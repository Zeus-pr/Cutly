import { describe, expect, it } from 'vitest';
import { jitteredTtlMs } from '../backend/src/rateLimit';

describe('rate limit TTL jitter (SEC-20)', () => {
  it('keeps TTL inside the window plus 0–10% (capped at 60s)', () => {
    const windowMs = 15 * 60_000;
    const samples = Array.from({ length: 50 }, (_, i) => jitteredTtlMs(windowMs, () => i / 50));
    for (const ttl of samples) {
      expect(ttl).toBeGreaterThanOrEqual(windowMs);
      expect(ttl).toBeLessThan(windowMs + 60_000);
    }
    expect(new Set(samples).size).toBeGreaterThan(1);
  });

  it('uses a full extra second of jitter on short windows', () => {
    expect(jitteredTtlMs(1000, () => 0)).toBe(1000);
    expect(jitteredTtlMs(1000, () => 0.999)).toBe(1999);
  });
});
