import { PermissionsAndroid, Platform } from 'react-native';
import * as Location from 'expo-location';

export type PlaceHit = {
  latitude: number;
  longitude: number;
  area: string;
  address: string;
  city: string;
};

function within<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      }
    );
  });
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
  const area = named(address.district)
    || named(address.street)
    || named(address.name)
    || named(fromFormatted)
    || named(address.city)
    || named(address.subregion)
    || 'Current location';
  const city = address.city || address.subregion || area;
  const parts = [address.street, address.district, address.city, address.subregion, address.postalCode]
    .map((part) => named(part))
    .filter((part): part is string => Boolean(part));
  const addressLine = formatted && !/[A-Z0-9]{4,}\+/.test(formatted)
    ? formatted
    : [...new Set(parts)].join(', ') || area;
  return {
    latitude: coords.latitude,
    longitude: coords.longitude,
    area,
    address: addressLine,
    city
  };
}

export async function ensureLocationPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    const fine = PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION;
    if (await PermissionsAndroid.check(fine)) return true;
    const result = await PermissionsAndroid.request(fine);
    return result === PermissionsAndroid.RESULTS.GRANTED;
  }
  const current = await within(Location.getForegroundPermissionsAsync(), 1500);
  if (current?.granted) return true;
  const asked = await within(Location.requestForegroundPermissionsAsync(), 8000);
  return Boolean(asked?.granted);
}

export async function readCurrentPlace(): Promise<PlaceHit | 'denied' | 'unavailable'> {
  const allowed = await ensureLocationPermission();
  if (!allowed) return 'denied';
  const last = await within(Location.getLastKnownPositionAsync(), 800);
  const position = last ?? await within(
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
    4000
  );
  if (!position) return 'unavailable';
  const places = await within(Location.reverseGeocodeAsync(position.coords), 2500);
  const first = places?.[0];
  if (!first) {
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      area: 'Current location',
      address: `${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)}`,
      city: 'Current location'
    };
  }
  return placeFromGeocode(first, position.coords);
}

export async function searchPlaces(query: string): Promise<PlaceHit[]> {
  const allowed = await ensureLocationPermission();
  if (!allowed) return [];
  const hits = await within(Location.geocodeAsync(query), 5000);
  if (!hits?.length) return [];
  const detailed = await Promise.all(
    hits.slice(0, 5).map(async (hit) => {
      const places = await within(Location.reverseGeocodeAsync(hit), 2000);
      if (!places?.[0]) {
        return {
          latitude: hit.latitude,
          longitude: hit.longitude,
          area: query,
          address: query,
          city: query
        };
      }
      return placeFromGeocode(places[0], hit);
    })
  );
  return detailed;
}

export function distanceKm(from: { latitude: number; longitude: number }, to: { latitude: number; longitude: number }) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(to.latitude - from.latitude);
  const dLon = toRad(to.longitude - from.longitude);
  const lat1 = toRad(from.latitude);
  const lat2 = toRad(to.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
