import { describe, expect, it } from 'vitest';
import { normalizeServiceIds } from '../backend/src/servicePackage';

describe('normalizeServiceIds', () => {
  it('prefers serviceIds list and drops dupes', () => {
    expect(normalizeServiceIds({ serviceIds: ['a', 'b', 'a'], serviceId: 'z' })).toEqual(['a', 'b']);
  });
  it('falls back to single serviceId', () => {
    expect(normalizeServiceIds({ serviceId: 'only' })).toEqual(['only']);
  });
});
