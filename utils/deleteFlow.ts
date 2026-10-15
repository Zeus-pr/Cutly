/**
 * #46 delete-account flow: pure helpers (no React Native imports, unit-tested in
 * tests/deleteFlow.test.ts). Contract: PR #45 + #46 backend (`docs/privacy-account-deletion.md`).
 */

export type AuthMethod = 'phone' | 'password' | 'google';
export type ReauthMethod = 'otp' | 'password' | 'google';

export type UpcomingBooking = {
  id: string;
  bookingCode: string;
  startsAt: string;
  status?: string;
  customerName?: string;
  serviceNames?: string[];
};

/** Error from a CutLy API call, keeping the machine-readable fields the flow needs. */
export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly retryAfterSec?: number;
  readonly attemptsRemaining?: number;
  readonly bookings?: UpcomingBooking[];

  constructor(input: {
    status: number;
    message: string;
    code?: string;
    retryAfterSec?: number;
    attemptsRemaining?: number;
    bookings?: UpcomingBooking[];
  }) {
    super(input.message);
    this.name = 'ApiError';
    this.status = input.status;
    this.code = input.code;
    this.retryAfterSec = input.retryAfterSec;
    this.attemptsRemaining = input.attemptsRemaining;
    this.bookings = input.bookings;
  }
}

/** Build an ApiError from a non-2xx response body (+ the Retry-After header for 429s). */
export function apiErrorFrom(status: number, payload: unknown, retryAfterHeader?: string | null): ApiError {
  const body = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;
  const headerSec = Number(retryAfterHeader);
  const bodySec = Number(body.retryAfterSec);
  const retryAfterSec =
    status === 429 ? (Number.isFinite(bodySec) && bodySec > 0 ? bodySec : Number.isFinite(headerSec) && headerSec > 0 ? headerSec : 60) : undefined;
  return new ApiError({
    status,
    message: typeof body.error === 'string' && body.error ? body.error : `Request failed (${status})`,
    code: typeof body.code === 'string' ? body.code : status === 429 ? 'RATE_LIMITED' : undefined,
    retryAfterSec,
    attemptsRemaining: typeof body.attemptsRemaining === 'number' ? body.attemptsRemaining : undefined,
    bookings: Array.isArray(body.bookings) ? (body.bookings as UpcomingBooking[]) : undefined
  });
}

/**
 * Which proof to ask for. Phone (the default login) → OTP; then password; then Google.
 * `alsoGoogle` offers Google under an OR divider when it is not the primary method.
 */
export function pickReauthMethod(profile: {
  phone?: string | null;
  hasPassword?: boolean;
  googleLinked?: boolean;
  authMethods?: AuthMethod[] | null;
}): { primary: ReauthMethod | null; alsoGoogle: boolean } {
  const methods = new Set<AuthMethod>(profile.authMethods ?? []);
  if (!profile.authMethods) {
    if (profile.phone) methods.add('phone');
    if (profile.hasPassword) methods.add('password');
    if (profile.googleLinked) methods.add('google');
  }
  const primary: ReauthMethod | null = methods.has('phone')
    ? 'otp'
    : methods.has('password')
      ? 'password'
      : methods.has('google')
        ? 'google'
        : null;
  return { primary, alsoGoogle: primary !== 'google' && methods.has('google') };
}

export type ReauthOutcome =
  | { kind: 'failed'; message: string; attemptsRemaining?: number }
  | { kind: 'rateLimited'; retryAt: number }
  | { kind: 'signedOut' }
  | { kind: 'error'; message: string };

export const REAUTH_FAILED_COPY = 'We could not confirm it’s you. Try again.';

/** A re-auth grant held on the client, with an absolute expiry. */
export type HeldGrant = { reauthToken: string; expiresAt: number };

/** Safety margin so we never send a grant that expires in flight. */
const GRANT_MARGIN_MS = 10_000;

export function holdGrant(grant: { reauthToken: string; expiresIn: number }, now = Date.now()): HeldGrant {
  return { reauthToken: grant.reauthToken, expiresAt: now + grant.expiresIn * 1000 };
}

/** The grant if it can still be used for DELETE, else null. A failed DELETE does not consume it. */
export function liveGrant(grant: HeldGrant | null, now = Date.now()): HeldGrant | null {
  return grant && grant.expiresAt - GRANT_MARGIN_MS > now ? grant : null;
}

/** Re-auth OTP auto-send cooldown (at least the server’s 30 s per-phone send cooldown). */
export const OTP_AUTOSEND_COOLDOWN_MS = 60_000;

export function shouldAutoSend(lastSentAt: number | null, now = Date.now()): boolean {
  return lastSentAt === null || now - lastSentAt >= OTP_AUTOSEND_COOLDOWN_MS;
}

