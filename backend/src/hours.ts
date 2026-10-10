import { PrismaClient } from '@prisma/client';
import { assertDateKeyIST, atIST, dateKeyIST, IST, todayKeyIST } from './ist';

const DEFAULT_OPENS = '10:00';
const DEFAULT_CLOSES = '21:00';

/** Weekday in Asia/Kolkata: 0 = Sunday … 6 = Saturday (JS Date convention). */
export function weekdayIST(dateKey: string): number {
  const at = new Date(`${assertDateKeyIST(dateKey)}T12:00:00+05:30`);
  const name = new Intl.DateTimeFormat('en-US', { timeZone: IST, weekday: 'short' }).format(at);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const day = map[name];
  if (day === undefined) throw new Error('Could not resolve weekday.');
  return day;
}

/** Normalize `H:mm` / `HH:mm` / `HH:mm:ss` → `HH:mm:ss` for atIST. */
export function normalizeHms(value: string): string {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) throw new Error('Invalid shop hours.');
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  const ss = Number(match[3] || '0');
  if (hh > 23 || mm > 59 || ss > 59) throw new Error('Invalid shop hours.');
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

export type DayWindow = { start: Date; end: Date } | null;

type HourRow = { opensAt: string; closesAt: string };

function windowFromRow(dateKey: string, row: HourRow): DayWindow {
  const start = atIST(dateKey, normalizeHms(row.opensAt));
  const end = atIST(dateKey, normalizeHms(row.closesAt));
  if (end.getTime() <= start.getTime()) return null;
  return { start, end };
}

function intersect(a: { start: Date; end: Date }, b: { start: Date; end: Date }): DayWindow {
  const start = a.start.getTime() > b.start.getTime() ? a.start : b.start;
  const end = a.end.getTime() < b.end.getTime() ? a.end : b.end;
  if (end.getTime() <= start.getTime()) return null;
  return { start, end };
}

/** Seed Mon–Sun 10:00–21:00 IST when a shop has no hour rows yet. */
export async function ensureDefaultShopHours(prisma: PrismaClient, shopId: string) {
  const count = await prisma.shopWorkingHours.count({ where: { shopId } });
  if (count > 0) return;
  await prisma.shopWorkingHours.createMany({
    data: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
      shopId,
      weekday,
      opensAt: DEFAULT_OPENS,
      closesAt: DEFAULT_CLOSES
    }))
  });
}

/**
 * Shop ∩ barber window for an IST calendar day.
 * Missing shop weekday row → closed (null). Barber hours optional.
 */
export async function resolveOpenWindow(
  prisma: PrismaClient,
  input: { shopId: string; dateKey: string; barberId?: string }
): Promise<DayWindow> {
  await ensureDefaultShopHours(prisma, input.shopId);
  const weekday = weekdayIST(input.dateKey);
  const shopHours = await prisma.shopWorkingHours.findUnique({
    where: { shopId_weekday: { shopId: input.shopId, weekday } }
  });
  if (!shopHours) return null;
  const shopWindow = windowFromRow(input.dateKey, shopHours);
  if (!shopWindow) return null;

  if (!input.barberId) return shopWindow;
  const barberHours = await prisma.barberWorkingHours.findUnique({
    where: { barberId_weekday: { barberId: input.barberId, weekday } }
  });
  if (!barberHours) return shopWindow;
  const barberWindow = windowFromRow(input.dateKey, barberHours);
  if (!barberWindow) return null;
  return intersect(shopWindow, barberWindow);
}

/**
 * Shop ∩ barber windows for many chairs in two queries (shop row + barber rows).
 * Missing barber hours fall back to the shop window, same as `resolveOpenWindow`.
 */
export async function openWindowsForBarbers(
  prisma: PrismaClient,
  input: { shopId: string; dateKey: string; barberIds: string[] }
): Promise<Map<string, DayWindow>> {
  const out = new Map<string, DayWindow>();
  if (!input.barberIds.length) return out;
  await ensureDefaultShopHours(prisma, input.shopId);
  const weekday = weekdayIST(input.dateKey);
  const [shopHours, barberHours] = await Promise.all([
    prisma.shopWorkingHours.findUnique({
      where: { shopId_weekday: { shopId: input.shopId, weekday } }
    }),
    prisma.barberWorkingHours.findMany({
      where: { barberId: { in: input.barberIds }, weekday }
    })
  ]);
  const shopWindow = shopHours ? windowFromRow(input.dateKey, shopHours) : null;
  const byBarber = new Map(barberHours.map((row) => [row.barberId, row]));
  for (const id of input.barberIds) {
    if (!shopWindow) {
      out.set(id, null);
      continue;
    }
    const row = byBarber.get(id);
    if (!row) {
      out.set(id, shopWindow);
      continue;
    }
    const barberWindow = windowFromRow(input.dateKey, row);
    out.set(id, barberWindow ? intersect(shopWindow, barberWindow) : null);
  }
  return out;
}

export function isWithinWindow(startsAt: Date, endsAt: Date, window: { start: Date; end: Date }): boolean {
  return startsAt.getTime() >= window.start.getTime() && endsAt.getTime() <= window.end.getTime();
}

/** Display helper for opens/closes wall times, e.g. "9:00 PM". */
export function formatClosesLabel(closesAt: string): string {
  const hms = normalizeHms(closesAt);
  const [hh, mm] = hms.split(':').map(Number);
  const hour = hh % 12 || 12;
  const suffix = hh >= 12 ? 'PM' : 'AM';
  return mm === 0 ? `${hour}:00 ${suffix}` : `${hour}:${String(mm).padStart(2, '0')} ${suffix}`;
}

