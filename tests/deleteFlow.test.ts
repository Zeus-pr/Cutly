import { describe, expect, it } from 'vitest';
import {
  ApiError,
  apiErrorFrom,
  attemptsCopy,
  deleteOutcome,
  formatIstDate,
  formatIstLong,
  formatIstRow,
  localPhone,
  maskEmail,
  mmss,
  pickReauthMethod,
  reauthOutcome,
  secondsLeft
} from '../utils/deleteFlow';

describe('#46 pickReauthMethod', () => {
  it('phone → OTP, Google offered when linked', () => {
    expect(pickReauthMethod({ authMethods: ['phone', 'google'] })).toEqual({ primary: 'otp', alsoGoogle: true });
    expect(pickReauthMethod({ authMethods: ['phone'] })).toEqual({ primary: 'otp', alsoGoogle: false });
  });
  it('Google only → Google; email+password → password (+Google)', () => {
    expect(pickReauthMethod({ authMethods: ['google'] })).toEqual({ primary: 'google', alsoGoogle: false });
    expect(pickReauthMethod({ authMethods: ['password', 'google'] })).toEqual({ primary: 'password', alsoGoogle: true });
  });
  it('falls back to profile flags when authMethods is missing (older API)', () => {
    expect(pickReauthMethod({ phone: null, hasPassword: true })).toEqual({ primary: 'password', alsoGoogle: false });
    expect(pickReauthMethod({ phone: '+919876543210', googleLinked: true })).toEqual({ primary: 'otp', alsoGoogle: true });
    expect(pickReauthMethod({})).toEqual({ primary: null, alsoGoogle: false });
  });
});

describe('#46 API errors → screens', () => {
  const now = 1_000_000;
  it('reads code, attemptsRemaining, Retry-After and bookings', () => {
    const e = apiErrorFrom(401, { error: 'x', code: 'REAUTH_FAILED', attemptsRemaining: 3 });
    expect(e).toBeInstanceOf(ApiError);
    expect(reauthOutcome(e, now)).toEqual({ kind: 'failed', message: 'x', attemptsRemaining: 3 });
    expect(apiErrorFrom(429, { error: 'slow' }, '90').retryAfterSec).toBe(90);
    expect(apiErrorFrom(429, { error: 'slow', code: 'RATE_LIMITED', retryAfterSec: 30 }, '90').retryAfterSec).toBe(30);
    expect(reauthOutcome(apiErrorFrom(429, {}, '10'), now)).toEqual({ kind: 'rateLimited', retryAt: now + 10_000 });
  });
  it('maps every DELETE code in the real backend', () => {
    const d = (status: number, body: object) => deleteOutcome(apiErrorFrom(status, body), now);
    expect(d(401, { error: 'Confirm it’s you first.', code: 'REAUTH_REQUIRED' })).toEqual({ kind: 'reauth', message: 'Confirm it’s you first.' });
    expect(d(409, { error: 'x', code: 'VISIT_IN_PROGRESS' })).toEqual({ kind: 'visit' });
    expect(d(409, { error: 'x', code: 'UPCOMING_BOOKINGS', bookings: [{ id: 'b', bookingCode: 'C', startsAt: 'z' }] })).toMatchObject({
      kind: 'bookings', bookings: [{ id: 'b' }]
    });
    expect(d(409, { error: 'Your bookings changed. Try again.', code: 'BOOKINGS_CHANGED' }).kind).toBe('retry');
    expect(d(409, { error: 'A customer is booking right now.', code: 'PARTNER_DELETE_CONFLICT' }).kind).toBe('retry');
    expect(d(403, { error: 'Ask CutLy support', code: 'PARTNER_DELETE_OPS_ONLY' }).kind).toBe('opsOnly');
    expect(d(429, { error: 'x', code: 'RATE_LIMITED', retryAfterSec: 5 })).toEqual({ kind: 'rateLimited', retryAt: now + 5000 });
    expect(d(401, { error: 'Sign in again.' })).toEqual({ kind: 'signedOut' });
    expect(deleteOutcome(new Error('offline')).kind).toBe('error');
  });
  it('attempts copy', () => {
    expect(attemptsCopy(undefined)).toBeNull();
    expect(attemptsCopy(1)).toBe('1 try left.');
    expect(attemptsCopy(4)).toBe('4 tries left.');
    expect(attemptsCopy(0)).toMatch(/No tries left/);
  });
});

describe('#46 formatting (IST, device-zone independent)', () => {
  it('formats like the spec', () => {
    expect(formatIstLong('2026-10-29T10:50:00.000Z')).toBe('Thu, 29 Oct 2026, 4:20 PM');
    expect(formatIstDate('2026-10-29T10:50:00.000Z')).toBe('29 Oct 2026, 4:20 PM');
    expect(formatIstRow('2026-10-17T11:00:00.000Z')).toBe('Sat, 17 Oct · 4:30 PM');
    expect(formatIstRow('2026-10-18T18:45:00.000Z')).toBe('Mon, 19 Oct · 12:15 AM');
  });
  it('countdown + masks', () => {
    expect(mmss(648)).toBe('10:48');
    expect(mmss(5)).toBe('0:05');
    expect(secondsLeft(10_500, 10_000)).toBe(1);
    expect(secondsLeft(5, 10)).toBe(0);
    expect(maskEmail('riya@gmail.com')).toBe('r•••@gmail.com');
    expect(localPhone('+919876543210')).toBe('98765 43210');
  });
});

describe('#46 P3 PAUSED shop on Partner Home', () => {
  it('a PAUSED shop is not bookable and says how to reopen', async () => {
    const { isPartnerBookableNow, partnerAcceptingCopy } = await import('../utils/partnerAccepting');
    const paused = { status: 'PAUSED' as const, acceptingAppointments: true, acceptingPausedUntil: null };
    expect(isPartnerBookableNow(paused)).toBe(false);
    expect(partnerAcceptingCopy(paused).body).toMatch(/Turn bookings back on/);
    expect(isPartnerBookableNow({ ...paused, status: 'ACTIVE' })).toBe(true);
    expect(isPartnerBookableNow({ acceptingAppointments: true, acceptingPausedUntil: null })).toBe(true);
  });
});