/** Map a POST /reauth (or re-auth OTP send) failure to the screen state. */
export function reauthOutcome(error: unknown, now = Date.now()): ReauthOutcome {
  if (!(error instanceof ApiError)) {
    return { kind: 'error', message: error instanceof Error ? error.message : 'Something went wrong. Try again.' };
  }
  if (error.status === 429) return { kind: 'rateLimited', retryAt: now + (error.retryAfterSec ?? 60) * 1000 };
  if (error.code === 'REAUTH_FAILED') {
    return { kind: 'failed', message: error.message || REAUTH_FAILED_COPY, attemptsRemaining: error.attemptsRemaining };
  }
  if (error.status === 401) return { kind: 'signedOut' };
  if (error.code === 'REAUTH_BAD_REQUEST') return { kind: 'failed', message: 'Something’s missing. Try again.' };
  return { kind: 'error', message: error.message };
}

export type DeleteOutcome =
  | { kind: 'reauth'; message: string }
  | { kind: 'rateLimited'; retryAt: number }
  | { kind: 'visit' }
  | { kind: 'bookings'; bookings: UpcomingBooking[] }
  | { kind: 'retry'; message: string }
  | { kind: 'opsOnly'; message: string }
  | { kind: 'signedOut' }
  | { kind: 'error'; message: string };

/** Map a DELETE /account failure to the screen state (spec §5). */
export function deleteOutcome(error: unknown, now = Date.now()): DeleteOutcome {
  if (!(error instanceof ApiError)) {
    return { kind: 'error', message: error instanceof Error ? error.message : 'Something went wrong. Try again.' };
  }
  switch (error.code) {
    case 'REAUTH_REQUIRED':
      return { kind: 'reauth', message: error.message };
    case 'RATE_LIMITED':
      return { kind: 'rateLimited', retryAt: now + (error.retryAfterSec ?? 60) * 1000 };
    case 'VISIT_IN_PROGRESS':
      return { kind: 'visit' };
    case 'UPCOMING_BOOKINGS':
      return { kind: 'bookings', bookings: error.bookings ?? [] };
    case 'BOOKINGS_CHANGED':
    case 'PARTNER_DELETE_CONFLICT':
      return { kind: 'retry', message: error.message };
    case 'PARTNER_DELETE_OPS_ONLY':
      return { kind: 'opsOnly', message: error.message };
    default:
      if (error.status === 429) return { kind: 'rateLimited', retryAt: now + (error.retryAfterSec ?? 60) * 1000 };
      if (error.status === 401) return { kind: 'signedOut' };
      return { kind: 'error', message: error.message };
  }
}

/** "4 tries left" line under the C3 error (null when the server sent no count). */
export function attemptsCopy(attemptsRemaining?: number): string | null {
  if (attemptsRemaining === undefined) return null;
  if (attemptsRemaining <= 0) return 'No tries left. Wait a few minutes before trying again.';
  return attemptsRemaining === 1 ? '1 try left.' : `${attemptsRemaining} tries left.`;
}

const IST_OFFSET_MS = 330 * 60_000;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function ist(iso: string) {
  const d = new Date(new Date(iso).getTime() + IST_OFFSET_MS);
  const h24 = d.getUTCHours();
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return {
    wd: WEEKDAYS[d.getUTCDay()],
    day: d.getUTCDate(),
    mon: MONTHS[d.getUTCMonth()],
    year: d.getUTCFullYear(),
    time: `${h12}:${String(d.getUTCMinutes()).padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`
  };
}

/** "Thu, 29 Oct 2026, 4:20 PM" (IST) — C8 lead. Fixed +05:30, independent of device zone/Intl. */
export function formatIstLong(iso: string) {
  const t = ist(iso);
  return `${t.wd}, ${t.day} ${t.mon} ${t.year}, ${t.time}`;
}

/** "29 Oct 2026, 4:20 PM" (IST) — C8 card row. */
export function formatIstDate(iso: string) {
  const t = ist(iso);
  return `${t.day} ${t.mon} ${t.year}, ${t.time}`;
}

/** "Sat, 17 Oct · 4:30 PM" (IST) — P2 rows. */
export function formatIstRow(iso: string) {
  const t = ist(iso);
  return `${t.wd}, ${t.day} ${t.mon} · ${t.time}`;
}

/** Seconds left until `retryAt` (never negative). */
export function secondsLeft(retryAt: number, now = Date.now()) {
  return Math.max(0, Math.ceil((retryAt - now) / 1000));
}

/** "10:48" */
export function mmss(totalSec: number) {
  const sec = Math.max(0, Math.floor(totalSec));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

/** "r•••@gmail.com" for the C5 lead. */
export function maskEmail(email: string | null | undefined) {
  if (!email) return 'your account';
  const [local, domain] = email.split('@');
  if (!domain) return email;
  return `${local.charAt(0)}${'•'.repeat(Math.max(1, Math.min(3, local.length - 1)))}@${domain}`;
}

/** "98765 43210" from "+919876543210" for the C2 lead ("+91 {phone}"). */
export function localPhone(phone: string | null | undefined) {
  const digits = (phone || '').replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
  return digits.length === 10 ? `${digits.slice(0, 5)} ${digits.slice(5)}` : digits;
}
