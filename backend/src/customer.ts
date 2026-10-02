import { PrismaClient } from '@prisma/client';
import { calculateSlots } from './availability';
import { userFromToken } from './auth';

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

async function ensureFloorBarber(shopId: string) {
  const existing = await prisma.barber.findFirst({ where: { shopId }, orderBy: { name: 'asc' } });
  if (existing) return existing;
  return prisma.barber.create({ data: { shopId, name: 'Any chair', rating: 5 } });
}

function mapShop(shop: {
  id: string;
  name: string;
  address: string;
  city: string;
  latitude: unknown;
  longitude: unknown;
  amenities: string[];
  images: { url: string }[];
  services: { pricePaise: number; service: { name: string } }[];
  reviews: { rating: number }[];
}, origin?: { lat: number; lng: number }) {
  const lat = toNum(shop.latitude as never);
  const lng = toNum(shop.longitude as never);
  const distanceKm = origin ? Math.round(haversineKm(origin.lat, origin.lng, lat, lng) * 10) / 10 : 0;
  const rating =
    shop.reviews.length > 0
      ? shop.reviews.reduce((sum, row) => sum + row.rating, 0) / shop.reviews.length
      : 4.8;
  const prices = shop.services.map((row) => row.pricePaise).filter((value) => value > 0);
  return {
    id: shop.id,
    name: shop.name,
    imageUrl: shop.images[0]?.url || FALLBACK_IMAGE,
    rating: Math.round(rating * 10) / 10,
    reviewCount: shop.reviews.length,
    distanceKm,
    isOpen: true,
    address: shop.address,
    city: shop.city,
    priceFromPaise: prices.length ? Math.min(...prices) : 0,
    nextAvailableAt: new Date(Date.now() + 20 * 60000).toISOString(),
    services: shop.services.map((row) => row.service.name),
    tags: shop.amenities.slice(0, 3)
  };
}

export async function listNearbyShops(input: {
  latitude?: number;
  longitude?: number;
  query?: string;
  openNow?: boolean;
  radiusKm?: number;
}) {
  const lat = input.latitude ?? 23.2324;
  const lng = input.longitude ?? 87.8615;
  const radius = input.radiusKm ?? 25;
  const rows = await prisma.shop.findMany({
    where: { setupDone: true, isActive: true },
    include: {
      images: { orderBy: { sortOrder: 'asc' }, take: 1 },
      services: { include: { service: true } },
      reviews: { select: { rating: true } }
    }
  });
  return rows
    .map((shop) => mapShop(shop, { lat, lng }))
    .filter((shop) => shop.distanceKm <= radius)
    .filter((shop) => {
      if (!input.query?.trim()) return true;
      const needle = input.query.trim().toLowerCase();
      return [shop.name, shop.city, shop.address, ...shop.services].join(' ').toLowerCase().includes(needle);
    })
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

export async function getShop(id: string, origin?: { lat: number; lng: number }) {
  const shop = await prisma.shop.findFirst({
    where: { id, setupDone: true, isActive: true },
    include: {
      images: { orderBy: { sortOrder: 'asc' }, take: 1 },
      services: { include: { service: true } },
      reviews: { select: { rating: true } }
    }
  });
  if (!shop) throw new Error('Shop not found.');
  return mapShop(shop, origin);
}

export async function shopServices(shopId: string) {
  const rows = await prisma.shopService.findMany({
    where: { shopId },
    include: { service: true },
    orderBy: { service: { name: 'asc' } }
  });
  return rows.map((row) => ({
    id: row.serviceId,
    name: row.service.name,
    durationMinutes: row.service.durationMinutes,
    pricePaise: row.pricePaise,
    description: undefined as string | undefined
  }));
}

export async function shopBarbers(shopId: string) {
  await ensureFloorBarber(shopId);
  const rows = await prisma.barber.findMany({ where: { shopId }, orderBy: { name: 'asc' } });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    rating: toNum(row.rating as never),
    imageUrl: undefined as string | undefined,
    nextAvailableAt: new Date(Date.now() + 15 * 60000).toISOString()
  }));
}

export async function shopAvailability(input: {
  shopId: string;
  serviceId: string;
  date: string;
  barberId?: string;
}) {
  const link = await prisma.shopService.findUnique({
    where: { shopId_serviceId: { shopId: input.shopId, serviceId: input.serviceId } },
    include: { service: true }
  });
  if (!link) throw new Error('Service not offered at this shop.');
  const barber = input.barberId
    ? await prisma.barber.findFirst({ where: { id: input.barberId, shopId: input.shopId } })
    : await ensureFloorBarber(input.shopId);
  if (!barber) throw new Error('No chair available.');
  const start = new Date(`${input.date}T10:00:00+05:30`);
  const end = new Date(`${input.date}T21:00:00+05:30`);
  const bookings = await prisma.booking.findMany({
    where: {
      shopId: input.shopId,
      barberId: barber.id,
      startsAt: { gte: start, lt: end },
      status: { notIn: ['CANCELLED', 'EXPIRED', 'FAILED'] }
    }
  });
  const slots = calculateSlots({
    shop: { start, end },
    barber: { start, end },
    bookings: bookings.map((row) => ({ start: row.startsAt, end: row.endsAt })),
    durationMinutes: link.service.durationMinutes
  });
  return slots.map((slot) => ({
    start: slot.start.toISOString(),
    end: slot.end.toISOString(),
    available: true,
    barberId: barber.id
  }));
}

