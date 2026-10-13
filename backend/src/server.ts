process.loadEnvFile();
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import { z } from 'zod';
import {
  adminCreatePartner,
  adminListLeads,
  adminListPartners,
  adminMintPartnerToken,
  adminPing,
  adminSetPartnerPassword,
  runAdmin
} from './admin';
import {
  adminCreateCatalogueService,
  adminCreateCategory,
  adminListCatalogue,
  adminMoveCatalogueService,
  adminRemoveCatalogueService,
  adminRenameCatalogueService,
  autoMigrateServiceCategories
} from './catalogueAdmin';
import { createPartnerLead } from './partnerLeads';
import {
  deleteCustomerAccount,
  sendPhoneOtp,
  signIn,
  signInWithGoogle,
  signUp,
  updateProfile,
  userFromToken,
  verifyPhoneOtp
} from './auth';
import {
  collectBalanceAtShop,
  createPartnerWalkIn,
  deletePartnerAccount,
  getPartnerHours,
  partnerBookingHistory,
  partnerBookingRequests,
  partnerDashboard,
  partnerRescheduleBooking,
  partnerShop,
  partnerSignIn,
  respondToBookingRequest,
  savePartnerPushToken,
  setPartnerAcceptingAppointments,
  setPartnerHours,
  setupShop,
  startBookingWithVerifyPin,
  updateAmenities,
  updateBarbers,
  updateFloor,
  updatePartnerBookingStatus,
  updatePartnerServices,
  updatePartnerWalkInStatus,
  updatePhotos,
  updateShopPhone,
  updateShopProfile
} from './partner';
import { PARTNER_FLOOR_TARGETS } from './bookingState';
import { startAwaitingExpirySweep } from './awaitingExpiry';
import { WALK_IN_DURATIONS } from './walkins';
import {
  abandonBookingPayment,
  cancelBooking,
  confirmBookingPayment,
  createBooking,
  createBookingReview,
  createHold,
  getBooking,
  getShop,
  isFavouriteShop,
  listBookings,
  listFavouriteShops,
  listNearbyShops,
  listShopReviews,
  rescheduleBooking,
  savePushToken,
  setFavouriteShop,
  shopAvailability,
  shopBarbers,
  shopHours,
  shopServices
} from './customer';
import { paymentsEnabled, razorpayConfigured } from './razorpay';
import {
  listUserNotifications,
  markAllNotificationsRead,
  markNotificationRead
} from './notifications';
import { clientKey, rateLimit } from './rateLimit';
import { toClientError } from './httpError';
const app = express();
app.set('trust proxy', 1);
const port = Number(process.env.PORT || 4000);
const corsOrigins = (process.env.CORS_ORIGINS || 'http://localhost:8081,http://127.0.0.1:8081,http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174,https://cutly.buzz,https://www.cutly.buzz')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
app.use(
  cors({
    origin(origin, callback) {
      // Native apps often send no Origin — allow. Web must match allowlist (CJ-45).
      if (!origin || corsOrigins.includes(origin) || corsOrigins.includes('*')) {
        callback(null, true);
        return;
      }
      callback(null, false);
    }
  })
);
app.use(express.json({ limit: '8mb' }));
app.get('/health', (_req, res) =>
  res.json({
    status: 'ok',
    service: 'cutly-api',
    payments: paymentsEnabled(),
    razorpay: razorpayConfigured()
  })
);
const emailSchema = z.string().trim().email().transform((value) => value.toLowerCase());
const passwordSchema = z.string().min(8);
const phoneSchema = z.string().regex(/^\+[1-9]\d{7,14}$/);
async function handle(res: express.Response, action: () => Promise<unknown>) {
  try {
    res.status(200).json({ data: await action() });
  } catch (error) {
    const { status, message } = toClientError(error);
    res.status(status).json({ error: message });
  }
}
app.post('/api/auth/signup', async (req, res) => {
  const limited = await rateLimit(clientKey(req, 'signup'), 10, 15 * 60_000);
  if (!limited.ok) {
    return res.status(429).json({ error: `Too many sign-up attempts. Try again in ${limited.retryAfterSec}s.` });
  }
  const parsed = z
    .object({
      email: emailSchema,
      password: passwordSchema,
      phone: phoneSchema,
      name: z.string().trim().min(1).optional()
    })
    .safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Use email, phone (+91…), and a password of at least 8 characters.' });
  }
  return handle(res, () => signUp(parsed.data.email, parsed.data.password, parsed.data.phone, parsed.data.name));
});
app.post('/api/auth/login', async (req, res) => {
  const limited = await rateLimit(clientKey(req, 'login'), 20, 15 * 60_000);
  if (!limited.ok) return res.status(429).json({ error: `Too many login attempts. Try again in ${limited.retryAfterSec}s.` });
  const parsed = z.object({ email: emailSchema, password: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter your email and password.' });
  return handle(res, () => signIn(parsed.data.email, parsed.data.password));
});
app.post('/api/auth/google', async (req, res) => {
  const limited = await rateLimit(clientKey(req, 'google'), 30, 15 * 60_000);
  if (!limited.ok) return res.status(429).json({ error: `Too many Google attempts. Try again in ${limited.retryAfterSec}s.` });
  const parsed = z.object({ idToken: z.string().min(20) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Google sign-in did not return a token.' });
  const mergeToken = bearer(req);
  return handle(res, () => signInWithGoogle(parsed.data.idToken, mergeToken || undefined));
});
app.post('/api/auth/otp/send', async (req, res) => {
  const limited = await rateLimit(clientKey(req, 'otp-send'), 8, 15 * 60_000);
  if (!limited.ok) return res.status(429).json({ error: `Too many codes requested. Try again in ${limited.retryAfterSec}s.` });
  const parsed = z.object({ phone: phoneSchema }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter the phone number with the country code, like +9198...' });
  return handle(res, async () => { await sendPhoneOtp(parsed.data.phone); return { sent: true }; });
});
app.post('/api/auth/otp/verify', async (req, res) => {
  const limited = await rateLimit(clientKey(req, 'otp-verify'), 20, 15 * 60_000);
  if (!limited.ok) return res.status(429).json({ error: `Too many code checks. Try again in ${limited.retryAfterSec}s.` });
  const parsed = z.object({ phone: phoneSchema, code: z.string().regex(/^\d{6}$/) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter the 6-digit code.' });
  const mergeToken = bearer(req);
  return handle(res, () => verifyPhoneOtp(parsed.data.phone, parsed.data.code, mergeToken || undefined));
});
function bearer(req: express.Request) {
  const header = req.header('authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}
app.delete('/api/auth/account', (req, res) => {
  const token = bearer(req);
  if (!token) return res.status(401).json({ error: 'Sign in again.' });
  return handle(res, () => deleteCustomerAccount(token));
});
app.get('/api/auth/me', (req, res) => {
  const token = bearer(req);
  if (!token) return res.status(401).json({ error: 'Sign in again.' });
  return handle(res, () => userFromToken(token));
});
const kinds = ['BARBER', 'SALON', 'PARLOUR', 'SPA', 'NAILS', 'TATTOO', 'PIERCING'] as const;
/** Public self-serve partner signup disabled (SEC-04). Onboard via Admin portal only. */
app.post('/api/partner/signup', (_req, res) => {
  return res.status(403).json({
    error: 'Partner accounts are created by CutLy. Use Partner with us on the website, or ask ops to onboard you.'
  });
});
app.post('/api/partner/login', async (req, res) => {
  const limited = await rateLimit(clientKey(req, 'partner-login'), 20, 15 * 60_000);
  if (!limited.ok) {
    res.setHeader('Retry-After', String(limited.retryAfterSec));
    return res.status(429).json({ error: `Too many login attempts. Try again in ${limited.retryAfterSec}s.` });
  }
  const parsed = z.object({ email: emailSchema, password: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter your email and password.' });
  return handle(res, () => partnerSignIn(parsed.data.email, parsed.data.password));
});
app.get('/api/partner/shop', (req, res) => {
  const token = bearer(req);
  if (!token) return res.status(401).json({ error: 'Sign in again.' });
  return handle(res, () => partnerShop(token));
});
app.post('/api/partner/shop', (req, res) => {
  const token = bearer(req);
  const parsed = z.object({
    name: z.string().trim().min(1).max(80),
    address: z.string().trim().min(1).max(180),
    city: z.string().trim().min(1).max(80),
    latitude: z.number(),
    longitude: z.number(),
    kind: z.enum(kinds).optional(),
    kinds: z.array(z.enum(kinds)).min(1).max(5).optional(),
    productBrands: z.array(z.string().trim().min(1).max(60)).max(24).optional(),
    services: z.array(z.object({
      name: z.string().trim().min(1).max(80),
      durationMinutes: z.number().int().min(10).max(480),
      pricePaise: z.number().int().min(0),
      audience: z.enum(['MEN', 'WOMEN', 'KIDS', 'UNISEX']).optional()
    })).min(1).max(24),
    chairCount: z.number().int().min(1).max(40),
    workersPresent: z.number().int().min(1).max(40)
  }).refine((body) => Boolean(body.kinds?.length || body.kind), { message: 'kinds' })
    .safeParse(req.body);
  if (!token || !parsed.success) return res.status(400).json({ error: 'Finish each setup step before continuing.' });
  return handle(res, () => setupShop(token, parsed.data));
});
/** Profile edit without wiping menu — used by admin portal (and safe for partner later). */
app.patch('/api/partner/shop', (req, res) => {
  const token = bearer(req);
  const parsed = z
    .object({
      name: z.string().trim().min(1).max(80).optional(),
      address: z.string().trim().min(1).max(180).optional(),
      city: z.string().trim().min(1).max(80).optional(),
      latitude: z.number().optional(),
      longitude: z.number().optional(),
      kind: z.enum(kinds).optional(),
      kinds: z.array(z.enum(kinds)).min(1).max(5).optional(),
      productBrands: z.array(z.string().trim().min(1).max(60)).max(24).optional(),
      chairCount: z.number().int().min(1).max(40).optional()
    })
    .safeParse(req.body);
  if (!token || !parsed.success) return res.status(400).json({ error: 'Check shop profile fields.' });
  return handle(res, () => updateShopProfile(token, parsed.data));
});
app.patch('/api/partner/floor', (req, res) => {
  const token = bearer(req);
  const parsed = z.object({ workersPresent: z.number().int().min(0).max(40), chairsInUse: z.number().int().min(0).max(40) }).safeParse(req.body);
  if (!token || !parsed.success) return res.status(400).json({ error: 'Enter how many seats and workers are in today.' });
  return handle(res, () => updateFloor(token, parsed.data));
});
app.patch('/api/partner/barbers', (req, res) => {
  const token = bearer(req);
  const parsed = z
    .object({
      barbers: z
        .array(z.object({ id: z.string().min(1).optional(), name: z.string().trim().min(1).max(40) }))
        .min(1)
        .max(40)
    })
    .safeParse(req.body);
  if (!token || !parsed.success) return res.status(400).json({ error: 'Enter staff names.' });
  return handle(res, () => updateBarbers(token, parsed.data.barbers));
});
app.patch('/api/partner/amenities', (req, res) => {
  const token = bearer(req);
  const parsed = z.object({ amenities: z.array(z.string().trim().min(1).max(40)).max(12) }).safeParse(req.body);
  if (!token || !parsed.success) return res.status(400).json({ error: 'Choose the features you have.' });
  return handle(res, () => updateAmenities(token, parsed.data.amenities));
});
app.patch('/api/partner/shop/phone', (req, res) => {
  const token = bearer(req);
  const parsed = z
    .object({ phone: z.union([phoneSchema, z.literal(''), z.null()]).optional() })
    .safeParse(req.body);
  if (!token || !parsed.success) {
    return res.status(400).json({ error: 'Enter a 10-digit mobile with country code, like +9198…' });
  }
  const raw = parsed.data.phone;
  return handle(res, () => updateShopPhone(token, raw == null || raw === '' ? null : raw));
});
app.get('/api/partner/hours', (req, res) => {
  const token = bearer(req);
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  return handle(res, () => getPartnerHours(token));
});
app.put('/api/partner/hours', (req, res) => {
  const token = bearer(req);
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  const parsed = z
    .object({
      days: z.array(
        z.object({
          weekday: z.number().int().min(0).max(6),
          opensAt: z.string().min(4).max(8),
          closesAt: z.string().min(4).max(8)
        })
      )
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  return handle(res, () => setPartnerHours(token, parsed.data.days));
});
app.patch('/api/partner/accepting', (req, res) => {
  const token = bearer(req);
  const parsed = z
    .union([
      z.object({ mode: z.enum(['open', 'today', 'temporary']) }),
      z.object({ acceptingAppointments: z.boolean() })
    ])
    .safeParse(req.body);
  if (!token || !parsed.success) {
    return res.status(400).json({ error: 'Say whether you are open for appointments.' });
  }
  const mode =
    'mode' in parsed.data
      ? parsed.data.mode
      : parsed.data.acceptingAppointments
        ? 'open'
        : 'temporary';
  return handle(res, () => setPartnerAcceptingAppointments(token, mode));
});
app.put('/api/partner/services', (req, res) => {
  const token = bearer(req);
  if (!token) return res.status(401).json({ error: 'Sign in again.' });
  const parsed = z
    .object({
      services: z
        .array(
          z.object({
            id: z.string().min(1).optional(),
            name: z.string().trim().min(1).max(80),
            durationMinutes: z.number().int().min(10).max(480),
            pricePaise: z.number().int().min(1),
            bufferMinutes: z.number().int().min(0).max(120).optional(),
            audience: z.enum(['MEN', 'WOMEN', 'KIDS', 'UNISEX']).optional()
          })
        )
        .min(1)
        .max(120)
    })
    .safeParse(req.body);
  if (!parsed.success) {
    const tooMany = parsed.error.issues.some((i) => i.code === 'too_big' && i.path.includes('services'));
    if (tooMany) {
      return res.status(400).json({ error: 'Max 120 services on a shop menu. Turn some off, then save.' });
    }
    return res.status(400).json({ error: 'Check service name, time, and price.' });
  }
  return handle(res, () => updatePartnerServices(token, parsed.data.services));
});
app.patch('/api/partner/photos', (req, res) => {
  const token = bearer(req);
  const parsed = z.object({ photos: z.array(z.string().min(8)).max(5) }).safeParse(req.body);
  if (!token || !parsed.success) return res.status(400).json({ error: 'Add up to 5 photos.' });
  return handle(res, () => updatePhotos(token, parsed.data.photos));
});
app.get('/api/partner/history', (req, res) => {
  const token = bearer(req);
  if (!token) return res.status(401).json({ error: 'Sign in again.' });
  return handle(res, () => partnerBookingHistory(token));
});
app.get('/api/partner/requests', (req, res) => {
  const token = bearer(req);
  if (!token) return res.status(401).json({ error: 'Sign in again.' });
  return handle(res, () => partnerBookingRequests(token));
});
app.get('/api/partner/dashboard', (req, res) => {
  const token = bearer(req);
  if (!token) return res.status(401).json({ error: 'Sign in again.' });
  return handle(res, () => partnerDashboard(token));
});
app.patch('/api/partner/bookings/:id/status', (req, res) => {
  const token = bearer(req);
  const parsed = z
    .object({
      status: z.enum(PARTNER_FLOOR_TARGETS)
    })
    .safeParse(req.body);
  if (!token) return res.status(401).json({ error: 'Sign in again.' });
  if (!parsed.success) return res.status(400).json({ error: 'Pick a valid floor status.' });
  return handle(res, () => updatePartnerBookingStatus(token, req.params.id, parsed.data.status));
});
app.post('/api/partner/bookings/:id/start', (req, res) => {
  const token = bearer(req);
  const parsed = z.object({ verifyPin: z.string().min(4).max(4) }).safeParse(req.body);
  if (!token) return res.status(401).json({ error: 'Sign in again.' });
  if (!parsed.success) return res.status(400).json({ error: 'Enter the 4-digit code from the customer.' });
  return handle(res, () => startBookingWithVerifyPin(token, req.params.id, parsed.data.verifyPin));
});
app.post('/api/partner/bookings/:id/collect-balance', (req, res) => {
  const token = bearer(req);
  if (!token) return res.status(401).json({ error: 'Sign in again.' });
  return handle(res, () => collectBalanceAtShop(token, req.params.id));
});
app.post('/api/partner/bookings/:id/respond', (req, res) => {
  const token = bearer(req);
  const parsed = z.object({ decision: z.enum(['ACCEPT', 'REJECT']) }).safeParse(req.body);
  if (!token) return res.status(401).json({ error: 'Sign in again.' });
  if (!parsed.success) return res.status(400).json({ error: 'Choose Accept or Reject.' });
  const status = parsed.data.decision === 'ACCEPT' ? ('CONFIRMED' as const) : ('REJECTED' as const);
  return handle(res, () => respondToBookingRequest(token, req.params.id, status));
});
app.post('/api/partner/bookings/:id/reschedule', (req, res) => {
  const token = bearer(req);
  const parsed = z
    .object({
      startsAt: z.string().datetime(),
      barberId: z.string().min(1).optional()
    })
    .safeParse(req.body);
  if (!token) return res.status(401).json({ error: 'Sign in again.' });
  if (!parsed.success) return res.status(400).json({ error: 'Pick a new time today.' });
  return handle(res, () => partnerRescheduleBooking(token, req.params.id, parsed.data));
});
app.post('/api/partner/walk-ins', (req, res) => {
  const token = bearer(req);
  const parsed = z
    .object({
      barberId: z.string().min(1),
      durationMinutes: z.number().int(),
      guestName: z.string().trim().max(60).optional()
    })
    .safeParse(req.body);
  if (!token) return res.status(401).json({ error: 'Sign in again.' });
  if (!parsed.success || !(WALK_IN_DURATIONS as readonly number[]).includes(parsed.data.durationMinutes)) {
    return res.status(400).json({ error: 'Pick staff and 15, 30, 45, or 60 minutes.' });
  }
  return handle(res, () =>
    createPartnerWalkIn(token, {
      barberId: parsed.data.barberId,
      durationMinutes: parsed.data.durationMinutes,
      guestName: parsed.data.guestName
    })
  );
});
app.patch('/api/partner/walk-ins/:id/status', (req, res) => {
  const token = bearer(req);
  const parsed = z.object({ status: z.enum(['COMPLETED', 'CANCELLED']) }).safeParse(req.body);
  if (!token) return res.status(401).json({ error: 'Sign in again.' });
  if (!parsed.success) return res.status(400).json({ error: 'Pick Done or Cancel.' });
  return handle(res, () => updatePartnerWalkInStatus(token, req.params.id, parsed.data.status));
});
app.delete('/api/partner/account', (req, res) => {
  const token = bearer(req);
  if (!token) return res.status(401).json({ error: 'Sign in again.' });
  return handle(res, () => deletePartnerAccount(token));
});
app.patch('/api/auth/profile', (req, res) => {
  const token = bearer(req);
  const parsed = z
    .object({
      name: z.string().trim().min(1).max(80).optional(),
      phone: phoneSchema.optional(),
      email: z.string().trim().email().max(120).optional().or(z.literal('')),
      gender: z.enum(['male', 'female', 'other', 'prefer_not', '']).optional(),
      dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      inviteCode: z.string().trim().max(32).optional()
    })
    .safeParse(req.body);
  if (!token) return res.status(401).json({ error: 'Sign in again.' });
  if (!parsed.success) {
    const badDate = parsed.error.issues.some((issue) => issue.path[0] === 'dateOfBirth');
    return res.status(400).json({ error: badDate ? 'Pick your date of birth.' : 'Check your details.' });
  }
  if (
    !parsed.data.name &&
    !parsed.data.phone &&
    parsed.data.email === undefined &&
    parsed.data.gender === undefined &&
    parsed.data.dateOfBirth === undefined &&
    parsed.data.inviteCode === undefined
  ) {
    return res.status(400).json({ error: 'Enter your name, email, or phone (+91…).' });
  }
  return handle(res, () => updateProfile(token, parsed.data));
});
app.post('/api/push/register', (req, res) => {
  const token = bearer(req);
  const parsed = z.object({ pushToken: z.string().min(8) }).safeParse(req.body);
  if (!token || !parsed.success) return res.status(400).json({ error: 'Push token missing.' });
  return handle(res, () => savePushToken(token, parsed.data.pushToken));
});
app.post('/api/partner/push/register', (req, res) => {
  const token = bearer(req);
  const parsed = z.object({ pushToken: z.string().min(8) }).safeParse(req.body);
  if (!token || !parsed.success) return res.status(400).json({ error: 'Push token missing.' });
  return handle(res, () => savePartnerPushToken(token, parsed.data.pushToken));
});
/** Query strings: z.coerce.boolean turns "false" into true (Boolean("false")). */
function queryBool(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  const s = String(value).toLowerCase();
  if (s === 'true' || s === '1') return true;
  if (s === 'false' || s === '0') return false;
  return undefined;
}

app.get('/api/shops', (req, res) => {
  const parsed = z.object({
    lat: z.coerce.number().optional(),
    lng: z.coerce.number().optional(),
    query: z.string().optional(),
    openNow: z.string().optional(),
    radiusKm: z.coerce.number().optional(),
    serviceName: z.string().optional(),
    kinds: z.string().optional(),
    serviceHints: z.string().optional()
  }).safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid shop search.' });
  return handle(res, () => listNearbyShops({
    latitude: parsed.data.lat,
    longitude: parsed.data.lng,
    query: parsed.data.query,
    openNow: queryBool(parsed.data.openNow),
    radiusKm: parsed.data.radiusKm,
    serviceName: parsed.data.serviceName,
    kinds: parsed.data.kinds,
    serviceHints: parsed.data.serviceHints
  }));
});
app.get('/api/shops/:id', (req, res) => {
  const lat = req.query.lat ? Number(req.query.lat) : undefined;
  const lng = req.query.lng ? Number(req.query.lng) : undefined;
  return handle(res, () => getShop(req.params.id, lat != null && lng != null ? { lat, lng } : undefined));
});
app.get('/api/shops/:id/services', (req, res) => handle(res, () => shopServices(req.params.id)));
app.get('/api/shops/:id/hours', (req, res) => handle(res, () => shopHours(req.params.id)));
app.get('/api/shops/:id/barbers', (req, res) => handle(res, () => shopBarbers(req.params.id)));
app.get('/api/shops/:id/reviews', (req, res) => handle(res, () => listShopReviews(req.params.id)));
app.get('/api/shops/:id/availability', (req, res) => {
  const parsed = z.object({
    serviceId: z.string().min(1).optional(),
    serviceIds: z.string().optional(),
    date: z.string().min(8),
    barberId: z.string().optional()
  }).safeParse(req.query);
  const serviceIds = parsed.success
    ? [
        ...(parsed.data.serviceIds ? parsed.data.serviceIds.split(',').map((s) => s.trim()).filter(Boolean) : []),
        ...(parsed.data.serviceId ? [parsed.data.serviceId] : [])
      ]
    : [];
  if (!parsed.success || !serviceIds.length) return res.status(400).json({ error: 'Pick a service and date.' });
  const token = bearer(req);
  return handle(res, async () => {
    let excludeUserId: string | undefined;
    if (token) {
      try {
        excludeUserId = (await userFromToken(token)).id;
      } catch {
        excludeUserId = undefined;
      }
    }
    return shopAvailability({
      shopId: req.params.id,
      serviceIds,
      date: parsed.data.date,
      barberId: parsed.data.barberId,
      excludeUserId
    });
  });
});
app.post('/api/bookings', async (req, res) => {
  const limited = await rateLimit(clientKey(req, 'book'), 30, 15 * 60_000);
  if (!limited.ok) {
    return res.status(429).json({ error: `Too many booking attempts. Try again in ${limited.retryAfterSec}s.` });
  }
  const token = bearer(req);
  const parsed = z.object({
    shopId: z.string().min(1),
    serviceId: z.string().min(1).optional(),
    serviceIds: z.array(z.string().min(1)).min(1).optional(),
    startsAt: z.string().datetime(),
    barberId: z.string().optional(),
    holdId: z.string().min(1),
    payMode: z.enum(['shop', 'app']).optional(),
    /** Required for CJ-13 retries; server also derives a full key if omitted. */
    idempotencyKey: z.string().trim().min(8).max(200)
  }).refine((v) => Boolean(v.serviceId || (v.serviceIds && v.serviceIds.length)), {
    message: 'Pick at least one service.'
  }).safeParse(req.body);
  if (!token) return res.status(401).json({ error: 'Sign in again.' });
  if (!parsed.success) return res.status(400).json({ error: 'Complete the booking details.' });
  return handle(res, () => createBooking(token, parsed.data));
});
app.post('/api/bookings/:id/confirm-payment', async (req, res) => {
  const limited = await rateLimit(clientKey(req, 'pay-confirm'), 40, 15 * 60_000);
  if (!limited.ok) {
    return res.status(429).json({ error: `Too many payment checks. Try again in ${limited.retryAfterSec}s.` });
  }
  const token = bearer(req);
  const parsed = z
    .object({
      razorpayOrderId: z.string().min(1),
      razorpayPaymentId: z.string().min(1),
      razorpaySignature: z.string().min(1)
    })
    .safeParse(req.body);
  if (!token) return res.status(401).json({ error: 'Sign in again.' });
  if (!parsed.success) return res.status(400).json({ error: 'Payment details missing.' });
  return handle(res, () =>
    confirmBookingPayment(token, {
      bookingId: req.params.id,
      razorpayOrderId: parsed.data.razorpayOrderId,
      razorpayPaymentId: parsed.data.razorpayPaymentId,
      razorpaySignature: parsed.data.razorpaySignature
    })
  );
});
app.post('/api/bookings/:id/abandon-payment', async (req, res) => {
  const limited = await rateLimit(clientKey(req, 'pay-abandon'), 40, 15 * 60_000);
  if (!limited.ok) {
    return res.status(429).json({ error: `Too many requests. Try again in ${limited.retryAfterSec}s.` });
  }
  const token = bearer(req);
  if (!token) return res.status(401).json({ error: 'Sign in again.' });
  return handle(res, () => abandonBookingPayment(token, req.params.id));
});
app.get('/api/favourites', (req, res) => {
  const token = bearer(req);
  if (!token) return res.status(401).json({ error: 'Sign in again.' });
  const lat = req.query.lat != null ? Number(req.query.lat) : undefined;
  const lng = req.query.lng != null ? Number(req.query.lng) : undefined;
  return handle(res, () => listFavouriteShops(token, { lat, lng }));
});
app.get('/api/favourites/:shopId', (req, res) => {
  const token = bearer(req);
  if (!token) return res.status(401).json({ error: 'Sign in again.' });
  return handle(res, () => isFavouriteShop(token, req.params.shopId));
});
app.post('/api/favourites/:shopId', (req, res) => {
  const token = bearer(req);
  if (!token) return res.status(401).json({ error: 'Sign in again.' });
  return handle(res, () => setFavouriteShop(token, req.params.shopId, true));
});
app.delete('/api/favourites/:shopId', (req, res) => {
  const token = bearer(req);
  if (!token) return res.status(401).json({ error: 'Sign in again.' });
  return handle(res, () => setFavouriteShop(token, req.params.shopId, false));
});
app.get('/api/bookings', (req, res) => {
  const token = bearer(req);
  if (!token) return res.status(401).json({ error: 'Sign in again.' });
  return handle(res, () => listBookings(token));
});
app.get('/api/bookings/:id', (req, res) => {
  const token = bearer(req);
  if (!token) return res.status(401).json({ error: 'Sign in again.' });
  return handle(res, () => getBooking(token, req.params.id));
});
app.get('/api/notifications', (req, res) => {
  const token = bearer(req);
  if (!token) return res.status(401).json({ error: 'Sign in again.' });
  return handle(res, () => listUserNotifications(token));
});
app.post('/api/notifications/read-all', (req, res) => {
  const token = bearer(req);
  if (!token) return res.status(401).json({ error: 'Sign in again.' });
  return handle(res, () => markAllNotificationsRead(token));
});
app.post('/api/notifications/:id/read', (req, res) => {
  const token = bearer(req);
  if (!token) return res.status(401).json({ error: 'Sign in again.' });
  return handle(res, () => markNotificationRead(token, req.params.id));
});
app.post('/api/bookings/:id/cancel', (req, res) => {
  const token = bearer(req);
  if (!token) return res.status(401).json({ error: 'Sign in again.' });
  return handle(res, () => cancelBooking(token, req.params.id));
});
app.post('/api/bookings/:id/reschedule', (req, res) => {
  const token = bearer(req);
  const parsed = z
    .object({
      startsAt: z.string().datetime(),
      barberId: z.string().optional(),
      holdId: z.string().min(1)
    })
    .safeParse(req.body);
  if (!token) return res.status(401).json({ error: 'Sign in again.' });
  if (!parsed.success) return res.status(400).json({ error: 'Pick a new time.' });
  return handle(res, () => rescheduleBooking(token, req.params.id, parsed.data));
});
app.post('/api/bookings/:id/review', (req, res) => {
  const token = bearer(req);
  const parsed = z
    .object({
      shopRating: z.number().min(1).max(5),
      barberRating: z.number().min(1).max(5),
      text: z.string().max(500).optional()
    })
    .safeParse(req.body);
  if (!token) return res.status(401).json({ error: 'Sign in again.' });
  if (!parsed.success) return res.status(400).json({ error: 'Rate the shop and the staff member from 1 to 5.' });
  return handle(res, () => createBookingReview(token, req.params.id, parsed.data));
});
app.post('/api/bookings/hold', async (req, res) => {
  const limited = await rateLimit(clientKey(req, 'hold'), 40, 15 * 60_000);
  if (!limited.ok) {
    return res.status(429).json({ error: `Too many holds. Try again in ${limited.retryAfterSec}s.` });
  }
  const token = bearer(req);
  const schema = z
    .object({
      shopId: z.string().min(1),
      serviceId: z.string().min(1).optional(),
      serviceIds: z.array(z.string().min(1)).min(1).optional(),
      startsAt: z.string().datetime(),
      barberId: z.string().optional(),
      idempotencyKey: z.string().min(8).optional()
    })
    .refine((v) => Boolean(v.serviceId || (v.serviceIds && v.serviceIds.length)), {
      message: 'Pick at least one service.'
    });
  const parsed = schema.safeParse(req.body);
  if (!token) return res.status(401).json({ error: 'Sign in again.' });
  if (!parsed.success) return res.status(400).json({ error: 'Invalid booking hold request' });
  return handle(res, () => createHold(token, parsed.data));
});

/**
 * Ops admin (SEC-01/05): loopback-only + strong ADMIN_SECRET + rate limit.
 * Admin UI talks to http://127.0.0.1:4000 — not the public tunnel.
 */
app.get('/api/admin/ping', (req, res) => runAdmin(req, res, () => adminPing()));
app.get('/api/admin/partners', (req, res) => runAdmin(req, res, () => adminListPartners()));
app.post('/api/admin/partners', (req, res) => {
  const parsed = z
    .object({
      email: emailSchema,
      password: passwordSchema,
      name: z.string().trim().min(1).max(80).optional()
    })
    .safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Use a valid email and a password of at least 8 characters.' });
  }
  return runAdmin(req, res, () => adminCreatePartner(parsed.data));
});
app.patch('/api/admin/partners/:id/password', (req, res) => {
  const parsed = z.object({ password: passwordSchema }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  return runAdmin(req, res, () => adminSetPartnerPassword(String(req.params.id), parsed.data.password));
});
app.post('/api/admin/partners/:id/token', (req, res) =>
  runAdmin(req, res, () => adminMintPartnerToken(String(req.params.id)))
);
app.get('/api/admin/leads', (req, res) =>
  runAdmin(req, res, () => {
    const limit = Number(req.query.limit) || 100;
    return adminListLeads(limit);
  })
);

/** Global category → SKU catalogue (CJ-71). */
app.get('/api/admin/catalogue', (req, res) => runAdmin(req, res, () => adminListCatalogue()));
app.post('/api/admin/catalogue/migrate', (req, res) =>
  runAdmin(req, res, () => autoMigrateServiceCategories())
);
app.post('/api/admin/catalogue/categories', (req, res) => {
  const parsed = z
    .object({
      label: z.string().trim().min(2).max(60),
      gridLabel: z.string().trim().min(1).max(24).optional(),
      id: z.string().trim().min(2).max(48).optional()
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Category name required.' });
  return runAdmin(req, res, () => adminCreateCategory(parsed.data));
});
app.post('/api/admin/catalogue/services', (req, res) => {
  const parsed = z
    .object({
      categoryId: z.string().trim().min(1),
      name: z.string().trim().min(1).max(80),
      durationMinutes: z.number().int().min(10).max(480).optional(),
      bufferMinutes: z.number().int().min(0).max(120).optional()
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'categoryId + name required.' });
  return runAdmin(req, res, () => adminCreateCatalogueService(parsed.data));
});
app.patch('/api/admin/catalogue/services/:id', (req, res) => {
  const parsed = z
    .object({
      categoryId: z.string().trim().min(1).optional(),
      name: z.string().trim().min(1).max(80).optional()
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Provide categoryId and/or name.' });
  const id = String(req.params.id);
  return runAdmin(req, res, async () => {
    let last: { id: string; name: string; categoryId: string | null } | null = null;
    if (parsed.data.name) last = await adminRenameCatalogueService(id, parsed.data.name);
    if (parsed.data.categoryId) last = await adminMoveCatalogueService(id, parsed.data.categoryId);
    if (!last) throw new Error('Provide categoryId and/or name.');
    return last;
  });
});
app.delete('/api/admin/catalogue/services/:id', (req, res) =>
  runAdmin(req, res, () => adminRemoveCatalogueService(String(req.params.id)))
);

/** Public Partner With Us lead — no auth. */
app.post('/api/public/partner-leads', async (req, res) => {
  const rl = await rateLimit(clientKey(req, 'partner-lead'), 5, 60 * 60 * 1000);
  if (!rl.ok) {
    res.setHeader('Retry-After', String(rl.retryAfterSec));
    return res.status(429).json({ error: 'Too many requests. Try again later.' });
  }
  const parsed = z
    .object({
      phone: z.string().min(8).max(20),
      shopName: z.string().trim().max(120).optional(),
      city: z.string().trim().max(80).optional(),
      source: z.string().trim().max(64).optional()
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter a valid phone number.' });
  return handle(res, () =>
    createPartnerLead({
      ...parsed.data,
      userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
      ip: req.ip || null
    })
  );
});

/**
 * Marketing site: www / apex (tunnel → this process, Host-gated static from site/dist).
 * api.cutly.buzz keeps JSON /api/* only. Old /partner-with-us links redirect to www.
 */
const partnerSiteUrl = (process.env.PARTNER_SITE_URL || 'https://www.cutly.buzz').replace(/\/$/, '');
const siteDist = path.resolve(process.cwd(), 'site/dist');
const marketingHosts = new Set(
  (process.env.PARTNER_SITE_HOSTS || 'www.cutly.buzz,cutly.buzz')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
);
function isMarketingHost(req: express.Request): boolean {
  const host = (req.hostname || '').toLowerCase();
  const raw = String(req.headers.host || '')
    .split(':')[0]
    .toLowerCase();
  return marketingHosts.has(host) || marketingHosts.has(raw);
}

app.get(['/partner-with-us', '/partner-with-us/'], (req, res) => {
  if (isMarketingHost(req)) {
    res.redirect(302, '/');
    return;
  }
  res.redirect(302, `${partnerSiteUrl}/`);
});
app.get(/^\/partner-with-us\/.+/, (req, res) => {
  if (isMarketingHost(req)) {
    res.redirect(302, '/');
    return;
  }
  res.redirect(302, `${partnerSiteUrl}/`);
});

app.use((req, res, next) => {
  if (!isMarketingHost(req) || req.path.startsWith('/api') || req.path === '/health') {
    next();
    return;
  }
  express.static(siteDist, { index: 'index.html', fallthrough: true })(req, res, (err) => {
    if (err) {
      next(err);
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      next();
      return;
    }
    res.sendFile(path.join(siteDist, 'index.html'), (sendErr) => {
      if (sendErr) next();
    });
  });
});

if (process.env.NODE_ENV !== 'test') {
  // Bind all interfaces so Cloudflare Tunnel / LAN devices can reach the API.
  app.listen(port, '0.0.0.0', () =>
    console.log(
      `CUTLY API listening on 0.0.0.0:${port} · payments=${paymentsEnabled() ? 'razorpay-test' : 'off'}`
    )
  );
  // Auto-expire missed AWAITING_SHOP while API is awake; expire-on-read covers app open.
  startAwaitingExpirySweep(60_000);
}
export default app;
