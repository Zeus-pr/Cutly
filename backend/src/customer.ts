import { Prisma, PrismaClient } from '@prisma/client';
import { assertFutureStart, calculateSlots, filterFutureSlots, mapBuffered, withBuffer } from './availability';
import { assertTransition, type BookingState } from './bookingState';
import { AVAILABILITY_FREE_STATUSES } from './activeBooking';
import { expireMissedAwaitingBookings } from './awaitingExpiry';
import { cancelPolicy } from './cancelPolicy';
import {
  CUSTOMER_OVERLAP_MESSAGE,
  customerTicketBlocksOverlap,
  rangesOverlap
} from './customerOverlap';
import { notifyWaitingStarted } from './waitingNotify';
import { holdExpiresAt, isHoldAlive } from './holds';
import {
  assertSlotAllowedByAccepting,
  getPublicShopHours,
  isWithinWindow,
  loadOpenStatusForShops,
  openWindowsForBarbers,
  resolveOpenWindow,
  type ShopOpenStatus
} from './hours';
import { assertDateKeyIST, addDaysKeyIST, dayRangeIST, formatIST, todayKeyIST } from './ist';
import { userFromToken } from './auth';
import { displayReviewerName } from './accountDeletion';
import { AppError } from './httpError';
import { notifyShopPartner, notifyUser } from './push';
import { SLOT_TAKEN_MESSAGE, throwIfSlotRace } from './race';
import { barberRatingFromReviews, resolveListService, shopRatingFromReviews } from './shopList';
import {
  isAtShopCapacity,
  listBookableBarbers,
  getDayCapacity,
  type TimeWindow
} from './staff';
import { findWalkInClash, loadActiveWalkIns } from './walkins';
import { createRazorpayOrder, paymentsEnabled, verifyRazorpaySignature } from './razorpay';
import {
  archivedIdempotencyKey,
  bindClientIdempotencyKey,
  bookingIdempotencyKey
} from './money';
import { normalizeServiceIds, resolveServicePackage } from './servicePackage';

const CAPACITY_CLOSED_MESSAGE = 'Shop has no open seats today (0 workers on the floor). Try another day.';

const txOpts = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable } as const;

const prisma = new PrismaClient();
const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=900';

function toNum(value: { toNumber?: () => number } | number | string) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  return value.toNumber ? value.toNumber() : Number(value);
}

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function bookingCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'CU-';
  for (let i = 0; i < 5; i += 1) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}

/** Rapido/Uber-style 4-digit visit PIN (customer shows, partner enters). */
function makeVerifyPin() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

async function assertNoCustomerOverlap(input: {
  userId: string;
  startsAt: Date;
  endsAt: Date;
  excludeBookingId?: string;
}) {
  const candidates = await prisma.booking.findMany({
    where: {
      userId: input.userId,
      startsAt: { lt: input.endsAt },
      endsAt: { gt: input.startsAt },
      ...(input.excludeBookingId ? { NOT: { id: input.excludeBookingId } } : {})
    },
    select: { id: true, status: true, startsAt: true, endsAt: true }
  });
  const hit = candidates.find(
    (row) =>
      customerTicketBlocksOverlap(row.status) &&
      rangesOverlap(input.startsAt, input.endsAt, row.startsAt, row.endsAt)
  );
  if (hit) throw new Error(CUSTOMER_OVERLAP_MESSAGE);
}

/** Intent keys on these statuses must not block a new book for the same slot/staff. */
const TERMINAL_INTENT_STATUSES = [
  'CANCELLED',
  'EXPIRED',
  'REJECTED',
  'FAILED',
  'COMPLETED',
  'NO_SHOW'
] as const;

/** Same client intent key must not block a new booking after a terminal visit (CJ-13 / CJ-14). */
async function releaseIntentKeyIfTerminal(userId: string, idempotencyKey: string) {
  const prior = await prisma.booking.findUnique({ where: { idempotencyKey } });
  if (!prior || prior.userId !== userId) return;
  if (!(TERMINAL_INTENT_STATUSES as readonly string[]).includes(prior.status)) return;
  await prisma.booking.update({
    where: { id: prior.id },
    data: { idempotencyKey: archivedIdempotencyKey(prior.id) }
  });
}

/** Next free slot ISO for a shop service — look ahead 7 IST days (CJ-33). */
async function nextAvailableAtForService(shopId: string, serviceId: string) {
  const startKey = todayKeyIST();
  for (let i = 0; i < 7; i += 1) {
    const date = i === 0 ? startKey : addDaysKeyIST(startKey, i);
    try {
      const slots = await shopAvailability({ shopId, serviceId, date });
      if (slots[0]?.start) return slots[0].start;
    } catch {
      // Shop closed / no staff that day — keep looking.
    }
  }
  return null;
}

function mapShop(
  shop: {
    id: string;
    name: string;
    address: string;
    city: string;
    phone?: string | null;
    latitude: unknown;
    longitude: unknown;
    amenities: string[];
    productBrands?: string[];
    kind?: string | null;
    kinds?: string[];
    images: { url: string }[];
    services: { pricePaise: number; service: { id: string; name: string; durationMinutes: number } }[];
    reviews: { rating: number }[];
  },
  origin: { lat: number; lng: number } | undefined,
  open: ShopOpenStatus,
  extras: { priceFromPaise: number; nextAvailableAt: string | null }
) {
  const lat = toNum(shop.latitude as never);
  const lng = toNum(shop.longitude as never);
  const distanceKm = origin ? Math.round(haversineKm(origin.lat, origin.lng, lat, lng) * 10) / 10 : 0;
  const { rating, reviewCount } = shopRatingFromReviews(shop.reviews);
  const kinds =
    shop.kinds?.length ? shop.kinds : shop.kind ? [shop.kind] : [];
  const photos = shop.images.map((img) => img.url).filter(Boolean);
  return {
    id: shop.id,
    name: shop.name,
    kind: shop.kind ?? null,
    kinds,
    imageUrl: photos[0] || FALLBACK_IMAGE,
    rating,
    reviewCount,
    distanceKm,
    isOpen: open.isOpen,
    hoursChip: open.hoursChip,
    hoursDetail: open.hoursDetail,
    address: shop.address,
    city: shop.city,
    phone: shop.phone || null,
    priceFromPaise: extras.priceFromPaise,
    nextAvailableAt: extras.nextAvailableAt,
    services: shop.services.map((row) => row.service.name),
    menu: shop.services.map((row) => ({
      name: row.service.name,
      pricePaise: row.pricePaise
    })),
    tags: shop.amenities.slice(0, 3),
    amenities: shop.amenities,
    productBrands: shop.productBrands ?? [],
    photos,
    latitude: lat,
    longitude: lng
  };
}

