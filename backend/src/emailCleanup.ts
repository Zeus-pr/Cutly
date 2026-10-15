/**
 * T4 (#9), DBA item 5: its own job (not the T3 purge). Every 15 min, single runner via a
 * transaction-level advisory lock with a different key from T3 (830_008).
 * - EmailCode / PendingSignup rows that expired more than 1 hour ago, in batches of 1000
 * - EmailRelease audit rows older than 12 months; EmailSuppression older than 24 months
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export const EMAIL_CLEANUP_LOCK_KEY = 830_009;
const BATCH = 1000;

async function deleteBatched(table: 'emailCode' | 'pendingSignup', cutoff: Date) {
  // ORM (not raw SQL) so the cutoff compares in UTC like Prisma stores it.
  const model = prisma[table] as unknown as {
    findMany(args: object): Promise<{ id: string }[]>;
    deleteMany(args: object): Promise<{ count: number }>;
  };
  let total = 0;
  for (;;) {
    const ids = (await model.findMany({ where: { expiresAt: { lt: cutoff } }, select: { id: true }, take: BATCH })).map((r) => r.id);
    if (!ids.length) return total;
    total += (await model.deleteMany({ where: { id: { in: ids } } })).count;
    if (ids.length < BATCH) return total;
  }
}

export async function runEmailCleanup(now = new Date()) {
  return prisma.$transaction(
    async (tx) => {
      const got = await tx.$queryRaw<{ ok: boolean }[]>`SELECT pg_try_advisory_xact_lock(${EMAIL_CLEANUP_LOCK_KEY}) AS ok`;
      if (!got[0]?.ok) return { skipped: true, codes: 0, pending: 0, releases: 0, suppressions: 0 };
      const hourAgo = new Date(now.getTime() - 60 * 60_000);
      const codes = await deleteBatched('emailCode', hourAgo);
      const pending = await deleteBatched('pendingSignup', hourAgo);
      const year = new Date(now);
      year.setUTCMonth(year.getUTCMonth() - 12);
      const twoYears = new Date(now);
      twoYears.setUTCMonth(twoYears.getUTCMonth() - 24);
      const releases = (await prisma.emailRelease.deleteMany({ where: { createdAt: { lt: year } } })).count;
      const suppressions = (await prisma.emailSuppression.deleteMany({ where: { createdAt: { lt: twoYears } } })).count;
      return { skipped: false, codes, pending, releases, suppressions };
    },
    { timeout: 5 * 60_000, maxWait: 10_000 }
  );
}

export function startEmailCleanupSweep(intervalMs = 15 * 60_000) {
  const tick = () => {
    runEmailCleanup()
      .then((r) => {
        if (r.codes || r.pending || r.releases || r.suppressions) console.log('[email-cleanup]', r);
      })
      .catch((error) => console.error('[email-cleanup] run failed', error instanceof Error ? error.message : error));
  };
  tick();
  return setInterval(tick, intervalMs);
}
