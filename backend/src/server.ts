process.loadEnvFile();
import express from 'express';
import cors from 'cors';
import { z } from 'zod';
import { calculateSlots } from './availability';
import { MockPaymentProvider } from './payment';
import { sendPhoneOtp, signIn, signInWithGoogle, signUp, verifyPhoneOtp } from './auth';
const app = express(); const port = Number(process.env.PORT || 4000); const payment = new MockPaymentProvider();
app.use(cors()); app.use(express.json());
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
app.get('/api/shops', (_req, res) => res.json({ data: [] }));
app.get('/api/shops/:id/availability', (req, res) => { const date = String(req.query.date || new Date().toISOString().slice(0, 10)); const start = new Date(`${date}T10:00:00+05:30`); const end = new Date(`${date}T21:00:00+05:30`); const slots = calculateSlots({ shop: { start, end }, barber: { start, end }, bookings: [], durationMinutes: Number(req.query.durationMinutes || 30) }); res.json({ data: slots }); });
app.post('/api/bookings/hold', (req, res) => { const schema = z.object({ shopId: z.string(), serviceId: z.string(), startsAt: z.string().datetime(), barberId: z.string().optional(), idempotencyKey: z.string().min(8) }); const parsed = schema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: 'Invalid booking hold request' }); res.status(201).json({ data: { id: `hold_${Date.now()}`, status: 'HELD', expiresAt: new Date(Date.now() + 5 * 60000).toISOString(), ...parsed.data } }); });
app.post('/api/payments/create', async (req, res) => { const schema = z.object({ amountPaise: z.number().int().positive(), bookingId: z.string(), idempotencyKey: z.string().min(8) }); const parsed = schema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: 'Invalid payment request' }); res.status(201).json({ data: await payment.createPayment(parsed.data) }); });
app.post('/api/payments/webhook', async (req, res) => { const result = await payment.handleWebhook(JSON.stringify(req.body), String(req.header('x-payment-signature') || '')); res.json({ received: true, data: result }); });
if (process.env.NODE_ENV !== 'test') app.listen(port, () => console.log(`CUTLY API listening on :${port}`));
export default app;
