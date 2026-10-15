/**
 * T4 (#9) design §3 + "Release re-check, final (agreed with DBA)":
 * an address only belongs to a row once emailVerified = true. When its owner proves it
 * (Google, a verified signup, or a verified email change), unverified holders are released.
 */
import { Prisma } from '@prisma/client';
import { EMAIL_CLAIM_REVIEW, EMAIL_TAKEN, emailHmac } from './emailCode';
import { AppError } from './httpError';
import { notifyUser } from './push';

type Tx = Prisma.TransactionClient;
export type ReleaseReason = 'google_owner' | 'signup_verified' | 'email_change';

type HolderRow = {
  id: string;
  email: string | null;
  emailVerified: boolean;
  phone: string | null;
  googleSub: string | null;
  passwordHash: string | null;
  deletionRequestedAt: Date | null;
  deletedAt: Date | null;
};

/** The released account must still be able to sign in (DBA final (a)). */
export function canStillSignIn(row: Pick<HolderRow, 'phone' | 'googleSub'>) {
  // DBA #58 item 3: only phone or Google count as another way in.
  return Boolean(row.phone || row.googleSub);
}

/**
 * PR Review #58 blocker (a): the Google email is on an older account that never verified it.
 * That account may be the Google owner's own, so we don't split it or release the email.
 */
export const GOOGLE_EMAIL_UNVERIFIED_OWNER = () =>
  new AppError(
    'This email is already on a CutLy account that has not verified it. Sign in with that account\'s phone number or password, then verify the email or link Google from Profile.',
    409,
    'GOOGLE_EMAIL_UNVERIFIED_OWNER'
  );

export class ReleaseStale extends Error {
  constructor() {
    super('Email release needs another look.');
    this.name = 'ReleaseStale';
  }
}

/**
 * Inside the caller's transaction:
 * - lock the holder rows and the winner (if any) in ascending id order (DBA item 4), lock_timeout 5 s
 * - verified / pending-deletion / purged holder → 409 EMAIL_TAKEN (generic)
 * - holder that would be left with no sign-in → 409 EMAIL_CLAIM_REVIEW (manual review)
 * - UPDATE … email = NULL must hit exactly 1 row, else ReleaseStale (caller maps to 409 or retries)
 * - invalidate EmailCode + PendingSignup rows for the address (except the winner's), write EmailRelease
 * Sessions are tied to the user id, so tokenVersion is NOT bumped.
 * Returns the released user ids; call `notifyReleased` after commit.
 */
export async function releaseUnverifiedHolders(
  tx: Tx,
  emailNorm: string,
  winnerId: string | null,
  reason: ReleaseReason,
  opts: { keepPendingSignupId?: string; refuseUnverified?: () => Error } = {}
): Promise<string[]> {
  await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '5s'`);
  const found = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "User" WHERE email IS NOT NULL AND lower(btrim(email)) = ${emailNorm}
  `;
  const holderIds = found.map((r) => r.id).filter((id) => id !== winnerId);
  const invalidateOthers = async () => {
    await tx.emailCode.deleteMany({
      // OR userId IS NULL: `NOT userId = x` alone would skip pending-signup codes (SQL NULL).
      where: { emailNorm, ...(winnerId ? { OR: [{ userId: null }, { NOT: { userId: winnerId } }] } : {}) }
    });
    await tx.pendingSignup.deleteMany({
      where: { emailNorm, ...(opts.keepPendingSignupId ? { NOT: { id: opts.keepPendingSignupId } } : {}) }
    });
  };
  // Sec #58 LOW: other pendings/codes for the address go even when no User holds it.
  if (!holderIds.length) {
    await invalidateOthers();
    return [];
  }
  const lockIds = [...new Set([...holderIds, ...(winnerId ? [winnerId] : [])])].sort();
  await tx.$queryRaw`SELECT id FROM "User" WHERE id IN (${Prisma.join(lockIds)}) ORDER BY id FOR UPDATE`;
  const holders = await tx.$queryRaw<HolderRow[]>`
    SELECT id, email, "emailVerified", phone, "googleSub", "passwordHash", "deletionRequestedAt", "deletedAt"
    FROM "User" WHERE id IN (${Prisma.join(holderIds)}) ORDER BY id
  `;
  for (const row of holders) {
    if (!row.email || row.email.trim().toLowerCase() !== emailNorm) continue; // changed since the first read
    if (row.emailVerified || row.deletionRequestedAt || row.deletedAt) throw EMAIL_TAKEN();
    // PR Review #58 blocker (a): Google never takes the address off an unverified holder.
    if (opts.refuseUnverified) throw opts.refuseUnverified();
    if (!canStillSignIn(row)) {
      console.warn('[email-release] manual review needed: holder has no other sign-in', row.id);
      throw EMAIL_CLAIM_REVIEW();
    }
  }
  const hmac = emailHmac(emailNorm);
  const released: string[] = [];
  for (const row of holders) {
    if (!row.email || row.email.trim().toLowerCase() !== emailNorm) continue;
    const changed = await tx.$executeRaw`
      UPDATE "User" SET email = NULL, "emailVerified" = false, "updatedAt" = now()
      WHERE id = ${row.id} AND "emailVerified" = false AND "deletionRequestedAt" IS NULL
        AND "deletedAt" IS NULL AND email = ${row.email}
    `;
    if (changed !== 1) throw new ReleaseStale();
    await tx.emailRelease.create({ data: { emailHmac: hmac, fromUserId: row.id, toUserId: winnerId, reason } });
    released.push(row.id);
  }
  await invalidateOthers();
  return released;
}

/** After commit: fill in the winner on audit rows created before the User existed. */
export async function setReleaseWinner(tx: Tx, releasedIds: string[], winnerId: string) {
  if (!releasedIds.length) return;
  await tx.emailRelease.updateMany({ where: { fromUserId: { in: releasedIds }, toUserId: null }, data: { toUserId: winnerId } });
}

export const EMAIL_RELEASED_TITLE = 'Email removed from your account';
export const EMAIL_RELEASED_BODY =
  'Its owner confirmed it on another sign-in, so we removed it. Your account still works with your phone. Add an email you own in Profile.';

/** P8: in-app notification (+ push if a token exists). Never emails the released address. */
export function notifyReleased(userIds: string[]) {
  for (const userId of userIds) {
    void notifyUser(userId, {
      title: EMAIL_RELEASED_TITLE,
      body: EMAIL_RELEASED_BODY,
      data: { type: 'email_released', screen: 'profile' }
    }).catch((error) => console.warn('[email-release] notify failed', userId, error instanceof Error ? error.message : ''));
  }
}
