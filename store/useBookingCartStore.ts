import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

type BookingCartState = {
  shopId: string | null;
  serviceIds: string[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setCart: (shopId: string, serviceIds: string[]) => void;
  clearCart: () => void;
};

const cartKey = 'cutly.bookingCart';

type PersistedCart = {
  shopId: string;
  serviceIds: string[];
};

function persist(shopId: string | null, serviceIds: string[]) {
  if (!shopId || !serviceIds.length) {
    void SecureStore.deleteItemAsync(cartKey);
    return;
  }
  const payload: PersistedCart = { shopId, serviceIds: [...serviceIds] };
  void SecureStore.setItemAsync(cartKey, JSON.stringify(payload));
}

export const useBookingCartStore = create<BookingCartState>((set, get) => ({
  shopId: null,
  serviceIds: [],
  hydrated: false,
  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const raw = await SecureStore.getItemAsync(cartKey);
      if (raw) {
        const parsed = JSON.parse(raw) as PersistedCart;
        if (
          parsed?.shopId &&
          Array.isArray(parsed.serviceIds) &&
          parsed.serviceIds.every((id) => typeof id === 'string') &&
          parsed.serviceIds.length
        ) {
          set({
            shopId: parsed.shopId,
            serviceIds: parsed.serviceIds,
            hydrated: true
          });
          return;
        }
      }
    } catch {
      /* ignore corrupt cart */
    }
    set({ hydrated: true });
  },
  setCart: (shopId, serviceIds) => {
    const nextShop = serviceIds.length ? shopId : null;
    const nextIds = [...serviceIds];
    set({ shopId: nextShop, serviceIds: nextIds });
    persist(nextShop, nextIds);
  },
  clearCart: () => {
    set({ shopId: null, serviceIds: [] });
    persist(null, []);
  }
}));