export async function createBooking(token: string, input: {
  shopId: string;
  serviceId: string;
  barberId?: string;
  startsAt: string;
}) {
  const user = await userFromToken(token);
  const link = await prisma.shopService.findUnique({
    where: { shopId_serviceId: { shopId: input.shopId, serviceId: input.serviceId } },
    include: { service: true, shop: { include: { images: { orderBy: { sortOrder: 'asc' }, take: 1 } } } }
  });
  if (!link || !link.shop.setupDone) throw new Error('Shop or service not available.');
  const barber = input.barberId
    ? await prisma.barber.findFirst({ where: { id: input.barberId, shopId: input.shopId } })
    : await ensureFloorBarber(input.shopId);
  if (!barber) throw new Error('No chair available.');
  const startsAt = new Date(input.startsAt);
  if (Number.isNaN(startsAt.getTime())) throw new Error('Pick a valid time.');
  const endsAt = new Date(startsAt.getTime() + link.service.durationMinutes * 60000);
  const clash = await prisma.booking.findFirst({
    where: {
      barberId: barber.id,
      status: { notIn: ['CANCELLED', 'EXPIRED', 'FAILED'] },
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt }
    }
  });
  if (clash) throw new Error('That slot was just taken. Pick another time.');
  const totalPaise = link.pricePaise;
  const advancePaise = Math.round(totalPaise * 0.3);
  let code = bookingCode();
  for (let i = 0; i < 5; i += 1) {
    const exists = await prisma.booking.findUnique({ where: { bookingCode: code } });
    if (!exists) break;
    code = bookingCode();
  }
  let booking;
  try {
    booking = await prisma.booking.create({
      data: {
        userId: user.id,
        shopId: input.shopId,
        barberId: barber.id,
        startsAt,
        endsAt,
        status: 'CONFIRMED',
        totalPaise,
        advancePaise,
        bookingCode: code,
        idempotencyKey: `book_${user.id}_${input.shopId}_${startsAt.toISOString()}`,
        services: {
          create: {
            serviceId: link.serviceId,
            pricePaise: totalPaise,
            durationMinutes: link.service.durationMinutes
          }
        },
        payment: {
          create: {
            provider: 'mock',
            providerPaymentId: `pay_${Date.now()}`,
            amountPaise: advancePaise,
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
  } catch (error) {
    const existing = await prisma.booking.findUnique({
      where: { idempotencyKey: `book_${user.id}_${input.shopId}_${startsAt.toISOString()}` },
      include: {
        shop: { include: { images: { orderBy: { sortOrder: 'asc' }, take: 1 } } },
        barber: true,
        services: { include: { service: true } }
      }
    });
    if (!existing) throw error;
    booking = existing;
  }
  const serviceRow = booking.services[0];
  const payload = {
    id: booking.id,
    bookingCode: booking.bookingCode,
    status: booking.status,
    startsAt: booking.startsAt.toISOString(),
    endsAt: booking.endsAt.toISOString(),
    totalPaise: booking.totalPaise,
    advancePaise: booking.advancePaise,
    shop: {
      id: booking.shop.id,
      name: booking.shop.name,
      imageUrl: booking.shop.images[0]?.url || FALLBACK_IMAGE,
      address: booking.shop.address
    },
    service: {
      id: serviceRow.serviceId,
      name: serviceRow.service.name,
      durationMinutes: serviceRow.durationMinutes,
      pricePaise: serviceRow.pricePaise
    },
    barber: {
      id: booking.barber.id,
      name: booking.barber.name,
      rating: toNum(booking.barber.rating as never)
    }
  };
  await notifyUser(user.id, {
    title: 'Booking confirmed',
    body: `${payload.service.name} at ${payload.shop.name} · ${startsAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`
  });
  return payload;
}

export async function listBookings(token: string) {
  const user = await userFromToken(token);
  const rows = await prisma.booking.findMany({
    where: { userId: user.id, status: { notIn: ['EXPIRED', 'FAILED'] } },
    orderBy: { startsAt: 'desc' },
    include: {
      shop: { include: { images: { orderBy: { sortOrder: 'asc' }, take: 1 } } },
      barber: true,
      services: { include: { service: true } }
    }
  });
  return rows.map((booking) => {
    const serviceRow = booking.services[0];
    return {
      id: booking.id,
      bookingCode: booking.bookingCode,
      status: booking.status,
      startsAt: booking.startsAt.toISOString(),
      endsAt: booking.endsAt.toISOString(),
      totalPaise: booking.totalPaise,
      advancePaise: booking.advancePaise,
      shop: {
        id: booking.shop.id,
        name: booking.shop.name,
        imageUrl: booking.shop.images[0]?.url || FALLBACK_IMAGE,
        address: booking.shop.address
      },
      service: serviceRow
        ? {
            id: serviceRow.serviceId,
            name: serviceRow.service.name,
            durationMinutes: serviceRow.durationMinutes,
            pricePaise: serviceRow.pricePaise
          }
        : { id: 'unknown', name: 'Appointment', durationMinutes: 30, pricePaise: booking.totalPaise },
      barber: {
        id: booking.barber.id,
        name: booking.barber.name,
        rating: toNum(booking.barber.rating as never)
      }
    };
  });
}

export async function savePushToken(token: string, pushToken: string) {
  const user = await userFromToken(token);
  await prisma.user.update({ where: { id: user.id }, data: { pushToken } });
  return { saved: true };
}

async function notifyUser(userId: string, message: { title: string; body: string }) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.pushToken) return;
  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        to: user.pushToken,
        sound: 'default',
        title: message.title,
        body: message.body,
        data: { type: 'booking' }
      })
    });
  } catch {
    // Local client notification still covers Expo Go.
  }
}
