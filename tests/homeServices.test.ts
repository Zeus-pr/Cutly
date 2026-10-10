import { describe, expect, it } from 'vitest';
import { homeSortChipLabel, sortFamily, sortShops, type HomeSort } from '../utils/homeSort';

const shops = [
  { id: 'a', distanceKm: 3, nextAvailableAt: '2026-10-03T14:00:00.000Z', priceFromPaise: 50000 },
  { id: 'b', distanceKm: 1, nextAvailableAt: '2026-10-03T16:00:00.000Z', priceFromPaise: 20000 },
  { id: 'c', distanceKm: 2, nextAvailableAt: null, priceFromPaise: 35000 }
];

describe('home sort', () => {
  it('keeps sort families mutually exclusive', () => {
    const sorts: HomeSort[] = ['nearest', 'earliest', 'price_asc', 'price_desc'];
    expect(sorts.map(sortFamily)).toEqual(['nearest', 'earliest', 'price', 'price']);
  });

  it('labels price directions for chips', () => {
    expect(homeSortChipLabel('price_asc')).toBe('Low to high');
    expect(homeSortChipLabel('price_desc')).toBe('High to low');
  });

  it('sorts nearest / earliest / price asc / price desc', () => {
    expect(sortShops(shops, 'nearest').map((s) => s.id)).toEqual(['b', 'c', 'a']);
    expect(sortShops(shops, 'earliest').map((s) => s.id)).toEqual(['a', 'b', 'c']);
    expect(sortShops(shops, 'price_asc').map((s) => s.id)).toEqual(['b', 'c', 'a']);
    expect(sortShops(shops, 'price_desc').map((s) => s.id)).toEqual(['a', 'c', 'b']);
  });
});
