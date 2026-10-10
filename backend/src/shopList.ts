/** Pure helpers for Home/search shop cards (CJ-32 / CJ-33 / CJ-34). */

export type ListServiceRow = {
  pricePaise: number;
  /** Shop-level duration when set; else catalogue service duration. */
  durationMinutes?: number;
  service: { id: string; name: string; durationMinutes: number };
};

export function matchServiceName(haystack: string, needle: string) {
  const h = haystack.toLowerCase().replace(/\s+/g, ' ').trim();
  const n = needle.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!n) return false;
  if (h.includes(n)) return true;
  const tokens = n.split(/[^a-z0-9]+/).filter((t) => t.length > 2);
  return tokens.length > 0 && tokens.every((t) => h.includes(t));
}

function lineDuration(row: ListServiceRow) {
  return row.durationMinutes && row.durationMinutes > 0
    ? row.durationMinutes
    : row.service.durationMinutes;
}

/** When serviceName set → that service; else shortest duration for earliest, min price separate. */
export function resolveListService(services: ListServiceRow[], serviceName?: string) {
  const paid = services.filter((row) => row.pricePaise > 0 && lineDuration(row) > 0);
  if (!paid.length) return null;
  if (serviceName?.trim()) {
    const needle = serviceName.trim();
    const hit = paid.find((row) => matchServiceName(row.service.name, needle));
    if (!hit) return null;
    return {
      serviceId: hit.service.id,
      pricePaise: hit.pricePaise,
      durationMinutes: lineDuration(hit)
    };
  }
  const shortest = [...paid].sort((a, b) => lineDuration(a) - lineDuration(b))[0];
  const minPrice = Math.min(...paid.map((row) => row.pricePaise));
  return {
    serviceId: shortest.service.id,
    pricePaise: minPrice,
    durationMinutes: lineDuration(shortest)
  };
}

export function shopRatingFromReviews(reviews: { rating: number }[]) {
  if (!reviews.length) return { rating: null as number | null, reviewCount: 0 };
  const avg = reviews.reduce((sum, row) => sum + row.rating, 0) / reviews.length;
  return { rating: Math.round(avg * 10) / 10, reviewCount: reviews.length };
}

export function barberRatingFromReviews(reviews: { barberRating: number }[]) {
  if (!reviews.length) return 0;
  const avg = reviews.reduce((sum, row) => sum + row.barberRating, 0) / reviews.length;
  return Math.round(avg * 10) / 10;
}
