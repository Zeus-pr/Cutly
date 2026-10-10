import { describe, expect, it } from 'vitest';
import { normalizeHms } from '../backend/src/hours';
import {
  defaultHourDrafts,
  draftsFromApiDays,
  draftsToApiDays
} from '../utils/hoursDraft';

describe('PS-01/02 partner hours drafts', () => {
  it('defaults to 10:00–21:00 all weekdays open', () => {
    const d = defaultHourDrafts();
    expect(d).toHaveLength(7);
    expect(d.every((row) => row.open && row.opensAt === '10:00' && row.closesAt === '21:00')).toBe(true);
  });

  it('omits closed days when serializing (closed = no row)', () => {
    const d = defaultHourDrafts();
    d[0]!.open = false; // Sunday closed
    d[6]!.open = false; // Saturday closed
    const api = draftsToApiDays(d);
    expect(api.map((x) => x.weekday)).toEqual([1, 2, 3, 4, 5]);
  });

  it('restores closed days from API omit', () => {
    const drafts = draftsFromApiDays([
      { weekday: 1, opensAt: '09:00', closesAt: '18:00' },
      { weekday: 2, opensAt: '09:00', closesAt: '18:00' }
    ]);
    expect(drafts[0]?.open).toBe(false);
    expect(drafts[1]?.open).toBe(true);
    expect(drafts[1]?.opensAt).toBe('09:00');
  });

  it('rejects overnight via normalize + compare', () => {
    const opens = normalizeHms('22:00');
    const closes = normalizeHms('06:00');
    const openMin = Number(opens.slice(0, 2)) * 60 + Number(opens.slice(3, 5));
    const closeMin = Number(closes.slice(0, 2)) * 60 + Number(closes.slice(3, 5));
    expect(closeMin <= openMin).toBe(true);
  });
});