export async function listNearbyShops(input: {
  latitude?: number;
  longitude?: number;
  query?: string;
  openNow?: boolean;
  radiusKm?: number;
  serviceName?: string;
  /** Comma-separated ShopKind values, e.g. BARBER,SALON */
  kinds?: string;
  /** Comma-separated menu substrings — shop must match at least one */
  serviceHints?: string;
}) {
  const lat = input.latitude ?? 23.2324;
  const lng = input.longitude ?? 87.8615;
  const radius = input.radiusKm ?? 25;
  const kindSet = (input.kinds || '')
    .split(',')
    .map((k) => k.trim().toUpperCase())
    .filter(Boolean);
  const hintList = (input.serviceHints || '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  const rows = await prisma.shop.findMany({
    where: {
      setupDone: true,
      status: 'ACTIVE',
      ...(kindSet.length
        ? {
            OR: [
              { kind: { in: kindSet as never } },
              { kinds: { hasSome: kindSet as never } }
            ]
          }
        : {})
    },
    include: {
      images: { orderBy: { sortOrder: 'asc' }, take: 1 },
      services: { include: { service: true } },
      reviews: { select: { rating: true } }
    }
  });
  const openById = await loadOpenStatusForShops(
    prisma,
    rows.map((shop) => shop.id)
  );

  const candidates = rows
    .map((shop) => {
      const open = openById.get(shop.id) || {
        isOpen: false,
        hoursChip: 'Closed',
        hoursDetail: 'Closed today'
      };
      const resolved = resolveListService(shop.services, input.serviceName);
      if (input.serviceName?.trim() && !resolved) return null;
      const card = mapShop(shop, { lat, lng }, open, {
        priceFromPaise: resolved?.pricePaise ?? 0,
        nextAvailableAt: null
      });
      return { shop, resolved, card };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .filter(({ card }) => card.distanceKm <= radius)
    .filter(({ card }) => {
      if (!hintList.length) return true;
      const hay = card.services.join(' ').toLowerCase();
      return hintList.some((h) => hay.includes(h));
    })
    .filter(({ card }) => {
      if (!input.query?.trim()) return true;
      // CJ-35: flat substring on name + live menu + address (no synonym expansion).
      const needle = input.query.trim().toLowerCase().replace(/\s+/g, ' ');
      const hay = [card.name, card.city, card.address, ...card.services]
        .join(' ')
        .toLowerCase()
        .replace(/\s+/g, ' ');
      return hay.includes(needle);
    })
    .filter(({ card }) => (input.openNow ? card.isOpen : true));

  // Real next slot only for shops that already pass filters (CJ-33).
  const mapped = await Promise.all(
    candidates.map(async ({ resolved, card }) => {
      if (!resolved) return card;
      const nextAvailableAt = await nextAvailableAtForService(card.id, resolved.serviceId);
      return { ...card, nextAvailableAt };
    })
  );

  const query = input.query?.trim() || '';
  if (!query) return mapped.sort((a, b) => a.distanceKm - b.distanceKm);

  // CJ-35: name-first, then menu match, then address/city, then distance.
  const rank = (card: (typeof mapped)[number]) => {
    const n = query.toLowerCase().replace(/\s+/g, ' ');
    const name = card.name.toLowerCase();
    if (name.includes(n)) return 0;
    if (card.services.some((s) => s.toLowerCase().includes(n))) return 1;
    if (card.city.toLowerCase().includes(n) || card.address.toLowerCase().includes(n)) return 2;
    return 3;
  };
  return mapped.sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    return a.distanceKm - b.distanceKm;
  });
}

export async function shopHours(id: string) {
  return getPublicShopHours(prisma, id);
}

/** T3-Q9: a CLOSED or purged shop answers 410 SHOP_CLOSED (deep links, favourites). */
export const SHOP_CLOSED = () => new AppError('This shop is no longer taking bookings.', 410, 'SHOP_CLOSED');

async function throwShopMissing(id: string): Promise<never> {
  const row = await prisma.shop.findUnique({ where: { id }, select: { status: true, deletedAt: true } });
  if (row && (row.status === 'CLOSED' || row.deletedAt)) throw SHOP_CLOSED();
  throw new Error('Shop not found.');
}

export async function getShop(id: string, origin?: { lat: number; lng: number }) {
  const shop = await prisma.shop.findFirst({
    where: { id, setupDone: true, status: 'ACTIVE' },
    include: {
      images: { orderBy: { sortOrder: 'asc' }, take: 8 },
      services: { include: { service: true } },
      reviews: { select: { rating: true } }
    }
  });
  if (!shop) await throwShopMissing(id);
  if (!shop) throw new Error('Shop not found.');
  const openById = await loadOpenStatusForShops(prisma, [shop.id]);
  const resolved = resolveListService(shop.services);
  const nextAvailableAt = resolved
    ? await nextAvailableAtForService(shop.id, resolved.serviceId)
    : null;
  return mapShop(
    shop,
    origin,
    openById.get(shop.id) || { isOpen: false, hoursChip: 'Closed', hoursDetail: 'Closed today' },
    {
      priceFromPaise: resolved?.pricePaise ?? 0,
      nextAvailableAt
    }
  );
}

export async function shopServices(shopId: string) {
  const rows = await prisma.shopService.findMany({
    where: { shopId, service: { active: true } },
    include: { service: { include: { category: true } } },
    orderBy: { service: { name: 'asc' } }
  });
  return rows.map((row) => ({
    id: row.serviceId,
    name: row.service.name,
    durationMinutes: row.durationMinutes || row.service.durationMinutes,
    pricePaise: row.pricePaise,
    audience: row.audience,
    /** Ops global tile (CJ-71). Null → client falls back to name match / More. */
    categoryId: row.service.categoryId || null,
    categoryLabel: row.service.category?.gridLabel || row.service.category?.label || null,
    description: undefined as string | undefined
  }));
}

export async function shopBarbers(shopId: string) {
  const rows = await listBookableBarbers(prisma, shopId);
  const counts = await prisma.review.groupBy({
    by: ['barberId'],
    where: { barberId: { in: rows.map((row) => row.id) } },
    _count: { _all: true }
  });
  const countById = new Map(counts.map((row) => [row.barberId, row._count._all]));
  return rows.map((row) => {
    const reviewCount = countById.get(row.id) || 0;
    const ratingNum = toNum(row.rating as never);
    return {
      id: row.id,
      name: row.name,
      rating: reviewCount > 0 ? ratingNum : null,
      reviewCount,
      imageUrl: undefined as string | undefined,
      nextAvailableAt: null as string | null
    };
  });
}

export async function listShopReviews(shopId: string) {
  const shop = await prisma.shop.findFirst({ where: { id: shopId, setupDone: true, status: 'ACTIVE' } });
  if (!shop) await throwShopMissing(shopId);
  const rows = await prisma.review.findMany({
    // Reviews of closed shops are never listed publicly (text is kept in the DB).
    where: { shopId, shop: { status: 'ACTIVE', deletedAt: null } },
    orderBy: { createdAt: 'desc' },
    take: 40,
    include: {
      user: { select: { name: true, deletionRequestedAt: true, deletedAt: true } },
      barber: { select: { id: true, name: true } }
    }
  });
  return rows.map((row) => ({
    id: row.id,
    shopRating: row.rating,
    barberRating: row.barberRating,
    text: row.text,
    createdAt: row.createdAt.toISOString(),
    customerName: displayReviewerName(row.user),
    barber: { id: row.barber.id, name: row.barber.name }
  }));
}

export async function createBookingReview(
  token: string,
  bookingId: string,
  input: { shopRating: number; barberRating: number; text?: string }
) {
  const user = await userFromToken(token);
  const shopRating = Math.round(input.shopRating);
  const barberRating = Math.round(input.barberRating);
  if (shopRating < 1 || shopRating > 5 || barberRating < 1 || barberRating > 5) {
    throw new Error('Rate the shop and the staff member from 1 to 5 stars.');
  }
  const text = input.text?.trim() ? input.text.trim().slice(0, 500) : null;

  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, userId: user.id },
    include: { review: true }
  });
  if (!booking) throw new Error('Booking not found.');
  if (booking.status !== 'COMPLETED') throw new Error('You can review only after the visit is completed.');
  if (booking.review) throw new Error('You already reviewed this visit.');
  // T3 case 36 (Prajesh): PAUSED shops still take reviews; only CLOSED/purged shops block.
  const shopRow = await prisma.shop.findUnique({ where: { id: booking.shopId }, select: { status: true, deletedAt: true } });
  if (!shopRow || shopRow.status === 'CLOSED' || shopRow.deletedAt) throw SHOP_CLOSED();

  const review = await prisma.$transaction(async (tx) => {
    const created = await tx.review.create({
      data: {
        userId: user.id,
        shopId: booking.shopId,
        barberId: booking.barberId,
        bookingId: booking.id,
        rating: shopRating,
        barberRating,
        text
      }
    });
    const barberReviews = await tx.review.findMany({
      where: { barberId: booking.barberId },
      select: { barberRating: true }
    });
    await tx.barber.update({
      where: { id: booking.barberId },
      data: { rating: barberRatingFromReviews(barberReviews) }
    });
    return created;
  });

  return {
    id: review.id,
    shopRating: review.rating,
    barberRating: review.barberRating,
    text: review.text,
    createdAt: review.createdAt.toISOString()
  };
}

async function shopBusyWindows(
  shopId: string,
  day: { start: Date; end: Date },
  now: Date,
  bufferMinutes: number,
  excludeUserId?: string
): Promise<TimeWindow[]> {
  const [bookings, holds, walkIns] = await Promise.all([
    prisma.booking.findMany({
      where: {
        shopId,
        startsAt: { gte: day.start, lt: day.end },
        status: { notIn: [...AVAILABILITY_FREE_STATUSES] }
      },
      include: { services: { include: { service: true } } }
    }),
    prisma.bookingHold.findMany({
      where: {
        shopId,
        expiresAt: { gt: now },
        startsAt: { gte: day.start, lt: day.end },
        ...(excludeUserId ? { userId: { not: excludeUserId } } : {})
      }
    }),
    loadActiveWalkIns(prisma, { shopId, overlap: day })
  ]);
  return busyWindowsFromRows(bookings, holds, walkIns, bufferMinutes);
}

