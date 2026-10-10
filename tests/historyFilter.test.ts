import { describe, expect, it } from 'vitest';
import { historyItemMatchesFilter } from '../utils/historyFilter';

describe('historyFilter', () => {
  it('maps buckets', () => {
    expect(historyItemMatchesFilter('CONFIRMED', 'accepted')).toBe(true);
    expect(historyItemMatchesFilter('COMPLETED', 'accepted')).toBe(true);
    expect(historyItemMatchesFilter('EXPIRED', 'missed')).toBe(true);
    expect(historyItemMatchesFilter('NO_SHOW', 'missed')).toBe(true);
    expect(historyItemMatchesFilter('REJECTED', 'rejected')).toBe(true);
    expect(historyItemMatchesFilter('CANCELLED', 'cancelled')).toBe(true);
    expect(historyItemMatchesFilter('REJECTED', 'accepted')).toBe(false);
    expect(historyItemMatchesFilter('EXPIRED', 'all')).toBe(true);
  });
});
