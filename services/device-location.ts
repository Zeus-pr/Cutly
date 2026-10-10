import { Linking, Platform } from 'react-native';
import * as Location from 'expo-location';

export type PlaceHit = {
  latitude: number;
  longitude: number;
  area: string;
  address: string;
  city: string;
};

/** Locked default — Bardhaman area (not emulator US GPS). */
export const DEFAULT_PLACE: PlaceHit = {
  latitude: 23.2324,
  longitude: 87.8615,
  area: 'Burdwan',
  address: 'Bardhaman, West Bengal',
  city: 'Burdwan'
};

/** Rough India bbox — Android emulators often report Mountain View, CA. */
export function isServiceArea(latitude: number, longitude: number) {
  return latitude >= 6.5 && latitude <= 37.5 && longitude >= 68 && longitude <= 97.5;
}

export function placeOrDefault(place: PlaceHit): PlaceHit {
  return isServiceArea(place.latitude, place.longitude) ? place : DEFAULT_PLACE;
}

function named(value: string | null | undefined) {
  const text = value?.trim();
  if (!text || /^\d+$/.test(text) || /[A-Z0-9]{4,}\+/.test(text)) return null;
  return text;
}

export function placeFromGeocode(
  address: Location.LocationGeocodedAddress,
  coords: { latitude: number; longitude: number }
): PlaceHit {
  const formatted = address.formattedAddress?.trim();
  const fromFormatted = formatted?.split(',')[0]?.replace(/^\d+\s*/, '').trim();
  const area =
    named(address.district) ||
    named(address.street) ||
    named(address.name) ||
    named(fromFormatted) ||
    named(address.city) ||
    named(address.subregion) ||
    'Current location';
  const city = address.city || address.subregion || area;
  const parts = [address.street, address.district, address.city, address.subregion, address.postalCode]
    .map((part) => named(part))
    .filter((part): part is string => Boolean(part));
  const addressLine =
    formatted && !/[A-Z0-9]{4,}\+/.test(formatted) ? formatted : [...new Set(parts)].join(', ') || area;
  return {
    latitude: coords.latitude,
    longitude: coords.longitude,
    area,
    address: addressLine,
    city
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    );
  });
}

/**
 * Expo Android bug: calling requestForegroundPermissionsAsync() when already
 * granted can hang forever. Check first; request only if needed.
 * @see https://github.com/expo/expo/issues/39851
 */
export async function ensureLocationPermission(): Promise<boolean> {
  try {
    const current = await withTimeout(
      Location.getForegroundPermissionsAsync(),
      5000,
      'getForegroundPermissions'
    );
    if (current.granted) return true;
    if (current.canAskAgain === false) return false;

    const asked = await withTimeout(
      Location.requestForegroundPermissionsAsync(),
      60_000,
      'requestForegroundPermissions'
    );
    return asked.granted;
  } catch (err) {
    console.warn('[cutly.location] permission failed', err);
    return false;
  }
}

export async function openLocationSettings() {
  try {
    if (Platform.OS === 'ios') {
      await Linking.openURL('app-settings:');
      return;
    }
    await Linking.openSettings();
  } catch {
    // ignore
  }
}

function coordsHit(
  coords: { latitude: number; longitude: number },
  area: string,
  address: string
): PlaceHit {
  return {
    latitude: coords.latitude,
    longitude: coords.longitude,
    area,
    address,
    city: area
  };
}

async function placeFromCoords(coords: { latitude: number; longitude: number }): Promise<PlaceHit> {
  if (!isServiceArea(coords.latitude, coords.longitude)) {
    return DEFAULT_PLACE;
  }
  try {
    const places = await withTimeout(Location.reverseGeocodeAsync(coords), 4000, 'reverseGeocode');
    const first = places[0];
    if (!first) {
      return coordsHit(
        coords,
        'Current location',
        `${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}`
      );
    }
    return placeOrDefault(placeFromGeocode(first, coords));
  } catch {
    return coordsHit(
      coords,
      'Current location',
      `${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}`
    );
  }
}

/** Last known only — what Swiggy/Uber-style apps use for instant “current location”. */
export async function peekCachedPlace(): Promise<PlaceHit | null> {
  try {
    // maxAge: accept up to 30 min old cache (still useful for area)
    const last = await withTimeout(
      Location.getLastKnownPositionAsync({ maxAge: 30 * 60_000 }),
      3000,
      'lastKnown'
    );
    if (!last) return null;
    return placeFromCoords(last.coords);
  } catch {
    return null;
  }
}

/**
 * Fresh fix. mayShowUserSettingsDialog MUST be false when called under a RN Modal —
 * otherwise Android starts an Activity-for-result that never completes (hangs forever).
 * @see expo LocationModule.kt addPendingLocationRequest
 */
async function fetchFreshPosition(): Promise<Location.LocationObject | null> {
  const opts: Location.LocationOptions = {
    accuracy: Location.Accuracy.Balanced,
    mayShowUserSettingsDialog: false
  };
  try {
    return await withTimeout(Location.getCurrentPositionAsync(opts), 10_000, 'getCurrentPosition');
  } catch {
    try {
      return await withTimeout(
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Lowest,
          mayShowUserSettingsDialog: false
        }),
        8_000,
        'getCurrentPosition-low'
      );
    } catch {
      return null;
    }
  }
}

export type ReadCurrentPlaceOptions = {
  forceFresh?: boolean;
};

/**
 * Industry pattern: last-known first (instant), then optional fresh refine.
 * Never call requestPermission if already granted; never show settings dialog under Modal.
 */
export async function readCurrentPlace(
  options: ReadCurrentPlaceOptions = {}
): Promise<PlaceHit | 'denied' | 'unavailable'> {
  try {
    const allowed = await ensureLocationPermission();
    if (!allowed) return 'denied';

    const cached = await peekCachedPlace();

    // Tap “use current” — prefer cache immediately (works even when fresh GPS hangs).
    if (!options.forceFresh && cached) return cached;

    if (options.forceFresh) {
      const fresh = await fetchFreshPosition();
      if (fresh) return placeFromCoords(fresh.coords);
      // Fresh hung/failed — still succeed with cache (same as Maps/Uber).
      if (cached) return cached;
      return 'unavailable';
    }

    if (cached) return cached;

    const fresh = await fetchFreshPosition();
    if (fresh) return placeFromCoords(fresh.coords);
    return 'unavailable';
  } catch (err) {
    console.warn('[cutly.location] read failed', err);
    return 'unavailable';
  }
}

export async function searchPlaces(query: string): Promise<PlaceHit[]> {
  const allowed = await ensureLocationPermission();
  if (!allowed) return [];
  try {
    const hits = await withTimeout(Location.geocodeAsync(query), 8000, 'geocode');
    if (!hits.length) return [];
    const detailed = await Promise.all(
      hits.slice(0, 5).map(async (hit) => {
        try {
          const places = await Location.reverseGeocodeAsync(hit);
          if (!places[0]) {
            return {
              latitude: hit.latitude,
              longitude: hit.longitude,
              area: query,
              address: query,
              city: query
            };
          }
          return placeFromGeocode(places[0], hit);
        } catch {
          return {
            latitude: hit.latitude,
            longitude: hit.longitude,
            area: query,
            address: query,
            city: query
          };
        }
      })
    );
    return detailed.map(placeOrDefault);
  } catch {
    return [];
  }
}

export function distanceKm(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number }
) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(to.latitude - from.latitude);
  const dLon = toRad(to.longitude - from.longitude);
  const lat1 = toRad(from.latitude);
  const lat2 = toRad(to.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
