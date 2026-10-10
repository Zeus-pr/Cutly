import { describe, expect, it } from 'vitest';
import { assertWalkInDuration } from '../backend/src/walkins';
import { isAtShopCapacity } from '../backend/src/staff';

const w = (start: string, end: string) => ({
  start: new Date(`2026-03-21T${start}:00+05:30`),
  end: new Date(`2026-03-21T${end}:00+05:30`)
});

describe('walk-in helpers (CJ-23)', () => {
  it('allows 15/30/45/60 only', () => {
    expect(assertWalkInDuration(30)).toBe(30);
    expect(() => assertWalkInDuration(20)).toThrow(/15, 30, 45, or 60/);
  });

  it('counts walk-ins toward shop capacity like bookings', () => {
    const busy = [w('10:00', '10:30'), w('10:00', '10:45')];
    expect(isAtShopCapacity(w('10:00', '10:30'), busy, 2)).toBe(true);
    expect(isAtShopCapacity(w('10:00', '10:30'), busy, 3)).toBe(false);
  });
});
