import { describe, expect, it } from 'vitest';
import { countOverlapping, isAtShopCapacity } from '../backend/src/staff';

const w = (start: string, end: string) => ({
  start: new Date(`2026-03-21T${start}:00+05:30`),
  end: new Date(`2026-03-21T${end}:00+05:30`)
});

describe('shop capacity (CJ-21)', () => {
  it('counts overlapping visits', () => {
    const busy = [w('10:00', '10:30'), w('10:15', '10:45'), w('11:00', '11:30')];
    expect(countOverlapping(w('10:00', '10:30'), busy)).toBe(2);
    expect(countOverlapping(w('11:00', '11:30'), busy)).toBe(1);
  });

  it('blocks when capacity is full', () => {
    const busy = [w('10:00', '10:30'), w('10:00', '10:30')];
    expect(isAtShopCapacity(w('10:00', '10:30'), busy, 2)).toBe(true);
    expect(isAtShopCapacity(w('10:00', '10:30'), busy, 3)).toBe(false);
    expect(isAtShopCapacity(w('10:00', '10:30'), [], 0)).toBe(true);
  });

  it('CJ-22: capacity 0 always blocks new visits', () => {
    expect(isAtShopCapacity(w('12:00', '12:30'), [], 0)).toBe(true);
  });
});
