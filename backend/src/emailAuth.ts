/**
 * T4 (#9): email verification at signup, "verify existing email", and email change.
 * Design: /workspace/design-T4.md (§4, §5, §7, §8 + DBA answers). A 6-digit code is emailed;
 * no User row exists for an email signup until the code is proved.
 */
import bcrypt from 'bcryptjs';
import { PrismaClient, type User } from '@prisma/client';
import { deletionState } from './accountDeletion';
import { ACCOUNT_PENDING_DELETION, findUsersByEmail, isPrismaUniqueConflict, jwtSecret, normalEmail, session, userFromToken } from './auth';
import {
  CODE_EXPIRED,
  CODE_INVALID,
  EMAIL_CODE_MAX_ATTEMPTS,
  EMAIL_CODE_TTL_SEC,
  EMAIL_RESEND_COOLDOWN_SEC,
  EMAIL_TAKEN,
  EMAIL_UNAVAILABLE,
  PENDING_SIGNUP_TTL_SEC,
  SIGNUP_EXPIRED,
  emailCodeKey,
  emailCodeMatches,
  emailHmac,
  generateEmailCode,
  hashEmailCode,
  isRetryableTxError,
  maskEmail,
  type EmailCodePurpose
} from './emailCode';
import { notifyReleased, releaseUnverifiedHolders, ReleaseStale, setReleaseWinner } from './emailRelease';
import { AppError } from './httpError';
import { codeMail, emailChangedMail, sendTransactional, signupNoticeMail, type EmailSender } from './mail';
import { notifyUser } from './push';
import { consumeReauthToken } from './reauth';

const prisma = new PrismaClient();

export type EmailDeps = { send: EmailSender; now: () => Date; rand?: (max: number) => number };
const defaultDeps: EmailDeps = { send: sendTransactional, now: () => new Date() };

/** Same message as the legacy one-step signup (SEC-08). */
const SIGNUP_TAKEN = 'Could not create that account. Try another email or phone, or sign in.';

type Subject = { userId: string } | { pendingSignupId: string };
const subjectKey = (s: Subject) => ('userId' in s ? `user:${s.userId}` : `pending:${s.pendingSignupId}`);
const subjectWhere = (s: Subject) => ('userId' in s ? { userId: s.userId } : { pendingSignupId: s.pendingSignupId });

export type CodeSent = { maskedEmail: string; resendInSec: number; expiresInSec: number };

async function suppressed(emailNorm: string) {
  const row = await prisma.emailSuppression.findUnique({ where: { emailHmac: emailHmac(emailNorm) } });
  return Boolean(row);
}

/**
 * Replaces the subject's live code for this purpose and emails it.
 * `notice` (address owned by a verified account): an unguessable code row is still stored so
 * verify answers exactly like a real code (no enumeration), and the owner gets a notice mail.
 * A suppressed address (hard bounce / complaint) gets nothing; the API still answers the same.
 */
async function issueCode(subject: Subject, purpose: EmailCodePurpose, emailNorm: string, deps: EmailDeps, notice = false): Promise<CodeSent> {
  const key = emailCodeKey();
  const now = deps.now();
  const code = generateEmailCode(deps.rand);
  const real = notice ? generateEmailCode() + generateEmailCode() : code; // 12 digits: can never match a 6-digit entry
  const id = subjectKey(subject);
  await prisma.emailCode.deleteMany({ where: { ...subjectWhere(subject), purpose } });
  const row = await prisma.emailCode.create({
    data: {
      ...subjectWhere(subject),
      purpose,
      emailNorm,
      codeHmac: hashEmailCode(key, id, purpose, emailNorm, real),
      expiresAt: new Date(now.getTime() + EMAIL_CODE_TTL_SEC * 1000)
    }
  });
  if (!(await suppressed(emailNorm))) {
    const result = await deps.send(notice ? signupNoticeMail(emailNorm) : codeMail(emailNorm, code, purpose));
    if (!result.sent) {
      await prisma.emailCode.deleteMany({ where: { id: row.id } });
      throw EMAIL_UNAVAILABLE();
    }
  }
  return { maskedEmail: maskEmail(emailNorm), resendInSec: EMAIL_RESEND_COOLDOWN_SEC, expiresInSec: EMAIL_CODE_TTL_SEC };
}

