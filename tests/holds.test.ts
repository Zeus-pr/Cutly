import { HOLD_MINUTES, formatHoldCountdown, holdSecondsLeft, isHoldAlive } from '../backend/src/holds';
import { describe, expect, it } from 'vitest';

describe('booking hold (CJ-03)', () => {
  it('uses an 8-minute TTL', () => {
    expect(HOLD_MINUTES).toBe(8);
  });

  it('treats expiry boundary as dead', () => {
    const now = new Date('2026-03-21T12:00:00.000Z');
    const alive = new Date('2026-03-21T12:00:01.000Z');
    const dead = new Date('2026-03-21T12:00:00.000Z');
    expect(isHoldAlive(alive, now)).toBe(true);
    expect(isHoldAlive(dead, now)).toBe(false);
  });

  it('formats countdown mm:ss', () => {
    const expires = new Date('2026-03-21T12:08:00.000Z');
    const now = new Date('2026-03-21T12:00:00.000Z');
    expect(holdSecondsLeft(expires, now)).toBe(8 * 60);
    expect(formatHoldCountdown(125)).toBe('2:05');
    expect(formatHoldCountdown(0)).toBe('0:00');
  });
});
