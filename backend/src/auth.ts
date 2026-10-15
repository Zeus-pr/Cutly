import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import twilio from 'twilio';
import { Prisma, PrismaClient, type User } from '@prisma/client';
import { assertDateOfBirth } from '../../utils/dateOfBirth';
import {
  CUSTOMER_CANCEL_ON_DELETE_STATUSES,
  CUSTOMER_IN_VISIT_STATUSES,
  IN_VISIT_RECENT_MS,
  deletionDeadline,
  deletionState,
  isDeletionRequested
} from './accountDeletion';
import { cancelPolicy } from './cancelPolicy';
import { AppError } from './httpError';
import { archivedIdempotencyKey } from './money';
import { notifyShopPartner } from './push';
import { consumeReauthToken, defaultVerifyGoogle, issueReauthToken, verifyReauthProof, type ReauthInput } from './reauth';

const prisma = new PrismaClient();
const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_COOLDOWN_MS = 30 * 1000;

export type PublicUser = {
  id: string;
  email: string | null;
  phone: string | null;
  name: string | null;
  gender?: string | null;
  dateOfBirth?: string | null;
  inviteCode?: string | null;
  googleLinked?: boolean;
};

/** Fail closed if JWT_SECRET missing (SEC-10). */
export function jwtSecret() {
  const value = process.env.JWT_SECRET;
  if (!value) throw new Error('JWT_SECRET is not set');
  return value;
}

function secret() {
  return jwtSecret();
}

const JWT_VERIFY: jwt.VerifyOptions = { algorithms: ['HS256'] };

function publicUser(user: {
  id: string;
  email: string | null;
  phone: string | null;
  name: string | null;
  gender?: string | null;
  dateOfBirth?: Date | null;
  inviteCode?: string | null;
  googleSub?: string | null;
}): PublicUser {
  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    name: user.name,
    gender: user.gender ?? null,
    dateOfBirth: dateOnly(user.dateOfBirth),
    inviteCode: user.inviteCode ?? null,
    googleLinked: Boolean(user.googleSub)
  };
}

