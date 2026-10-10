import { describe, expect, it } from 'vitest';
import {
  addDaysKeyIST,
  bookingDayOptions,
  formatDateLong,
  formatDateTime,
  formatDayHeading,
  formatTime,
  isFutureStart,
  todayKeyIST
} from '../utils/time';

describe('IST booking dates (CJ-05)', () => {
  it('formats today as YYYY-MM-DD in Asia/Kolkata', () => {
    // 2026-03-20 23:30 UTC = 2026-03-21 05:00 IST
    const key = todayKeyIST(new Date('2026-03-20T23:30:00.000Z'));
    expect(key).toBe('2026-03-21');
  });

  it('adds calendar days without UTC drift', () => {
    expect(addDaysKeyIST('2026-03-21', 1)).toBe('2026-03-22');
    expect(addDaysKeyIST('2026-03-31', 1)).toBe('2026-04-01');
  });

  it('builds a 7-day booking strip starting today IST', () => {
    const days = bookingDayOptions(7, new Date('2026-03-20T23:30:00.000Z'));
    expect(days).toHaveLength(7);
    expect(days[0]?.key).toBe('2026-03-21');
    expect(days[0]?.isToday).toBe(true);
    expect(days[6]?.key).toBe('2026-03-27');
  });

  it('labels today and tomorrow', () => {
    const now = new Date('2026-03-20T23:30:00.000Z');
    const today = todayKeyIST(now);
    expect(formatDayHeading(today, now)).toMatch(/^Today · /);
    expect(formatDayHeading(addDaysKeyIST(today, 1), now)).toMatch(/^Tomorrow · /);
  });

  it('hides past slot starts on the client', () => {
    const now = new Date('2026-03-21T10:00:00.000Z');
    expect(isFutureStart('2026-03-21T09:00:00.000Z', now)).toBe(false);
    expect(isFutureStart('2026-03-21T10:00:01.000Z', now)).toBe(true);
  });

  it('formats display times in Asia/Kolkata', () => {
    // 2026-03-21T04:30:00Z = 10:00 IST
    const iso = '2026-03-21T04:30:00.000Z';
    expect(formatTime(iso)).toMatch(/10:00/);
    expect(formatDateLong(iso)).toMatch(/21/);
    expect(formatDateTime(iso)).toMatch(/10:00/);
  });
});


