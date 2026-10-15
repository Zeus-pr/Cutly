import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { BookingStatus, Prisma, PrismaClient, ShopKind } from '@prisma/client';
import { checkPhoneOtpCode, jwtSecret, signToken, tokenVersionMatches } from './auth';
import {
  PARTNER_BLOCKING_STATUSES,
  blocksPartnerDelete,
  deletionDeadline,
  deletionFlags,
  deletionState,
  displayCustomerName,
  displayCustomerPhone,
  isDeletionRequested,
  shopStatusData
} from './accountDeletion';
import { AppError } from './httpError';
import { consumeReauthToken, defaultVerifyGoogle, issueReauthToken, verifyReauthProof, type ReauthInput } from './reauth';
import {
  assertTransition,
  assertPartnerTransition,
  setBookingStatusIfCurrent,
  transitionWithSideEffect,
  type PartnerFloorTarget,
  nextFloorActions,
  nextShopRequestActions,
  type BookingState
} from './bookingState';
import { assertFutureStart } from './availability';
import { expireMissedAwaitingBookings } from './awaitingExpiry';
import { canMarkNoShow, noShowAvailableAt } from './grace';
import {
  ensureDefaultShopHours,
  isWithinWindow,
  normalizeHms,
  resolveOpenWindow,
  resolveTodayBookingPauseUntil
} from './hours';
import { dayRangeIST, formatIST, todayKeyIST } from './ist';
import { archivedIdempotencyKey } from './money';
import { notifyUser } from './push';
import { SLOT_TAKEN_MESSAGE, throwIfSlotRace } from './race';
import {
  ensureStaffBarbers,
  getDayCapacity,
  isAtShopCapacity,
  type TimeWindow
} from './staff';
import { AVAILABILITY_FREE_STATUSES, BOOKING_FREE_STATUSES } from './activeBooking';
import { PARTNER_HISTORY_STATUSES, partnerHistoryStatusLabel } from './partnerHistory';
import { assertPaidPricePaise } from './price';
import { ensureServiceCategories, findOrCreateCatalogueService } from './catalogueAdmin';
import { isServiceAudience, resolveServiceAudience } from './serviceAudience';
import { claimCategoryId } from './serviceCategoryMeta';
import { notifyWaitingStarted } from './waitingNotify';
import { assertWalkInDuration, findWalkInClash, loadActiveWalkIns } from './walkins';

const prisma = new PrismaClient();
const txOpts = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable } as const;

export type PublicPartner = { id: string; email: string | null; phone: string | null; name: string | null };

type SetupService = {
  name: string;
  durationMinutes: number;
  pricePaise: number;
  bufferMinutes?: number;
  audience?: string;
};

/** CJ-11: default turnover when partner setup omits buffer (consultations stay 0). */
function defaultBufferMinutes(name: string, explicit?: number) {
  if (explicit != null && Number.isFinite(explicit)) return Math.max(0, Math.min(60, Math.round(explicit)));
  return /consultation/i.test(name) ? 0 : 10;
}

function publicPartner(partner: PublicPartner): PublicPartner {
  return { id: partner.id, email: partner.email, phone: partner.phone, name: partner.name };
}

export async function partnerFromToken(token: string) {
  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(token, jwtSecret(), { algorithms: ['HS256'] }) as jwt.JwtPayload;
  } catch {
    throw new Error('Sign in again.');
  }
  if (payload.aud !== 'partner' || typeof payload.sub !== 'string') throw new Error('Sign in again.');
  const partner = await prisma.partner.findUnique({ where: { id: payload.sub } });
  if (!partner) throw new Error('Sign in again.');
  // T3: deletion requested or token issued before a revocation.
  if (isDeletionRequested(partner) || !tokenVersionMatches(payload, partner.tokenVersion ?? 0)) throw new Error('Sign in again.');
  return publicPartner(partner);
}

/**
 * T3-Q11: partner sign-in inside the grace window restores the account; the shop goes
 * CLOSED → PAUSED (never straight to ACTIVE). Past the deadline: null (generic failure).
 */
async function partnerSignInGate<T extends { id: string; deletionRequestedAt: Date | null; deletedAt: Date | null }>(
  partner: T,
  now = new Date()
): Promise<boolean> {
  const state = deletionState(partner, now);
  if (state === 'active') return true;
  if (state !== 'pending') return false;
  return prisma.$transaction(async (tx) => {
    const restored = await tx.partner.updateMany({
      where: { id: partner.id, deletedAt: null, deletionRequestedAt: partner.deletionRequestedAt },
      data: { deletionRequestedAt: null }
    });
    if (restored.count !== 1) return false;
    await tx.shop.updateMany({
      where: { ownerPartnerId: partner.id, status: 'CLOSED', deletedAt: null },
      data: shopStatusData(deletionFlags().partnerRestoreShopStatus)
    });
    return true;
  });
}

export async function partnerSignUp(email: string, password: string, name?: string) {
  const existing = await prisma.partner.findUnique({ where: { email } });
  // Same rule as customer sign-up (T3-Q6): in grace → tell them to sign in, which restores.
  if (existing && deletionState(existing) === 'pending') {
    throw new AppError('This account is pending deletion. Sign in to restore it.', 409, 'ACCOUNT_PENDING_DELETION');
  }
  if (existing) throw new Error('A partner account with that email already exists.');
  const partner = await prisma.partner.create({
    data: { email, name: name || null, passwordHash: await bcrypt.hash(password, 10) }
  });
  const profile = publicPartner(partner);
  return { token: signToken(profile, 'partner', partner.tokenVersion), partner: profile, shop: null };
}

export async function partnerSignIn(email: string, password: string) {
  const partner = await prisma.partner.findUnique({ where: { email } });
  if (!partner?.passwordHash || !(await bcrypt.compare(password, partner.passwordHash))) {
    throw new Error('Email or password is incorrect.');
  }
  if (!(await partnerSignInGate(partner))) throw new Error('Email or password is incorrect.');
  const profile = publicPartner(partner);
  const shop = await shopFor(partner.id);
  return { token: signToken(profile, 'partner', partner.tokenVersion), partner: profile, shop };
}

async function shopFor(partnerId: string) {
  const shop = await prisma.shop.findUnique({
    where: { ownerPartnerId: partnerId },
    include: {
      images: { orderBy: { sortOrder: 'asc' } },
      services: { include: { service: true } },
      barbers: { orderBy: { name: 'asc' } }
    }
  });
  if (!shop) return null;
  if (shop.acceptingPausedUntil && shop.acceptingPausedUntil.getTime() <= Date.now()) {
    await prisma.shop.update({
      where: { id: shop.id },
      data: { acceptingPausedUntil: null }
    });
    shop.acceptingPausedUntil = null;
  }
  const today = todayKeyIST();
  const capacity = await prisma.shopDayCapacity.findUnique({ where: { shopId_date: { shopId: shop.id, date: today } } });
  return {
    id: shop.id,
    name: shop.name,
    address: shop.address,
    city: shop.city,
    phone: shop.phone || null,
    latitude: Number(shop.latitude),
    longitude: Number(shop.longitude),
    kind: shop.kind,
    kinds: (shop.kinds?.length ? shop.kinds : shop.kind ? [shop.kind] : []) as string[],
    productBrands: shop.productBrands || [],
    chairCount: shop.chairCount,
    setupDone: shop.setupDone,
    status: shop.status,
    acceptingAppointments: shop.acceptingAppointments,
    acceptingPausedUntil: shop.acceptingPausedUntil?.toISOString() ?? null,
    amenities: shop.amenities,
    photos: shop.images.map((image) => image.url),
    services: shop.services.map((row) => ({
      id: row.serviceId,
      name: row.service.name,
      durationMinutes: row.durationMinutes || row.service.durationMinutes,
      bufferMinutes: row.bufferMinutes ?? row.service.bufferMinutes ?? 10,
      pricePaise: row.pricePaise,
      audience: row.audience,
      categoryId: row.service.categoryId || null
    })),
    barbers: shop.barbers
      .filter((row) => row.name !== 'Any chair')
      .map((row) => ({ id: row.id, name: row.name, rating: Number(row.rating) })),
    today: {
      date: today,
      workersPresent: capacity?.workersPresent ?? shop.chairCount,
      chairsInUse: capacity?.chairsInUse ?? shop.chairCount
    }
  };
}

