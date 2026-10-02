import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
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

type PlaceState = {
  sheetOpen: boolean;
  active: ActivePlace | null;
  saved: SavedPlace[];
  openSheet: () => void;
  closeSheet: () => void;
  hydrate: () => Promise<void>;
  select: (place: Omit<ActivePlace, 'savedId'> & { savedId?: string | null }) => void;
  save: (place: Omit<SavedPlace, 'id'>) => SavedPlace;
  remove: (id: string) => void;
};

const activeKey = 'cutly.place';
const savedKey = 'cutly.savedPlaces';

function persist(active: ActivePlace | null, saved: SavedPlace[]) {
  void SecureStore.setItemAsync(activeKey, JSON.stringify(active));
  void SecureStore.setItemAsync(savedKey, JSON.stringify(saved));
}

export const usePlaceStore = create<PlaceState>((set, get) => ({
  sheetOpen: false,
  active: null,
  saved: [],
  openSheet: () => set({ sheetOpen: true }),
  closeSheet: () => set({ sheetOpen: false }),
  hydrate: async () => {
    const [activeRaw, savedRaw] = await Promise.all([
      SecureStore.getItemAsync(activeKey),
      SecureStore.getItemAsync(savedKey)
    ]);
    let active: ActivePlace | null = null;
    let saved: SavedPlace[] = [];
    try {
      active = activeRaw ? (JSON.parse(activeRaw) as ActivePlace) : null;
    } catch {
      active = null;
    }
    try {
      saved = savedRaw ? (JSON.parse(savedRaw) as SavedPlace[]) : [];
    } catch {
      saved = [];
    }
    set((state) => ({
      active: state.active ?? active,
      saved: state.saved.length > 0 ? state.saved : saved
    }));
    const city = (get().active ?? active)?.city;
    if (city) useSessionStore.getState().setCity(city);
  },
  select: (place) => {
    const active: ActivePlace = {
      area: place.area,
      address: place.address,
      city: place.city,
      latitude: place.latitude,
      longitude: place.longitude,
      savedId: place.savedId ?? null
    };
    set({ active, sheetOpen: false });
    persist(active, get().saved);
    useSessionStore.getState().setCity(place.city);
  },
  save: (place) => {
    const savedPlace: SavedPlace = { ...place, id: `place_${Date.now()}` };
    const saved = [savedPlace, ...get().saved];
    const active: ActivePlace = { ...place, savedId: savedPlace.id };
    set({ saved, active, sheetOpen: false });
    persist(active, saved);
    useSessionStore.getState().setCity(place.city);
    return savedPlace;
  },
  remove: (id) => {
    const current = get().active;
    const saved = get().saved.filter((place) => place.id !== id);
    const active = current?.savedId === id ? { ...current, savedId: null } : current;
    set({ saved, active });
    persist(active, saved);
  }
}));