function dateOnly(value: Date | null | undefined) {
  if (!value) return null;
  const y = value.getUTCFullYear();
  const m = String(value.getUTCMonth() + 1).padStart(2, '0');
  const d = String(value.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * T3: `tv` = the account's tokenVersion at sign-in. Bumping tokenVersion (delete request)
 * revokes every older token. Tokens without `tv` (issued before T3) count as 0.
 */
export function signToken(user: PublicUser, audience: 'customer' | 'partner' = 'customer', tokenVersion = 0) {
  return jwt.sign(
    { sub: user.id, email: user.email, phone: user.phone, aud: audience, tv: tokenVersion },
    secret(),
    { expiresIn: '30d' }
  );
}

export function tokenVersionMatches(payload: object, tokenVersion: number) {
  const raw = (payload as { tv?: unknown }).tv;
  const tv = typeof raw === 'number' ? raw : 0;
  return tv === tokenVersion;
}

function session(user: User) {
  const profile = publicUser(user);
  return { token: signToken(profile, 'customer', user.tokenVersion), user: profile };
}

export const ACCOUNT_PENDING_DELETION = () =>
  new AppError('This account is pending deletion. Sign in to restore it.', 409, 'ACCOUNT_PENDING_DELETION');

/**
 * T3: a sign-in inside the grace window restores the account (nothing was blanked).
 * Past the deadline it is treated as purged → the caller's generic auth failure.
 * Returns the usable row, or null when the sign-in must fail.
 */
async function signInGate(user: User, now = new Date()): Promise<User | null> {
  const state = deletionState(user, now);
  if (state === 'active') return user;
  if (state !== 'pending') return null;
  const restored = await prisma.user.updateMany({
    where: { id: user.id, deletedAt: null, deletionRequestedAt: user.deletionRequestedAt },
    data: { deletionRequestedAt: null }
  });
  if (restored.count !== 1) return null;
  return prisma.user.findUnique({ where: { id: user.id } });
}

/** SEC-08: same message for email/phone taken — no account enumeration. */
const SIGNUP_TAKEN = 'Could not create that account. Try another email or phone, or sign in.';

export function normalEmail(email: string) {
  return email.trim().toLowerCase();
}

/** Whole-address match. `_` and `%` stay literal, unlike a Postgres ILIKE. */
export function sameEmail(stored: string, typed: string) {
  return normalEmail(stored) === normalEmail(typed);
}

async function findUsersByEmail(email: string) {
  const normalised = normalEmail(email);
  return prisma.$queryRaw<User[]>`
    SELECT * FROM "User"
    WHERE email IS NOT NULL AND lower(btrim(email)) = ${normalised}
    ORDER BY id
    LIMIT 5
  `;
}

export async function signUp(email: string, password: string, phone: string, name?: string) {
  const normalised = normalEmail(email);
  const existing = await findUsersByEmail(normalised);
  const phoneTaken = await prisma.user.findUnique({ where: { phone } });
  // T3-Q6: same phone/email as an account in its grace window → tell them to sign in (restores).
  if ([...existing, ...(phoneTaken ? [phoneTaken] : [])].some((row) => deletionState(row) === 'pending')) {
    throw ACCOUNT_PENDING_DELETION();
  }
  if (existing.length) throw new Error(SIGNUP_TAKEN);
  if (phoneTaken) throw new Error(SIGNUP_TAKEN);
  const user = await prisma.user.create({
    data: {
      email: normalised,
      phone,
      name: name || null,
      passwordHash: await bcrypt.hash(password, 10)
    }
  });
  return session(user);
}

export async function userFromToken(token: string) {
  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(token, secret(), JWT_VERIFY) as jwt.JwtPayload;
  } catch {
    throw new Error('Sign in again.');
  }
  // SEC-10: reject partner tokens (and anything without customer aud).
  if (payload.aud !== 'customer') throw new Error('Sign in again.');
  const id = typeof payload.sub === 'string' ? payload.sub : '';
  if (!id) throw new Error('Sign in again.');
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new Error('Sign in again.');
  // T3: deletion requested (grace or purged) or token issued before a revocation.
  if (isDeletionRequested(user) || !tokenVersionMatches(payload, user.tokenVersion ?? 0)) throw new Error('Sign in again.');
  return publicUser(user);
}

export async function updateProfile(
  token: string,
  input: { name?: string; phone?: string; email?: string; gender?: string; dateOfBirth?: string; inviteCode?: string }
) {
  const current = await userFromToken(token);
  const data: {
    name?: string;
    phone?: string;
    email?: string | null;
    emailVerified?: boolean;
    gender?: string | null;
    dateOfBirth?: Date;
    inviteCode?: string | null;
  } = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new Error('Enter your name.');
    data.name = name;
  }
  if (input.phone !== undefined) {
    const phone = input.phone.trim();
    if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
      throw new Error('Enter phone with country code, like +9198…');
    }
    const taken = await prisma.user.findFirst({ where: { phone, NOT: { id: current.id } } });
    if (taken) throw new Error('That phone number is already on another account.');
    data.phone = phone;
  }
  if (input.email !== undefined) {
    const email = normalEmail(input.email);
    if (!email) {
      data.email = null;
    } else {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email.');
      const taken = (await findUsersByEmail(email)).some((row) => row.id !== current.id);
      if (taken) throw new Error('That email is already on another account.');
      data.email = email;
    }
    if (shouldClearEmailVerified(current.email, data.email ?? null)) data.emailVerified = false;
  }
  if (input.gender !== undefined) {
    const gender = input.gender.trim().toLowerCase();
    const allowed = new Set(['male', 'female', 'other', 'prefer_not', '']);
    if (!allowed.has(gender)) throw new Error('Pick a gender option.');
    data.gender = gender || null;
  }
  if (input.dateOfBirth !== undefined) {
    const iso = assertDateOfBirth(input.dateOfBirth);
    data.dateOfBirth = new Date(`${iso}T00:00:00.000Z`);
  }
  if (input.inviteCode !== undefined) {
    const code = input.inviteCode.trim().slice(0, 32);
    data.inviteCode = code || null;
  }
  if (!Object.keys(data).length) throw new Error('Nothing to update.');
  const user = await prisma.user.update({ where: { id: current.id }, data });
  return publicUser(user);
}