export async function partnerShop(token: string) {
  const partner = await partnerFromToken(token);
  return shopFor(partner.id);
}

/** Mid-day / admin profile edit — does not wipe menu (unlike POST setup). */
export async function updateShopProfile(
  token: string,
  input: {
    name?: string;
    address?: string;
    city?: string;
    latitude?: number;
    longitude?: number;
    kind?: ShopKind;
    kinds?: ShopKind[];
    productBrands?: string[];
    chairCount?: number;
  }
) {
  const partner = await partnerFromToken(token);
  const shop = await prisma.shop.findUnique({ where: { ownerPartnerId: partner.id } });
  if (!shop) throw new Error('Finish shop setup first.');

  const kinds = (input.kinds?.length ? input.kinds : input.kind ? [input.kind] : undefined) as
    | ShopKind[]
    | undefined;
  if (kinds && !kinds.length) throw new Error('Choose at least one shop type.');

  const brands = input.productBrands
    ?.map((b) => b.trim())
    .filter(Boolean)
    .slice(0, 24);

  const chairs =
    input.chairCount != null ? Math.max(1, Math.min(40, Math.round(input.chairCount))) : undefined;

  await prisma.shop.update({
    where: { id: shop.id },
    data: {
      ...(input.name != null ? { name: input.name.trim().slice(0, 80) } : {}),
      ...(input.address != null ? { address: input.address.trim().slice(0, 180) } : {}),
      ...(input.city != null ? { city: input.city.trim().slice(0, 80) } : {}),
      ...(input.latitude != null ? { latitude: input.latitude } : {}),
      ...(input.longitude != null ? { longitude: input.longitude } : {}),
      ...(kinds
        ? {
            kinds,
            kind: kinds[0]
          }
        : {}),
      ...(brands ? { productBrands: brands } : {}),
      ...(chairs != null ? { chairCount: chairs } : {})
    }
  });

  if (chairs != null) {
    await ensureStaffBarbers(prisma, shop.id, chairs);
  }

  return shopFor(partner.id);
}

export async function setupShop(token: string, input: {
  name: string;
  address: string;
  city: string;
  latitude: number;
  longitude: number;
  kind?: ShopKind;
  kinds?: ShopKind[];
  productBrands?: string[];
  services: SetupService[];
  chairCount: number;
  workersPresent: number;
}) {
  const partner = await partnerFromToken(token);
  if (!input.services.length) throw new Error('Choose at least one service.');
  for (const item of input.services) assertPaidPricePaise(item.pricePaise, item.name);
  const chairs = Math.max(1, Math.min(40, input.chairCount));
  const workers = Math.max(1, Math.min(chairs, input.workersPresent));
  const kinds = (input.kinds?.length ? input.kinds : input.kind ? [input.kind] : []) as ShopKind[];
  if (!kinds.length) throw new Error('Choose at least one shop type.');
  const primary = kinds[0];
  const brands = (input.productBrands || [])
    .map((b) => b.trim())
    .filter(Boolean)
    .slice(0, 24);
  const owned = await prisma.shop.findUnique({ where: { ownerPartnerId: partner.id } });
  const data = {
    name: input.name,
    address: input.address,
    city: input.city,
    latitude: input.latitude,
    longitude: input.longitude,
    kind: primary,
    kinds,
    productBrands: brands,
    chairCount: chairs,
    setupDone: true,
    ownerPartnerId: partner.id
  };
  const shop = owned
    ? await prisma.shop.update({ where: { id: owned.id }, data })
    : await prisma.shop.create({ data });
  await prisma.shopService.deleteMany({ where: { shopId: shop.id } });
  await ensureServiceCategories();
  for (const item of input.services) {
    const serviceKind = resolveServiceKind(item.name, kinds) || primary;
    const service = await findOrCreateCatalogueService({
      name: item.name,
      durationMinutes: item.durationMinutes,
      bufferMinutes: defaultBufferMinutes(item.name, item.bufferMinutes),
      kind: serviceKind,
      categoryId: claimCategoryId(item.name)
    });
    await prisma.shopService.create({
      data: {
        shopId: shop.id,
        serviceId: service.id,
        pricePaise: item.pricePaise,
        durationMinutes: item.durationMinutes,
        bufferMinutes: defaultBufferMinutes(item.name, item.bufferMinutes),
        audience: resolveServiceAudience(item.name, item.audience)
      }
    });
  }
  const today = todayKeyIST();
  await prisma.shopDayCapacity.upsert({
    where: { shopId_date: { shopId: shop.id, date: today } },
    create: { shopId: shop.id, date: today, workersPresent: workers, chairsInUse: chairs },
    update: { workersPresent: workers, chairsInUse: chairs }
  });
  await ensureDefaultShopHours(prisma, shop.id);
  await ensureStaffBarbers(prisma, shop.id, chairs);
  return shopFor(partner.id);
}

function resolveServiceKind(name: string, kinds: ShopKind[]): ShopKind {
  const needle = name.toLowerCase();
  const spaHints = ['facial', 'spa', 'massage', 'cleanup', 'detan', 'threading'];
  const nailsHints = ['manicure', 'pedicure', 'nail', 'lash', 'wax', 'makeup'];
  const tattooHints = ['tattoo', 'cover-up', 'blackwork', 'touch-up', 'flash'];
  const piercHints = ['lobe', 'helix', 'tragus', 'nose', 'septum', 'eyebrow', 'navel', 'jewellery', 'pierc'];
  const pick = (want: ShopKind) => (kinds.includes(want) ? want : null);
  if (spaHints.some((h) => needle.includes(h))) return pick('SPA') || kinds[0];
  if (nailsHints.some((h) => needle.includes(h))) return pick('NAILS') || kinds[0];
  if (tattooHints.some((h) => needle.includes(h))) return pick('TATTOO') || kinds[0];
  if (piercHints.some((h) => needle.includes(h))) return pick('PIERCING') || kinds[0];
  return pick('SALON') || kinds[0];
}

export type PartnerHourDay = {
  weekday: number;
  opensAt: string;
  closesAt: string;
};

/** PS-01/02: list shop hours (missing weekday = closed). Seeds defaults if empty. */
export async function getPartnerHours(token: string) {
  const partner = await partnerFromToken(token);
  const shop = await prisma.shop.findUnique({ where: { ownerPartnerId: partner.id } });
  if (!shop) throw new Error('Finish shop setup first.');
  await ensureDefaultShopHours(prisma, shop.id);
  const rows = await prisma.shopWorkingHours.findMany({
    where: { shopId: shop.id },
    orderBy: { weekday: 'asc' }
  });
  return {
    shopId: shop.id,
    days: rows.map((row) => ({
      weekday: row.weekday,
      opensAt: row.opensAt.slice(0, 5),
      closesAt: row.closesAt.slice(0, 5)
    }))
  };
}