function busyWindowsFromRows(
  bookings: { startsAt: Date; endsAt: Date; services: { service: { bufferMinutes: number } }[] }[],
  holds: { startsAt: Date; endsAt: Date }[],
  walkIns: TimeWindow[],
  bufferMinutes: number
): TimeWindow[] {
  return [
    ...bookings.map((row) => {
      const ownBuffer = Math.max(0, ...row.services.map((s) => s.service.bufferMinutes), bufferMinutes);
      return withBuffer({ start: row.startsAt, end: row.endsAt }, ownBuffer);
    }),
    ...mapBuffered(
      holds.map((row) => ({ start: row.startsAt, end: row.endsAt })),
      bufferMinutes
    ),
    ...walkIns
  ];
}

function groupById<T extends { barberId: string }>(rows: T[]) {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const list = map.get(row.barberId);
    if (list) list.push(row);
    else map.set(row.barberId, [row]);
  }
  return map;
}

/** One round of queries for every chair on a day — grouped in memory per barber. */
async function loadDayChairRows(input: {
  shopId: string;
  barberIds: string[];
  day: { start: Date; end: Date };
  now: Date;
  excludeUserId?: string;
}) {
  const ids = input.barberIds;
  const [bookings, holds, walkIns, breaks, leave] = await Promise.all([
    prisma.booking.findMany({
      where: {
        shopId: input.shopId,
        startsAt: { gte: input.day.start, lt: input.day.end },
        status: { notIn: [...AVAILABILITY_FREE_STATUSES] }
      },
      include: { services: { include: { service: true } } }
    }),
    prisma.bookingHold.findMany({
      where: {
        shopId: input.shopId,
        expiresAt: { gt: input.now },
        startsAt: { gte: input.day.start, lt: input.day.end },
        ...(input.excludeUserId ? { userId: { not: input.excludeUserId } } : {})
      }
    }),
    prisma.walkIn.findMany({
      where: {
        shopId: input.shopId,
        status: 'ACTIVE',
        startsAt: { lt: input.day.end },
        endsAt: { gt: input.day.start }
      }
    }),
    ids.length
      ? prisma.barberBreak.findMany({
          where: {
            barberId: { in: ids },
            startsAt: { lt: input.day.end },
            endsAt: { gt: input.day.start }
          }
        })
      : Promise.resolve([]),
    ids.length
      ? prisma.barberLeave.findMany({
          where: {
            barberId: { in: ids },
            startsAt: { lt: input.day.end },
            endsAt: { gt: input.day.start }
          }
        })
      : Promise.resolve([])
  ]);
  return { bookings, holds, walkIns, breaks, leave };
}

function slotsFromChairRows(input: {
  barberId: string;
  open: { start: Date; end: Date } | null;
  durationMinutes: number;
  bufferMinutes: number;
  now: Date;
  shopBusy: TimeWindow[];
  capacity: number;
  breaks: { startsAt: Date; endsAt: Date }[];
  leave: { startsAt: Date; endsAt: Date }[];
  bookings: { startsAt: Date; endsAt: Date; services: { service: { bufferMinutes: number } }[] }[];
  holds: { startsAt: Date; endsAt: Date }[];
  walkIns: { startsAt: Date; endsAt: Date }[];
}) {
  if (!input.open) return [] as { start: Date; end: Date; barberId: string }[];
  const bufferedBookings = input.bookings.map((row) => {
    const ownBuffer = Math.max(0, ...row.services.map((s) => s.service.bufferMinutes), input.bufferMinutes);
    return withBuffer({ start: row.startsAt, end: row.endsAt }, ownBuffer);
  });
  const raw = filterFutureSlots(
    calculateSlots({
      shop: input.open,
      barber: input.open,
      breaks: input.breaks.map((row) => ({ start: row.startsAt, end: row.endsAt })),
      leave: input.leave.map((row) => ({ start: row.startsAt, end: row.endsAt })),
      bookings: bufferedBookings,
      holds: mapBuffered(
        input.holds.map((row) => ({ start: row.startsAt, end: row.endsAt })),
        input.bufferMinutes
      ),
      walkIns: input.walkIns.map((row) => ({ start: row.startsAt, end: row.endsAt })),
      durationMinutes: input.durationMinutes,
      bufferMinutes: input.bufferMinutes
    }),
    input.now
  );
  return raw
    .filter((slot) => {
      const occupy = withBuffer(slot, input.bufferMinutes);
      return !isAtShopCapacity(occupy, input.shopBusy, input.capacity);
    })
    .map((slot) => ({ ...slot, barberId: input.barberId }));
}

export async function shopAvailability(input: {
  shopId: string;
  serviceId?: string;
  serviceIds?: string[];
  date: string;
  barberId?: string;
  excludeUserId?: string;
}) {
  const shop = await prisma.shop.findFirst({
    where: { id: input.shopId, setupDone: true, status: 'ACTIVE' },
    select: { acceptingAppointments: true, acceptingPausedUntil: true }
  });
  if (!shop) throw new Error('Shop not found.');
  if (!shop.acceptingAppointments) return [];

  const serviceIds = normalizeServiceIds(input);
  const pack = await resolveServicePackage(prisma, input.shopId, serviceIds);
  const dateKey = assertDateKeyIST(input.date);
  const now = new Date();
  if (
    dateKey === todayKeyIST(now) &&
    shop.acceptingPausedUntil &&
    shop.acceptingPausedUntil.getTime() > now.getTime()
  ) {
    return [];
  }
  const capacity = await getDayCapacity(prisma, input.shopId, dateKey);
  if (capacity <= 0) return [];
  const day = dayRangeIST(dateKey);
  const bufferMinutes = pack.bufferMinutes;
  const staff = await listBookableBarbers(prisma, input.shopId);
  if (!staff.length) throw new Error('No staff available.');

  const targets = input.barberId
    ? staff.filter((row) => row.id === input.barberId)
    : staff;
  if (!targets.length) throw new Error('No staff available.');

  const barberIds = targets.map((row) => row.id);
  const [windows, rows] = await Promise.all([
    openWindowsForBarbers(prisma, { shopId: input.shopId, dateKey, barberIds }),
    loadDayChairRows({
      shopId: input.shopId,
      barberIds,
      day,
      now,
      excludeUserId: input.excludeUserId
    })
  ]);
  const shopBusy = busyWindowsFromRows(
    rows.bookings,
    rows.holds,
    rows.walkIns.map((row) => ({ start: row.startsAt, end: row.endsAt })),
    bufferMinutes
  );
  const breaksBy = groupById(rows.breaks);
  const leaveBy = groupById(rows.leave);
  const bookingsBy = groupById(rows.bookings);
  const holdsBy = groupById(rows.holds);
  const walkInsBy = groupById(rows.walkIns);

  const merged = new Map<string, { start: string; end: string; available: boolean; barberId: string }>();
  for (const barber of targets) {
    const slots = slotsFromChairRows({
      barberId: barber.id,
      open: windows.get(barber.id) ?? null,
      durationMinutes: pack.durationMinutes,
      bufferMinutes,
      now,
      shopBusy,
      capacity,
      breaks: breaksBy.get(barber.id) ?? [],
      leave: leaveBy.get(barber.id) ?? [],
      bookings: bookingsBy.get(barber.id) ?? [],
      holds: holdsBy.get(barber.id) ?? [],
      walkIns: walkInsBy.get(barber.id) ?? []
    });
    for (const slot of slots) {
      const key = slot.start.toISOString();
      if (!merged.has(key)) {
        merged.set(key, {
          start: key,
          end: slot.end.toISOString(),
          available: true,
          barberId: slot.barberId
        });
      }
    }
  }
  return [...merged.values()].sort((a, b) => a.start.localeCompare(b.start));
}

