import { describe, expect, it } from 'vitest';
import { humanWait } from '../backend/src/rateLimit';

describe('humanWait (#46 429 copy)', () => {
  it('a jittered 15-min window reads 15 min, never 16', () => {
    expect(humanWait(900)).toBe('15 min');
    expect(humanWait(958)).toBe('15 min'); // Tester T46: 958 s used to say "16 min"
    expect(humanWait(959)).toBe('15 min');
  });
  it('seconds, minutes and hours', () => {
    expect(humanWait(45)).toBe('45s');
    expect(humanWait(60)).toBe('1 min');
    expect(humanWait(180)).toBe('3 min');
    expect(humanWait(3600)).toBe('1 hr');
    expect(humanWait(3660)).toBe('1 hr');
  });
});