/**
 * PS-01/02: replace weekly hours.
 * Closed day = omit that weekday. At least one open day required (avoids ensureDefault reseeding).
 */
export async function setPartnerHours(token: string, days: PartnerHourDay[]) {
  const partner = await partnerFromToken(token);
  const shop = await prisma.shop.findUnique({ where: { ownerPartnerId: partner.id } });
  if (!shop) throw new Error('Finish shop setup first.');

  const cleaned: PartnerHourDay[] = [];
  const seen = new Set<number>();
  for (const day of days) {
    const weekday = Number(day.weekday);
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
      throw new Error('Weekday must be 0 (Sun) through 6 (Sat).');
    }
    if (seen.has(weekday)) throw new Error('Duplicate weekday in hours.');
    seen.add(weekday);
    const opensAt = normalizeHms(day.opensAt).slice(0, 5);
    const closesAt = normalizeHms(day.closesAt).slice(0, 5);
    const openMin =
      Number(opensAt.slice(0, 2)) * 60 + Number(opensAt.slice(3, 5));
    const closeMin =
      Number(closesAt.slice(0, 2)) * 60 + Number(closesAt.slice(3, 5));
    if (closeMin <= openMin) {
      throw new Error('Closing time must be after opening (overnight hours not supported).');
    }
    cleaned.push({ weekday, opensAt, closesAt });
  }
  if (!cleaned.length) throw new Error('Keep at least one open day.');

  await prisma.$transaction(async (tx) => {
    await tx.shopWorkingHours.deleteMany({ where: { shopId: shop.id } });
    await tx.shopWorkingHours.createMany({
      data: cleaned.map((day) => ({
        shopId: shop.id,
        weekday: day.weekday,
        opensAt: day.opensAt,
        closesAt: day.closesAt
      }))
    });
  });

  return getPartnerHours(token);
}

export type PartnerAcceptingMode = 'open' | 'today' | 'temporary';

/** Partner Home: open / close for today / close until toggled on. Does not hide shop. */
export async function setPartnerAcceptingAppointments(token: string, mode: PartnerAcceptingMode) {
  const partner = await partnerFromToken(token);
  const shop = await prisma.shop.findUnique({ where: { ownerPartnerId: partner.id } });
  if (!shop?.setupDone) throw new Error('Finish shop setup first.');

  let data: { acceptingAppointments: boolean; acceptingPausedUntil: Date | null };
  if (mode === 'open') {
    data = { acceptingAppointments: true, acceptingPausedUntil: null };
  } else if (mode === 'temporary') {
    data = { acceptingAppointments: false, acceptingPausedUntil: null };
  } else {
    data = {
      acceptingAppointments: true,
      acceptingPausedUntil: await resolveTodayBookingPauseUntil(prisma, shop.id)
    };
  }

  await prisma.shop.update({ where: { id: shop.id }, data });
  return shopFor(partner.id);
}

export type PartnerMenuServiceInput = {
  id?: string;
  name: string;
  durationMinutes: number;
  pricePaise: number;
  bufferMinutes?: number;
  /** MEN | WOMEN | KIDS | UNISEX — inferred from the name when omitted. */
  audience?: string;
};

/**
 * Mid-day menu edit: shop-level price + duration + buffer.
 * Existing ids update; missing ids create; services not in payload are removed (and orphan Service).
 */
export async function updatePartnerServices(token: string, services: PartnerMenuServiceInput[]) {
  const partner = await partnerFromToken(token);
  const shop = await prisma.shop.findUnique({ where: { ownerPartnerId: partner.id } });
  if (!shop?.setupDone) throw new Error('Finish shop setup first.');
  if (!services.length) throw new Error('Keep at least one service on the menu.');
  if (services.length > 120) throw new Error('Max 120 services on a shop menu.');
  await ensureServiceCategories();

  const cleaned = services.map((item) => {
    const name = item.name.trim().slice(0, 80);
    if (!name) throw new Error('Service name required.');
    const durationMinutes = Math.round(Number(item.durationMinutes));
    if (!Number.isFinite(durationMinutes) || durationMinutes < 10 || durationMinutes > 480) {
      throw new Error(`Duration for ${name} must be 10–480 minutes.`);
    }
    assertPaidPricePaise(item.pricePaise, name);
    const bufferMinutes = defaultBufferMinutes(name, item.bufferMinutes);
    return {
      id: item.id?.trim() || undefined,
      name,
      durationMinutes,
      pricePaise: Math.round(item.pricePaise),
      bufferMinutes,
      /** undefined = leave an existing line unchanged (older clients). */
      audience: isServiceAudience(item.audience) ? item.audience : undefined
    };
  });

  const existingLinks = await prisma.shopService.findMany({
    where: { shopId: shop.id },
    select: { serviceId: true }
  });
  const ownedIds = new Set(existingLinks.map((row) => row.serviceId));

  await prisma.$transaction(async (tx) => {
    const keepIds = new Set<string>();
    for (const item of cleaned) {
      if (item.id) {
        if (ownedIds.has(item.id)) {
          await tx.service.update({
            where: { id: item.id },
            data: {
              name: item.name,
              durationMinutes: item.durationMinutes,
              bufferMinutes: item.bufferMinutes
            }
          });
          await tx.shopService.update({
            where: { shopId_serviceId: { shopId: shop.id, serviceId: item.id } },
            data: {
              pricePaise: item.pricePaise,
              durationMinutes: item.durationMinutes,
              bufferMinutes: item.bufferMinutes,
              audience: item.audience
            }
          });
          keepIds.add(item.id);
        } else {
          // Link an existing global catalogue SKU onto this shop (Ops menu).
          const catalogue = await tx.service.findFirst({
            where: { id: item.id, active: true }
          });
          if (!catalogue) throw new Error(`Unknown catalogue service: ${item.name}`);
          await tx.service.update({
            where: { id: item.id },
            data: {
              name: item.name,
              durationMinutes: item.durationMinutes,
              bufferMinutes: item.bufferMinutes
            }
          });
          await tx.shopService.create({
            data: {
              shopId: shop.id,
              serviceId: item.id,
              pricePaise: item.pricePaise,
              durationMinutes: item.durationMinutes,
              bufferMinutes: item.bufferMinutes,
              audience: resolveServiceAudience(item.name, item.audience)
            }
          });
          keepIds.add(item.id);
        }
      } else {
        // Reuse global catalogue SKU by name — never mint a second “Beard trim”.
        const created = await findOrCreateCatalogueService({
          name: item.name,
          durationMinutes: item.durationMinutes,
          bufferMinutes: item.bufferMinutes,
          kind: shop.kind,
          categoryId: claimCategoryId(item.name)
        });
        const already = await tx.shopService.findUnique({
          where: { shopId_serviceId: { shopId: shop.id, serviceId: created.id } }
        });
        if (already) {
          await tx.shopService.update({
            where: { shopId_serviceId: { shopId: shop.id, serviceId: created.id } },
            data: {
              pricePaise: item.pricePaise,
              durationMinutes: item.durationMinutes,
              bufferMinutes: item.bufferMinutes,
              audience: resolveServiceAudience(item.name, item.audience)
            }
          });
        } else {
          await tx.shopService.create({
            data: {
              shopId: shop.id,
              serviceId: created.id,
              pricePaise: item.pricePaise,
              durationMinutes: item.durationMinutes,
              bufferMinutes: item.bufferMinutes,
              audience: resolveServiceAudience(item.name, item.audience)
            }
          });
        }
        keepIds.add(created.id);
      }
    }

    const removeIds = [...ownedIds].filter((id) => !keepIds.has(id));
    if (removeIds.length) {
      await tx.shopService.deleteMany({
        where: { shopId: shop.id, serviceId: { in: removeIds } }
      });
      // Orphan catalogue rows created for this shop — drop if unused elsewhere.
      for (const serviceId of removeIds) {
        const stillLinked = await tx.shopService.count({ where: { serviceId } });
        const inBookings = await tx.bookingService.count({ where: { serviceId } });
        if (stillLinked === 0 && inBookings === 0) {
          // Keep Ops catalogue SKUs (have categoryId); only drop ad-hoc orphans.
          const svc = await tx.service.findUnique({
            where: { id: serviceId },
            select: { categoryId: true }
          });
          if (svc && !svc.categoryId) {
            await tx.service.delete({ where: { id: serviceId } }).catch(() => undefined);
          }
        }
      }
    }
  });

  return shopFor(partner.id);
}

