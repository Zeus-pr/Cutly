process.loadEnvFile();
import express from 'express';
import cors from 'cors';
import { z } from 'zod';
import { MockPaymentProvider } from './payment';
import { sendPhoneOtp, signIn, signInWithGoogle, signUp, updateProfileName, userFromToken, verifyPhoneOtp } from './auth';
import { partnerDashboard, partnerShop, partnerSignIn, partnerSignUp, setupShop, updateAmenities, updateFloor, updatePhotos, deletePartnerAccount } from './partner';
import {
  createBooking,
  getShop,
  listBookings,
  listNearbyShops,
  savePushToken,
  shopAvailability,
  shopBarbers,
  shopServices
} from './customer';
const app = express(); const port = Number(process.env.PORT || 4000); const payment = new MockPaymentProvider();
app.use(cors()); app.use(express.json({ limit: '8mb' }));
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'cutly-api' }));
const emailSchema = z.string().trim().email().transform((value) => value.toLowerCase());
const passwordSchema = z.string().min(8);
const phoneSchema = z.string().regex(/^\+[1-9]\d{7,14}$/);
async function handle(res: express.Response, action: () => Promise<unknown>) {
  try {
    res.status(200).json({ data: await action() });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Request failed';
    res.status(400).json({ error: message });
  }
}
app.post('/api/auth/signup', (req, res) => {
  const parsed = z.object({ email: emailSchema, password: passwordSchema, name: z.string().trim().min(1).optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Use a valid email and a password of at least 8 characters.' });
  return handle(res, () => signUp(parsed.data.email, parsed.data.password, parsed.data.name));
});
app.post('/api/auth/login', (req, res) => {
  const parsed = z.object({ email: emailSchema, password: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter your email and password.' });
  return handle(res, () => signIn(parsed.data.email, parsed.data.password));
});
app.post('/api/auth/google', (req, res) => {
  const parsed = z.object({ idToken: z.string().min(20) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Google sign-in did not return a token.' });
  return handle(res, () => signInWithGoogle(parsed.data.idToken));
});
app.post('/api/auth/otp/send', (req, res) => {
  const parsed = z.object({ phone: phoneSchema }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter the phone number with the country code, like +9198...' });
  return handle(res, async () => { await sendPhoneOtp(parsed.data.phone); return { sent: true }; });
});
app.post('/api/auth/otp/verify', (req, res) => {
  const parsed = z.object({ phone: phoneSchema, code: z.string().regex(/^\d{6}$/) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter the 6-digit code.' });
  return handle(res, () => verifyPhoneOtp(parsed.data.phone, parsed.data.code));
});
function bearer(req: express.Request) {
  const header = req.header('authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}
app.get('/api/auth/me', (req, res) => {
  const token = bearer(req);
  if (!token) return res.status(401).json({ error: 'Sign in again.' });
  return handle(res, () => userFromToken(token));
});
const kinds = ['BARBER', 'SALON', 'PARLOUR', 'TATTOO', 'PIERCING'] as const;
app.post('/api/partner/signup', (req, res) => {
  const parsed = z.object({ email: emailSchema, password: passwordSchema, name: z.string().trim().min(1).max(80).optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Use a valid email and a password of at least 8 characters.' });
  return handle(res, () => partnerSignUp(parsed.data.email, parsed.data.password, parsed.data.name));
});
app.post('/api/partner/login', (req, res) => {
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
    kind: z.enum(kinds),
    services: z.array(z.object({
      name: z.string().trim().min(1).max(80),
      durationMinutes: z.number().int().min(10).max(480),
      pricePaise: z.number().int().min(0)
    })).min(1).max(24),
    chairCount: z.number().int().min(1).max(40),
    workersPresent: z.number().int().min(1).max(40)
  }).safeParse(req.body);
  if (!token || !parsed.success) return res.status(400).json({ error: 'Finish each setup step before continuing.' });
  return handle(res, () => setupShop(token, parsed.data));
});
app.patch('/api/partner/floor', (req, res) => {
  const token = bearer(req);
  const parsed = z.object({ workersPresent: z.number().int().min(0).max(40), chairsInUse: z.number().int().min(0).max(40) }).safeParse(req.body);
  if (!token || !parsed.success) return res.status(400).json({ error: 'Enter how many chairs and workers are in today.' });
  return handle(res, () => updateFloor(token, parsed.data));
});
app.patch('/api/partner/amenities', (req, res) => {
  const token = bearer(req);
  const parsed = z.object({ amenities: z.array(z.string().trim().min(1).max(40)).max(12) }).safeParse(req.body);
  if (!token || !parsed.success) return res.status(400).json({ error: 'Choose the features you have.' });
  return handle(res, () => updateAmenities(token, parsed.data.amenities));
});
app.patch('/api/partner/photos', (req, res) => {
  const token = bearer(req);
  const parsed = z.object({ photos: z.array(z.string().min(8)).max(5) }).safeParse(req.body);
  if (!token || !parsed.success) return res.status(400).json({ error: 'Add up to 5 photos.' });
  return handle(res, () => updatePhotos(token, parsed.data.photos));
});
app.get('/api/partner/dashboard', (req, res) => {
  const token = bearer(req);
  if (!token) return res.status(401).json({ error: 'Sign in again.' });
  return handle(res, () => partnerDashboard(token));
});
app.delete('/api/partner/account', (req, res) => {
  const token = bearer(req);
  if (!token) return res.status(401).json({ error: 'Sign in again.' });
  return handle(res, () => deletePartnerAccount(token));
});
app.patch('/api/auth/profile', (req, res) => {
  const token = bearer(req);
  const parsed = z.object({ name: z.string().trim().min(1).max(80) }).safeParse(req.body);
  if (!token || !parsed.success) return res.status(400).json({ error: 'Enter your name.' });
  return handle(res, () => updateProfileName(token, parsed.data.name));
});
app.post('/api/push/register', (req, res) => {
  const token = bearer(req);
  const parsed = z.object({ pushToken: z.string().min(8) }).safeParse(req.body);
  if (!token || !parsed.success) return res.status(400).json({ error: 'Push token missing.' });
  return handle(res, () => savePushToken(token, parsed.data.pushToken));
});
app.get('/api/shops', (req, res) => {
  const parsed = z.object({
    lat: z.coerce.number().optional(),
    lng: z.coerce.number().optional(),
    query: z.string().optional(),
    openNow: z.coerce.boolean().optional(),
    radiusKm: z.coerce.number().optional()
  }).safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid shop search.' });
  return handle(res, () => listNearbyShops({
    latitude: parsed.data.lat,
    longitude: parsed.data.lng,
    query: parsed.data.query,
    openNow: parsed.data.openNow,
    radiusKm: parsed.data.radiusKm
  }));
});
app.get('/api/shops/:id', (req, res) => {
  const lat = req.query.lat ? Number(req.query.lat) : undefined;
  const lng = req.query.lng ? Number(req.query.lng) : undefined;
  return handle(res, () => getShop(req.params.id, lat != null && lng != null ? { lat, lng } : undefined));
});
app.get('/api/shops/:id/services', (req, res) => handle(res, () => shopServices(req.params.id)));
app.get('/api/shops/:id/barbers', (req, res) => handle(res, () => shopBarbers(req.params.id)));
app.get('/api/shops/:id/availability', (req, res) => {
  const parsed = z.object({
    serviceId: z.string().min(1),
    date: z.string().min(8),
    barberId: z.string().optional()
  }).safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: 'Pick a service and date.' });
  return handle(res, () => shopAvailability({
    shopId: req.params.id,
    serviceId: parsed.data.serviceId,
    date: parsed.data.date,
    barberId: parsed.data.barberId
  }));
});
app.post('/api/bookings', (req, res) => {
  const token = bearer(req);
  const parsed = z.object({
    shopId: z.string().min(1),
    serviceId: z.string().min(1),
    startsAt: z.string().datetime(),
    barberId: z.string().optional()
  }).safeParse(req.body);
  if (!token) return res.status(401).json({ error: 'Sign in again.' });
  if (!parsed.success) return res.status(400).json({ error: 'Complete the booking details.' });
  return handle(res, () => createBooking(token, parsed.data));
});
app.get('/api/bookings', (req, res) => {
  const token = bearer(req);
  if (!token) return res.status(401).json({ error: 'Sign in again.' });
  return handle(res, () => listBookings(token));
});
app.post('/api/bookings/hold', (req, res) => {
  const schema = z.object({ shopId: z.string(), serviceId: z.string(), startsAt: z.string().datetime(), barberId: z.string().optional(), idempotencyKey: z.string().min(8) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid booking hold request' });
  res.status(201).json({ data: { id: `hold_${Date.now()}`, status: 'HELD', expiresAt: new Date(Date.now() + 5 * 60000).toISOString(), ...parsed.data } });
});
app.post('/api/payments/create', async (req, res) => { const schema = z.object({ amountPaise: z.number().int().positive(), bookingId: z.string(), idempotencyKey: z.string().min(8) }); const parsed = schema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: 'Invalid payment request' }); res.status(201).json({ data: await payment.createPayment(parsed.data) }); });
app.post('/api/payments/webhook', async (req, res) => { const result = await payment.handleWebhook(JSON.stringify(req.body), String(req.header('x-payment-signature') || '')); res.json({ received: true, data: result }); });
if (process.env.NODE_ENV !== 'test') app.listen(port, () => console.log(`CUTLY API listening on :${port}`));
export default app;