/** @deprecated use updateProfile */
export async function updateProfileName(token: string, name: string) {
  return updateProfile(token, { name });
}

export async function signIn(email: string, password: string) {
  const matches = await findUsersByEmail(email);
  for (const user of matches) {
    if (user.passwordHash && (await bcrypt.compare(password, user.passwordHash))) {
      const usable = await signInGate(user);
      if (usable) return session(usable);
    }
  }
  throw new Error('Email or password is incorrect.');
}

/**
 * SEC-03: an unverified Google email must not match or be saved on a CUTLY user.
 * `email_verified` is only trusted when it is boolean true.
 */
export function trustedGoogleEmail(payload: { email?: string | null; email_verified?: boolean | null }) {
  if (payload.email_verified !== true) return null;
  const email = normalEmail(payload.email || '');
  return email || null;
}

/** SEC-03: editing the address drops the Google proof. The same address keeps it. */
export function shouldClearEmailVerified(currentEmail: string | null, nextEmail: string | null) {
  return (nextEmail ?? null) !== (currentEmail ?? null);
}

/** When several rows share an address apart from case, keep the verified one, then a password login. */
export function preferEmailOwner<T extends { emailVerified: boolean; hasPassword: boolean }>(rows: T[]) {
  return rows.find((row) => row.emailVerified) || rows.find((row) => row.hasPassword) || rows[0] || null;
}

export const GOOGLE_LINK_AFTER_PASSWORD =
  'You already have a CUTLY account with this email. Sign in with your password, then link Google.';

export function planGoogleMerge(input: {
  googleSub: string;
  trustedEmail: string | null;
  accountId: string;
  accountEmail: string | null;
  accountGoogleSub: string | null;
  googleOwnerId: string | null;
}): { ok: true } | { ok: false; message: string } {
  if (!input.trustedEmail) return { ok: false, message: 'Verify your Google email before linking it.' };
  if (input.accountGoogleSub && input.accountGoogleSub !== input.googleSub) {
    return { ok: false, message: 'This account is already linked to a different Google login.' };
  }
  if (input.googleOwnerId && input.googleOwnerId !== input.accountId) {
    return { ok: false, message: 'This Google account is already linked to another CUTLY profile.' };
  }
  const stored = input.accountEmail ? normalEmail(input.accountEmail) : null;
  if (stored && stored !== input.trustedEmail) {
    return { ok: false, message: 'This Google email does not match the email on your CUTLY account.' };
  }
  return { ok: true };
}

export type GoogleProfileHit = {
  id: string;
  email: string | null;
  googleSub: string | null;
  emailVerified: boolean;
  hasPassword: boolean;
};

export type GoogleLinkPlan =
  | {
      kind: 'link';
      userId: string;
      storeEmail: string | null;
      markEmailVerified: boolean;
      reclaimFromUserId: string | null;
      reclaimEmail: string | null;
    }
  | { kind: 'create'; email: string | null; reclaimFromUserId: string | null; reclaimEmail: string | null }
  | { kind: 'reject'; message: string };

/**
 * SEC-03: link a verified Google email only to a CUTLY profile whose stored email
 * was itself verified. A typed address with no password is moved off that row.
 * A password account keeps its email. A different googleSub on a verified profile is never replaced.
 */