/** PS-04: rename + add (no id) + remove staff missing from the payload. Per-barber hours = later. */
export async function updateBarbers(token: string, barbers: { id?: string; name: string }[]) {
  const partner = await partnerFromToken(token);
  const shop = await prisma.shop.findUnique({ where: { ownerPartnerId: partner.id } });
  if (!shop?.setupDone) throw new Error('Finish shop setup first.');
  const cleaned = barbers
    .map((row) => ({ id: row.id?.trim() || undefined, name: row.name.trim().slice(0, 40) }))
    .filter((row) => row.name);
  if (!cleaned.length) throw new Error('Add at least one staff name.');
  if (cleaned.length > 40) throw new Error('Max 40 staff on a shop.');

  const existing = await prisma.barber.findMany({ where: { shopId: shop.id } });
  const keepIds = new Set(cleaned.map((row) => row.id).filter(Boolean) as string[]);

  for (const row of cleaned) {
    if (row.id) {
      await prisma.barber.updateMany({
        where: { id: row.id, shopId: shop.id },
        data: { name: row.name }
      });
    } else {
      await prisma.barber.create({
        data: { shopId: shop.id, name: row.name, rating: 5 }
      });
    }
  }

  const toRemove = existing.filter((row) => !keepIds.has(row.id));
  for (const row of toRemove) {
    const active = await prisma.booking.count({
      where: {
        barberId: row.id,
        status: { in: ['AWAITING_SHOP', 'CONFIRMED', 'ARRIVED', 'IN_SERVICE', 'PAYMENT_PENDING', 'HELD'] }
      }
    });
    const walkIns = await prisma.walkIn.count({ where: { barberId: row.id, status: 'ACTIVE' } });
    if (active || walkIns) {
      throw new Error(`Cannot remove ${row.name} — they still have active visits.`);
    }
    await prisma.bookingHold.deleteMany({ where: { barberId: row.id } });
    await prisma.barber.delete({ where: { id: row.id } });
  }

  return shopFor(partner.id);
}

export async function updateFloor(token: string, input: { workersPresent: number; chairsInUse: number }) {
  const partner = await partnerFromToken(token);
  const shop = await prisma.shop.findUnique({ where: { ownerPartnerId: partner.id } });
  if (!shop?.setupDone) throw new Error('Finish shop setup first.');
  const chairsInUse = Math.max(0, Math.min(shop.chairCount, input.chairsInUse));
  const workersPresent = Math.max(0, Math.min(chairsInUse || shop.chairCount, input.workersPresent));
  const today = todayKeyIST();
  await prisma.shopDayCapacity.upsert({
    where: { shopId_date: { shopId: shop.id, date: today } },
    create: { shopId: shop.id, date: today, workersPresent, chairsInUse },
    update: { workersPresent, chairsInUse }
  });
  return shopFor(partner.id);
}

export async function updateAmenities(token: string, amenities: string[]) {
  const partner = await partnerFromToken(token);
  const shop = await prisma.shop.findUnique({ where: { ownerPartnerId: partner.id } });
  if (!shop) throw new Error('Finish shop setup first.');
  await prisma.shop.update({ where: { id: shop.id }, data: { amenities: amenities.slice(0, 12) } });
  return shopFor(partner.id);
}

/** Public shop contact phone (customer Contact tile). Empty string clears. */
export async function updateShopPhone(token: string, phone: string | null) {
  const partner = await partnerFromToken(token);
  const shop = await prisma.shop.findUnique({ where: { ownerPartnerId: partner.id } });
  if (!shop) throw new Error('Finish shop setup first.');
  const next = phone?.trim() || null;
  if (next && !/^\+[1-9]\d{7,14}$/.test(next)) {
    throw new Error('Enter phone with country code, like +9198…');
  }
  await prisma.shop.update({ where: { id: shop.id }, data: { phone: next } });
  return shopFor(partner.id);
}

export async function updatePhotos(token: string, photos: string[]) {
  const partner = await partnerFromToken(token);
  const shop = await prisma.shop.findUnique({ where: { ownerPartnerId: partner.id } });
  if (!shop) throw new Error('Finish shop setup first.');
  const next = photos.slice(0, 5);
  await prisma.shopImage.deleteMany({ where: { shopId: shop.id } });
  if (next.length) {
    await prisma.shopImage.createMany({
      data: next.map((url, sortOrder) => ({ shopId: shop.id, url, sortOrder }))
    });
  }
  return shopFor(partner.id);
}

type PaymentMoneyRow = {
  totalPaise: number;
  advancePaise: number;
  payment?: { amountPaise: number; status: string; shopSettledAt?: Date | null } | null;
};

function bookingMoney(row: PaymentMoneyRow) {
  const totalPaise = row.totalPaise;
  const collectedPaise =
    row.payment?.status === 'CAPTURED' ? Math.max(0, row.payment.amountPaise) : 0;
  const remainingPaise =
    row.payment?.status === 'REFUNDED' ? 0 : Math.max(0, totalPaise - collectedPaise);
  return {
    totalPaise,
    advancePaise: row.advancePaise,
    collectedPaise,
    remainingPaise,
    balanceSettled: remainingPaise === 0 && totalPaise > 0 && collectedPaise >= totalPaise,
    shopSettledAt: row.payment?.shopSettledAt?.toISOString() || null
  };
}

function mapFloorVisit(row: {
  id: string;
  bookingCode: string;
  status: string;
  startsAt: Date;
  endsAt: Date;
  totalPaise: number;
  advancePaise: number;
  shopId?: string;
  user: { name: string | null; phone?: string | null; deletionRequestedAt?: Date | null; deletedAt?: Date | null };
  barber: { id: string; name: string };
  services: { serviceId?: string; service: { name: string } }[];
  payment?: { amountPaise: number; status: string; shopSettledAt?: Date | null } | null;
}) {
  const status = row.status as BookingState;
  const graceOk = canMarkNoShow(row.startsAt);
  const money = bookingMoney(row);
  return {
    kind: 'booking' as const,
    id: row.id,
    bookingCode: row.bookingCode,
    status: row.status,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    name: displayCustomerName(row.user),
    phone: displayCustomerPhone(row.user),
    service: row.services.map((item) => item.service.name).join(', ') || 'Appointment',
    serviceId: row.services[0]?.serviceId || null,
    shopId: row.shopId || null,
    barberName: row.barber.name,
    barberId: row.barber.id,
    canNoShow: status === 'CONFIRMED' || status === 'ARRIVED' ? graceOk : false,
    canReschedule: status === 'CONFIRMED' ? graceOk : false,
    noShowAvailableAt: noShowAvailableAt(row.startsAt).toISOString(),
    actions: nextFloorActions(status),
    ...money
  };
}

