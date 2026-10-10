import { describe, expect, it } from 'vitest';
import { inferServiceAudience, resolveServiceAudience } from '../backend/src/serviceAudience';
import { sortShops } from '../utils/homeSort';

describe('service audience (menu Men/Women/Kids)', () => {
  it('infers from the service name', () => {
    expect(inferServiceAudience('Kids cut')).toBe('KIDS');
    expect(inferServiceAudience('Baby haircut')).toBe('KIDS');
    expect(inferServiceAudience('Beard trim')).toBe('MEN');
    expect(inferServiceAudience("Men's haircut")).toBe('MEN');
    expect(inferServiceAudience('Bridal makeup')).toBe('WOMEN');
    expect(inferServiceAudience("Women's haircut")).toBe('WOMEN');
    expect(inferServiceAudience('Haircut')).toBe('UNISEX');
  });

  it('prefers an explicit audience', () => {
    expect(resolveServiceAudience('Haircut', 'MEN')).toBe('MEN');
    expect(resolveServiceAudience('Kids cut', undefined)).toBe('KIDS');
    expect(resolveServiceAudience('Haircut', 'nonsense')).toBe('UNISEX');
  });
});

describe('rating sort', () => {
  const base = { distanceKm: 1, nextAvailableAt: null, priceFromPaise: 100 };
  it('puts unrated shops last', () => {
    const out = sortShops(
      [
        { ...base, id: 'a', rating: null },
        { ...base, id: 'b', rating: 4.2 },
        { ...base, id: 'c', rating: 4.8 }
      ],
      'rating_desc'
    );
    expect(out.map((s) => s.id)).toEqual(['c', 'b', 'a']);
  });
});
