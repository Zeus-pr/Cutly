import { describe, expect, it } from 'vitest';
import { canMarkNoShow, NO_SHOW_GRACE_MS, noShowAvailableAt } from '../backend/src/grace';

describe('no-show grace', () => {
  it('locks until start + 5 minutes', () => {
    const start = new Date('2026-10-04T06:30:00.000Z');
    expect(noShowAvailableAt(start).getTime()).toBe(start.getTime() + NO_SHOW_GRACE_MS);
    expect(canMarkNoShow(start, new Date(start.getTime() + NO_SHOW_GRACE_MS - 1))).toBe(false);
    expect(canMarkNoShow(start, new Date(start.getTime() + NO_SHOW_GRACE_MS))).toBe(true);
  });
});