export function planGoogleLink(input: {
  googleSub: string;
  trustedEmail: string | null;
  bySub: GoogleProfileHit | null;
  byEmail: GoogleProfileHit | null;
}): GoogleLinkPlan {
  const { googleSub, trustedEmail, bySub, byEmail } = input;
  const other = byEmail && (!bySub || byEmail.id !== bySub.id) ? byEmail : null;
  const reclaimTarget = other && !other.emailVerified && !other.hasPassword ? other : null;

  if (bySub) {
    const matchesStored = Boolean(trustedEmail && bySub.email && sameEmail(bySub.email, trustedEmail));
    const fillEmpty = Boolean(trustedEmail && !bySub.email && !other);
    const reclaim = Boolean(trustedEmail && !bySub.email && reclaimTarget);
    return {
      kind: 'link',
      userId: bySub.id,
      storeEmail: fillEmpty || reclaim ? trustedEmail : null,
      markEmailVerified: matchesStored || fillEmpty || reclaim,
      reclaimFromUserId: reclaim && reclaimTarget ? reclaimTarget.id : null,
      reclaimEmail: reclaim && reclaimTarget?.email ? reclaimTarget.email : null
    };
  }

  if (byEmail?.emailVerified) {
    const sameGoogle = !byEmail.googleSub || byEmail.googleSub === googleSub;
    if (!sameGoogle) {
      return { kind: 'reject', message: 'This Google account does not match that email on CUTLY.' };
    }
    return {
      kind: 'link',
      userId: byEmail.id,
      storeEmail: null,
      markEmailVerified: true,
      reclaimFromUserId: null,
      reclaimEmail: null
    };
  }

  if (reclaimTarget && trustedEmail) {
    return {
      kind: 'create',
      email: trustedEmail,
      reclaimFromUserId: reclaimTarget.id,
      reclaimEmail: reclaimTarget.email
    };
  }

  if (other?.hasPassword) {
    return {
      kind: 'reject',
      message: GOOGLE_LINK_AFTER_PASSWORD
    };
  }

  return { kind: 'create', email: trustedEmail, reclaimFromUserId: null, reclaimEmail: null };
}

/** Stale reclaim or a unique clash: look the profiles up once more. */
export class GoogleLinkRetry extends Error {
  constructor() {
    super('Google link needs another look.');
    this.name = 'GoogleLinkRetry';
  }
}

export function shouldRetryGoogleLink(error: unknown) {
  return error instanceof GoogleLinkRetry || isPrismaUniqueConflict(error);
}

export function isPrismaUniqueConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export async function signInWithGoogle(idToken: string, mergeToken?: string) {
  const clientId = process.env.GOOGLE_WEB_CLIENT_ID;
  if (!clientId) throw new Error('Google sign-in is not configured.');
  const client = new OAuth2Client(clientId);
  const ticket = await client.verifyIdToken({ idToken, audience: clientId });
  const payload = ticket.getPayload();
  const googleSub = payload?.sub;
  if (!googleSub) throw new Error('Google did not return an account.');
  const email = trustedGoogleEmail(payload);
  const name = payload.name || null;
  if (mergeToken) return linkGoogleToSignedIn(googleSub, email, name, mergeToken);
  try {
    return await finishGoogleSignIn(googleSub, email, name);
  } catch (error) {
    if (!shouldRetryGoogleLink(error)) throw error;
    return finishGoogleSignIn(googleSub, email, name);
  }
}

async function linkGoogleToSignedIn(googleSub: string, email: string | null, name: string | null, mergeToken: string) {
  const signedIn = await userFromToken(mergeToken);
  const account = await prisma.user.findUnique({ where: { id: signedIn.id } });
  if (!account) throw new Error('Sign in again.');
  const owner = await prisma.user.findUnique({ where: { googleSub } });
  const plan = planGoogleMerge({
    googleSub,
    trustedEmail: email,
    accountId: account.id,
    accountEmail: account.email,
    accountGoogleSub: account.googleSub,
    googleOwnerId: owner?.id ?? null
  });
  if (!plan.ok) throw new Error(plan.message);
  if (!account.email && email) {
    const holders = await findUsersByEmail(email);
    if (holders.some((row) => row.id !== account.id)) throw new Error('That email is already on another account.');
  }
  let user;
  try {
    user = await prisma.user.update({
      where: { id: account.id },
      data: {
        googleSub,
        email: account.email || email,
        emailVerified: true,
        name: account.name || name
      }
    });
  } catch (error) {
    if (isPrismaUniqueConflict(error)) throw new Error('That email is already on another account.');
    throw error;
  }
  return session(user);
}