/** 60 s cooldown from the live code's createdAt (P9). Throws 429 RATE_LIMITED. */
async function assertCooldown(subject: Subject, purpose: EmailCodePurpose, now: Date) {
  const last = await prisma.emailCode.findFirst({ where: { ...subjectWhere(subject), purpose }, orderBy: { createdAt: 'desc' } });
  if (!last) return;
  const waitSec = Math.ceil((last.createdAt.getTime() + EMAIL_RESEND_COOLDOWN_SEC * 1000 - now.getTime()) / 1000);
  if (waitSec > 0) {
    throw new AppError('Wait a moment before requesting another code.', 429, 'RATE_LIMITED', { retryAfterSec: waitSec });
  }
}

/**
 * Checks a code: one attempt is counted atomically BEFORE comparing, so parallel guesses can't
 * exceed 5. Wrong → 401 CODE_INVALID + attemptsRemaining; 5th wrong / expired / none → 410 CODE_EXPIRED.
 * A match deletes the row (single use). Returns the target address.
 */
export async function consumeEmailCode(subject: Subject, purpose: EmailCodePurpose, code: string, now: Date) {
  const key = emailCodeKey();
  const live = await prisma.emailCode.findFirst({ where: { ...subjectWhere(subject), purpose }, orderBy: { createdAt: 'desc' } });
  if (!live) throw CODE_EXPIRED();
  // ORM (not raw SQL) so the timestamp comparison matches Prisma's UTC storage.
  const counted = await prisma.emailCode.updateMany({
    where: { id: live.id, attempts: { lt: EMAIL_CODE_MAX_ATTEMPTS }, expiresAt: { gt: now } },
    data: { attempts: { increment: 1 } }
  });
  if (counted.count !== 1) throw CODE_EXPIRED();
  const after = await prisma.emailCode.findUnique({ where: { id: live.id }, select: { attempts: true } });
  if (!after) throw CODE_EXPIRED();
  const ok = emailCodeMatches(live.codeHmac, hashEmailCode(key, subjectKey(subject), purpose, live.emailNorm, code));
  if (!ok) {
    const left = EMAIL_CODE_MAX_ATTEMPTS - after.attempts;
    if (left <= 0) {
      await prisma.emailCode.deleteMany({ where: { id: live.id } });
      throw CODE_EXPIRED();
    }
    throw CODE_INVALID(left);
  }
  const used = await prisma.emailCode.deleteMany({ where: { id: live.id } });
  if (used.count !== 1) throw CODE_EXPIRED();
  return live.emailNorm;
}

/** One retry on deadlock / serialization failure / a stale release (DBA item 4). */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (!(isRetryableTxError(error) || error instanceof ReleaseStale)) throw error;
    try {
      return await fn();
    } catch (again) {
      if (again instanceof ReleaseStale) throw EMAIL_TAKEN();
      throw again;
    }
  }
}

function verifiedHolder(rows: User[]) {
  return rows.some((row) => row.emailVerified && deletionState(row) === 'active');
}

// ---------------------------------------------------------------- signup (§4)

