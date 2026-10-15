import { Prisma, PrismaClient } from '@prisma/client';
import { deletedIdentityRetentionDays, phoneHmac, purgeCutoff, shopStatusData } from './accountDeletion';

/**
 * T3 purge job. Anonymises accounts whose grace window ended
 * (deletionRequestedAt + ACCOUNT_DELETION_GRACE_DAYS), and drops DeletedIdentity rows
 * older than 12 months.
 *
 * - Single runner: a session-level Postgres advisory lock held on one pinned
 *   connection (an interactive transaction) for the whole run. A second instance skips.
 * - One transaction per account, re-selected with FOR UPDATE SKIP LOCKED, so it is
 *   idempotent and safe to re-run or crash mid-way.
 * - DeletedIdentity (HMAC of the E.164 phone) is written before the phone is nulled.
 * - Bookings, payments and reviews are never touched (finance retention; finance-row
 *   purge after 8 years is a follow-up issue).
 */

const prisma = new PrismaClient();

/** Arbitrary constant: "T3 purge" lock id. Must not collide with other advisory locks. */
export const PURGE_LOCK_KEY = 830_008;
const BATCH = 50;

type Tx = Prisma.TransactionClient;

export type PurgeResult = {
  skipped: boolean;
  users: number;
  partners: number;
  deletedIdentitiesRemoved: number;
};

async function purgeUser(tx: Tx, userId: string, cutoff: Date, now: Date) {
  const locked = await tx.$queryRaw<{ id: string; phone: string | null }[]>`
    SELECT id, phone FROM "User"
    WHERE id = ${userId} AND "deletedAt" IS NULL
      AND "deletionRequestedAt" IS NOT NULL AND "deletionRequestedAt" <= ${cutoff}
    FOR UPDATE SKIP LOCKED`;
  const row = locked[0];
  if (!row) return false;
  const hmac = row.phone ? phoneHmac(row.phone) : null;
  if (hmac) await tx.deletedIdentity.create({ data: { phoneHmac: hmac, reason: 'customer_deleted', deletedAt: now } });
  await tx.favouriteShop.deleteMany({ where: { userId } });
  await tx.savedLocation.deleteMany({ where: { userId } });
  await tx.notification.deleteMany({ where: { userId } });
  await tx.bookingHold.deleteMany({ where: { userId } });
  if (row.phone) await tx.phoneOtp.deleteMany({ where: { phone: row.phone } });
  await tx.user.update({
    where: { id: userId },
    data: {
      name: null,
      phone: null,
      email: null,
      gender: null,
      dateOfBirth: null,
      inviteCode: null,
      passwordHash: null,
      googleSub: null,
      pushToken: null,
      emailVerified: false,
      deletedAt: now
    }
  });
  return true;
}

async function purgePartner(tx: Tx, partnerId: string, cutoff: Date, now: Date) {
  const locked = await tx.$queryRaw<{ id: string; phone: string | null }[]>`
    SELECT id, phone FROM "Partner"
    WHERE id = ${partnerId} AND "deletedAt" IS NULL
      AND "deletionRequestedAt" IS NOT NULL AND "deletionRequestedAt" <= ${cutoff}
    FOR UPDATE SKIP LOCKED`;
  const row = locked[0];
  if (!row) return false;
  const hmac = row.phone ? phoneHmac(row.phone) : null;
  if (hmac) await tx.deletedIdentity.create({ data: { phoneHmac: hmac, reason: 'partner_deleted', deletedAt: now } });
  // Shop name/address are business data and stay (customer history). Its public phone goes.
  await tx.shop.updateMany({
    where: { ownerPartnerId: partnerId },
    data: { ...shopStatusData('CLOSED'), phone: null, deletedAt: now }
  });
  await tx.partner.update({
    where: { id: partnerId },
    data: { name: null, phone: null, email: null, passwordHash: null, googleSub: null, pushToken: null, deletedAt: now }
  });
  return true;
}

async function dueIds(table: 'User' | 'Partner', cutoff: Date, afterId: string) {
  const rows =
    table === 'User'
      ? await prisma.$queryRaw<{ id: string }[]>`
          SELECT id FROM "User" WHERE "deletedAt" IS NULL AND "deletionRequestedAt" IS NOT NULL
            AND "deletionRequestedAt" <= ${cutoff} AND id > ${afterId} ORDER BY id LIMIT ${BATCH}`
      : await prisma.$queryRaw<{ id: string }[]>`
          SELECT id FROM "Partner" WHERE "deletedAt" IS NULL AND "deletionRequestedAt" IS NOT NULL
            AND "deletionRequestedAt" <= ${cutoff} AND id > ${afterId} ORDER BY id LIMIT ${BATCH}`;
  return rows.map((row) => row.id);
}

async function purgeAll(
  table: 'User' | 'Partner',
  cutoff: Date,
  now: Date,
  one: (tx: Tx, id: string, cutoff: Date, now: Date) => Promise<boolean>
) {
  let done = 0;
  let afterId = '';
  for (;;) {
    const ids = await dueIds(table, cutoff, afterId);
    if (!ids.length) return done;
    for (const id of ids) {
      try {
        if (await prisma.$transaction((tx) => one(tx, id, cutoff, now))) done += 1;
      } catch (error) {
        // One bad row must not stop the run; it is retried next time.
        console.error(`[purge] ${table} ${id} failed`, error);
      }
    }
    afterId = ids[ids.length - 1];
  }
}

export async function runAccountPurge(now = new Date()): Promise<PurgeResult> {
  return prisma.$transaction(
    async (lockTx) => {
      const got = await lockTx.$queryRaw<{ ok: boolean }[]>`SELECT pg_try_advisory_lock(${PURGE_LOCK_KEY}) AS ok`;
      if (!got[0]?.ok) return { skipped: true, users: 0, partners: 0, deletedIdentitiesRemoved: 0 };
      try {
        const cutoff = purgeCutoff(now);
        const users = await purgeAll('User', cutoff, now, purgeUser);
        const partners = await purgeAll('Partner', cutoff, now, purgePartner);
        const retentionCutoff = new Date(now.getTime() - deletedIdentityRetentionDays() * 24 * 60 * 60 * 1000);
        const removed = await prisma.deletedIdentity.deleteMany({ where: { deletedAt: { lt: retentionCutoff } } });
        await prisma.reauthGrant.deleteMany({ where: { expiresAt: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) } } });
        return { skipped: false, users, partners, deletedIdentitiesRemoved: removed.count };
      } finally {
        await lockTx.$queryRaw`SELECT pg_advisory_unlock(${PURGE_LOCK_KEY})`;
      }
    },
    { timeout: 30 * 60_000, maxWait: 10_000 }
  );
}

/** Runs the purge on an interval (default hourly) while the API process is up. */
export function startAccountPurgeSweep(intervalMs = 60 * 60_000) {
  const tick = () => {
    runAccountPurge()
      .then((r) => {
        if (r.users || r.partners || r.deletedIdentitiesRemoved) console.log('[purge]', r);
      })
      .catch((error) => console.error('[purge] run failed', error));
  };
  tick();
  return setInterval(tick, intervalMs);
}
