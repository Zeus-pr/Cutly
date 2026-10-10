import { describe, expect, it } from 'vitest';
import {
  advancePaiseFromTotal,
  archivedIdempotencyKey,
  bookingIdempotencyKey,
  bindClientIdempotencyKey
} from '../backend/src/money';
import { advanceFor } from '../utils/money';
import { bookingIntentKey } from '../utils/idempotency';

describe('advance amount (CJ-02)', () => {
  it('matches client and server formulas', () => {
    for (const total of [0, 100, 333, 35000, 99999]) {
      expect(advanceFor(total)).toBe(advancePaiseFromTotal(total));
    }
  });

  it('uses round (not ceil) so ₹350 → ₹105', () => {
    expect(advancePaiseFromTotal(35000)).toBe(10500);
    expect(advanceFor(35000)).toBe(10500);
    // ceil would have been 10500 too for this case; pick a drift case:
    expect(advancePaiseFromTotal(100)).toBe(30);
    expect(Math.ceil(100 * 0.3)).toBe(30);
    expect(advancePaiseFromTotal(10)).toBe(3);
    expect(Math.ceil(10 * 0.3)).toBe(3);
    // classic drift: 1 paise * 0.3
    expect(Math.round(1 * 0.3)).toBe(0);
    expect(Math.ceil(1 * 0.3)).toBe(1);
    expect(advancePaiseFromTotal(1)).toBe(0);
    expect(advanceFor(1)).toBe(0);
  });
});

describe('booking idempotency (CJ-12 / CJ-13)', () => {
  it('includes service and barber', () => {
    const key = bookingIdempotencyKey({
      userId: 'u1',
      shopId: 's1',
      serviceId: 'svc',
      barberId: 'b1',
      startsAtIso: '2026-10-04T04:30:00.000Z'
    });
    expect(key).toContain('_svc_');
    expect(key).toContain('_b1_');
    expect(key).toContain('u1');
  });

  it('binds client intent to the user', () => {
    const intent = bookingIntentKey({
      shopId: 's1',
      serviceId: 'svc',
      barberId: 'b1',
      startsAt: '2026-10-04T04:30:00.000Z'
    });
    expect(bindClientIdempotencyKey('u1', intent)).toBe(`book_u1_${intent}`);
    expect(bindClientIdempotencyKey('u1', `book_u1_${intent}`)).toBe(`book_u1_${intent}`);
  });

  it('archives intent key per booking id after terminal status', () => {
    expect(archivedIdempotencyKey('bk_abc')).toBe('archived_bk_abc');
  });
});