const GOOGLE_SIGN_IN_FAILED = 'Google sign-in failed. Try again.';

async function finishGoogleSignIn(googleSub: string, email: string | null, name: string | null) {
  const subRow = await prisma.user.findUnique({ where: { googleSub } });
  // T3: Google sign-in within the grace window restores; after the deadline it fails.
  if (subRow && isDeletionRequested(subRow)) {
    const usable = await signInGate(subRow);
    if (!usable) throw new Error(GOOGLE_SIGN_IN_FAILED);
    return session(usable);
  }
  const bySub = subRow;
  let emailRows = email ? await findUsersByEmail(email) : [];
  const pendingOwner = emailRows.find((row) => isDeletionRequested(row));
  if (pendingOwner) {
    const sameGoogle = !pendingOwner.googleSub || pendingOwner.googleSub === googleSub;
    if (!bySub && pendingOwner.emailVerified && sameGoogle && (await signInGate(pendingOwner))) {
      emailRows = email ? await findUsersByEmail(email) : [];
    } else {
      throw new Error(GOOGLE_SIGN_IN_FAILED);
    }
  }
  const byEmail = preferEmailOwner(
    emailRows.map((row) => ({ ...row, hasPassword: Boolean(row.passwordHash) }))
  );
  const plan = planGoogleLink({
    googleSub,
    trustedEmail: email,
    bySub: bySub
      ? {
          id: bySub.id,
          email: bySub.email,
          googleSub: bySub.googleSub,
          emailVerified: bySub.emailVerified,
          hasPassword: Boolean(bySub.passwordHash)
        }
      : null,
    byEmail: byEmail
      ? {
          id: byEmail.id,
          email: byEmail.email,
          googleSub: byEmail.googleSub,
          emailVerified: byEmail.emailVerified,
          hasPassword: Boolean(byEmail.passwordHash)
        }
      : null
  });
  if (plan.kind === 'reject') throw new Error(plan.message);
  const linked = plan.kind === 'link' ? (plan.userId === bySub?.id ? bySub : byEmail) : null;
  const user = await prisma.$transaction(async (tx) => {
    if (plan.reclaimFromUserId) {
      if (!plan.reclaimEmail) throw new GoogleLinkRetry();
      const cleared = await tx.user.updateMany({
        where: {
          id: plan.reclaimFromUserId,
          email: plan.reclaimEmail,
          emailVerified: false,
          passwordHash: null
        },
        data: { email: null, emailVerified: false }
      });
      if (cleared.count !== 1) throw new GoogleLinkRetry();
    }
    if (plan.kind === 'create') {
      return tx.user.create({
        data: { googleSub, email: plan.email, emailVerified: Boolean(plan.email), name }
      });
    }
    return tx.user.update({
      where: { id: plan.userId },
      data: {
        googleSub,
        name: linked?.name || name,
        ...(plan.storeEmail ? { email: plan.storeEmail } : {}),
        ...(plan.markEmailVerified ? { emailVerified: true } : {})
      }
    });
  });
  return session(user);
}

let verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID || '';

function twilioError(error: unknown): never {
  const err = error as { code?: number; message?: string };
  const message = err.message || 'Could not send the code.';
  if (err.code === 60203) throw new Error('Too many codes were sent. Wait a few minutes and try again.');
  if (err.code === 60202 || err.code === 20404) throw new Error('That code is incorrect or expired.');
  if (/unverified/i.test(message) || err.code === 21608) {
    throw new Error('This Twilio trial can only text numbers verified in the Twilio console.');
  }
  if (/geo permissions|permission to send/i.test(message) || err.code === 21408 || err.code === 60605) {
    throw new Error('Twilio is not allowed to text this country yet. Enable it in Twilio geo permissions.');
  }
  throw new Error(message);
}

