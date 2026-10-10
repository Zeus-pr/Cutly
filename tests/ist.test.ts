import { describe, expect, it } from 'vitest';
import { assertDateKeyIST, atIST, dayRangeIST, todayKeyIST } from '../backend/src/ist';

describe('backend IST (CJ-07)', () => {
  it('todayKeyIST uses Kolkata day across UTC midnight', () => {
    // 2026-03-20 23:30 UTC = 2026-03-21 05:00 IST
    expect(todayKeyIST(new Date('2026-03-20T23:30:00.000Z'))).toBe('2026-03-21');
    // 2026-03-20 18:00 UTC = 2026-03-20 23:30 IST — still previous IST day
    expect(todayKeyIST(new Date('2026-03-20T18:00:00.000Z'))).toBe('2026-03-20');
  });

  it('rejects invalid date keys', () => {
    expect(() => assertDateKeyIST('2026-13-40')).toThrow(/valid date/);
    expect(() => assertDateKeyIST('26-03-21')).toThrow(/valid date/);
    expect(assertDateKeyIST('2026-03-21')).toBe('2026-03-21');
  });

  it('builds day range and wall times in +05:30', () => {
    const { start, end } = dayRangeIST('2026-03-21');
    expect(start.toISOString()).toBe('2026-03-20T18:30:00.000Z');
    expect(end.toISOString()).toBe('2026-03-21T18:30:00.000Z');
    expect(atIST('2026-03-21', '10:00:00').toISOString()).toBe('2026-03-21T04:30:00.000Z');
    expect(atIST('2026-03-21', '21:00:00').toISOString()).toBe('2026-03-21T15:30:00.000Z');
  });
});
