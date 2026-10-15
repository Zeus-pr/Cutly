import { describe, expect, it } from 'vitest';
import { ApiError } from '../utils/deleteFlow';
import {
  EXPIRED_COPY,
  RESTART_COPY,
  SEND_FAILED_COPY,
  codeOutcome,
  nudgeVisible,
  resendCaption,
  resumablePending,
  showResendHint,
  wrongCodeCopy
} from '../utils/emailVerifyFlow';

const err = (status: number, code?: string, extra: Partial<ConstructorParameters<typeof ApiError>[0]> = {}) =>
  new ApiError({ status, message: 'x', code, ...extra });

describe('T4 code screen outcomes (spec §5)', () => {
  it('401 CODE_INVALID → 04 copy with tries left (singular at 1)', () => {
    expect(codeOutcome(err(401, 'CODE_INVALID', { attemptsRemaining: 3 }))).toEqual({ kind: 'wrong', message: "That code isn't right. 3 tries left." });
    expect(wrongCodeCopy(1)).toBe("That code isn't right. 1 try left.");
  });
  it('410 CODE_EXPIRED → 05; SIGNUP_EXPIRED → back to 02', () => {
    expect(codeOutcome(err(410, 'CODE_EXPIRED'))).toEqual({ kind: 'expired', message: EXPIRED_COPY });
    expect(codeOutcome(err(410, 'SIGNUP_EXPIRED'))).toEqual({ kind: 'restart', message: RESTART_COPY });
  });
  it('429 → countdown with retryAt; 409 taken; 503; a plain 401 signs out', () => {
    expect(codeOutcome(err(429, 'RATE_LIMITED', { retryAfterSec: 30 }), 1000)).toEqual({ kind: 'rateLimited', retryAt: 31_000 });
    expect(codeOutcome(new ApiError({ status: 409, code: 'EMAIL_TAKEN', message: "This email can't be used. Try another one." })).kind).toBe('taken');
    expect(codeOutcome(err(503, 'EMAIL_UNAVAILABLE'))).toEqual({ kind: 'error', message: SEND_FAILED_COPY });
    expect(codeOutcome(err(401))).toEqual({ kind: 'signedOut' });
    expect(codeOutcome(new Error('offline'))).toEqual({ kind: 'error', message: 'offline' });
  });
});

describe('T4 small UI rules', () => {
  it('resend caption counts down as m:ss', () => {
    expect(resendCaption(42)).toBe('Resend code in 0:42');
    expect(resendCaption(60)).toBe('Resend code in 1:00');
    expect(resendCaption(-3)).toBe('Resend code in 0:00');
  });
  it('hint after 2 resends', () => {
    expect(showResendHint(1)).toBe(false);
    expect(showResendHint(2)).toBe(true);
  });
  it('verify nudge: only for an unverified email, hidden while snoozed', () => {
    expect(nudgeVisible({ email: 'a@x.com', emailVerified: false, snoozedUntil: null }, 0)).toBe(true);
    expect(nudgeVisible({ email: 'a@x.com', emailVerified: true, snoozedUntil: null }, 0)).toBe(false);
    expect(nudgeVisible({ email: null, emailVerified: false, snoozedUntil: null }, 0)).toBe(false);
    expect(nudgeVisible({ email: 'a@x.com', emailVerified: false, snoozedUntil: 100 }, 50)).toBe(false);
    expect(nudgeVisible({ email: 'a@x.com', emailVerified: false, snoozedUntil: 100 }, 100)).toBe(true);
  });
  it('a saved pendingId resumes for 30 min only', () => {
    const raw = JSON.stringify({ pendingId: 'p1', maskedEmail: 'a***@x.com', email: 'a@x.com', savedAt: 0 });
    expect(resumablePending(raw, 29 * 60_000)?.pendingId).toBe('p1');
    expect(resumablePending(raw, 30 * 60_000)).toBeNull();
    expect(resumablePending('nope', 0)).toBeNull();
    expect(resumablePending(null, 0)).toBeNull();
  });
});
