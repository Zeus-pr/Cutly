import { describe, expect, it } from 'vitest';
import {
  assertTransition,
  nextFloorActions,
  nextShopRequestActions
} from '../backend/src/bookingState';

describe('booking state machine', () => {
  it('routes payment to awaiting shop (not confirmed)', () => {
    expect(() => assertTransition('PAYMENT_PENDING', 'AWAITING_SHOP')).not.toThrow();
    expect(() => assertTransition('PAYMENT_PENDING', 'CONFIRMED')).toThrow();
  });

  it('allows shop accept / reject', () => {
    expect(() => assertTransition('AWAITING_SHOP', 'CONFIRMED')).not.toThrow();
    expect(() => assertTransition('AWAITING_SHOP', 'REJECTED')).not.toThrow();
    expect(nextShopRequestActions('AWAITING_SHOP').map((a) => a.to)).toEqual(['CONFIRMED', 'REJECTED']);
  });

  it('allows missed awaiting shop → expired', () => {
    expect(() => assertTransition('AWAITING_SHOP', 'EXPIRED')).not.toThrow();
  });

  it('allows failed → awaiting shop after paid-dismiss race', () => {
    expect(() => assertTransition('FAILED', 'AWAITING_SHOP')).not.toThrow();
  });

  it('reschedule returns to awaiting shop', () => {
    expect(() => assertTransition('CONFIRMED', 'AWAITING_SHOP')).not.toThrow();
  });

  it('blocks skipping a hold', () => {
    expect(() => assertTransition('HELD', 'CONFIRMED')).toThrow();
  });
});

describe('floor status buttons (CJ-17)', () => {
  it('exposes Start (code) / No-show from confirmed (no separate Arrived)', () => {
    expect(nextFloorActions('CONFIRMED').map((a) => a.to)).toEqual(['IN_SERVICE', 'NO_SHOW']);
    expect(nextFloorActions('CONFIRMED').map((a) => a.label)).toEqual(['Start (code)', 'No-show']);
  });

  it('moves arrived → in service → done', () => {
    expect(() => assertTransition('ARRIVED', 'IN_SERVICE')).not.toThrow();
    expect(() => assertTransition('IN_SERVICE', 'COMPLETED')).not.toThrow();
    expect(nextFloorActions('ARRIVED').map((a) => a.to)).toEqual(['IN_SERVICE', 'NO_SHOW']);
    expect(nextFloorActions('IN_SERVICE')).toEqual([{ to: 'COMPLETED', label: 'Done' }]);
  });

  it('allows no-show from arrived', () => {
    expect(() => assertTransition('ARRIVED', 'NO_SHOW')).not.toThrow();
  });
});
