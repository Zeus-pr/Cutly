/** Locked default — keep in sync with `services/device-location` DEFAULT_PLACE. */
export const DEFAULT_PLACE_COORDS = { latitude: 23.2324, longitude: 87.8615 };

/** Haversine threshold for “saved pin is stale vs GPS” (CJ-30). */
export const STALE_PIN_KM = 2;

function distanceKm(from: { latitude: number; longitude: number }, to: { latitude: number; longitude: number }) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(to.latitude - from.latitude);
  const dLon = toRad(to.longitude - from.longitude);
  const lat1 = toRad(from.latitude);
  const lat2 = toRad(to.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Match DEFAULT_PLACE coords (silent Bardhaman fallback). */
export function isDefaultPlaceCoords(place: { latitude: number; longitude: number }) {
  return (
    Math.abs(place.latitude - DEFAULT_PLACE_COORDS.latitude) < 0.00015 &&
    Math.abs(place.longitude - DEFAULT_PLACE_COORDS.longitude) < 0.00015
  );
}

export function isStaleSavedPin(
  gps: { latitude: number; longitude: number },
  active: { latitude: number; longitude: number; savedId?: string | null },
  thresholdKm = STALE_PIN_KM
) {
  if (!active.savedId) return false;
  return distanceKm(gps, active) > thresholdKm;
}

/** CJ-35: case-insensitive flat substring (no token/synonym expansion). */
export function flatSubstringMatch(haystack: string, needle: string) {
  const h = haystack.trim().toLowerCase().replace(/\s+/g, ' ');
  const n = needle.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!n) return true;
  return h.includes(n);
}

export type ShopQueryRank = 0 | 1 | 2 | 3;

/**
 * Name-first ranking for shop search (CJ-35).
 * 0 = name, 1 = menu/service, 2 = address/city, 3 = no match.
 */
export function shopQueryRank(
  shop: { name: string; city: string; address: string; services: string[] },
  query: string
): ShopQueryRank {
  const needle = query.trim();
  if (!needle) return 3;
  if (flatSubstringMatch(shop.name, needle)) return 0;
  if (shop.services.some((service) => flatSubstringMatch(service, needle))) return 1;
  if (flatSubstringMatch(shop.city, needle) || flatSubstringMatch(shop.address, needle)) return 2;
  return 3;
}

export function compareShopsByQueryThenDistance<
  T extends { name: string; city: string; address: string; services: string[]; distanceKm: number }
>(a: T, b: T, query: string) {
  const ra = shopQueryRank(a, query);
  const rb = shopQueryRank(b, query);
  if (ra !== rb) return ra - rb;
  return a.distanceKm - b.distanceKm;
}