export type ShopOpenStatus = {
  isOpen: boolean;
  /** Card chip, e.g. "Open · Closes 9:00 PM" */
  hoursChip: string;
  /** Detail line without leading dot, e.g. "Closes at 9:00 PM" */
  hoursDetail: string;
};

/** Pure open/closed status for an IST day hour row (CJ-10). */
export function openStatusFromHoursRow(
  dateKey: string,
  row: HourRow | null | undefined,
  now = new Date()
): ShopOpenStatus {
  if (!row) {
    return { isOpen: false, hoursChip: 'Closed', hoursDetail: 'Closed today' };
  }
  const window = windowFromRow(dateKey, row);
  if (!window) {
    return { isOpen: false, hoursChip: 'Closed', hoursDetail: 'Closed today' };
  }
  const t = now.getTime();
  if (t < window.start.getTime()) {
    const opens = formatClosesLabel(row.opensAt);
    return {
      isOpen: false,
      hoursChip: `Closed · Opens ${opens}`,
      hoursDetail: `Opens at ${opens}`
    };
  }
  if (t >= window.end.getTime()) {
    return { isOpen: false, hoursChip: 'Closed', hoursDetail: 'Closed for today' };
  }
  const closes = formatClosesLabel(row.closesAt);
  return {
    isOpen: true,
    hoursChip: `Open · Closes ${closes}`,
    hoursDetail: `Closes at ${closes}`
  };
}

export type ShopAcceptingFields = {
  acceptingAppointments: boolean;
  acceptingPausedUntil: Date | null;
};

/** Partner toggle / explore: taking new bookings right now (not future days). */
export function isShopBookableNow(shop: ShopAcceptingFields, now = new Date()): boolean {
  if (!shop.acceptingAppointments) return false;
  if (shop.acceptingPausedUntil && shop.acceptingPausedUntil.getTime() > now.getTime()) return false;
  return true;
}

/** Block hold/pay when the slot falls on today during a “close for today” pause. */
export function assertSlotAllowedByAccepting(
  shop: ShopAcceptingFields,
  startsAt: Date,
  now = new Date()
): void {
  if (!shop.acceptingAppointments) {
    throw new Error('This shop is not taking appointments right now.');
  }
  if (!shop.acceptingPausedUntil || shop.acceptingPausedUntil.getTime() <= now.getTime()) return;
  const todayKey = todayKeyIST(now);
  if (dateKeyIST(startsAt) === todayKey && startsAt.getTime() < shop.acceptingPausedUntil.getTime()) {
    throw new Error('This shop is not taking bookings for today.');
  }
}

/** Public weekly hours for a shop (missing weekday = closed). Seeds defaults if empty. */
export async function getPublicShopHours(prisma: PrismaClient, shopId: string) {
  const shop = await prisma.shop.findFirst({
    where: { id: shopId, isActive: true },
    select: { id: true, name: true }
  });
  if (!shop) throw new Error('Shop not found.');
  await ensureDefaultShopHours(prisma, shopId);
  const rows = await prisma.shopWorkingHours.findMany({
    where: { shopId },
    orderBy: { weekday: 'asc' }
  });
  return {
    shopId: shop.id,
    shopName: shop.name,
    days: rows.map((row) => ({
      weekday: row.weekday,
      opensAt: row.opensAt.slice(0, 5),
      closesAt: row.closesAt.slice(0, 5)
    }))
  };
}

/** End of today’s shop hours in IST (for “close for today”). */
export async function resolveTodayBookingPauseUntil(
  prisma: PrismaClient,
  shopId: string,
  now = new Date()
): Promise<Date> {
  await ensureDefaultShopHours(prisma, shopId);
  const dateKey = todayKeyIST(now);
  const weekday = weekdayIST(dateKey);
  const row = await prisma.shopWorkingHours.findUnique({
    where: { shopId_weekday: { shopId, weekday } }
  });
  if (!row) return atIST(dateKey, '23:59:59');
  const window = windowFromRow(dateKey, row);
  if (!window) return atIST(dateKey, '23:59:59');
  return window.end;
}

/** Batch open status for shop cards / explore filter. */
export async function loadOpenStatusForShops(
  prisma: PrismaClient,
  shopIds: string[],
  now = new Date()
): Promise<Map<string, ShopOpenStatus>> {
  const result = new Map<string, ShopOpenStatus>();
  if (!shopIds.length) return result;
  const dateKey = todayKeyIST(now);
  const weekday = weekdayIST(dateKey);
  await Promise.all(shopIds.map((id) => ensureDefaultShopHours(prisma, id)));
  const [rows, shops] = await Promise.all([
    prisma.shopWorkingHours.findMany({
      where: { shopId: { in: shopIds }, weekday }
    }),
    prisma.shop.findMany({
      where: { id: { in: shopIds } },
      select: { id: true, acceptingAppointments: true, acceptingPausedUntil: true }
    })
  ]);
  const byShop = new Map(rows.map((row) => [row.shopId, row]));
  const shopMeta = new Map(shops.map((row) => [row.id, row]));
  for (const id of shopIds) {
    const fromHours = openStatusFromHoursRow(dateKey, byShop.get(id), now);
    const meta = shopMeta.get(id);
    if (!meta) {
      result.set(id, fromHours);
      continue;
    }
    if (!isShopBookableNow(meta, now)) {
      const pausedToday =
        meta.acceptingAppointments &&
        meta.acceptingPausedUntil &&
        meta.acceptingPausedUntil.getTime() > now.getTime();
      result.set(id, {
        isOpen: false,
        hoursChip: pausedToday ? 'Closed · Not taking bookings today' : 'Closed · Not taking bookings',
        hoursDetail: pausedToday
          ? 'Not taking new bookings for today'
          : 'Not taking appointments right now'
      });
      continue;
    }
    result.set(id, fromHours);
  }
  return result;
}