function mapWalkInVisit(row: {
  id: string;
  status: string;
  startsAt: Date;
  endsAt: Date;
  guestName: string | null;
  barber: { id: string; name: string };
}) {
  const minutes = Math.max(1, Math.round((row.endsAt.getTime() - row.startsAt.getTime()) / 60000));
  return {
    kind: 'walkin' as const,
    id: row.id,
    bookingCode: 'WALK-IN',
    status: row.status,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    name: row.guestName?.trim() || 'Walk-in',
    phone: null as string | null,
    service: `${minutes} min walk-in`,
    serviceId: null as string | null,
    shopId: null as string | null,
    barberName: row.barber.name,
    barberId: row.barber.id,
    canNoShow: false,
    canReschedule: false,
    noShowAvailableAt: row.startsAt.toISOString(),
    actions:
      row.status === 'ACTIVE'
        ? [
            { to: 'COMPLETED', label: 'Done' },
            { to: 'CANCELLED', label: 'Cancel' }
          ]
        : [],
    totalPaise: 0,
    advancePaise: 0,
    collectedPaise: 0,
    remainingPaise: 0,
    balanceSettled: true,
    shopSettledAt: null as string | null
  };
}

export type FloorVisitRow = ReturnType<typeof mapFloorVisit> | ReturnType<typeof mapWalkInVisit>;

function mapRequestRow(row: {
  id: string;
  bookingCode: string;
  status: string;
  startsAt: Date;
  endsAt: Date;
  totalPaise: number;
  advancePaise: number;
  user: { name: string | null; phone: string | null; deletionRequestedAt?: Date | null; deletedAt?: Date | null };
  barber: { id: string; name: string };
  services: { service: { name: string } }[];
}) {
  return {
    id: row.id,
    bookingCode: row.bookingCode,
    status: row.status,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    name: displayCustomerName(row.user),
    phone: displayCustomerPhone(row.user),
    service: row.services.map((item) => item.service.name).join(', ') || 'Appointment',
    barberName: row.barber.name,
    barberId: row.barber.id,
    totalPaise: row.totalPaise,
    advancePaise: row.advancePaise,
    actions: nextShopRequestActions(row.status as BookingState)
  };
}

/** All pending shop requests (any day), oldest first. */
export async function partnerBookingRequests(token: string) {
  const partner = await partnerFromToken(token);
  const shop = await prisma.shop.findUnique({ where: { ownerPartnerId: partner.id } });
  if (!shop?.setupDone) return { items: [] as ReturnType<typeof mapRequestRow>[], requestCount: 0 };
  await expireMissedAwaitingBookings({ shopId: shop.id });
  const rows = await prisma.booking.findMany({
    where: { shopId: shop.id, status: 'AWAITING_SHOP' },
    orderBy: { startsAt: 'asc' },
    include: {
      user: true,
      barber: true,
      services: { include: { service: true } }
    }
  });
  const items = rows.map((row) => mapRequestRow(row));
  return { items, requestCount: items.length };
}

export async function partnerDashboard(token: string) {
  const partner = await partnerFromToken(token);
  const shop = await shopFor(partner.id);
  if (!shop) {
    return {
      shop: null,
      next: null,
      visits: [] as FloorVisitRow[],
      todayCount: 0,
      waiting: 0,
      inService: 0,
      done: 0,
      revenuePaise: 0,
      advanceCollectedPaise: 0,
      remainingPaise: 0,
      openSlots: 0,
      peakHour: null as string | null,
      byHour: [] as { hour: number; label: string; count: number }[],
      requests: [] as ReturnType<typeof mapRequestRow>[],
      requestCount: 0
    };
  }
  // Expire-on-read + waiting-time notify when partner opens Home/Floor.
  await expireMissedAwaitingBookings({ shopId: shop.id });
  await notifyWaitingStarted({ shopId: shop.id });
  const { start, end } = dayRangeIST(shop.today.date);
  const [rows, walkInRows, awaitingRows] = await Promise.all([
    prisma.booking.findMany({
      where: {
        shopId: shop.id,
        startsAt: { gte: start, lt: end },
        status: { notIn: [...BOOKING_FREE_STATUSES] }
      },
      orderBy: { startsAt: 'asc' },
      include: {
        user: true,
        barber: true,
        services: { include: { service: true } },
        payment: true
      }
    }),
    prisma.walkIn.findMany({
      where: {
        shopId: shop.id,
        status: { in: ['ACTIVE', 'COMPLETED'] },
        startsAt: { lt: end },
        endsAt: { gt: start }
      },
      orderBy: { startsAt: 'asc' },
      include: { barber: true }
    }),
    prisma.booking.findMany({
      where: { shopId: shop.id, status: 'AWAITING_SHOP' },
      orderBy: { startsAt: 'asc' },
      include: {
        user: true,
        barber: true,
        services: { include: { service: true } },
        payment: true
      }
    })
  ]);
  const requestRows = awaitingRows.map((row) => mapRequestRow(row));
  const requestCount = requestRows.length;
  const active = rows.filter(
    (row) => row.status === 'CONFIRMED' || row.status === 'ARRIVED' || row.status === 'IN_SERVICE'
  );
  const activeWalkIns = walkInRows.filter((row) => row.status === 'ACTIVE');
  const visits: FloorVisitRow[] = [
    ...active.map((row) => mapFloorVisit(row)),
    ...activeWalkIns.map((row) => mapWalkInVisit(row))
  ].sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  const upcoming = active.find((row) => row.startsAt.getTime() >= Date.now() - 30 * 60 * 1000) || active[0] || null;
  const hourCounts = new Map<number, number>();
  for (let hour = 9; hour <= 21; hour += 1) hourCounts.set(hour, 0);
  let revenuePaise = 0;
  let remainingPaise = 0;
  for (const row of rows) {
    const hour = Number(formatIST(row.startsAt, { hour: 'numeric', hour12: false }));
    if (hourCounts.has(hour)) hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
    if (
      row.status === 'COMPLETED' ||
      row.status === 'IN_SERVICE' ||
      row.status === 'ARRIVED' ||
      row.status === 'CONFIRMED' ||
      row.status === 'AWAITING_SHOP'
    ) {
      const money = bookingMoney(row);
      // Revenue = cash collected at the shop. No separate advance bucket.
      remainingPaise += money.remainingPaise;
      revenuePaise += money.collectedPaise;
    }
  }
  for (const row of walkInRows) {
    const hour = Number(formatIST(row.startsAt, { hour: 'numeric', hour12: false }));
    if (hourCounts.has(hour)) hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
  }
  const byHour = [...hourCounts.entries()].map(([hour, count]) => ({
    hour,
    label: hour > 12 ? `${hour - 12}p` : hour === 12 ? '12p' : `${hour}a`,
    count
  }));
  const peak = byHour.reduce((best, item) => (item.count > (best?.count ?? -1) ? item : best), null as (typeof byHour)[number] | null);
  const openSlots = Math.min(shop.today.workersPresent, shop.today.chairsInUse);
  return {
    shop,
    visits,
    requests: requestRows,
    requestCount,
    todayCount: rows.length + walkInRows.length,
    waiting: rows.filter((row) => row.status === 'CONFIRMED').length,
    inService:
      rows.filter((row) => row.status === 'IN_SERVICE' || row.status === 'ARRIVED').length + activeWalkIns.length,
    done: rows.filter((row) => row.status === 'COMPLETED').length + walkInRows.filter((row) => row.status === 'COMPLETED').length,
    revenuePaise,
    advanceCollectedPaise: 0,
    remainingPaise,
    openSlots,
    peakHour: peak && peak.count > 0 ? peak.label : null,
    byHour,
    next: upcoming
      ? {
          id: upcoming.id,
          name: displayCustomerName(upcoming.user),
          service: upcoming.services.map((item) => item.service.name).join(', ') || 'Appointment',
          startsAt: upcoming.startsAt.toISOString(),
          status: upcoming.status
        }
      : null
  };
}

