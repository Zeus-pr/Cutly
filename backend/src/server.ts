// Tests import this module without a .env file; the process entry is backend/src/main.ts.
try {
  process.loadEnvFile();
} catch {
  // no .env: rely on the process environment
}
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
  sendCustomerReauthOtp,
  startCustomerReauth,
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
  startPartnerReauth,
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
import { refundRateLimit, clientKey, rateLimit, sendRateLimited } from './rateLimit';
import { clientErrorBody, toClientError } from './httpError';
import { getClientIp, isLoopback, socketIp } from './clientIp';
import {
  CHANGE_EMAIL_ACTION,
  confirmEmailChange,
  confirmVerifyExisting,
  emailReleasedFlag,
  pendingSignupEmail,
  pendingChangeEmail,
  requestEmailChange,
  resendEmailChange,
  resendEmailSignup,
  sendVerifyExisting,
  startEmailSignup,
  verifyEmailSignup
} from './emailAuth';
import { cleanCode, emailBucket, signupEmailVerifyOn } from './emailCode';
import { recordResendEvent, verifySvixSignature } from './resendWebhook';
export const app = express();
// T2: never derive req.ip from X-Forwarded-For. Use getClientIp(req) instead.
app.set('trust proxy', false);
app.disable('x-powered-by');

/** One 404 for unknown routes and for /api/admin/* on the public listener (byte-identical). */
function notFound(_req: express.Request, res: express.Response) {
  res.status(404).json({ error: 'Not found.' });
}
/** Case-insensitive, slash-normalised match for /api/admin and below. */
export function isAdminPath(rawPath: string) {
  const p = rawPath.toLowerCase().replace(/\/{2,}/g, '/');
  return /^\/api\/admin(\/|$)/.test(p);
}
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
// T2-Q6: after CORS (so headers match any unknown route, Tester case 20) but before body
// parsing and auth, so :4000 reveals nothing about admin.
app.use((req, res, next) => (isAdminPath(req.path) ? notFound(req, res) : next()));
// T4 (#9): Resend webhook needs the raw body for the Svix signature, so it sits before express.json.
app.post('/api/webhooks/resend', express.raw({ type: '*/*', limit: '256kb' }), async (req, res) => {
  const limited = await rateLimit(clientKey(req, 'resend-webhook'), 120, 60_000);
  if (!limited.ok) return sendRateLimited(res, limited, 'requests');
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim() || '';
  if (!secret) return res.status(503).json({ error: 'Webhook not configured.' });
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  const ok = verifySvixSignature(
    secret,
    { id: req.header('svix-id'), timestamp: req.header('svix-timestamp'), signature: req.header('svix-signature') },
    raw
  );
  if (!ok) return res.status(401).json({ error: 'Bad signature.' });
  let event: unknown;
  try {
    event = JSON.parse(raw);
  } catch {
    return res.status(400).json({ error: 'Bad body.' });
  }
  return handle(res, () => recordResendEvent(event as Parameters<typeof recordResendEvent>[0]));
});
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
    const err = toClientError(error);
    res.status(err.status).json(clientErrorBody(err));
  }
}
app.post('/api/auth/signup', async (req, res) => {
  const limited = await rateLimit(clientKey(req, 'signup'), 10, 15 * 60_000);
  if (!limited.ok) {
    return sendRateLimited(res, limited, 'sign-up attempts');
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
  // T4 (#9): two-step signup. SIGNUP_EMAIL_VERIFY=off keeps the old one-step session for old builds.
  if (!signupEmailVerifyOn()) {
    return handle(res, () => signUp(parsed.data.email, parsed.data.password, parsed.data.phone, parsed.data.name));
  }
  const sendKeys = await emailSendLimited(req, res, parsed.data.email, null);
  if (!sendKeys) return;
  return handleEmail(res, () => startEmailSignup(parsed.data), 202, sendKeys);
});

/**
 * T4 (#9) §5 send limits: 10/IP per 15 min, 5/address per hour, 20/address per day,
 * 5/subject (pending signup or session) per hour. The 60 s cooldown is checked in emailAuth.
 * Returns false when a 429 was already sent.
 */
async function emailSendLimited(
  req: express.Request,
  res: express.Response,
  email: string | null,
  subject: string | null
): Promise<string[] | false> {
  const checks: [string, number, number][] = [[clientKey(req, 'email-send'), 10, 15 * 60_000]];
  if (email) {
    const bucket = emailBucket(email.trim().toLowerCase());
    checks.push([`email-send-h:${bucket}`, 5, 60 * 60_000], [`email-send-d:${bucket}`, 20, 24 * 60 * 60_000]);
  }
  if (subject) checks.push([`email-send-s:${subject}`, 5, 60 * 60_000]);
  const taken: string[] = [];
  for (const [key, limit, windowMs] of checks) {
    const limited = await rateLimit(key, limit, windowMs);
    if (!limited.ok) {
      await Promise.all(taken.map(refundRateLimit)); // refused here: earlier buckets give the hit back
      sendRateLimited(res, limited, 'codes requested');
      return false;
    }
    taken.push(key);
  }
  return taken;
}

/** Verify limits: 20/IP per 15 min (as otp-verify) + 10/address-subject per hour; 5 per code in emailAuth. */
async function emailVerifyLimited(req: express.Request, res: express.Response, subject: string) {
  for (const [key, limit, windowMs] of [
    [clientKey(req, 'email-verify'), 20, 15 * 60_000],
    [`email-verify-s:${subject}`, 10, 60 * 60_000]
  ] as [string, number, number][]) {
    const limited = await rateLimit(key, limit, windowMs);
    if (!limited.ok) {
      sendRateLimited(res, limited, 'code checks');
      return false;
    }
  }
  return true;
}

/** Like handle(), plus Retry-After on a RATE_LIMITED domain error and a custom success status. */
async function handleEmail(res: express.Response, action: () => Promise<unknown>, okStatus = 200, refund: string[] = []) {
  try {
    res.status(okStatus).json({ data: await action() });
  } catch (error) {
    // T4 F4: only codes actually sent count toward the send limits (cooldown / re-auth / taken refusals don't).
    await Promise.all(refund.map(refundRateLimit));
    const err = toClientError(error);
    const retry = err.details?.retryAfterSec;
    if (err.code === 'RATE_LIMITED' && typeof retry === 'number') res.setHeader('Retry-After', String(retry));
    res.status(err.status).json(clientErrorBody(err));
  }
}

/**
 * Signed-in email routes: limits key on the user id (PR Review #58), not on token bytes.
 * Returns null after answering 401.
 */
async function emailUser(req: express.Request, res: express.Response) {
  const token = bearer(req);
  if (!token) {
    res.status(401).json({ error: 'Sign in again.' });
    return null;
  }
  try {
    const user = await userFromToken(token);
    return { token, userId: user.id, email: user.email };
  } catch (error) {
    const err = toClientError(error);
    res.status(err.status).json(clientErrorBody(err));
    return null;
  }
}

const codeSchema = z.string().transform((v) => cleanCode(v)).refine((v): v is string => Boolean(v));

app.post('/api/auth/signup/resend', async (req, res) => {
  const parsed = z.object({ pendingId: z.string().min(10).max(40) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Start again from Create account.' });
  const email = await pendingSignupEmail(parsed.data.pendingId);
  const sendKeys = await emailSendLimited(req, res, email, `pending:${parsed.data.pendingId}`);
  if (!sendKeys) return;
  return handleEmail(res, () => resendEmailSignup(parsed.data.pendingId), 200, sendKeys);
});
app.post('/api/auth/signup/verify', async (req, res) => {
  const parsed = z.object({ pendingId: z.string().min(10).max(40), code: codeSchema }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter the 6-digit code.' });
  // PR Review #58: per pending signup + IP (one IP can't burn another person's attempts budget).
  if (!(await emailVerifyLimited(req, res, `pending:${parsed.data.pendingId}:${clientKey(req, 'ip')}`))) return;
  return handleEmail(res, () => verifyEmailSignup(parsed.data.pendingId, parsed.data.code));
});
app.post('/api/auth/email/verify/send', async (req, res) => {
  const me = await emailUser(req, res);
  if (!me) return;
  // Sec #58 item 2: per-address buckets here too.
  const sendKeys = await emailSendLimited(req, res, me.email, `user:${me.userId}`);
  if (!sendKeys) return;
  return handleEmail(res, () => sendVerifyExisting(me.token), 200, sendKeys);
});
app.post('/api/auth/email/verify', async (req, res) => {
  const parsed = z.object({ code: codeSchema }).safeParse(req.body);
  const me = await emailUser(req, res);
  if (!me) return;
  if (!parsed.success) return res.status(400).json({ error: 'Enter the 6-digit code.' });
  if (!(await emailVerifyLimited(req, res, `user:${me.userId}`))) return;
  return handleEmail(res, () => confirmVerifyExisting(me.token, parsed.data.code));
});
app.post('/api/auth/email/change', async (req, res) => {
  const me = await emailUser(req, res);
  if (!me) return;
  const parsed = z.object({ newEmail: emailSchema }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter a valid email.' });
  const sendKeys = await emailSendLimited(req, res, parsed.data.newEmail, `user:${me.userId}`);
  if (!sendKeys) return;
  return handleEmail(res, () => requestEmailChange(me.token, req.header('x-reauth-token'), parsed.data.newEmail), 200, sendKeys);
});
app.post('/api/auth/email/change/resend', async (req, res) => {
  const me = await emailUser(req, res);
  if (!me) return;
  // Sec #58 item 2: per-address buckets on the pending target address.
  const sendKeys = await emailSendLimited(req, res, await pendingChangeEmail(me.userId), `user:${me.userId}`);
  if (!sendKeys) return;
  return handleEmail(res, () => resendEmailChange(me.token), 200, sendKeys);
});
app.post('/api/auth/email/change/verify', async (req, res) => {
  const me = await emailUser(req, res);
  if (!me) return;
  const parsed = z.object({ code: codeSchema }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter the 6-digit code.' });
  if (!(await emailVerifyLimited(req, res, `user:${me.userId}`))) return;
  return handleEmail(res, () => confirmEmailChange(me.token, parsed.data.code));
});
app.post('/api/auth/login', async (req, res) => {
  const limited = await rateLimit(clientKey(req, 'login'), 20, 15 * 60_000);
  if (!limited.ok) return sendRateLimited(res, limited, 'login attempts');
  const parsed = z.object({ email: emailSchema, password: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter your email and password.' });
  return handle(res, () => signIn(parsed.data.email, parsed.data.password));
});
app.post('/api/auth/google', async (req, res) => {
  const limited = await rateLimit(clientKey(req, 'google'), 30, 15 * 60_000);
  if (!limited.ok) return sendRateLimited(res, limited, 'Google attempts');
  const parsed = z.object({ idToken: z.string().min(20) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Google sign-in did not return a token.' });
  const mergeToken = bearer(req);
  return handle(res, () => signInWithGoogle(parsed.data.idToken, mergeToken || undefined));
});
app.post('/api/auth/otp/send', async (req, res) => {
  const limited = await rateLimit(clientKey(req, 'otp-send'), 8, 15 * 60_000);
  if (!limited.ok) return sendRateLimited(res, limited, 'codes requested');
  const parsed = z.object({ phone: phoneSchema }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter the phone number with the country code, like +9198...' });
  return handle(res, async () => { await sendPhoneOtp(parsed.data.phone); return { sent: true }; });
});
app.post('/api/auth/otp/verify', async (req, res) => {
  const limited = await rateLimit(clientKey(req, 'otp-verify'), 20, 15 * 60_000);
  if (!limited.ok) return sendRateLimited(res, limited, 'code checks');
  const parsed = z.object({ phone: phoneSchema, code: z.string().regex(/^\d{6}$/) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter the 6-digit code.' });
  const mergeToken = bearer(req);
  return handle(res, () => verifyPhoneOtp(parsed.data.phone, parsed.data.code, mergeToken || undefined));
});
function bearer(req: express.Request) {
  const header = req.header('authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}
/** T3 step-up proof: { password } | { code } (SMS to the account's own phone) | { googleIdToken }. */
const reauthSchema = z.union([
  z.object({ password: z.string().min(1).max(200) }).transform((v) => ({ method: 'password' as const, password: v.password })),
  z.object({ code: z.string().regex(/^\d{6}$/) }).transform((v) => ({ method: 'otp' as const, code: v.code })),
  z.object({ googleIdToken: z.string().min(20) }).transform((v) => ({ method: 'google' as const, idToken: v.googleIdToken }))
]);
/** Returns null when rate limited (429 already sent), else how many tries are left in the window. */
async function reauthLimited(req: express.Request, res: express.Response, who: string): Promise<number | null> {
  // 5 per session (≈ per user) + a looser 20 per IP so a shared NAT does not lock everyone out.
  const byIp = await rateLimit(clientKey(req, `reauth-${who}`), 20, 15 * 60_000);
  const byToken = await rateLimit(`reauth-${who}-tok:${bearer(req).slice(-24)}`, 5, 15 * 60_000);
  const limited = !byIp.ok ? byIp : !byToken.ok ? byToken : null;
  if (limited) {
    sendRateLimited(res, limited, 'attempts');
    return null;
  }
  return Math.min(byIp.remaining ?? 0, byToken.remaining ?? 0);
}

/** #46: a wrong code/password says how many tries are left before the 429. */
async function handleReauth(res: express.Response, attemptsRemaining: number, action: () => Promise<unknown>) {
  try {
    res.status(200).json({ data: await action() });
  } catch (error) {
    const err = toClientError(error);
    const body = clientErrorBody(err);
    res.status(err.status).json(err.code === 'REAUTH_FAILED' ? { ...body, attemptsRemaining } : body);
  }
}
app.post('/api/auth/reauth', async (req, res) => {
  const token = bearer(req);
  if (!token) return res.status(401).json({ error: 'Sign in again.' });
  const left = await reauthLimited(req, res, 'customer');
  if (left === null) return;
  const parsed = reauthSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Confirm with your password, an SMS code, or Google.', code: 'REAUTH_BAD_REQUEST' });
  // T4 (#9): optional `action` binds the grant (default delete_account, as before).
  const action = req.body?.action === CHANGE_EMAIL_ACTION ? CHANGE_EMAIL_ACTION : 'delete_account';
  return handleReauth(res, left, () => startCustomerReauth(token, parsed.data, undefined, action));
});
/**
 * #46: send the re-auth SMS to the signed-in account's own phone. Its own limit (5/session,
 * 10/IP per 15 min) so it does not share the login send bucket. No phone in the body.
 */
app.post('/api/auth/reauth/otp/send', async (req, res) => {
  const token = bearer(req);
  if (!token) return res.status(401).json({ error: 'Sign in again.' });
  const byIp = await rateLimit(clientKey(req, 'reauth-otp-send'), 10, 15 * 60_000);
  const limited = byIp.ok ? await rateLimit(`reauth-otp-send-tok:${token.slice(-24)}`, 5, 15 * 60_000) : byIp;
  if (!limited.ok) return sendRateLimited(res, limited, 'codes requested');
  return handle(res, () => sendCustomerReauthOtp(token));
});
/** T3: soft delete; requires a one-time X-Reauth-Token from POST /api/auth/reauth. */
app.delete('/api/auth/account', async (req, res) => {
  // sec LOW: bound account-delete attempts (30/IP, 5/session per 15 min), same shape as reauth.
  const byIp = await rateLimit(clientKey(req, 'account-delete'), 30, 15 * 60_000);
  const limited = byIp.ok ? await rateLimit(`account-delete-tok:${bearer(req).slice(-24)}`, 5, 15 * 60_000) : byIp;
  if (!limited.ok) return sendRateLimited(res, limited, 'attempts');
  const token = bearer(req);
  if (!token) return res.status(401).json({ error: 'Sign in again.' });
  return handle(res, () => deleteCustomerAccount(token, req.header('x-reauth-token')));
});
app.get('/api/auth/me', (req, res) => {
  const token = bearer(req);
  if (!token) return res.status(401).json({ error: 'Sign in again.' });
  return handle(res, async () => {
    const user = await userFromToken(token);
    // T4 (#9) screen 14: the address was released to its proven owner.
    return { ...user, emailReleased: await emailReleasedFlag(user.id, user.email) };
  });
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
  if (!limited.ok) return sendRateLimited(res, limited, 'login attempts');
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
app.post('/api/partner/reauth', async (req, res) => {
  const token = bearer(req);
  if (!token) return res.status(401).json({ error: 'Sign in again.' });
  const left = await reauthLimited(req, res, 'partner');
  if (left === null) return;
  const parsed = reauthSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Confirm with your password, an SMS code, or Google.', code: 'REAUTH_BAD_REQUEST' });
  return handleReauth(res, left, () => startPartnerReauth(token, parsed.data));
});
/** T3: soft delete; requires a one-time X-Reauth-Token from POST /api/partner/reauth. */
app.delete('/api/partner/account', async (req, res) => {
  // #46: same shape as the customer delete limit (30/IP, 5/session per 15 min).
  const byIp = await rateLimit(clientKey(req, 'partner-account-delete'), 30, 15 * 60_000);
  const limited = byIp.ok ? await rateLimit(`partner-account-delete-tok:${bearer(req).slice(-24)}`, 5, 15 * 60_000) : byIp;
  if (!limited.ok) return sendRateLimited(res, limited, 'attempts');
  const token = bearer(req);
  if (!token) return res.status(401).json({ error: 'Sign in again.' });
  return handle(res, () => deletePartnerAccount(token, req.header('x-reauth-token')));
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
    return sendRateLimited(res, limited, 'booking attempts');
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
    return sendRateLimited(res, limited, 'payment checks');
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
    return sendRateLimited(res, limited, 'requests');
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
    return sendRateLimited(res, limited, 'holds');
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
 * T2: served only by `adminApp` on 127.0.0.1:4001 (ADMIN_PORT). The tunnel points at :4000,
 * where /api/admin/* is a plain 404.
 */
const adminRouter = express.Router();
adminRouter.get('/api/admin/ping', (req, res) => runAdmin(req, res, () => adminPing()));
adminRouter.get('/api/admin/partners', (req, res) => runAdmin(req, res, () => adminListPartners()));
adminRouter.post('/api/admin/partners', (req, res) => {
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
adminRouter.patch('/api/admin/partners/:id/password', (req, res) => {
  const parsed = z.object({ password: passwordSchema }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  return runAdmin(req, res, () => adminSetPartnerPassword(String(req.params.id), parsed.data.password));
});
adminRouter.post('/api/admin/partners/:id/token', (req, res) =>
  runAdmin(req, res, () => adminMintPartnerToken(String(req.params.id)))
);
adminRouter.get('/api/admin/leads', (req, res) =>
  runAdmin(req, res, () => {
    const limit = Number(req.query.limit) || 100;
    return adminListLeads(limit);
  })
);

/** Global category → SKU catalogue (CJ-71). */
adminRouter.get('/api/admin/catalogue', (req, res) => runAdmin(req, res, () => adminListCatalogue()));
adminRouter.post('/api/admin/catalogue/migrate', (req, res) =>
  runAdmin(req, res, () => autoMigrateServiceCategories())
);
adminRouter.post('/api/admin/catalogue/categories', (req, res) => {
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
adminRouter.post('/api/admin/catalogue/services', (req, res) => {
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
adminRouter.patch('/api/admin/catalogue/services/:id', (req, res) => {
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
adminRouter.delete('/api/admin/catalogue/services/:id', (req, res) =>
  runAdmin(req, res, () => adminRemoveCatalogueService(String(req.params.id)))
);

export const adminApp = express();
adminApp.set('trust proxy', false);
adminApp.disable('x-powered-by');
// Defence in depth: the admin listener only ever serves loopback peers.
adminApp.use((req, res, next) => {
  if (!isLoopback(socketIp(req))) {
    res.status(401).json({ error: 'Unauthorized.' });
    return;
  }
  next();
});
// Unauthenticated liveness for scripts/cutly-api.sh. Never touches the admin rate limits.
adminApp.get('/health', (_req, res) => res.json({ status: 'ok', service: 'cutly-admin' }));
adminApp.use((req, res, next) => (isAdminPath(req.path) ? next() : notFound(req, res)));
adminApp.use(
  cors({
    origin(origin, callback) {
      callback(null, !origin || corsOrigins.includes(origin));
    }
  })
);
adminApp.use(express.json({ limit: '2mb' }));
adminApp.use(adminRouter);
adminApp.use(notFound);

/** Public Partner With Us lead — no auth. */
app.post('/api/public/partner-leads', async (req, res) => {
  const rl = await rateLimit(clientKey(req, 'partner-lead'), 5, 60 * 60 * 1000);
  if (!rl.ok) {
    return sendRateLimited(res, rl, 'requests');
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
      ip: (() => {
        const ip = getClientIp(req);
        return ip === 'unknown' ? null : ip;
      })()
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

app.use(notFound);

// No listen() here: importing this module must not start servers (Tester).
// Process entry (listeners + sweeps): backend/src/main.ts.
export default app;
