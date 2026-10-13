import { describe, expect, it } from 'vitest';
import { ageInYears, assertDateOfBirth } from '../utils/dateOfBirth';

describe('date of birth', () => {
  const now = new Date('2026-10-12T08:00:00.000Z');

  it('counts a birthday that has not happened yet as a year younger', () => {
    expect(ageInYears('2013-10-13', now)).toBe(12);
    expect(ageInYears('2013-10-12', now)).toBe(13);
  });

  it('rejects under 13', () => {
    expect(() => assertDateOfBirth('2013-10-13', now)).toThrow(/13 or older/);
    expect(assertDateOfBirth('2013-10-12', now)).toBe('2013-10-12');
  });
});