export async function respondToBookingRequest(
  token: string,
  bookingId: string,
  decision: 'CONFIRMED' | 'REJECTED'
) {
  const partner = await partnerFromToken(token);
  const shop = await prisma.shop.findUnique({ where: { ownerPartnerId: partner.id } });
  if (!shop?.setupDone) throw new Error('Finish shop setup first.');
  await expireMissedAwaitingBookings({ shopId: shop.id, bookingId });
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, shopId: shop.id },
    include: {
      user: true,
      barber: true,
      services: { include: { service: true } },
      payment: true
    }
  });
  if (!booking) throw new Error('Booking not found.');
  if (booking.status === 'EXPIRED') {
    throw new Error('Appointment missed — slot start passed without a decision.');
  }
  if (booking.status !== 'AWAITING_SHOP') throw new Error('This request is no longer waiting for a decision.');
  if (booking.startsAt.getTime() <= Date.now()) {
    await expireMissedAwaitingBookings({ bookingId: booking.id });
    throw new Error('Appointment missed — slot start passed without a decision.');
  }
  assertTransition('AWAITING_SHOP', decision);

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.booking.update({
      where: { id: booking.id },
      data: {
        status: decision,
        ...(decision === 'REJECTED' ? { idempotencyKey: archivedIdempotencyKey(booking.id) } : {})
      },
      include: {
        user: true,
        barber: true,
        services: { include: { service: true } },
        payment: true
      }
    });
    if (decision === 'REJECTED' && row.payment) {
      await tx.bookingPayment.update({
        where: { bookingId: row.id },
        data: { status: 'REFUNDED' }
      });
    }
    return row;
  });

  const when = formatIST(updated.startsAt, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit'
  });
  const serviceName = updated.services.map((item) => item.service.name).join(', ') || 'Appointment';
  if (decision === 'CONFIRMED') {
    void notifyUser(updated.userId, {
      title: 'Booking confirmed',
      body: `${serviceName} at ${shop.name} · ${when}`,
      data: { bookingId: updated.id, screen: 'booking' }
    });
  } else {
    void notifyUser(updated.userId, {
      title: 'Booking rejected',
      body: `${shop.name} could not take this visit`,
      data: { bookingId: updated.id, screen: 'booking' }
    });
  }

  return {
    id: updated.id,
    bookingCode: updated.bookingCode,
    status: updated.status,
    startsAt: updated.startsAt.toISOString(),
    endsAt: updated.endsAt.toISOString(),
    name: displayCustomerName(updated.user),
    service: serviceName,
    barberName: updated.barber.name,
    barberId: updated.barberId,
    advancePaise: updated.advancePaise,
    actions: nextShopRequestActions(updated.status as BookingState)
  };
}

export async function partnerBookingHistory(token: string) {
  const partner = await partnerFromToken(token);
  const shop = await prisma.shop.findUnique({ where: { ownerPartnerId: partner.id } });
  if (!shop?.setupDone) return { items: [] as ReturnType<typeof mapHistoryRow>[] };
  await expireMissedAwaitingBookings({ shopId: shop.id });
  const rows = await prisma.booking.findMany({
    where: { shopId: shop.id, status: { in: [...PARTNER_HISTORY_STATUSES] } },
    orderBy: { startsAt: 'desc' },
    take: 100,
    include: {
      user: true,
      barber: true,
      services: { include: { service: true } },
      payment: true
    }
  });
  return { items: rows.map((row) => mapHistoryRow(row)) };
}

function mapHistoryRow(row: {
  id: string;
  bookingCode: string;
  status: string;
  startsAt: Date;
  endsAt: Date;
  totalPaise: number;
  advancePaise: number;
  user: { name: string | null; phone: string | null; deletionRequestedAt?: Date | null; deletedAt?: Date | null };
  barber: { id: string; name: string };
  services: { service: { name: string }; pricePaise: number }[];
  payment: { status: string; amountPaise: number; shopSettledAt: Date | null } | null;
}) {
  const money = bookingMoney({
    totalPaise: row.totalPaise,
    advancePaise: row.advancePaise,
    payment: row.payment
  });
  return {
    id: row.id,
    bookingCode: row.bookingCode,
    status: row.status,
    statusLabel: partnerHistoryStatusLabel(row.status),
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    name: displayCustomerName(row.user),
    phone: displayCustomerPhone(row.user),
    service: row.services.map((item) => item.service.name).join(', ') || 'Appointment',
    barberName: row.barber.name,
    barberId: row.barber.id,
    advancePaise: row.advancePaise,
    totalPaise: money.totalPaise,
    collectedPaise: money.collectedPaise,
    remainingPaise: money.remainingPaise,
    paymentStatus: row.payment?.status || null
  };
}

export async function updatePartnerBookingStatus(token: string, bookingId: string, status: PartnerFloorTarget) {
  const partner = await partnerFromToken(token);
  const shop = await prisma.shop.findUnique({ where: { ownerPartnerId: partner.id } });
  if (!shop?.setupDone) throw new Error('Finish shop setup first.');
  await notifyWaitingStarted({ shopId: shop.id });
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, shopId: shop.id },
    include: {
      user: true,
      barber: true,
      services: { include: { service: true } },
      payment: true
    }
  });
  if (!booking) throw new Error('Booking not found.');
  // Transition first: wrong state is 409 even before the no-show grace window opens.
  assertPartnerTransition(booking.status, status);
  if (status === 'NO_SHOW' && !canMarkNoShow(booking.startsAt)) {
    throw new Error('No-show unlocks 5 minutes after the appointment start.');
  }

  // T6: compare-and-set + balance settlement commit or roll back together.
  await transitionWithSideEffect(prisma, booking.id, booking.status, status, async (tx) => {
    // Done = complete service + collect any remaining at shop (revenue) in one step.
    if (status === 'COMPLETED' && bookingMoney(booking).remainingPaise > 0) {
      await settleRemainingAtShop(booking, tx as Prisma.TransactionClient);
    }
  });

  // No-show does not refund. Payment stays as recorded.
  const updated = await prisma.booking.findUniqueOrThrow({
    where: { id: booking.id },
    include: {
      user: true,
      barber: true,
      services: { include: { service: true } },
      payment: true
    }
  });
  if (status === 'NO_SHOW') {
    void notifyUser(updated.userId, {
      title: 'Marked as no-show',
      body: `${shop.name} · ${updated.bookingCode} · marked no-show`,
      data: { bookingId: updated.id, screen: 'booking' }
    });
  }
  return mapFloorVisit(updated);
}

type BookingForSettle = {
  id: string;
  totalPaise: number;
  payment: {
    provider: string;
  } | null;
};

/** Capture remaining balance as shop-settled (PS-31). */
async function settleRemainingAtShop(booking: BookingForSettle, db: Prisma.TransactionClient = prisma) {
  const now = new Date();
  if (booking.payment) {
    await db.bookingPayment.update({
      where: { bookingId: booking.id },
      data: {
        amountPaise: booking.totalPaise,
        status: 'CAPTURED',
        shopSettledAt: now,
        provider:
          booking.payment.provider === 'razorpay' || booking.payment.provider === 'mixed'
            ? 'mixed'
            : 'shop'
      }
    });
  } else {
    await db.bookingPayment.create({
      data: {
        bookingId: booking.id,
        provider: 'shop',
        providerPaymentId: `shop_${Date.now()}`,
        amountPaise: booking.totalPaise,
        status: 'CAPTURED',
        shopSettledAt: now
      }
    });
  }
}

