/** Mutually exclusive list order (Zomato/Swiggy-style — one sort at a time). */
export type HomeSort = 'nearest' | 'earliest' | 'price_asc' | 'price_desc' | 'rating_desc';

export type HomeSortFamily = 'nearest' | 'earliest' | 'price' | 'rating';

export function sortFamily(sort: HomeSort): HomeSortFamily {
  if (sort === 'price_asc' || sort === 'price_desc') return 'price';
  if (sort === 'rating_desc') return 'rating';
  return sort;
}

export type HomeSortOption = {
  id: HomeSort;
  family: HomeSortFamily;
  label: string;
  hint: string;
};

/** Full sort menu — same shape as food-delivery “Sort by” sheets. */
export const HOME_SORT_OPTIONS: HomeSortOption[] = [
  { id: 'nearest', family: 'nearest', label: 'Nearest', hint: 'Closest shops first' },
  { id: 'earliest', family: 'earliest', label: 'Earliest', hint: 'Soonest next slot first' },
  { id: 'price_asc', family: 'price', label: 'Price: Low to high', hint: 'Cheapest starting price first' },
  { id: 'price_desc', family: 'price', label: 'Price: High to low', hint: 'Highest starting price first' },
  { id: 'rating_desc', family: 'rating', label: 'Rating: High to low', hint: 'Best rated shops first' }
];

/** Compact chip label for the active sort. */
export function homeSortChipLabel(sort: HomeSort): string {
  switch (sort) {
    case 'nearest':
      return 'Nearest';
    case 'earliest':
      return 'Earliest';
    case 'price_asc':
      return 'Low to high';
    case 'price_desc':
      return 'High to low';
    case 'rating_desc':
      return 'Top rated';
  }
}

export function sortShops<
  T extends { distanceKm: number; nextAvailableAt: string | null; priceFromPaise: number; rating?: number | null }
>(
  shops: T[],
  sort: HomeSort
): T[] {
  const copy = [...shops];
  if (sort === 'nearest') {
    copy.sort((a, b) => a.distanceKm - b.distanceKm);
  } else if (sort === 'earliest') {
    copy.sort((a, b) => {
      const at = a.nextAvailableAt ? new Date(a.nextAvailableAt).getTime() : Number.POSITIVE_INFINITY;
      const bt = b.nextAvailableAt ? new Date(b.nextAvailableAt).getTime() : Number.POSITIVE_INFINITY;
      return at - bt;
    });
  } else if (sort === 'price_asc') {
    copy.sort((a, b) => a.priceFromPaise - b.priceFromPaise || a.distanceKm - b.distanceKm);
  } else if (sort === 'price_desc') {
    copy.sort((a, b) => b.priceFromPaise - a.priceFromPaise || a.distanceKm - b.distanceKm);
  } else if (sort === 'rating_desc') {
    // Unrated shops (null / 0) sink to the bottom.
    const r = (v?: number | null) => (v && v > 0 ? v : Number.NEGATIVE_INFINITY);
    copy.sort((a, b) => r(b.rating) - r(a.rating) || a.distanceKm - b.distanceKm);
  }
  return copy;
}