export async function startEmailSignup(
  input: { email: string; password: string; phone: string; name?: string },
  deps: EmailDeps = defaultDeps
) {
  const emailNorm = normalEmail(input.email);
  const now = deps.now();
  const holders = await findUsersByEmail(emailNorm);
  const phoneTaken = await prisma.user.findUnique({ where: { phone: input.phone } });
  // T3-Q6 (unchanged): an account in its grace window → sign in to restore.
  if ([...holders, ...(phoneTaken ? [phoneTaken] : [])].some((row) => deletionState(row, now) === 'pending')) {
    throw ACCOUNT_PENDING_DELETION();
  }
  if (phoneTaken) throw new Error(SIGNUP_TAKEN); // pre-existing (phone at signup is a follow-up, P10)
  emailCodeKey(); // fail closed before writing anything
  const pending = await prisma.pendingSignup.create({
    data: {
      emailNorm,
      phone: input.phone,
      name: input.name?.trim() || null,
      passwordHash: await bcrypt.hash(input.password, 10),
      expiresAt: new Date(now.getTime() + PENDING_SIGNUP_TTL_SEC * 1000)
    }
  });
  try {
    const sent = await issueCode({ pendingSignupId: pending.id }, 'signup_verify', emailNorm, deps, verifiedHolder(holders));
    return { pendingId: pending.id, ...sent };
  } catch (error) {
    await prisma.pendingSignup.deleteMany({ where: { id: pending.id } });
    throw error;
  }
}

async function livePending(pendingId: string, now: Date) {
  const pending = await prisma.pendingSignup.findUnique({ where: { id: pendingId } });
  if (!pending || pending.expiresAt <= now) throw SIGNUP_EXPIRED();
  return pending;
}

/** For per-address rate limits on /signup/resend. Null when unknown/expired. */
export async function pendingSignupEmail(pendingId: string) {
  const pending = await prisma.pendingSignup.findUnique({ where: { id: pendingId } });
  return pending?.emailNorm ?? null;
}

export async function resendEmailSignup(pendingId: string, deps: EmailDeps = defaultDeps) {
  const now = deps.now();
  const pending = await livePending(pendingId, now);
  const subject = { pendingSignupId: pending.id };
  await assertCooldown(subject, 'signup_verify', now);
  const holders = await findUsersByEmail(pending.emailNorm);
  const sent = await issueCode(subject, 'signup_verify', pending.emailNorm, deps, verifiedHolder(holders));
  return { pendingId: pending.id, ...sent };
}

export async function verifyEmailSignup(pendingId: string, code: string, deps: EmailDeps = defaultDeps) {
  const now = deps.now();
  const pending = await livePending(pendingId, now);
  await consumeEmailCode({ pendingSignupId: pending.id }, 'signup_verify', code, now);
  let released: string[] = [];
  let user: User;
  try {
    user = await withRetry(() =>
      prisma.$transaction(async (tx) => {
        const row = await tx.pendingSignup.findUnique({ where: { id: pending.id } });
        if (!row) throw SIGNUP_EXPIRED();
        const phoneOwner = await tx.user.findUnique({ where: { phone: row.phone } });
        if (phoneOwner) throw EMAIL_TAKEN();
        released = await releaseUnverifiedHolders(tx, row.emailNorm, null, 'signup_verified', { keepPendingSignupId: row.id });
        const created = await tx.user.create({
          data: { email: row.emailNorm, emailVerified: true, phone: row.phone, name: row.name, passwordHash: row.passwordHash }
        });
        await setReleaseWinner(tx, released, created.id);
        await tx.pendingSignup.delete({ where: { id: row.id } });
        await tx.emailCode.deleteMany({ where: { pendingSignupId: row.id } });
        return created;
      })
    );
  } catch (error) {
    // Concurrent verifies of one address: the first wins on User.email @unique (§9.7).
    if (isPrismaUniqueConflict(error)) throw EMAIL_TAKEN();
    throw error;
  }
  notifyReleased(released);
  return session(user);
}

// ---------------------------------------------------------------- verify existing (§7, P7)

export async function sendVerifyExisting(token: string, deps: EmailDeps = defaultDeps) {
  const current = await userFromToken(token);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: current.id } });
  if (!user.email) throw new AppError('Add an email first.', 400, 'NO_EMAIL');
  if (user.emailVerified) throw new AppError('Your email is already verified.', 409, 'ALREADY_VERIFIED');
  const subject = { userId: user.id };
  await assertCooldown(subject, 'verify_existing', deps.now());
  return issueCode(subject, 'verify_existing', normalEmail(user.email), deps);
}