/** CJ-39 shop-side: mark remaining balance paid at chair → clears Remaining, adds to revenue. */
export async function collectBalanceAtShop(token: string, bookingId: string) {
  const partner = await partnerFromToken(token);
  const shop = await prisma.shop.findUnique({ where: { ownerPartnerId: partner.id } });
  if (!shop?.setupDone) throw new Error('Finish shop setup first.');
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, shopId: shop.id },
    include: {
      user: true,
      barber: true,
      services: { include: { service: true } },
      payment: true
    }
  });
  if (!booking) throw new Error('Booking not found.');
  if (
    booking.status === 'CANCELLED' ||
    booking.status === 'REJECTED' ||
    booking.status === 'EXPIRED' ||
    booking.status === 'FAILED' ||
    booking.status === 'NO_SHOW'
  ) {
    throw new Error('This visit cannot collect a balance.');
  }
  const money = bookingMoney(booking);
  if (money.remainingPaise <= 0) {
    throw new Error('Balance is already settled.');
  }
  await settleRemainingAtShop(booking);
  const updated = await prisma.booking.findFirstOrThrow({
    where: { id: booking.id },
    include: {
      user: true,
      barber: true,
      services: { include: { service: true } },
      payment: true
    }
  });
  return mapFloorVisit(updated);
}

/** Floor: partner enters customer’s 4-digit verify PIN to start service (Rapido/Uber style). */
export async function startBookingWithVerifyPin(token: string, bookingId: string, verifyPin: string) {
  const partner = await partnerFromToken(token);
  const shop = await prisma.shop.findUnique({ where: { ownerPartnerId: partner.id } });
  if (!shop?.setupDone) throw new Error('Finish shop setup first.');
  const pin = String(verifyPin || '').trim();
  if (!/^\d{4}$/.test(pin)) throw new Error('Enter the 4-digit code from the customer.');

  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, shopId: shop.id },
    include: {
      user: true,
      barber: true,
      services: { include: { service: true } }
    }
  });
  if (!booking) throw new Error('Booking not found.');
  if (booking.status !== 'CONFIRMED' && booking.status !== 'ARRIVED') {
    throw new Error('Only arrived or confirmed visits can be started with a code.');
  }
  if (!booking.verifyPin || booking.verifyPin !== pin) {
    throw new Error('Wrong code. Ask the customer for the 4-digit visit code.');
  }

  // T6: status-checked writes in one transaction — a PIN start that read CONFIRMED
  // can't overwrite a NO_SHOW committed meanwhile (409 instead).
  const updated = await prisma.$transaction(async (tx) => {
    if (booking.status === 'CONFIRMED') {
      assertTransition('CONFIRMED', 'ARRIVED');
      await setBookingStatusIfCurrent(tx, booking.id, 'CONFIRMED', 'ARRIVED');
    }
    assertTransition('ARRIVED', 'IN_SERVICE');
    await setBookingStatusIfCurrent(tx, booking.id, 'ARRIVED', 'IN_SERVICE');
    return tx.booking.findUniqueOrThrow({
      where: { id: booking.id },
      include: {
        user: true,
        barber: true,
        services: { include: { service: true } },
        payment: true
      }
    });
  });
  void notifyUser(updated.userId, {
    title: 'Service started',
    body: `${shop.name} · ${updated.bookingCode}`,
    data: { bookingId: updated.id, screen: 'booking' }
  });
  return mapFloorVisit(updated);
}

/** Partner same-day reschedule after grace; stays CONFIRMED (auto-accept). */
export async function partnerRescheduleBooking(
  token: string,
  bookingId: string,
  input: { startsAt: string; barberId?: string }
) {
  const partner = await partnerFromToken(token);
  const shop = await prisma.shop.findUnique({ where: { ownerPartnerId: partner.id } });
  if (!shop?.setupDone) throw new Error('Finish shop setup first.');
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, shopId: shop.id },
    include: {
      user: true,
      barber: true,
      services: { include: { service: true } }
    }
  });
  if (!booking) throw new Error('Booking not found.');
  if (booking.status !== 'CONFIRMED') throw new Error('Only confirmed visits can be rescheduled.');
  if (!canMarkNoShow(booking.startsAt)) {
    throw new Error('Reschedule unlocks 5 minutes after the appointment start — call the customer first.');
  }

  const startsAt = new Date(input.startsAt);
  if (Number.isNaN(startsAt.getTime())) throw new Error('Pick a valid time.');
  assertFutureStart(startsAt);
  const todayKey = todayKeyIST();
  const newDay = todayKeyIST(startsAt);
  if (newDay !== todayKey) throw new Error('Partner reschedule is only available for today.');

  const serviceRow = booking.services[0];
  if (!serviceRow) throw new Error('Booking has no service.');
  const endsAt = new Date(startsAt.getTime() + serviceRow.durationMinutes * 60000);
  const barberId = input.barberId || booking.barberId;
  const barber = await prisma.barber.findFirst({ where: { id: barberId, shopId: shop.id } });
  if (!barber) throw new Error('Pick a staff member.');

  const open = await resolveOpenWindow(prisma, { shopId: shop.id, dateKey: newDay, barberId });
  if (!open || !isWithinWindow(startsAt, endsAt, open)) {
    throw new Error('That time is outside shop hours. Pick another slot.');
  }
  const capacity = await getDayCapacity(prisma, shop.id, newDay);
  if (capacity <= 0) throw new Error('No open seats today.');

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const shopBusy: TimeWindow[] = [
        ...(
          await tx.booking.findMany({
            where: {
              shopId: shop.id,
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
              shopId: shop.id,
              expiresAt: { gt: new Date() },
              startsAt: { lt: endsAt },
              endsAt: { gt: startsAt }
            }
          })
        ).map((row) => ({ start: row.startsAt, end: row.endsAt })),
        ...(await loadActiveWalkIns(tx, { shopId: shop.id, overlap: { start: startsAt, end: endsAt } }))
      ];
      if (isAtShopCapacity({ start: startsAt, end: endsAt }, shopBusy, capacity)) {
        throw new Error(SLOT_TAKEN_MESSAGE);
      }
      const clash = await tx.booking.findFirst({
        where: {
          barberId,
          status: { notIn: [...AVAILABILITY_FREE_STATUSES] },
          startsAt: { lt: endsAt },
          endsAt: { gt: startsAt },
          NOT: { id: booking.id }
        }
      });
      if (clash) throw new Error(SLOT_TAKEN_MESSAGE);
      if (await findWalkInClash(tx, barberId, { start: startsAt, end: endsAt })) {
        throw new Error(SLOT_TAKEN_MESSAGE);
      }

      return tx.booking.update({
        where: { id: booking.id },
        data: {
          barberId,
          startsAt,
          endsAt,
          status: 'CONFIRMED',
          waitingStartedNotifiedAt: null
        },
        include: {
          user: true,
          barber: true,
          services: { include: { service: true } },
          payment: true
        }
      });
    }, txOpts);

    const when = formatIST(updated.startsAt, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit'
    });
    void notifyUser(updated.userId, {
      title: 'Visit rescheduled',
      body: `${shop.name} moved your visit to ${when}`,
      data: { bookingId: updated.id, screen: 'booking' }
    });
    return mapFloorVisit(updated);
  } catch (error) {
    throwIfSlotRace(error, 'booking');
    throw error;
  }
}

