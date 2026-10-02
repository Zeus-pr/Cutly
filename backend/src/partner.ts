import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient, ShopKind } from '@prisma/client';
import { signToken } from './auth';

const prisma = new PrismaClient();

export type PublicPartner = { id: string; email: string | null; phone: string | null; name: string | null };

type SetupService = { name: string; durationMinutes: number; pricePaise: number };

function publicPartner(partner: PublicPartner): PublicPartner {
  return { id: partner.id, email: partner.email, phone: partner.phone, name: partner.name };
}

function todayKey() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

function dayRange(key: string) {
  const start = new Date(`${key}T00:00:00+05:30`);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

export async function partnerFromToken(token: string) {
  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET || '') as jwt.JwtPayload;
  } catch {
    throw new Error('Sign in again.');
  }
  if (payload.aud !== 'partner' || typeof payload.sub !== 'string') throw new Error('Sign in again.');
  const partner = await prisma.partner.findUnique({ where: { id: payload.sub } });
  if (!partner) throw new Error('Sign in again.');
  return publicPartner(partner);
}

export async function partnerSignUp(email: string, password: string, name?: string) {
  const existing = await prisma.partner.findUnique({ where: { email } });
  if (existing) throw new Error('A partner account with that email already exists.');
  const partner = await prisma.partner.create({
    data: { email, name: name || null, passwordHash: await bcrypt.hash(password, 10) }
  });
  const profile = publicPartner(partner);
  return { token: signToken(profile, 'partner'), partner: profile, shop: null };
}

export async function partnerSignIn(email: string, password: string) {
  const partner = await prisma.partner.findUnique({ where: { email } });
  if (!partner?.passwordHash || !(await bcrypt.compare(password, partner.passwordHash))) {
    throw new Error('Email or password is incorrect.');
  }
  const profile = publicPartner(partner);
  const shop = await shopFor(partner.id);
  return { token: signToken(profile, 'partner'), partner: profile, shop };
}

