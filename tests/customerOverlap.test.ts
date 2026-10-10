import { describe, expect, it } from 'vitest';
import {
  CUSTOMER_OVERLAP_MESSAGE,
  customerTicketBlocksOverlap,
  rangesOverlap
} from '../backend/src/customerOverlap';

describe('customer ticket overlap (CJ-16)', () => {
  it('detects overlapping half-open ranges', () => {
    const a0 = new Date('2026-10-04T10:00:00.000Z');
    const a1 = new Date('2026-10-04T10:30:00.000Z');
    const b0 = new Date('2026-10-04T10:15:00.000Z');
    const b1 = new Date('2026-10-04T10:45:00.000Z');
    const c0 = new Date('2026-10-04T10:30:00.000Z');
    const c1 = new Date('2026-10-04T11:00:00.000Z');
    expect(rangesOverlap(a0, a1, b0, b1)).toBe(true);
    expect(rangesOverlap(a0, a1, c0, c1)).toBe(false);
  });

  it('blocks active tickets but not completed / free statuses', () => {
    expect(customerTicketBlocksOverlap('AWAITING_SHOP')).toBe(true);
    expect(customerTicketBlocksOverlap('CONFIRMED')).toBe(true);
    expect(customerTicketBlocksOverlap('PAYMENT_PENDING')).toBe(true);
    expect(customerTicketBlocksOverlap('ARRIVED')).toBe(true);
    expect(customerTicketBlocksOverlap('IN_SERVICE')).toBe(true);
    expect(customerTicketBlocksOverlap('COMPLETED')).toBe(false);
    expect(customerTicketBlocksOverlap('CANCELLED')).toBe(false);
    expect(customerTicketBlocksOverlap('REJECTED')).toBe(false);
    expect(customerTicketBlocksOverlap('NO_SHOW')).toBe(false);
    expect(customerTicketBlocksOverlap('EXPIRED')).toBe(false);
    expect(customerTicketBlocksOverlap('FAILED')).toBe(false);
  });

  it('exposes a friendly message', () => {
    expect(CUSTOMER_OVERLAP_MESSAGE).toMatch(/overlap/i);
  });
});
