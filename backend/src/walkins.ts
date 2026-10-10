import type { Prisma, PrismaClient } from '@prisma/client';
import type { TimeWindow } from './staff';

type Db = PrismaClient | Prisma.TransactionClient;

export const WALK_IN_DURATIONS = [15, 30, 45, 60] as const;

export function assertWalkInDuration(minutes: number): number {
  if (!(WALK_IN_DURATIONS as readonly number[]).includes(minutes)) {
    throw new Error('Pick 15, 30, 45, or 60 minutes for a walk-in.');
  }
  return minutes;
}

/** Active walk-in windows for a shop (optional barber / time overlap). */
export async function loadActiveWalkIns(
  db: Db,
  where: {
    shopId: string;
    barberId?: string;
    overlap?: TimeWindow;
  }
): Promise<TimeWindow[]> {
  const rows = await db.walkIn.findMany({
    where: {
      shopId: where.shopId,
      status: 'ACTIVE',
      ...(where.barberId ? { barberId: where.barberId } : {}),
      ...(where.overlap
        ? { startsAt: { lt: where.overlap.end }, endsAt: { gt: where.overlap.start } }
        : {})
    }
  });
  return rows.map((row) => ({ start: row.startsAt, end: row.endsAt }));
}

export async function findWalkInClash(
  db: Db,
  barberId: string,
  window: TimeWindow,
  excludeId?: string
) {
  return db.walkIn.findFirst({
    where: {
      barberId,
      status: 'ACTIVE',
      startsAt: { lt: window.end },
      endsAt: { gt: window.start },
      ...(excludeId ? { NOT: { id: excludeId } } : {})
    }
  });
}