async function shopFor(partnerId: string) {
  const shop = await prisma.shop.findUnique({
    where: { ownerPartnerId: partnerId },
    include: { images: { orderBy: { sortOrder: 'asc' } }, services: { include: { service: true } } }
  });
  if (!shop) return null;
  const today = todayKey();
  const capacity = await prisma.shopDayCapacity.findUnique({ where: { shopId_date: { shopId: shop.id, date: today } } });
  return {
    id: shop.id,
    name: shop.name,
    address: shop.address,
    city: shop.city,
    kind: shop.kind,
    chairCount: shop.chairCount,
    setupDone: shop.setupDone,
    amenities: shop.amenities,
    photos: shop.images.map((image) => image.url),
    services: shop.services.map((row) => ({
      name: row.service.name,
      durationMinutes: row.service.durationMinutes,
      pricePaise: row.pricePaise
    })),
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

export async function setupShop(token: string, input: {
  name: string;
  address: string;
  city: string;
  latitude: number;
  longitude: number;
  kind: ShopKind;
  services: SetupService[];
  chairCount: number;
  workersPresent: number;
}) {
  const partner = await partnerFromToken(token);
  if (!input.services.length) throw new Error('Choose at least one service.');
  const chairs = Math.max(1, Math.min(40, input.chairCount));
  const workers = Math.max(1, Math.min(chairs, input.workersPresent));
  const owned = await prisma.shop.findUnique({ where: { ownerPartnerId: partner.id } });
  const data = {
    name: input.name,
    address: input.address,
    city: input.city,
    latitude: input.latitude,
    longitude: input.longitude,
    kind: input.kind,
    chairCount: chairs,
    setupDone: true,
    ownerPartnerId: partner.id
  };
  const shop = owned
    ? await prisma.shop.update({ where: { id: owned.id }, data })
    : await prisma.shop.create({ data });
  await prisma.shopService.deleteMany({ where: { shopId: shop.id } });
  for (const item of input.services) {
    const service = await prisma.service.create({
      data: {
        name: item.name,
        durationMinutes: item.durationMinutes,
        kind: input.kind
      }
    });
    await prisma.shopService.create({
      data: { shopId: shop.id, serviceId: service.id, pricePaise: item.pricePaise }
    });
  }
  const today = todayKey();
  await prisma.shopDayCapacity.upsert({
    where: { shopId_date: { shopId: shop.id, date: today } },
    create: { shopId: shop.id, date: today, workersPresent: workers, chairsInUse: chairs },
    update: { workersPresent: workers, chairsInUse: chairs }
  });
  const hasBarber = await prisma.barber.findFirst({ where: { shopId: shop.id } });
  if (!hasBarber) await prisma.barber.create({ data: { shopId: shop.id, name: 'Any chair', rating: 5 } });
  return shopFor(partner.id);
}

export async function updateFloor(token: string, input: { workersPresent: number; chairsInUse: number }) {
  const partner = await partnerFromToken(token);
  const shop = await prisma.shop.findUnique({ where: { ownerPartnerId: partner.id } });
  if (!shop?.setupDone) throw new Error('Finish shop setup first.');
  const chairsInUse = Math.max(0, Math.min(shop.chairCount, input.chairsInUse));
  const workersPresent = Math.max(0, Math.min(chairsInUse || shop.chairCount, input.workersPresent));
  const today = todayKey();
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

export async function partnerDashboard(token: string) {
  const partner = await partnerFromToken(token);
  const shop = await shopFor(partner.id);
  if (!shop) {
    return {
      shop: null,
      next: null,
      todayCount: 0,
      waiting: 0,
      inService: 0,
      done: 0,
      revenuePaise: 0,
      openSlots: 0,
      peakHour: null as string | null,
      byHour: [] as { hour: number; label: string; count: number }[]
    };
  }
  const { start, end } = dayRange(shop.today.date);
  const rows = await prisma.booking.findMany({
    where: { shopId: shop.id, startsAt: { gte: start, lt: end }, status: { notIn: ['EXPIRED', 'FAILED', 'CANCELLED'] } },
    orderBy: { startsAt: 'asc' },
    include: { user: true, services: { include: { service: true } } }
  });
  const open = rows.filter((row) => row.status === 'CONFIRMED' || row.status === 'ARRIVED' || row.status === 'IN_SERVICE');
  const upcoming = open.find((row) => row.startsAt.getTime() >= Date.now() - 30 * 60 * 1000) || open[0] || null;
  const hourCounts = new Map<number, number>();
  for (let hour = 9; hour <= 21; hour += 1) hourCounts.set(hour, 0);
  let revenuePaise = 0;
  for (const row of rows) {
    const hour = Number(
      new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }).format(row.startsAt)
    );
    if (hourCounts.has(hour)) hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
    revenuePaise += row.services.reduce((sum, item) => sum + item.pricePaise, 0);
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
    todayCount: rows.length,
    waiting: rows.filter((row) => row.status === 'CONFIRMED' || row.status === 'ARRIVED').length,
    inService: rows.filter((row) => row.status === 'IN_SERVICE').length,
    done: rows.filter((row) => row.status === 'COMPLETED').length,
    revenuePaise,
    openSlots,
    peakHour: peak && peak.count > 0 ? peak.label : null,
    byHour,
    next: upcoming
      ? {
          id: upcoming.id,
          name: upcoming.user.name || 'Customer',
          service: upcoming.services.map((item) => item.service.name).join(', ') || 'Appointment',
          startsAt: upcoming.startsAt.toISOString(),
          status: upcoming.status
        }
      : null
  };
}

export async function deletePartnerAccount(token: string) {
  const partner = await partnerFromToken(token);
  const shop = await prisma.shop.findUnique({ where: { ownerPartnerId: partner.id } });
  if (shop) {
    const bookings = await prisma.booking.findMany({ where: { shopId: shop.id }, select: { id: true } });
    const ids = bookings.map((row) => row.id);
    if (ids.length) {
      await prisma.review.deleteMany({ where: { bookingId: { in: ids } } });
      await prisma.bookingPayment.deleteMany({ where: { bookingId: { in: ids } } });
      await prisma.bookingService.deleteMany({ where: { bookingId: { in: ids } } });
      await prisma.booking.deleteMany({ where: { id: { in: ids } } });
    }
    await prisma.review.deleteMany({ where: { shopId: shop.id } });
    await prisma.favouriteShop.deleteMany({ where: { shopId: shop.id } });
    await prisma.bookingHold.deleteMany({ where: { shopId: shop.id } });
    await prisma.shop.delete({ where: { id: shop.id } });
  }
  await prisma.partner.delete({ where: { id: partner.id } });
  return { deleted: true };
}