async function verifyService() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new Error('Phone sign-in is not configured.');
  const client = twilio(sid, token);
  if (!verifyServiceSid) {
    const listed = await client.verify.v2.services.list({ limit: 20 });
    const found = listed.find((service) => service.friendlyName === 'CUTLY');
    verifyServiceSid = found?.sid || (await client.verify.v2.services.create({ friendlyName: 'CUTLY', codeLength: 6 })).sid;
  }
  return { client, serviceSid: verifyServiceSid };
}

export async function sendPhoneOtp(phone: string) {
  const recent = await prisma.phoneOtp.findFirst({ where: { phone, codeHash: 'twilio-verify' }, orderBy: { createdAt: 'desc' } });
  if (recent && Date.now() - recent.createdAt.getTime() < OTP_COOLDOWN_MS) {
    throw new Error('Wait a moment before requesting another code.');
  }
  const { client, serviceSid } = await verifyService();
  try {
    await client.verify.v2.services(serviceSid).verifications.create({ to: phone, channel: 'sms' });
  } catch (error) {
    twilioError(error);
  }
  await prisma.phoneOtp.create({
    data: { phone, codeHash: 'twilio-verify', expiresAt: new Date(Date.now() + OTP_TTL_MS) }
  });
}

/** Twilio Verify check. True only when the code is approved for this phone. */
export async function checkPhoneOtpCode(phone: string, code: string) {
  const { client, serviceSid } = await verifyService();
  let status = '';
  try {
    const check = await client.verify.v2.services(serviceSid).verificationChecks.create({ to: phone, code });
    status = check.status;
  } catch (error) {
    twilioError(error);
  }
  return status === 'approved';
}

export async function verifyPhoneOtp(phone: string, code: string, mergeToken?: string) {
  if (!(await checkPhoneOtpCode(phone, code))) throw new Error('That code is incorrect or expired.');
  await prisma.phoneOtp.deleteMany({ where: { phone } });

  const byPhone = await prisma.user.findUnique({ where: { phone } });

  // CJ-43: signed-in email/Google user without phone → attach this phone (merge).
  if (mergeToken) {
    try {
      const signedIn = await userFromToken(mergeToken);
      if (signedIn.phone && signedIn.phone !== phone) {
        throw new Error('This account already has a different phone number.');
      }
      if (!signedIn.phone) {
        if (byPhone && byPhone.id !== signedIn.id) {
          // Phone-only stub with no email/google → fold into signed-in account.
          if (!byPhone.email && !byPhone.googleSub && !byPhone.passwordHash && !isDeletionRequested(byPhone)) {
            await prisma.$transaction(async (tx) => {
              await tx.booking.updateMany({ where: { userId: byPhone.id }, data: { userId: signedIn.id } });
              await tx.favouriteShop.updateMany({ where: { userId: byPhone.id }, data: { userId: signedIn.id } });
              await tx.review.updateMany({ where: { userId: byPhone.id }, data: { userId: signedIn.id } });
              await tx.notification.updateMany({ where: { userId: byPhone.id }, data: { userId: signedIn.id } });
              await tx.user.delete({ where: { id: byPhone.id } });
              await tx.user.update({ where: { id: signedIn.id }, data: { phone } });
            });
          } else {
            throw new Error('That phone is already linked to another CUTLY account.');
          }
        } else {
          await prisma.user.update({ where: { id: signedIn.id }, data: { phone } });
        }
        const merged = await prisma.user.findUniqueOrThrow({ where: { id: signedIn.id } });
        return session(merged);
      }
    } catch (err) {
      if (err instanceof Error && !/Sign in again|token/i.test(err.message)) throw err;
      // Invalid merge token → fall through to normal OTP login.
    }
  }

  if (byPhone && isDeletionRequested(byPhone)) {
    // T3: OTP sign-in is the restore path inside the grace window.
    const usable = await signInGate(byPhone);
    if (!usable) throw new Error('That code is incorrect or expired.');
    return session(usable);
  }
  const user = byPhone || (await prisma.user.create({ data: { phone } }));
  return session(user);
}

