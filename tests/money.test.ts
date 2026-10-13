import { describe, expect, it } from 'vitest';
import {
  archivedIdempotencyKey,
  bookingIdempotencyKey,
  bindClientIdempotencyKey
} from '../backend/src/money';
import { bookingIntentKey } from '../utils/idempotency';

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