export async function createPartnerWalkIn(
  token: string,
  input: { barberId: string; durationMinutes: number; guestName?: string }
) {
  const partner = await partnerFromToken(token);
  const shop = await prisma.shop.findUnique({ where: { ownerPartnerId: partner.id } });
  if (!shop?.setupDone) throw new Error('Finish shop setup first.');
  const durationMinutes = assertWalkInDuration(input.durationMinutes);
  const barber = await prisma.barber.findFirst({ where: { id: input.barberId, shopId: shop.id } });
  if (!barber) throw new Error('Pick a staff member on your floor.');

  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + durationMinutes * 60000);
  const dateKey = todayKeyIST(startsAt);
  const capacity = await getDayCapacity(prisma, shop.id, dateKey);
  if (capacity <= 0) {
    throw new Error('No open seats — set workers above 0 on the Floor.');
  }

  const guestName = input.guestName?.trim() ? input.guestName.trim().slice(0, 60) : null;

  try {
    const row = await prisma.$transaction(async (tx) => {
      const now = new Date();
      await tx.bookingHold.deleteMany({ where: { expiresAt: { lte: now } } });

      const shopBusy: TimeWindow[] = [
        ...(
          await tx.booking.findMany({
            where: {
              shopId: shop.id,
              status: { notIn: [...AVAILABILITY_FREE_STATUSES] },
              startsAt: { lt: endsAt },
              endsAt: { gt: startsAt }
            }
          })
        ).map((item) => ({ start: item.startsAt, end: item.endsAt })),
        ...(
          await tx.bookingHold.findMany({
            where: {
              shopId: shop.id,
              expiresAt: { gt: now },
              startsAt: { lt: endsAt },
              endsAt: { gt: startsAt }
            }
          })
        ).map((item) => ({ start: item.startsAt, end: item.endsAt })),
        ...(await loadActiveWalkIns(tx, { shopId: shop.id, overlap: { start: startsAt, end: endsAt } }))
      ];
      if (isAtShopCapacity({ start: startsAt, end: endsAt }, shopBusy, capacity)) {
        throw new Error('Shop is full right now. Free a seat or wait.');
      }

      const bookingClash = await tx.booking.findFirst({
        where: {
          barberId: barber.id,
          status: { notIn: [...AVAILABILITY_FREE_STATUSES] },
          startsAt: { lt: endsAt },
          endsAt: { gt: startsAt }
        }
      });
      if (bookingClash) throw new Error(SLOT_TAKEN_MESSAGE);

      const holdClash = await tx.bookingHold.findFirst({
        where: {
          barberId: barber.id,
          expiresAt: { gt: now },
          startsAt: { lt: endsAt },
          endsAt: { gt: startsAt }
        }
      });
      if (holdClash) throw new Error('That staff has a held booking overlapping now.');

      if (await findWalkInClash(tx, barber.id, { start: startsAt, end: endsAt })) {
        throw new Error('That staff already has a walk-in.');
      }

      return tx.walkIn.create({
        data: {
          shopId: shop.id,
          barberId: barber.id,
          startsAt,
          endsAt,
          status: 'ACTIVE',
          guestName
        },
        include: { barber: true }
      });
    }, txOpts);
    return mapWalkInVisit(row);
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === SLOT_TAKEN_MESSAGE ||
        error.message.includes('full right now') ||
        error.message.includes('already has') ||
        error.message.includes('held booking'))
    ) {
      throw error;
    }
    throwIfSlotRace(error, 'walk-in');
  }
}

export async function updatePartnerWalkInStatus(
  token: string,
  walkInId: string,
  status: 'COMPLETED' | 'CANCELLED'
) {
  const partner = await partnerFromToken(token);
  const shop = await prisma.shop.findUnique({ where: { ownerPartnerId: partner.id } });
  if (!shop?.setupDone) throw new Error('Finish shop setup first.');
  const walkIn = await prisma.walkIn.findFirst({
    where: { id: walkInId, shopId: shop.id },
    include: { barber: true }
  });
  if (!walkIn) throw new Error('Walk-in not found.');
  if (walkIn.status !== 'ACTIVE') throw new Error('That walk-in is already closed.');
  const updated = await prisma.walkIn.update({
    where: { id: walkIn.id },
    data: { status },
    include: { barber: true }
  });
  return mapWalkInVisit(updated);
}

export async function savePartnerPushToken(token: string, pushToken: string) {
  const partner = await partnerFromToken(token);
  await prisma.partner.update({ where: { id: partner.id }, data: { pushToken } });
  return { saved: true as const };
}

/** T3 step-up: POST /api/partner/reauth → one-time 5-minute token for DELETE /api/partner/account. */
export async function startPartnerReauth(token: string, input: ReauthInput) {
  const current = await partnerFromToken(token);
  const partner = await prisma.partner.findUniqueOrThrow({ where: { id: current.id } });
  await verifyReauthProof(partner, input, { checkOtp: checkPhoneOtpCode, verifyGoogle: defaultVerifyGoogle });
  return issueReauthToken(prisma, jwtSecret(), partner.id, 'partner');
}

/**
 * T3 partner soft delete. Never deletes the shop, its bookings, payments or reviews.
 * - Product flag PARTNER_SELF_DELETE_ENABLED (default on); off → 403 PARTNER_DELETE_OPS_ONLY.
 * - Any upcoming/in-progress booking → 409 UPCOMING_BOOKINGS with the list (no auto-cancel).
 * - Serializable transaction that closes the shop first, then re-checks bookings, so a
 *   racing booking either fails (shop no longer ACTIVE) or this returns 409.
 * - Partner: deletionRequestedAt, tokenVersion++, pushToken null. PII stays until purge.
 */
export async function deletePartnerAccount(token: string, reauthToken?: string | null, now = new Date()) {
  const current = await partnerFromToken(token);
  if (!deletionFlags().partnerSelfDelete) {
    throw new AppError('Ask CutLy support to close your partner account.', 403, 'PARTNER_DELETE_OPS_ONLY');
  }
  await prisma.$transaction(async (tx) => {
    await consumeReauthToken(tx, jwtSecret(), reauthToken, current.id, 'partner', now);
    const shop = await tx.shop.findUnique({ where: { ownerPartnerId: current.id } });
    if (shop) {
      await tx.shop.update({ where: { id: shop.id }, data: shopStatusData('CLOSED') });
      const live = await tx.booking.findMany({
        where: { shopId: shop.id, status: { in: [...PARTNER_BLOCKING_STATUSES] } },
        select: { id: true, bookingCode: true, startsAt: true, endsAt: true, status: true },
        orderBy: { startsAt: 'asc' }
      });
      const blocking = live.filter((row) => blocksPartnerDelete(row, now));
      if (blocking.length) {
        throw new AppError('Finish or cancel your upcoming bookings first.', 409, 'UPCOMING_BOOKINGS', {
          bookings: blocking.map((row) => ({
            id: row.id,
            bookingCode: row.bookingCode,
            startsAt: row.startsAt.toISOString()
          }))
        });
      }
      await tx.bookingHold.deleteMany({ where: { shopId: shop.id } });
    }
    await tx.partner.update({
      where: { id: current.id },
      data: { deletionRequestedAt: now, tokenVersion: { increment: 1 }, pushToken: null }
    });
  }, txOpts);
  return {
    deleted: true as const,
    deletionRequestedAt: now.toISOString(),
    restoreBefore: deletionDeadline(now).toISOString()
  };
}