/** T3 step-up: POST /api/auth/reauth → one-time 5-minute token for DELETE /api/auth/account. */
export async function startCustomerReauth(token: string, input: ReauthInput) {
  const current = await userFromToken(token);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: current.id } });
  await verifyReauthProof(user, input, { checkOtp: checkPhoneOtpCode, verifyGoogle: defaultVerifyGoogle });
  if (input.method === 'otp' && user.phone) await prisma.phoneOtp.deleteMany({ where: { phone: user.phone } });
  return issueReauthToken(prisma, secret(), user.id, 'customer');
}

/**
 * T3 soft delete (customer). One transaction:
 * - refuse while a visit is in progress (409 VISIT_IN_PROGRESS)
 * - cancel upcoming bookings (refund marking follows the normal cancel policy; DB-only today)
 * - set deletionRequestedAt, bump tokenVersion (all sessions die), clear pushToken,
 *   release holds, delete PhoneOtp rows for the phone.
 * PII, favourites, saved places and notifications stay until the purge job runs
 * (deadline = deletionRequestedAt + grace) so a sign-in inside the window restores everything.
 * Bookings, payments and reviews are always kept (finance records, shop history).
 */
export async function deleteCustomerAccount(token: string, reauthToken?: string | null, now = new Date()) {
  const current = await userFromToken(token);
  const result = await prisma.$transaction(async (tx) => {
    await consumeReauthToken(tx, secret(), reauthToken, current.id, 'customer', now);
    const user = await tx.user.findUniqueOrThrow({ where: { id: current.id } });
    if (isDeletionRequested(user)) throw new Error('Sign in again.');
    const inVisit = await tx.booking.count({
      where: {
        userId: user.id,
        status: { in: [...CUSTOMER_IN_VISIT_STATUSES] },
        endsAt: { gt: new Date(now.getTime() - IN_VISIT_RECENT_MS) }
      }
    });
    if (inVisit) throw new AppError('Finish your current visit first.', 409, 'VISIT_IN_PROGRESS');
    const upcoming = await tx.booking.findMany({
      // Only genuinely upcoming bookings; past unclosed visits are left as they are.
      where: { userId: user.id, status: { in: [...CUSTOMER_CANCEL_ON_DELETE_STATUSES] }, endsAt: { gt: now } },
      include: { payment: true }
    });
    const refunded: string[] = [];
    for (const booking of upcoming) {
      const changed = await tx.booking.updateMany({
        where: { id: booking.id, status: booking.status },
        data: { status: 'CANCELLED', idempotencyKey: archivedIdempotencyKey(booking.id) }
      });
      if (changed.count !== 1) throw new AppError('Your bookings changed. Try again.', 409, 'BOOKINGS_CHANGED');
      const refund = booking.status === 'AWAITING_SHOP' || cancelPolicy(booking.startsAt, now).refundAdvance;
      if (refund && booking.payment && booking.payment.status !== 'REFUNDED') {
        await tx.bookingPayment.update({ where: { bookingId: booking.id }, data: { status: 'REFUNDED' } });
        refunded.push(booking.id);
      }
    }
    await tx.user.update({
      where: { id: user.id },
      data: { deletionRequestedAt: now, tokenVersion: { increment: 1 }, pushToken: null }
    });
    await tx.bookingHold.deleteMany({ where: { userId: user.id } });
    if (user.phone) await tx.phoneOtp.deleteMany({ where: { phone: user.phone } });
    return { upcoming, refunded };
  });
  for (const booking of result.upcoming) {
    void notifyShopPartner(booking.shopId, {
      title: 'Customer cancelled',
      body: `${booking.bookingCode} · account closed`,
      data: { bookingId: booking.id, screen: 'requests' }
    });
  }
  return {
    deleted: true as const,
    deletionRequestedAt: now.toISOString(),
    restoreBefore: deletionDeadline(now).toISOString(),
    cancelledBookings: result.upcoming.length,
    refundedBookingIds: result.refunded
  };
}
