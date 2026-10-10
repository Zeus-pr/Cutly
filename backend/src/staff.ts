import type { PrismaClient } from '@prisma/client';
import { todayKeyIST } from './ist';

export type TimeWindow = { start: Date; end: Date };

export function overlaps(a: TimeWindow, b: TimeWindow): boolean {
  return a.start < b.end && b.start < a.end;
}

/** Open chairs for an IST calendar day = min(workers, chairs). */
export async function getDayCapacity(
  prisma: PrismaClient,
  shopId: string,
  dateKey = todayKeyIST()
): Promise<number> {
  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  if (!shop) return 0;
  const capacity = await prisma.shopDayCapacity.findUnique({
    where: { shopId_date: { shopId, date: dateKey } }
  });
  const workers = capacity?.workersPresent ?? shop.chairCount;
  const chairs = capacity?.chairsInUse ?? shop.chairCount;
  return Math.max(0, Math.min(workers, chairs));
}

export function countOverlapping(
  window: TimeWindow,
  busy: TimeWindow[]
): number {
  return busy.filter((row) => overlaps(window, row)).length;
}

/** True when adding this visit would exceed day capacity (CJ-21). */
export function isAtShopCapacity(
  window: TimeWindow,
  shopBusy: TimeWindow[],
  capacity: number
): boolean {
  if (capacity <= 0) return true;
  return countOverlapping(window, shopBusy) >= capacity;
}

const PLACEHOLDER = 'Any chair';

/** Named staff rows — seed Staff 1..N; drop legacy “Any chair” when real staff exist (CJ-19). */
export async function ensureStaffBarbers(prisma: PrismaClient, shopId: string, count?: number) {
  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  if (!shop) throw new Error('Shop not found.');
  const target = Math.max(1, Math.min(40, count ?? shop.chairCount));
  let rows = await prisma.barber.findMany({ where: { shopId }, orderBy: { name: 'asc' } });
  const real = rows.filter((row) => row.name !== PLACEHOLDER);

  if (real.length > 0) {
    if (real.length !== rows.length) {
      await prisma.barber.deleteMany({ where: { shopId, name: PLACEHOLDER } });
      rows = real;
    }
  } else if (rows.length === 0) {
    await prisma.barber.createMany({
      data: Array.from({ length: target }, (_, i) => ({
        shopId,
        name: `Staff ${i + 1}`,
        rating: 5
      }))
    });
    rows = await prisma.barber.findMany({ where: { shopId }, orderBy: { name: 'asc' } });
  } else {
    // Only placeholder(s) — rename first to Staff 1 and fill up to target
    const first = rows[0];
    await prisma.barber.update({ where: { id: first.id }, data: { name: 'Staff 1' } });
    for (let i = rows.length; i < target; i += 1) {
      await prisma.barber.create({ data: { shopId, name: `Staff ${i + 1}`, rating: 5 } });
    }
    await prisma.barber.deleteMany({ where: { shopId, name: PLACEHOLDER } });
    rows = await prisma.barber.findMany({ where: { shopId }, orderBy: { name: 'asc' } });
  }

  if (rows.length < target) {
    for (let i = rows.length; i < target; i += 1) {
      await prisma.barber.create({ data: { shopId, name: `Staff ${i + 1}`, rating: 5 } });
    }
    rows = await prisma.barber.findMany({ where: { shopId }, orderBy: { name: 'asc' } });
  }

  return rows.filter((row) => row.name !== PLACEHOLDER);
}

export async function listBookableBarbers(prisma: PrismaClient, shopId: string) {
  return ensureStaffBarbers(prisma, shopId);
}

export async function loadBarberBlocks(
  prisma: PrismaClient,
  barberId: string,
  day: { start: Date; end: Date }
): Promise<{ breaks: TimeWindow[]; leave: TimeWindow[] }> {
  const [breaks, leave] = await Promise.all([
    prisma.barberBreak.findMany({
      where: { barberId, startsAt: { lt: day.end }, endsAt: { gt: day.start } }
    }),
    prisma.barberLeave.findMany({
      where: { barberId, startsAt: { lt: day.end }, endsAt: { gt: day.start } }
    })
  ]);
  return {
    breaks: breaks.map((row) => ({ start: row.startsAt, end: row.endsAt })),
    leave: leave.map((row) => ({ start: row.startsAt, end: row.endsAt }))
  };
}