async function resolveBookableBarber(
  shopId: string,
  barberId: string | undefined,
  startsAt: Date,
  endsAt: Date,
  excludeUserId?: string
) {
  const staff = await listBookableBarbers(prisma, shopId);
  if (!staff.length) throw new Error('No staff available.');
  if (barberId) {
    const match = staff.find((row) => row.id === barberId);
    if (!match) throw new Error('No staff available.');
    return match;
  }
  // Any barber — first free staff member for this window (CJ-19)
  const dateKey = todayKeyIST(startsAt);
  const day = dayRangeIST(dateKey);
  const now = new Date();
  const capacity = await getDayCapacity(prisma, shopId, dateKey);
  if (capacity <= 0) throw new Error(CAPACITY_CLOSED_MESSAGE);
  const shopBusy = await shopBusyWindows(shopId, day, now, 0, excludeUserId);
  if (isAtShopCapacity({ start: startsAt, end: endsAt }, shopBusy, capacity)) {
    throw new Error(SLOT_TAKEN_MESSAGE);
  }
  const barberIds = staff.map((row) => row.id);
  const window = { start: startsAt, end: endsAt };
  const [windows, breaks, leave, bookings, holds] = await Promise.all([
    openWindowsForBarbers(prisma, { shopId, dateKey, barberIds }),
    prisma.barberBreak.findMany({
      where: { barberId: { in: barberIds }, startsAt: { lt: day.end }, endsAt: { gt: day.start } }
    }),
    prisma.barberLeave.findMany({
      where: { barberId: { in: barberIds }, startsAt: { lt: day.end }, endsAt: { gt: day.start } }
    }),
    prisma.booking.findMany({
      where: {
        barberId: { in: barberIds },
        status: { notIn: [...AVAILABILITY_FREE_STATUSES] },
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt }
      }
    }),
    prisma.bookingHold.findMany({
      where: {
        barberId: { in: barberIds },
        expiresAt: { gt: now },
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
        ...(excludeUserId ? { userId: { not: excludeUserId } } : {})
      }
    })
  ]);
  const breaksBy = groupById(breaks);
  const leaveBy = groupById(leave);
  const bookingsBy = groupById(bookings);
  const holdsBy = groupById(holds);
  for (const barber of staff) {
    const open = windows.get(barber.id) ?? null;
    if (!open || startsAt < open.start || endsAt > open.end) continue;
    const blocked = [
      ...(breaksBy.get(barber.id) ?? []).map((row) => ({ start: row.startsAt, end: row.endsAt })),
      ...(leaveBy.get(barber.id) ?? []).map((row) => ({ start: row.startsAt, end: row.endsAt })),
      ...(bookingsBy.get(barber.id) ?? []).map((row) => ({ start: row.startsAt, end: row.endsAt })),
      ...(holdsBy.get(barber.id) ?? []).map((row) => ({ start: row.startsAt, end: row.endsAt }))
    ];
    if (blocked.some((span) => span.start < window.end && window.start < span.end)) continue;
    return barber;
  }
  throw new Error(SLOT_TAKEN_MESSAGE);
}

export async function createHold(
  token: string,
  input: {
    shopId: string;
    serviceId?: string;
    serviceIds?: string[];
    barberId?: string;
    startsAt: string;
    idempotencyKey?: string;
  }
) {
  const user = await userFromToken(token);
  if (!user.phone?.trim()) {
    throw new Error('Add your phone number in Profile before booking.');
  }
  const serviceIds = normalizeServiceIds(input);
  const accepting = await prisma.shop.findFirst({
    where: { id: input.shopId, setupDone: true, status: 'ACTIVE' },
    select: { acceptingAppointments: true, acceptingPausedUntil: true }
  });
  if (!accepting) throw new Error('Shop not found.');
  const pack = await resolveServicePackage(prisma, input.shopId, serviceIds);
  const startsAt = new Date(input.startsAt);
  if (Number.isNaN(startsAt.getTime())) throw new Error('Pick a valid time.');
  assertFutureStart(startsAt);
  assertSlotAllowedByAccepting(accepting, startsAt);
  const bufferMinutes = pack.bufferMinutes;
  const endsAt = new Date(startsAt.getTime() + pack.durationMinutes * 60000);
  const occupy = withBuffer({ start: startsAt, end: endsAt }, bufferMinutes);
  await assertNoCustomerOverlap({ userId: user.id, startsAt: occupy.start, endsAt: occupy.end });
  const barber = await resolveBookableBarber(input.shopId, input.barberId, occupy.start, occupy.end, user.id);
  const bookingDay = todayKeyIST(startsAt);
  const open = await resolveOpenWindow(prisma, {
    shopId: input.shopId,
    dateKey: bookingDay,
    barberId: barber.id
  });
  if (!open || !isWithinWindow(startsAt, endsAt, open)) {
    throw new Error('That time is outside shop hours. Pick another slot.');
  }
  const capacity = await getDayCapacity(prisma, input.shopId, bookingDay);
  if (capacity <= 0) throw new Error(CAPACITY_CLOSED_MESSAGE);

  const idempotencyKey =
    input.idempotencyKey || `hold_${user.id}_${input.shopId}_${barber.id}_${startsAt.toISOString()}`;

  let hold;
  try {
    hold = await prisma.$transaction(async (tx) => {
      const now = new Date();
      // T3 case 39: lock the shop row (FOR SHARE) so a concurrent partner delete, which
      // UPDATEs the shop to CLOSED and releases its holds, either waits for this hold or
      // makes it fail here. No orphan hold can stay on a CLOSED shop.
      const live = await tx.$queryRaw<{ status: string }[]>`
        SELECT status::text AS status FROM "Shop" WHERE id = ${input.shopId} FOR SHARE`;
      if (live[0]?.status !== 'ACTIVE') throw SHOP_CLOSED();
      await tx.bookingHold.deleteMany({ where: { expiresAt: { lte: now } } });

      const shopBusy: TimeWindow[] = [
        ...mapBuffered(
          (
            await tx.booking.findMany({
              where: {
                shopId: input.shopId,
                status: { notIn: [...AVAILABILITY_FREE_STATUSES] },
                startsAt: { lt: occupy.end },
                endsAt: { gt: occupy.start }
              }
            })
          ).map((row) => ({ start: row.startsAt, end: row.endsAt })),
          bufferMinutes
        ),
        ...mapBuffered(
          (
            await tx.bookingHold.findMany({
              where: {
                shopId: input.shopId,
                expiresAt: { gt: now },
                startsAt: { lt: occupy.end },
                endsAt: { gt: occupy.start },
                NOT: { idempotencyKey }
              }
            })
          ).map((row) => ({ start: row.startsAt, end: row.endsAt })),
          bufferMinutes
        ),
        ...(await loadActiveWalkIns(tx, { shopId: input.shopId, overlap: occupy }))
      ];
      if (isAtShopCapacity(occupy, shopBusy, capacity)) {
        throw new Error(SLOT_TAKEN_MESSAGE);
      }

      const padStart = new Date(occupy.start.getTime() - bufferMinutes * 60000);
      const nearbyBookings = await tx.booking.findMany({
        where: {
          barberId: barber.id,
          status: { notIn: [...AVAILABILITY_FREE_STATUSES] },
          startsAt: { lt: occupy.end },
          endsAt: { gt: padStart }
        },
        include: { services: { include: { service: true } } }
      });
      const bookingClash = nearbyBookings.some((row) => {
        const buf = Math.max(0, ...row.services.map((s) => s.service.bufferMinutes), bufferMinutes);
        const w = withBuffer({ start: row.startsAt, end: row.endsAt }, buf);
        return w.start < occupy.end && occupy.start < w.end;
      });
      if (bookingClash) throw new Error(SLOT_TAKEN_MESSAGE);

      const nearbyHolds = await tx.bookingHold.findMany({
        where: {
          barberId: barber.id,
          expiresAt: { gt: now },
          startsAt: { lt: occupy.end },
          endsAt: { gt: padStart },
          NOT: { idempotencyKey }
        }
      });
      if (
        nearbyHolds.some((row) => {
          const w = withBuffer({ start: row.startsAt, end: row.endsAt }, bufferMinutes);
          return w.start < occupy.end && occupy.start < w.end;
        })
      ) {
        throw new Error('Someone else is holding that slot. Try another time.');
      }

      if (await findWalkInClash(tx, barber.id, occupy)) {
        throw new Error(SLOT_TAKEN_MESSAGE);
      }

      // One active hold per user per shop — drop older holds for this shop.
      await tx.bookingHold.deleteMany({
        where: { userId: user.id, shopId: input.shopId, NOT: { idempotencyKey } }
      });

      const expiresAt = holdExpiresAt(now);
      return tx.bookingHold.upsert({
        where: { idempotencyKey },
        create: {
          userId: user.id,
          shopId: input.shopId,
          barberId: barber.id,
          startsAt,
          endsAt,
          expiresAt,
          idempotencyKey
        },
        update: {
          barberId: barber.id,
          startsAt,
          endsAt,
          expiresAt
        }
      });
    }, txOpts);
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === SLOT_TAKEN_MESSAGE ||
        error.message === CUSTOMER_OVERLAP_MESSAGE ||
        error.message.includes('holding') ||
        error.message.includes('at least ₹1'))
    ) {
      throw error;
    }
    throwIfSlotRace(error, 'hold');
  }

  return {
    id: hold.id,
    status: 'HELD' as const,
    shopId: hold.shopId,
    serviceId: serviceIds[0],
    serviceIds,
    barberId: hold.barberId,
    startsAt: hold.startsAt.toISOString(),
    endsAt: hold.endsAt.toISOString(),
    expiresAt: hold.expiresAt.toISOString()
  };
}

