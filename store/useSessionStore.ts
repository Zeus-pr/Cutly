import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

type SessionState = {
  accessToken: string | null;
  phone: string | null;
  email: string | null;
  city: string;
  introDone: boolean;
  hydrated: boolean;
  setSession: (token: string, phone: string, email?: string | null) => void;
  setCity: (city: string) => void;
  passIntro: () => void;
  hydrate: () => Promise<void>;
  clear: () => void;
};

const tokenKey = 'cutly.accessToken';
const phoneKey = 'cutly.phone';
const emailKey = 'cutly.email';
const cityKey = 'cutly.city';

export const useSessionStore = create<SessionState>((set) => ({
  accessToken: null,
  phone: null,
  email: null,
  city: 'Burdwan',
  introDone: false,
  hydrated: false,
  setSession: (accessToken, phone, email = null) => {
    set({ accessToken, phone, email });
    void SecureStore.setItemAsync(tokenKey, accessToken);
    void SecureStore.setItemAsync(phoneKey, phone);
    void SecureStore.setItemAsync(emailKey, email || '');
  },
  setCity: (city) => {
    const next = city.trim() || 'Burdwan';
    set({ city: next });
    void SecureStore.setItemAsync(cityKey, next);
  },
  passIntro: () => set({ introDone: true }),
  hydrate: async () => {
    const [accessToken, phone, email, city] = await Promise.all([
      SecureStore.getItemAsync(tokenKey),
      SecureStore.getItemAsync(phoneKey),
      SecureStore.getItemAsync(emailKey),
      SecureStore.getItemAsync(cityKey)
    ]);
    set({
      accessToken,
      phone: phone || null,
      email: email || null,
      city: city || 'Burdwan',
      hydrated: true
    });
  },
  clear: () => {
    set({ accessToken: null, phone: null, email: null, introDone: false });
    void SecureStore.deleteItemAsync(tokenKey);
    void SecureStore.deleteItemAsync(phoneKey);
    void SecureStore.deleteItemAsync(emailKey);
  }
}));
