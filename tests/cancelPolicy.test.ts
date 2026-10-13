import { describe, expect, it } from 'vitest';
import { cancelPolicy } from '../backend/src/cancelPolicy';

describe('cancel policy (CJ-15)', () => {
  const start = new Date('2026-03-21T15:00:00+05:30');

  it('refunds when 12h or more before start', () => {
    const now = new Date('2026-03-21T02:00:00+05:30'); // 13h before
    const policy = cancelPolicy(start, now);
    expect(policy.canModify).toBe(true);
    expect(policy.refundAdvance).toBe(true);
  });

  it('does not refund inside 12h (including under 2h)', () => {
    const mid = cancelPolicy(start, new Date('2026-03-21T08:00:00+05:30')); // 7h
    expect(mid.refundAdvance).toBe(false);
    expect(mid.canModify).toBe(true);
    const late = cancelPolicy(start, new Date('2026-03-21T14:00:00+05:30')); // 1h
    expect(late.refundAdvance).toBe(false);
    expect(late.canModify).toBe(true);
  });

  it('blocks modify after start', () => {
    const past = cancelPolicy(start, new Date('2026-03-21T15:30:00+05:30'));
    expect(past.canModify).toBe(false);
  });
});
