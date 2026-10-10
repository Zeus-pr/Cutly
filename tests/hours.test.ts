import { describe, expect, it } from 'vitest';
import { atIST } from '../backend/src/ist';
import {
  formatClosesLabel,
  isWithinWindow,
  normalizeHms,
  openStatusFromHoursRow,
  weekdayIST
} from '../backend/src/hours';

describe('shop hours (CJ-09)', () => {
  it('maps IST calendar days to JS weekday (0=Sun)', () => {
    // 2026-03-21 is Saturday in IST
    expect(weekdayIST('2026-03-21')).toBe(6);
    // 2026-03-22 is Sunday
    expect(weekdayIST('2026-03-22')).toBe(0);
    // 2026-03-23 is Monday
    expect(weekdayIST('2026-03-23')).toBe(1);
  });

  it('normalizes open/close strings to HH:mm:ss', () => {
    expect(normalizeHms('10:00')).toBe('10:00:00');
    expect(normalizeHms('9:30')).toBe('09:30:00');
    expect(normalizeHms('21:00:00')).toBe('21:00:00');
    expect(() => normalizeHms('25:00')).toThrow(/Invalid/);
  });

  it('rejects visits outside the open window', () => {
    const open = { start: atIST('2026-03-21', '10:00:00'), end: atIST('2026-03-21', '18:00:00') };
    const okStart = atIST('2026-03-21', '17:00:00');
    const okEnd = atIST('2026-03-21', '17:30:00');
    expect(isWithinWindow(okStart, okEnd, open)).toBe(true);
    const lateStart = atIST('2026-03-21', '17:45:00');
    const lateEnd = atIST('2026-03-21', '18:15:00');
    expect(isWithinWindow(lateStart, lateEnd, open)).toBe(false);
    const early = atIST('2026-03-21', '09:30:00');
    expect(isWithinWindow(early, atIST('2026-03-21', '10:00:00'), open)).toBe(false);
  });

  it('formats closes label for cards', () => {
    expect(formatClosesLabel('21:00')).toBe('9:00 PM');
    expect(formatClosesLabel('18:30')).toBe('6:30 PM');
  });

  it('builds open/closed chip from hours (CJ-10)', () => {
    const dateKey = '2026-03-21';
    const row = { opensAt: '10:00', closesAt: '21:00' };
    const during = atIST(dateKey, '14:00:00');
    const before = atIST(dateKey, '09:00:00');
    const after = atIST(dateKey, '21:30:00');
    expect(openStatusFromHoursRow(dateKey, row, during)).toMatchObject({
      isOpen: true,
      hoursChip: 'Open · Closes 9:00 PM',
      hoursDetail: 'Closes at 9:00 PM'
    });
    expect(openStatusFromHoursRow(dateKey, row, before)).toMatchObject({
      isOpen: false,
      hoursChip: 'Closed · Opens 10:00 AM'
    });
    expect(openStatusFromHoursRow(dateKey, row, after).isOpen).toBe(false);
    expect(openStatusFromHoursRow(dateKey, null, during)).toMatchObject({
      isOpen: false,
      hoursChip: 'Closed'
    });
  });
});
