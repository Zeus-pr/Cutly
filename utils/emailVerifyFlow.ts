/**
 * T4 (#9): pure helpers for the email-code screens (03–06, 11). Unit-tested in tests/emailVerifyFlow.test.ts.
 */
import { ApiError } from './deleteFlow';

export type CodeSent = { maskedEmail: string; resendInSec: number; expiresInSec: number };
export type SignupStarted = CodeSent & { pendingId: string };

export type CodeOutcome =
  | { kind: 'wrong'; message: string }
  | { kind: 'expired'; message: string }
  | { kind: 'restart'; message: string }
  | { kind: 'taken'; message: string }
  | { kind: 'rateLimited'; retryAt: number }
  | { kind: 'signedOut' }
  | { kind: 'error'; message: string };

/** V10: show masked addresses with bullets ("r•••@gmail.com"); the API masks with '*'. */
export function displayMasked(masked: string) {
  return masked.replace(/\*/g, '•');
}

/** V18 / V15: "+91 98765 43210" from "+919876543210" (other shapes are returned as-is). */
export function displayPhone(phone: string | null | undefined) {
  const raw = (phone || '').trim();
  const d = raw.replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) return `+91 ${d.slice(2, 7)} ${d.slice(7)}`;
  return raw;
}

/** V5: 10-digit local number from "+91 98765 43210", "9876543210" or "919876543210". */
export function localDigits(value: string) {
  const d = value.replace(/\D/g, '');
  return (d.length > 10 && d.startsWith('91') ? d.slice(2) : d).slice(0, 10);
}

/** F3: the rate-limit screen ends only once its deadline has really passed. */
export function rateLimitOver(limitedUntil: number | null, now = Date.now()) {
  return limitedUntil !== null && limitedUntil <= now;
}

/** V9 / V12: the expiry caption shows only on plain 03 (no error, not expired, timer running). */
export function showExpiryCaption(input: { error: string; expired: boolean; resendLeft: number }) {
  return !input.error && !input.expired && input.resendLeft > 0;
}

export const EXPIRED_COPY = 'This code has expired. Send a new one to continue.';
export const TAKEN_COPY = "This email can't be used. Try another one.";
export const RESTART_COPY = 'Your code request expired. Send a new one.';
export const SEND_FAILED_COPY = "We couldn't send the code. Try again in a minute.";
export const RESEND_HINT = "Didn't get it? Check the address is right, or try another email.";

export function wrongCodeCopy(attemptsRemaining?: number) {
  if (attemptsRemaining === undefined) return "That code isn't right.";
  return `That code isn't right. ${attemptsRemaining} ${attemptsRemaining === 1 ? 'try' : 'tries'} left.`;
}

/** Maps a verify / resend failure to the screen state (spec §5 table). */
export function codeOutcome(error: unknown, now = Date.now()): CodeOutcome {
  if (!(error instanceof ApiError)) {
    return { kind: 'error', message: error instanceof Error ? error.message : 'Something went wrong. Try again.' };
  }
  if (error.status === 429) return { kind: 'rateLimited', retryAt: now + (error.retryAfterSec ?? 60) * 1000 };
  if (error.code === 'CODE_INVALID') return { kind: 'wrong', message: wrongCodeCopy(error.attemptsRemaining) };
  if (error.code === 'CODE_EXPIRED') return { kind: 'expired', message: EXPIRED_COPY };
  if (error.code === 'SIGNUP_EXPIRED' || error.code === 'CHANGE_EXPIRED') return { kind: 'restart', message: RESTART_COPY };
  if (error.code === 'EMAIL_TAKEN' || error.code === 'EMAIL_CLAIM_REVIEW') return { kind: 'taken', message: error.message || TAKEN_COPY };
  if (error.code === 'EMAIL_UNAVAILABLE') return { kind: 'error', message: SEND_FAILED_COPY };
  if (error.status === 401) return { kind: 'signedOut' };
  return { kind: 'error', message: error.message };
}

/** Spec 06: the hint shows after 2 resends. */
export function showResendHint(resends: number) {
  return resends >= 2;
}

/** Spec 03: "Resend code in 0:42". */
export function resendCaption(secondsLeft: number) {
  const s = Math.max(0, Math.ceil(secondsLeft));
  return `Resend code in ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Spec 08: "Verify your email" banner is dismissed for 7 days. */
export const VERIFY_NUDGE_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

export function nudgeVisible(input: { email: string | null; emailVerified: boolean; snoozedUntil: number | null }, now = Date.now()) {
  if (!input.email || input.emailVerified) return false;
  return !input.snoozedUntil || input.snoozedUntil <= now;
}

/** Spec 03: a pendingId kept for 30 min so the screen can resume after the app is killed. */
export type SavedPending = { pendingId: string; maskedEmail: string; email: string; savedAt: number };
export const PENDING_RESUME_MS = 30 * 60 * 1000;

export function resumablePending(raw: string | null, now = Date.now()): SavedPending | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<SavedPending>;
    if (typeof v.pendingId !== 'string' || typeof v.savedAt !== 'number' || typeof v.maskedEmail !== 'string') return null;
    return now - v.savedAt < PENDING_RESUME_MS ? (v as SavedPending) : null;
  } catch {
    return null;
  }
}
