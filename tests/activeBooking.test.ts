import { describe, expect, it } from 'vitest';
import { BOOKING_FREE_STATUSES, bookingOccupiesChair } from '../backend/src/activeBooking';

describe('chair occupancy after reject', () => {
  it('frees the slot for REJECTED, NO_SHOW, and COMPLETED', () => {
    expect(bookingOccupiesChair('REJECTED')).toBe(false);
    expect(bookingOccupiesChair('NO_SHOW')).toBe(false);
    expect(bookingOccupiesChair('COMPLETED')).toBe(false);
    expect(BOOKING_FREE_STATUSES).toEqual(
      expect.arrayContaining(['CANCELLED', 'EXPIRED', 'FAILED', 'NO_SHOW', 'REJECTED'])
    );
    expect(BOOKING_FREE_STATUSES).not.toContain('COMPLETED');
  });

  it('keeps awaiting / confirmed occupying the chair', () => {
    expect(bookingOccupiesChair('AWAITING_SHOP')).toBe(true);
    expect(bookingOccupiesChair('CONFIRMED')).toBe(true);
    expect(bookingOccupiesChair('PAYMENT_PENDING')).toBe(true);
  });
});