export async function createBooking(token: string, input: {
  shopId: string;
  serviceId?: string;
  serviceIds?: string[];
  barberId?: string;
  startsAt: string;
  holdId: string;
  idempotencyKey?: string;
  /** Ignored. Bookings are pay-at-shop; there is no in-app advance. */
  payMode?: 'shop' | 'app';
}) {
  const user = await userFromToken(token);
  if (!user.phone?.trim()) {
    throw new Error('Add your phone number in Profile before booking.');
  }
  if (!input.holdId?.trim()) throw new Error('Hold this slot again before paying.');
  const serviceIds = normalizeServiceIds(input);
  const accepting = await prisma.shop.findFirst({
    where: { id: input.shopId, setupDone: true, status: 'ACTIVE' },
    select: { acceptingAppointments: true, acceptingPausedUntil: true }
  });
  if (!accepting) throw new Error('Shop not found.');
  const pack = await resolveServicePackage(prisma, input.shopId, serviceIds);
  if (input.payMode === 'app') {
    throw new Error('Pay at the shop. In-app advance is not offered.');
  }
  const startsAt = new Date(input.startsAt);
  if (Number.isNaN(startsAt.getTime())) throw new Error('Pick a valid time.');
  assertFutureStart(startsAt);
  assertSlotAllowedByAccepting(accepting, startsAt);
  const bufferMinutes = pack.bufferMinutes;
  const endsAt = new Date(startsAt.getTime() + pack.durationMinutes * 60000);
  const occupy = withBuffer({ start: startsAt, end: endsAt }, bufferMinutes);
  await assertNoCustomerOverlap({ userId: user.id, startsAt: occupy.start, endsAt: occupy.end });
  const bookingDay = todayKeyIST(startsAt);
  const capacity = await getDayCapacity(prisma, input.shopId, bookingDay);
  if (capacity <= 0) throw new Error(CAPACITY_CLOSED_MESSAGE);
  const totalPaise = pack.totalPaise;
  const advancePaise = 0;

  const holdPeek = await prisma.bookingHold.findFirst({
    where: { id: input.holdId, userId: user.id }
  });
  if (!holdPeek || !isHoldAlive(holdPeek.expiresAt)) {
    if (holdPeek) await prisma.bookingHold.delete({ where: { id: holdPeek.id } }).catch(() => undefined);
    throw new Error('Your hold expired. Go back and pick the slot again.');
  }
  const resolvedBarberId = input.barberId || holdPeek.barberId;
  const startsAtIso = startsAt.toISOString();
  const idempotencyKey = input.idempotencyKey?.trim()
    ? bindClientIdempotencyKey(user.id, input.idempotencyKey)
    : bookingIdempotencyKey({
        userId: user.id,
        shopId: input.shopId,
        serviceId: pack.serviceIdsKey,
        barberId: resolvedBarberId,
        startsAtIso
      });

  await releaseIntentKeyIfTerminal(user.id, idempotencyKey);

  const bookingInclude = {
    shop: { include: { images: { orderBy: { sortOrder: 'asc' as const }, take: 1 } } },
    barber: true,
    services: { include: { service: true } }
  };

  let booking;
  try {
    booking = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM "BookingHold" WHERE id = ${input.holdId} AND "userId" = ${user.id} FOR UPDATE`;
      const hold = await tx.bookingHold.findFirst({
        where: { id: input.holdId, userId: user.id }
      });
      if (!hold || !isHoldAlive(hold.expiresAt)) {
        if (hold) await tx.bookingHold.delete({ where: { id: hold.id } });
        throw new Error('Your hold expired. Go back and pick the slot again.');
      }
      if (hold.shopId !== input.shopId || hold.startsAt.getTime() !== startsAt.getTime()) {
        throw new Error('This hold does not match the slot. Pick the time again.');
      }
      const barberId = resolvedBarberId;
      if (hold.barberId !== barberId) {
        throw new Error('This hold does not match the slot. Pick the time again.');
      }
      const open = await resolveOpenWindow(prisma, {
        shopId: input.shopId,
        dateKey: bookingDay,
        barberId: hold.barberId
      });
      if (!open || !isWithinWindow(startsAt, endsAt, open)) {
        throw new Error('That time is outside shop hours. Pick another slot.');
      }

      const shopBusy: TimeWindow[] = [
        ...mapBuffered(
          (
            await tx.booking.findMany({
              where: {
                shopId: input.shopId,
                status: { notIn: [...AVAILABILITY_FREE_STATUSES] },
                startsAt: { lt: occupy.end },
                endsAt: { gt: occupy.start }
              }
            })
          ).map((row) => ({ start: row.startsAt, end: row.endsAt })),
          bufferMinutes
        ),
        ...mapBuffered(
          (
            await tx.bookingHold.findMany({
              where: {
                shopId: input.shopId,
                expiresAt: { gt: new Date() },
                startsAt: { lt: occupy.end },
                endsAt: { gt: occupy.start },
                NOT: { id: hold.id }
              }
            })
          ).map((row) => ({ start: row.startsAt, end: row.endsAt })),
          bufferMinutes
        ),
        ...(await loadActiveWalkIns(tx, { shopId: input.shopId, overlap: occupy }))
      ];
      if (isAtShopCapacity(occupy, shopBusy, capacity)) {
        throw new Error(SLOT_TAKEN_MESSAGE);
      }

      const padStart = new Date(occupy.start.getTime() - bufferMinutes * 60000);
      const nearby = await tx.booking.findMany({
        where: {
          barberId: hold.barberId,
          status: { notIn: [...AVAILABILITY_FREE_STATUSES] },
          startsAt: { lt: occupy.end },
          endsAt: { gt: padStart }
        },
        include: { services: { include: { service: true } } }
      });
      if (
        nearby.some((row) => {
          const buf = Math.max(0, ...row.services.map((s) => s.service.bufferMinutes), bufferMinutes);
          const w = withBuffer({ start: row.startsAt, end: row.endsAt }, buf);
          return w.start < occupy.end && occupy.start < w.end;
        })
      ) {
        throw new Error(SLOT_TAKEN_MESSAGE);
      }
      if (await findWalkInClash(tx, hold.barberId, occupy)) {
        throw new Error(SLOT_TAKEN_MESSAGE);
      }

      let code = bookingCode();
      for (let i = 0; i < 5; i += 1) {
        const exists = await tx.booking.findUnique({ where: { bookingCode: code } });
        if (!exists) break;
        code = bookingCode();
      }
      const pin = makeVerifyPin();

      // Pay the full bill at the shop. No 30% advance checkout.
      const skipCheckout = true;
      const created = await tx.booking.create({
        data: {
          userId: user.id,
          shopId: input.shopId,
          barberId: hold.barberId,
          startsAt,
          endsAt,
          status: skipCheckout ? 'AWAITING_SHOP' : 'PAYMENT_PENDING',
          totalPaise,
          advancePaise,
          bookingCode: code,
          verifyPin: pin,
          idempotencyKey,
          services: {
            create: pack.lines.map((line) => ({
              serviceId: line.serviceId,
              pricePaise: line.pricePaise,
              durationMinutes: line.durationMinutes
            }))
          },
          payment: {
            create: {
              provider: skipCheckout ? 'none' : 'razorpay',
              providerPaymentId: skipCheckout ? `direct_${Date.now()}` : `pending_${Date.now()}`,
              amountPaise: 0,
              status: skipCheckout ? 'CAPTURED' : 'PAYMENT_PENDING'
            }
          }
        },
        include: bookingInclude
      });
      await tx.bookingHold.delete({ where: { id: hold.id } });
      return created;
    }, txOpts);
  } catch (error) {
    if (error instanceof Error && (
      error.message === SLOT_TAKEN_MESSAGE ||
      error.message.includes('hold expired') ||
      error.message.includes('does not match')
    )) {
      throw error;
    }
    const existing = await prisma.booking.findUnique({
      where: { idempotencyKey },
      include: bookingInclude
    });
    if (!existing) throwIfSlotRace(error, 'booking');

    // CJ-13: unpaid leftovers can be wiped; finished visits only archive the key.
    if (
      existing.status === 'FAILED' ||
      existing.status === 'EXPIRED' ||
      existing.status === 'REJECTED' ||
      existing.status === 'CANCELLED'
    ) {
      await prisma.bookingPayment.deleteMany({ where: { bookingId: existing.id } });
      await prisma.bookingService.deleteMany({ where: { bookingId: existing.id } });
      await prisma.booking.delete({ where: { id: existing.id } });
      return createBooking(token, input);
    }
    if (existing.status === 'COMPLETED' || existing.status === 'NO_SHOW') {
      await prisma.booking.update({
        where: { id: existing.id },
        data: { idempotencyKey: archivedIdempotencyKey(existing.id) }
      });
      return createBooking(token, input);
    }

    booking = existing;
    await prisma.bookingHold.delete({ where: { id: input.holdId } }).catch(() => undefined);
  }

  if (!booking) throw new Error('Could not create booking.');

  // Payments temporarily off — promote any leftover PAYMENT_PENDING to awaiting shop.
  if (booking.status === 'PAYMENT_PENDING' && !paymentsEnabled()) {
    booking = await prisma.booking.update({
      where: { id: booking.id },
      data: {
        status: 'AWAITING_SHOP',
        payment: {
          update: {
            provider: 'none',
            providerPaymentId: `direct_${Date.now()}`,
            status: 'CAPTURED'
          }
        }
      },
      include: bookingInclude
    });
  }

  if (booking.status === 'AWAITING_SHOP' || booking.status === 'CONFIRMED') {
    const payload = mapBookingPayload(booking);
    const when = formatIST(startsAt, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit'
    });
    if (booking.status === 'AWAITING_SHOP') {
      await notifyUser(user.id, {
        title: paymentsEnabled() ? 'Payment confirmed' : 'Request sent',
        body: `Awaiting shop confirmation · ${payload.shop.name} · ${when}`,
        data: { bookingId: booking.id, screen: 'booking' }
      });
      void notifyShopPartner(booking.shopId, {
        title: 'New booking request',
        body: `Accept or reject · ${payload.service.name} · ${when} · ${payload.bookingCode}`,
        data: { bookingId: booking.id, screen: 'requests' }
      });
    }
    return { ...payload, checkout: null as null };
  }

  if (!paymentsEnabled()) {
    throw new Error('Could not finish this booking. Pick the slot again.');
  }

  // CJ-02: charge the advance stored on the booking row (not a re-derived client amount).
  const chargePaise = booking.advancePaise;
  if (chargePaise <= 0) {
    throw new Error('This booking has no advance to collect.');
  }

  const order = await createRazorpayOrder({
    amountPaise: chargePaise,
    receipt: booking.bookingCode,
    notes: { bookingId: booking.id, userId: user.id }
  });
  await prisma.bookingPayment.update({
    where: { bookingId: booking.id },
    data: {
      provider: 'razorpay',
      providerPaymentId: order.orderId,
      status: 'PAYMENT_PENDING',
      amountPaise: chargePaise
    }
  });

  return {
    ...mapBookingPayload(booking),
    status: 'PAYMENT_PENDING' as const,
    checkout: {
      keyId: order.keyId,
      orderId: order.orderId,
      amountPaise: order.amountPaise,
      currency: order.currency,
      description: 'CUTLY test advance — Razorpay test mode, no real charge'
    }
  };
}

function mapBookingPayload(booking: {
  id: string;
  bookingCode: string;
  verifyPin?: string | null;
  status: string;
  startsAt: Date;
  endsAt: Date;
  totalPaise: number;
  advancePaise: number;
  shop: {
    id: string;
    name: string;
    address: string;
    latitude?: { toNumber?: () => number } | number;
    longitude?: { toNumber?: () => number } | number;
    images: { url: string }[];
  };
  barber: { id: string; name: string; rating: unknown };
  services: { serviceId: string; durationMinutes: number; pricePaise: number; service: { name: string } }[];
}) {
  const serviceRows = booking.services;
  const serviceRow = serviceRows[0];
  const durationMinutes = serviceRows.reduce((sum, row) => sum + row.durationMinutes, 0);
  const pricePaise = serviceRows.reduce((sum, row) => sum + row.pricePaise, 0);
  const serviceName = serviceRows.map((row) => row.service.name).join(' · ') || 'Appointment';
  const lat =
    typeof booking.shop.latitude === 'number'
      ? booking.shop.latitude
      : booking.shop.latitude && 'toNumber' in booking.shop.latitude
        ? (booking.shop.latitude as { toNumber(): number }).toNumber()
        : null;
  const lng =
    typeof booking.shop.longitude === 'number'
      ? booking.shop.longitude
      : booking.shop.longitude && 'toNumber' in booking.shop.longitude
        ? (booking.shop.longitude as { toNumber(): number }).toNumber()
        : null;
  return {
    id: booking.id,
    bookingCode: booking.bookingCode,
    verifyPin: booking.verifyPin || null,
    status: booking.status,
    startsAt: booking.startsAt.toISOString(),
    endsAt: booking.endsAt.toISOString(),
    totalPaise: booking.totalPaise,
    advancePaise: booking.advancePaise,
    shop: {
      id: booking.shop.id,
      name: booking.shop.name,
      imageUrl: booking.shop.images[0]?.url || FALLBACK_IMAGE,
      address: booking.shop.address,
      latitude: lat,
      longitude: lng
    },
    service: {
      id: serviceRow?.serviceId || 'unknown',
      name: serviceName,
      durationMinutes: durationMinutes || serviceRow?.durationMinutes || 30,
      pricePaise: pricePaise || booking.totalPaise
    },
    services: serviceRows.map((row) => ({
      id: row.serviceId,
      name: row.service.name,
      durationMinutes: row.durationMinutes,
      pricePaise: row.pricePaise
    })),
    barber: {
      id: booking.barber.id,
      name: booking.barber.name,
      rating: toNum(booking.barber.rating as never)
    }
  };
}

export async function confirmBookingPayment(
  token: string,
  input: { bookingId: string; razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string }
) {
  const user = await userFromToken(token);
  const booking = await prisma.booking.findFirst({
    where: { id: input.bookingId, userId: user.id },
    include: {
      shop: { include: { images: { orderBy: { sortOrder: 'asc' }, take: 1 } } },
      barber: true,
      services: { include: { service: true } },
      payment: true
    }
  });
  if (!booking) throw new Error('Booking not found.');
  if (booking.status === 'AWAITING_SHOP' || booking.status === 'CONFIRMED') {
    return { ...mapBookingPayload(booking), checkout: null as null };
  }

  const ok = verifyRazorpaySignature({
    orderId: input.razorpayOrderId,
    paymentId: input.razorpayPaymentId,
    signature: input.razorpaySignature
  });
  if (!ok) throw new Error('Payment signature check failed.');

  // Recover from dismiss-race: Razorpay paid but client abandoned → FAILED before confirm landed.
  const canCapture =
    booking.status === 'PAYMENT_PENDING' ||
    (booking.status === 'FAILED' &&
      booking.payment &&
      (booking.payment.providerPaymentId === input.razorpayOrderId ||
        booking.payment.providerPaymentId === input.razorpayPaymentId));

  if (!canCapture) throw new Error('This booking is not waiting for payment.');
  if (!booking.payment) throw new Error('Payment order does not match this booking.');
  // Order id must match unless we already stored the payment id from a partial confirm.
  if (
    booking.payment.providerPaymentId !== input.razorpayOrderId &&
    booking.payment.providerPaymentId !== input.razorpayPaymentId
  ) {
    throw new Error('Payment order does not match this booking.');
  }

  assertTransition(booking.status as BookingState, 'AWAITING_SHOP');

  const updated = await prisma.booking.update({
    where: { id: booking.id },
    data: {
      status: 'AWAITING_SHOP',
      payment: {
        update: {
          providerPaymentId: input.razorpayPaymentId,
          status: 'CAPTURED'
        }
      }
    },
    include: {
      shop: { include: { images: { orderBy: { sortOrder: 'asc' }, take: 1 } } },
      barber: true,
      services: { include: { service: true } }
    }
  });
  const payload = mapBookingPayload(updated);
  const when = formatIST(updated.startsAt, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit'
  });
  await notifyUser(user.id, {
    title: 'Payment confirmed',
    body: `Awaiting shop confirmation · ${payload.shop.name} · ${when}`,
    data: { bookingId: updated.id, screen: 'booking' }
  });
  void notifyShopPartner(updated.shopId, {
    title: 'New booking request',
    body: `Accept or reject · ${payload.service.name} · ${when} · ${payload.bookingCode}`,
    data: { bookingId: updated.id, screen: 'requests' }
  });
  return { ...payload, checkout: null as null };
}

export async function abandonBookingPayment(token: string, bookingId: string) {
  const user = await userFromToken(token);
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, userId: user.id },
    include: { payment: true }
  });
  if (!booking) throw new Error('Booking not found.');
  if (booking.status === 'CONFIRMED') return { abandoned: false as const, status: booking.status };
  if (booking.status !== 'PAYMENT_PENDING') return { abandoned: false as const, status: booking.status };
  assertTransition('PAYMENT_PENDING', 'FAILED');
  await prisma.booking.update({
    where: { id: booking.id },
    data: {
      status: 'FAILED',
      payment: booking.payment
        ? { update: { status: 'FAILED' } }
        : undefined
    }
  });
  return { abandoned: true as const, status: 'FAILED' as const };
}

async function loadBooking(id: string, userId: string) {
  return prisma.booking.findFirst({
    where: { id, userId },
    include: {
      shop: { include: { images: { orderBy: { sortOrder: 'asc' }, take: 1 } } },
      barber: true,
      services: { include: { service: true } },
      payment: true,
      review: { select: { id: true } }
    }
  });
}

function bookingBalance(booking: {
  totalPaise: number;
  advancePaise: number;
  payment?: { amountPaise: number; status: string } | null;
}) {
  const totalPaise = booking.totalPaise;
  const collectedPaise =
    booking.payment?.status === 'CAPTURED' ? Math.max(0, booking.payment.amountPaise) : 0;
  const remainingPaise =
    booking.payment?.status === 'REFUNDED' ? 0 : Math.max(0, totalPaise - collectedPaise);
  return {
    remainingPaise,
    balanceSettled: remainingPaise === 0 && totalPaise > 0 && collectedPaise >= totalPaise
  };
}

function serializeBooking(booking: NonNullable<Awaited<ReturnType<typeof loadBooking>>>, now = new Date()) {
  const serviceRow = booking.services[0];
  const policy = cancelPolicy(booking.startsAt, now);
  const awaiting = booking.status === 'AWAITING_SHOP';
  const confirmedUpcoming = booking.status === 'CONFIRMED' && policy.canModify;
  const canCancel = awaiting || confirmedUpcoming;
  const canReschedule = confirmedUpcoming;
  const refundOnCancel = awaiting || (confirmedUpcoming && policy.refundAdvance);
  const hasReview = Boolean(booking.review);
  // T3 case 36 (Prajesh): reviews allowed at ACTIVE and PAUSED shops; CLOSED/purged blocks.
  const canReview = booking.status === 'COMPLETED' && !hasReview && booking.shop.status !== 'CLOSED' && !booking.shop.deletedAt;
  const { remainingPaise, balanceSettled } = bookingBalance(booking);
  const lat = toNum(booking.shop.latitude as never);
  const lng = toNum(booking.shop.longitude as never);
  return {
    id: booking.id,
    bookingCode: booking.bookingCode,
    verifyPin: booking.verifyPin || null,
    status: booking.status,
    startsAt: booking.startsAt.toISOString(),
    endsAt: booking.endsAt.toISOString(),
    totalPaise: booking.totalPaise,
    advancePaise: booking.advancePaise,
    remainingPaise,
    balanceSettled,
    canCancel,
    canReschedule,
    canReview,
    hasReview,
    refundOnCancel,
    cancelPolicyLabel: awaiting
      ? 'Cancel free — the shop has not confirmed yet.'
      : policy.refundLabel,
    shop: {
      id: booking.shop.id,
      name: booking.shop.name,
      imageUrl: booking.shop.images[0]?.url || FALLBACK_IMAGE,
      address: booking.shop.address,
      latitude: Number.isFinite(lat) ? lat : null,
      longitude: Number.isFinite(lng) ? lng : null
    },
    service: serviceRow
      ? {
          id: serviceRow.serviceId,
          name: booking.services.map((row) => row.service.name).join(' · '),
          durationMinutes: booking.services.reduce((sum, row) => sum + row.durationMinutes, 0),
          pricePaise: booking.services.reduce((sum, row) => sum + row.pricePaise, 0)
        }
      : { id: 'unknown', name: 'Appointment', durationMinutes: 30, pricePaise: booking.totalPaise },
    services: booking.services.map((row) => ({
      id: row.serviceId,
      name: row.service.name,
      durationMinutes: row.durationMinutes,
      pricePaise: row.pricePaise
    })),
    barber: {
      id: booking.barber.id,
      name: booking.barber.name,
      rating: toNum(booking.barber.rating as never)
    }
  };
}

export async function getBooking(token: string, bookingId: string) {
  const user = await userFromToken(token);
  let booking = await loadBooking(bookingId, user.id);
  if (!booking) throw new Error('Booking not found.');
  if (!booking.verifyPin) {
    const pin = makeVerifyPin();
    booking = await prisma.booking.update({
      where: { id: booking.id },
      data: { verifyPin: pin },
      include: {
        shop: { include: { images: { orderBy: { sortOrder: 'asc' }, take: 1 } } },
        barber: true,
        services: { include: { service: true } },
        payment: true,
        review: { select: { id: true } }
      }
    });
  }
  return serializeBooking(booking);
}

export async function listBookings(token: string) {
  const user = await userFromToken(token);
  // Expire-on-read so customer sees missed + refund without waiting for sweep.
  await expireMissedAwaitingBookings({ userId: user.id });
  await notifyWaitingStarted({ userId: user.id });
  const rows = await prisma.booking.findMany({
    where: { userId: user.id, status: { notIn: ['FAILED', 'PAYMENT_PENDING', 'HELD'] } },
    orderBy: { startsAt: 'desc' },
    include: {
      shop: { include: { images: { orderBy: { sortOrder: 'asc' }, take: 1 } } },
      barber: true,
      services: { include: { service: true } },
      payment: true,
      review: { select: { id: true } }
    }
  });
  return rows.map((booking) => serializeBooking(booking));
}

export async function cancelBooking(token: string, bookingId: string) {
  const user = await userFromToken(token);
  const booking = await loadBooking(bookingId, user.id);
  if (!booking) throw new Error('Booking not found.');
  assertTransition(booking.status as BookingState, 'CANCELLED');
  const awaiting = booking.status === 'AWAITING_SHOP';
  const policy = cancelPolicy(booking.startsAt);
  if (!awaiting && !policy.canModify) throw new Error('This visit can no longer be cancelled.');

  const refundAdvance = awaiting || policy.refundAdvance;
  await prisma.$transaction(async (tx) => {
    await tx.booking.update({
      where: { id: booking.id },
      data: { status: 'CANCELLED', idempotencyKey: archivedIdempotencyKey(booking.id) }
    });
    if (refundAdvance && booking.payment) {
      await tx.bookingPayment.update({
        where: { bookingId: booking.id },
        data: { status: 'REFUNDED' }
      });
    }
  });

  const when = formatIST(booking.startsAt, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit'
  });
  void notifyUser(user.id, {
    title: 'Booking cancelled',
    body: `${booking.bookingCode} · ${when}`,
    data: { bookingId: booking.id, screen: 'booking' }
  });
  void notifyShopPartner(booking.shopId, {
    title: 'Customer cancelled',
    body: `${booking.bookingCode} · ${when}`,
    data: { bookingId: booking.id, screen: 'requests' }
  });

  const next = await loadBooking(bookingId, user.id);
  if (!next) throw new Error('Booking not found.');
  return serializeBooking(next);
}

export async function rescheduleBooking(
  token: string,
  bookingId: string,
  input: { startsAt: string; barberId?: string; holdId: string }
) {
  const user = await userFromToken(token);
  const booking = await loadBooking(bookingId, user.id);
  if (!booking) throw new Error('Booking not found.');
  if (booking.status !== 'CONFIRMED') throw new Error('Only confirmed visits can be rescheduled.');
  const policy = cancelPolicy(booking.startsAt);
  if (!policy.canModify) throw new Error('This visit can no longer be rescheduled.');
  // After reschedule, shop must Accept again → AWAITING_SHOP.

  const startsAt = new Date(input.startsAt);
  if (Number.isNaN(startsAt.getTime())) throw new Error('Pick a valid time.');
  assertFutureStart(startsAt);
  const serviceRow = booking.services[0];
  if (!serviceRow) throw new Error('Booking has no service.');
  const endsAt = new Date(startsAt.getTime() + serviceRow.durationMinutes * 60000);
  await assertNoCustomerOverlap({
    userId: user.id,
    startsAt,
    endsAt,
    excludeBookingId: booking.id
  });
  const bookingDay = todayKeyIST(startsAt);
  const capacity = await getDayCapacity(prisma, booking.shopId, bookingDay);
  if (capacity <= 0) throw new Error(CAPACITY_CLOSED_MESSAGE);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM "BookingHold" WHERE id = ${input.holdId} AND "userId" = ${user.id} FOR UPDATE`;
      const hold = await tx.bookingHold.findFirst({ where: { id: input.holdId, userId: user.id } });
      if (!hold || !isHoldAlive(hold.expiresAt)) {
        if (hold) await tx.bookingHold.delete({ where: { id: hold.id } });
        throw new Error('Your hold expired. Pick the new time again.');
      }
      if (hold.shopId !== booking.shopId || hold.startsAt.getTime() !== startsAt.getTime()) {
        throw new Error('This hold does not match the new slot.');
      }
      const barberId = input.barberId || hold.barberId;
      if (hold.barberId !== barberId) throw new Error('This hold does not match the new slot.');

      const open = await resolveOpenWindow(prisma, {
        shopId: booking.shopId,
        dateKey: bookingDay,
        barberId: hold.barberId
      });
      if (!open || !isWithinWindow(startsAt, endsAt, open)) {
        throw new Error('That time is outside shop hours. Pick another slot.');
      }

      const shopBusy: TimeWindow[] = [
        ...(
          await tx.booking.findMany({
            where: {
              shopId: booking.shopId,
              status: { notIn: [...AVAILABILITY_FREE_STATUSES] },
              startsAt: { lt: endsAt },
              endsAt: { gt: startsAt },
              NOT: { id: booking.id }
            }
          })
        ).map((row) => ({ start: row.startsAt, end: row.endsAt })),
        ...(
          await tx.bookingHold.findMany({
            where: {
              shopId: booking.shopId,
              expiresAt: { gt: new Date() },
              startsAt: { lt: endsAt },
              endsAt: { gt: startsAt },
              NOT: { id: hold.id }
            }
          })
        ).map((row) => ({ start: row.startsAt, end: row.endsAt })),
        ...(await loadActiveWalkIns(tx, { shopId: booking.shopId, overlap: { start: startsAt, end: endsAt } }))
      ];
      if (isAtShopCapacity({ start: startsAt, end: endsAt }, shopBusy, capacity)) {
        throw new Error(SLOT_TAKEN_MESSAGE);
      }

      const clash = await tx.booking.findFirst({
        where: {
          barberId: hold.barberId,
          status: { notIn: [...AVAILABILITY_FREE_STATUSES] },
          startsAt: { lt: endsAt },
          endsAt: { gt: startsAt },
          NOT: { id: booking.id }
        }
      });
      if (clash) throw new Error(SLOT_TAKEN_MESSAGE);
      if (await findWalkInClash(tx, hold.barberId, { start: startsAt, end: endsAt })) {
        throw new Error(SLOT_TAKEN_MESSAGE);
      }

      assertTransition('CONFIRMED', 'AWAITING_SHOP');
      await tx.booking.update({
        where: { id: booking.id },
        data: {
          barberId: hold.barberId,
          startsAt,
          endsAt,
          status: 'AWAITING_SHOP'
        }
      });
      await tx.bookingHold.delete({ where: { id: hold.id } });
    }, txOpts);
  } catch (error) {
    if (error instanceof Error && (
      error.message === SLOT_TAKEN_MESSAGE ||
      error.message === CUSTOMER_OVERLAP_MESSAGE ||
      error.message.includes('hold expired') ||
      error.message.includes('does not match') ||
      error.message.includes('outside shop')
    )) {
      throw error;
    }
    throwIfSlotRace(error, 'booking');
  }

  const when = formatIST(startsAt, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit'
  });
  void notifyUser(user.id, {
    title: 'New time requested',
    body: `Awaiting shop confirmation · ${booking.bookingCode} · ${when}`,
    data: { bookingId: booking.id, screen: 'booking' }
  });
  void notifyShopPartner(booking.shopId, {
    title: 'Reschedule request',
    body: `Accept or reject · ${booking.bookingCode} · ${when}`,
    data: { bookingId: booking.id, screen: 'requests' }
  });

  const next = await loadBooking(bookingId, user.id);
  if (!next) throw new Error('Booking not found.');
  return serializeBooking(next);
}

