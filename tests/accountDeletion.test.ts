import { afterEach, describe, expect, it } from 'vitest';
import {
  FORMER_CUSTOMER,
  blocksPartnerDelete,
  deletionDeadline,
  deletionFlags,
  deletionState,
  displayCustomerName,
  displayCustomerPhone,
  displayReviewerName,
  graceDays,
  phoneHmac,
  purgeCutoff,
  shopStatusData,
  toE164
} from '../backend/src/accountDeletion';
import { AppError, clientErrorBody, toClientError } from '../backend/src/httpError';

const DAY = 24 * 60 * 60 * 1000;
const envKeys = [
  'ACCOUNT_DELETION_GRACE_DAYS',
  'DELETION_FORMER_CUSTOMER_DURING_GRACE',
  'PARTNER_SELF_DELETE_ENABLED',
  'PARTNER_RESTORE_SHOP_STATUS'
];
afterEach(() => {
  for (const key of envKeys) delete process.env[key];
});

describe('grace window (T3-Q5)', () => {
  const requested = new Date('2026-10-01T18:30:00.000Z');

  it('defaults to 14 days and is configurable', () => {
    expect(graceDays()).toBe(14);
    process.env.ACCOUNT_DELETION_GRACE_DAYS = '30';
    expect(graceDays()).toBe(30);
    process.env.ACCOUNT_DELETION_GRACE_DAYS = 'nope';
    expect(graceDays()).toBe(14);
  });

  it('deadline is request + 14d in UTC instants', () => {
    expect(deletionDeadline(requested).toISOString()).toBe('2026-10-15T18:30:00.000Z');
  });

  it('restores at 14d - 1s, fails at 14d + 1s', () => {
    const row = { deletionRequestedAt: requested, deletedAt: null };
    expect(deletionState(row, new Date(requested.getTime() + 14 * DAY - 1000))).toBe('pending');
    expect(deletionState(row, new Date(requested.getTime() + 14 * DAY + 1000))).toBe('expired');
  });

  it('active and purged states', () => {
    expect(deletionState({ deletionRequestedAt: null, deletedAt: null })).toBe('active');
    expect(deletionState({ deletionRequestedAt: requested, deletedAt: new Date() })).toBe('purged');
  });

  it('purge cutoff is now - grace', () => {
    const now = new Date('2026-10-15T00:00:00.000Z');
    expect(purgeCutoff(now).toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });
});

describe('"Former customer" display (T3-Q3)', () => {
  const pending = { name: 'Asha Rao', phone: '+919800000001', deletionRequestedAt: new Date(), deletedAt: null };
  const live = { name: 'Asha Rao', phone: '+919800000001', deletionRequestedAt: null, deletedAt: null };

  it('hides name and phone during grace by default', () => {
    expect(displayCustomerName(pending)).toBe(FORMER_CUSTOMER);
    expect(displayReviewerName(pending)).toBe(FORMER_CUSTOMER);
    expect(displayCustomerPhone(pending)).toBeNull();
  });

  it('live users keep the existing fallbacks', () => {
    expect(displayCustomerName(live)).toBe('Asha Rao');
    expect(displayReviewerName(live)).toBe('Asha');
    expect(displayCustomerName({ name: null })).toBe('Customer');
    expect(displayReviewerName({ name: null })).toBe('Guest');
    expect(displayCustomerPhone(live)).toBe('+919800000001');
  });

  it('flag off shows the real name during grace but never after purge', () => {
    process.env.DELETION_FORMER_CUSTOMER_DURING_GRACE = '0';
    expect(displayCustomerName(pending)).toBe('Asha Rao');
    expect(displayCustomerName({ ...pending, deletedAt: new Date(), name: null })).toBe(FORMER_CUSTOMER);
  });
});

describe('product flags', () => {
  it('defaults: self-delete on, restore to PAUSED', () => {
    expect(deletionFlags()).toEqual({
      formerCustomerDuringGrace: true,
      partnerSelfDelete: true,
      partnerRestoreShopStatus: 'PAUSED'
    });
  });

  it('restore never reopens as ACTIVE', () => {
    process.env.PARTNER_RESTORE_SHOP_STATUS = 'ACTIVE';
    expect(deletionFlags().partnerRestoreShopStatus).toBe('PAUSED');
    process.env.PARTNER_RESTORE_SHOP_STATUS = 'closed';
    expect(deletionFlags().partnerRestoreShopStatus).toBe('CLOSED');
  });

  it('self-delete can be switched to ops-only', () => {
    process.env.PARTNER_SELF_DELETE_ENABLED = 'false';
    expect(deletionFlags().partnerSelfDelete).toBe(false);
  });
});

describe('phone hash (DeletedIdentity)', () => {
  const key = 'test-key-0123456789abcdef';

  it('normalises to E.164', () => {
    expect(toE164('+91 98000 00001')).toBe('+919800000001');
    expect(toE164('9800000001')).toBe('+919800000001');
    expect(toE164('09800000001')).toBe('+919800000001');
    expect(toE164('919800000001')).toBe('+919800000001');
    expect(toE164('12345')).toBeNull();
  });

  it('same phone in any format → same HMAC; key matters', () => {
    const a = phoneHmac('+919800000001', key);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(phoneHmac('98000 00001', key)).toBe(a);
    expect(phoneHmac('+919800000001', 'another-key-0123456789')).not.toBe(a);
  });

  it('fails closed without PHONE_HASH_KEY', () => {
    const prev = process.env.PHONE_HASH_KEY;
    delete process.env.PHONE_HASH_KEY;
    expect(() => phoneHmac('+919800000001')).toThrow(/PHONE_HASH_KEY/);
    if (prev) process.env.PHONE_HASH_KEY = prev;
  });
});

describe('partner delete blockers (T3-Q13)', () => {
  const now = new Date('2026-10-15T10:00:00.000Z');
  const later = new Date('2026-10-15T11:00:00.000Z');
  const earlier = new Date('2026-10-15T09:00:00.000Z');

  it('future live bookings block', () => {
    for (const status of ['HELD', 'PAYMENT_PENDING', 'AWAITING_SHOP', 'CONFIRMED']) {
      expect(blocksPartnerDelete({ status, endsAt: later }, now)).toBe(true);
      expect(blocksPartnerDelete({ status, endsAt: earlier }, now)).toBe(false);
    }
  });

  it('a visit in the chair blocks even after its slot', () => {
    expect(blocksPartnerDelete({ status: 'IN_SERVICE', endsAt: earlier }, now)).toBe(true);
    expect(blocksPartnerDelete({ status: 'ARRIVED', endsAt: earlier }, now)).toBe(true);
  });

  it('terminal statuses never block', () => {
    for (const status of ['COMPLETED', 'CANCELLED', 'REJECTED', 'NO_SHOW', 'EXPIRED', 'FAILED']) {
      expect(blocksPartnerDelete({ status, endsAt: later }, now)).toBe(false);
    }
  });
});

describe('shop status sync', () => {
  it('isActive mirrors status', () => {
    expect(shopStatusData('ACTIVE')).toEqual({ status: 'ACTIVE', isActive: true });
    expect(shopStatusData('PAUSED')).toEqual({ status: 'PAUSED', isActive: false });
    expect(shopStatusData('CLOSED')).toEqual({ status: 'CLOSED', isActive: false });
  });
});

describe('AppError codes', () => {
  it('carries code and details into the response body', () => {
    const err = toClientError(
      new AppError('Finish or cancel your upcoming bookings first.', 409, 'UPCOMING_BOOKINGS', { bookings: [{ id: 'b1' }] })
    );
    expect(err.status).toBe(409);
    expect(clientErrorBody(err)).toEqual({
      bookings: [{ id: 'b1' }],
      error: 'Finish or cancel your upcoming bookings first.',
      code: 'UPCOMING_BOOKINGS'
    });
  });

  it('plain errors keep the old body shape', () => {
    expect(clientErrorBody(toClientError(new Error('Sign in again.')))).toEqual({ error: 'Sign in again.' });
  });
});
