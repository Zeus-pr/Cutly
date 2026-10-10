import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { DEFAULT_PLACE, isServiceArea } from '@/services/device-location';
import { isDefaultPlaceCoords } from '@/utils/placeTrust';
import { useSessionStore } from '@/store/useSessionStore';

export type SavedPlace = {
  id: string;
  label: string;
  area: string;
  address: string;
  city: string;
  latitude: number;
  longitude: number;
};

export type ActivePlace = {
  area: string;
  address: string;
  city: string;
  latitude: number;
  longitude: number;
  savedId: string | null;
};

export type PlaceOrigin = 'gps' | 'search' | 'saved' | 'default';

type PlaceMeta = {
  areaConfirmed: boolean;
  originKind: PlaceOrigin;
};

type PlaceState = {
  sheetOpen: boolean;
  active: ActivePlace | null;
  saved: SavedPlace[];
  /** CJ-29: user acknowledged listing origin (or picked a place). */
  areaConfirmed: boolean;
  originKind: PlaceOrigin;
  /** Session flag — stale-pin alert shown once (CJ-30). */
  stalePromptShown: boolean;
  openSheet: () => void;
  closeSheet: () => void;
  hydrate: () => Promise<void>;
  select: (
    place: Omit<ActivePlace, 'savedId'> & {
      savedId?: string | null;
      originKind?: PlaceOrigin;
    }
  ) => void;
  /** Confirm silent default area without changing pin (CJ-29). */
  confirmArea: () => void;
  markStalePromptShown: () => void;
  save: (place: Omit<SavedPlace, 'id'>) => SavedPlace;
  remove: (id: string) => void;
};

const activeKey = 'cutly.place';
const savedKey = 'cutly.savedPlaces';
const metaKey = 'cutly.placeMeta';

function persist(active: ActivePlace | null, saved: SavedPlace[], meta: PlaceMeta) {
  void SecureStore.setItemAsync(activeKey, JSON.stringify(active));
  void SecureStore.setItemAsync(savedKey, JSON.stringify(saved));
  void SecureStore.setItemAsync(metaKey, JSON.stringify(meta));
}

function inArea(place: { latitude: number; longitude: number } | null | undefined) {
  return Boolean(place && isServiceArea(place.latitude, place.longitude));
}

function asActive(
  place: Omit<ActivePlace, 'savedId'> & { savedId?: string | null }
): ActivePlace {
  const safe = inArea(place) ? place : DEFAULT_PLACE;
  return {
    area: safe.area,
    address: safe.address,
    city: safe.city,
    latitude: safe.latitude,
    longitude: safe.longitude,
    savedId: place.savedId ?? null
  };
}

function inferConfirmed(active: ActivePlace, meta: PlaceMeta | null): PlaceMeta {
  if (meta?.areaConfirmed) {
    return { areaConfirmed: true, originKind: meta.originKind || 'search' };
  }
  // Returning user with a non-default or saved pin → treat as already confirmed.
  if (active.savedId || !isDefaultPlaceCoords(active)) {
    return { areaConfirmed: true, originKind: active.savedId ? 'saved' : meta?.originKind || 'search' };
  }
  return { areaConfirmed: false, originKind: 'default' };
}

export const usePlaceStore = create<PlaceState>((set, get) => ({
  sheetOpen: false,
  active: null,
  saved: [],
  areaConfirmed: false,
  originKind: 'default',
  stalePromptShown: false,
  openSheet: () => set({ sheetOpen: true }),
  closeSheet: () => set({ sheetOpen: false }),
  markStalePromptShown: () => set({ stalePromptShown: true }),
  hydrate: async () => {
    const [activeRaw, savedRaw, metaRaw] = await Promise.all([
      SecureStore.getItemAsync(activeKey),
      SecureStore.getItemAsync(savedKey),
      SecureStore.getItemAsync(metaKey)
    ]);
    let stored: ActivePlace | null = null;
    let saved: SavedPlace[] = [];
    let meta: PlaceMeta | null = null;
    try {
      stored = activeRaw ? (JSON.parse(activeRaw) as ActivePlace) : null;
    } catch {
      stored = null;
    }
    try {
      saved = savedRaw ? (JSON.parse(savedRaw) as SavedPlace[]) : [];
    } catch {
      saved = [];
    }
    try {
      meta = metaRaw ? (JSON.parse(metaRaw) as PlaceMeta) : null;
    } catch {
      meta = null;
    }

    const current = get().active;
    let active: ActivePlace | null;
    let usedSilentDefault = false;
    if (inArea(current)) {
      active = current;
    } else if (inArea(stored)) {
      active = stored;
    } else if (stored || current) {
      // Emulator US GPS / stale SecureStore → Bardhaman default
      active = { ...DEFAULT_PLACE, savedId: null };
      usedSilentDefault = true;
    } else {
      active = { ...DEFAULT_PLACE, savedId: null };
      usedSilentDefault = true;
    }

    const resolved = active as ActivePlace;
    const nextMeta = usedSilentDefault
      ? { areaConfirmed: false, originKind: 'default' as const }
      : inferConfirmed(resolved, meta);

    const nextSaved = get().saved.length > 0 ? get().saved : saved;
    persist(resolved, nextSaved, nextMeta);
    set({
      active: resolved,
      saved: nextSaved,
      areaConfirmed: nextMeta.areaConfirmed,
      originKind: nextMeta.originKind
    });
    if (resolved.city) useSessionStore.getState().setCity(resolved.city);
  },
  select: (place) => {
    const remapped = !inArea(place);
    const active = asActive(place);
    const originKind: PlaceOrigin = remapped
      ? 'default'
      : place.originKind ||
        (place.savedId ? 'saved' : isDefaultPlaceCoords(active) ? 'default' : 'search');
    const meta: PlaceMeta = { areaConfirmed: true, originKind };
    set({ active, sheetOpen: false, areaConfirmed: true, originKind });
    persist(active, get().saved, meta);
    useSessionStore.getState().setCity(active.city);
  },
  confirmArea: () => {
    const active = get().active || { ...DEFAULT_PLACE, savedId: null };
    const meta: PlaceMeta = {
      areaConfirmed: true,
      originKind: get().originKind === 'default' ? 'default' : get().originKind
    };
    set({ areaConfirmed: true, active });
    persist(active, get().saved, meta);
    useSessionStore.getState().setCity(active.city);
  },
  save: (place) => {
    const safe = inArea(place) ? place : DEFAULT_PLACE;
    const savedPlace: SavedPlace = {
      ...safe,
      label: place.label,
      id: `place_${Date.now()}`
    };
    const saved = [savedPlace, ...get().saved];
    const active: ActivePlace = { ...safe, savedId: savedPlace.id };
    const meta: PlaceMeta = { areaConfirmed: true, originKind: 'saved' };
    set({ saved, active, sheetOpen: false, areaConfirmed: true, originKind: 'saved' });
    persist(active, saved, meta);
    useSessionStore.getState().setCity(active.city);
    return savedPlace;
  },
  remove: (id) => {
    const current = get().active;
    const saved = get().saved.filter((place) => place.id !== id);
    const active = current?.savedId === id ? { ...current, savedId: null } : current;
    const meta: PlaceMeta = {
      areaConfirmed: get().areaConfirmed,
      originKind: get().originKind
    };
    set({ saved, active });
    persist(active, saved, meta);
  }
}));