export async function savePushToken(token: string, pushToken: string) {
  const user = await userFromToken(token);
  await prisma.user.update({ where: { id: user.id }, data: { pushToken } });
  return { saved: true };
}

/** CJ-36: heart always — favourite any shop, list on Profile. */
export async function listFavouriteShops(token: string, origin?: { lat?: number; lng?: number }) {
  const user = await userFromToken(token);
  const rows = await prisma.favouriteShop.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    include: {
      shop: {
        include: {
          images: { orderBy: { sortOrder: 'asc' }, take: 1 },
          services: { include: { service: true } },
          reviews: { select: { rating: true } }
        }
      }
    }
  });
  const lat = origin?.lat ?? 23.2324;
  const lng = origin?.lng ?? 87.8615;
  const shops = rows.map((row) => row.shop).filter((shop) => shop.setupDone && shop.status === 'ACTIVE');
  const openById = await loadOpenStatusForShops(
    prisma,
    shops.map((shop) => shop.id)
  );
  return shops.map((shop) => {
    const open = openById.get(shop.id) || {
      isOpen: false,
      hoursChip: 'Closed',
      hoursDetail: 'Closed today'
    };
    const resolved = resolveListService(shop.services);
    return mapShop(shop, { lat, lng }, open, {
      priceFromPaise: resolved?.pricePaise ?? 0,
      nextAvailableAt: null
    });
  });
}

export async function setFavouriteShop(token: string, shopId: string, favourite: boolean) {
  const user = await userFromToken(token);
  const shop = await prisma.shop.findFirst({ where: { id: shopId, setupDone: true, status: 'ACTIVE' } });
  if (!shop) throw new Error('Shop not found.');
  if (favourite) {
    await prisma.favouriteShop.upsert({
      where: { userId_shopId: { userId: user.id, shopId } },
      create: { userId: user.id, shopId },
      update: {}
    });
  } else {
    await prisma.favouriteShop.deleteMany({ where: { userId: user.id, shopId } });
  }
  return { shopId, favourite };
}

export async function isFavouriteShop(token: string, shopId: string) {
  const user = await userFromToken(token);
  const row = await prisma.favouriteShop.findUnique({
    where: { userId_shopId: { userId: user.id, shopId } }
  });
  return { favourite: Boolean(row) };
}