export async function confirmVerifyExisting(token: string, code: string, deps: EmailDeps = defaultDeps) {
  const current = await userFromToken(token);
  const emailNorm = await consumeEmailCode({ userId: current.id }, 'verify_existing', code, deps.now());
  const done = await prisma.user.updateMany({
    where: { id: current.id, email: emailNorm, deletionRequestedAt: null },
    data: { emailVerified: true }
  });
  if (done.count !== 1) throw CODE_EXPIRED(); // the address changed since the code was sent
  return { user: await userFromToken(token) };
}

// ---------------------------------------------------------------- change email (§8, P3)

export const CHANGE_EMAIL_ACTION = 'change_email' as const;

export async function requestEmailChange(token: string, reauthToken: string | undefined, newEmail: string, deps: EmailDeps = defaultDeps) {
  const current = await userFromToken(token);
  const emailNorm = normalEmail(newEmail);
  if (current.email && normalEmail(current.email) === emailNorm) {
    throw new AppError('That is already your email.', 400, 'SAME_EMAIL');
  }
  const holders = (await findUsersByEmail(emailNorm)).filter((row) => row.id !== current.id);
  if (holders.some((row) => row.emailVerified || deletionState(row, deps.now()) !== 'active')) throw EMAIL_TAKEN();
  emailCodeKey();
  // P3: the step-up grant (action change_email) is burnt here; resends don't need a new one.
  await prisma.$transaction((tx) => consumeReauthToken(tx, jwtSecret(), reauthToken, current.id, 'customer', deps.now(), CHANGE_EMAIL_ACTION));
  return issueCode({ userId: current.id }, 'email_change', emailNorm, deps);
}

export async function resendEmailChange(token: string, deps: EmailDeps = defaultDeps) {
  const current = await userFromToken(token);
  const subject = { userId: current.id };
  const last = await prisma.emailCode.findFirst({ where: { userId: current.id, purpose: 'email_change' }, orderBy: { createdAt: 'desc' } });
  if (!last) throw new AppError('Start the email change again.', 410, 'CHANGE_EXPIRED');
  await assertCooldown(subject, 'email_change', deps.now());
  return issueCode(subject, 'email_change', last.emailNorm, deps);
}

export async function confirmEmailChange(token: string, code: string, deps: EmailDeps = defaultDeps) {
  const current = await userFromToken(token);
  const emailNorm = await consumeEmailCode({ userId: current.id }, 'email_change', code, deps.now());
  let released: string[] = [];
  let before: User | null = null;
  let user: User;
  try {
    user = await withRetry(() =>
      prisma.$transaction(async (tx) => {
        released = await releaseUnverifiedHolders(tx, emailNorm, current.id, 'email_change');
        before = await tx.user.findUniqueOrThrow({ where: { id: current.id } });
        if (before.deletionRequestedAt) throw new Error('Sign in again.');
        return tx.user.update({ where: { id: current.id }, data: { email: emailNorm, emailVerified: true } });
      })
    );
  } catch (error) {
    if (isPrismaUniqueConflict(error)) throw EMAIL_TAKEN();
    throw error;
  }
  notifyReleased(released);
  const old = before as User | null;
  const oldVerified = Boolean(old?.email && old.emailVerified);
  if (oldVerified && old?.email) {
    void deps.send(emailChangedMail(old.email, maskEmail(emailNorm))).catch(() => undefined);
    void notifyUser(user.id, {
      title: 'Email updated',
      body: `Your CutLy email is now ${maskEmail(emailNorm)}.`,
      data: { type: 'email_changed', screen: 'profile' }
    }).catch(() => undefined);
  }
  return { user: await userFromToken(token), notifiedOldAddress: oldVerified };
}

/** /auth/me extra: the address was released to its owner and none was added since (screen 14). */
export async function emailReleasedFlag(userId: string, email: string | null) {
  if (email) return false;
  return Boolean(await prisma.emailRelease.findFirst({ where: { fromUserId: userId }, select: { id: true } }));
}
