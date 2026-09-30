import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

type SessionState = {
  accessToken: string | null;
  phone: string | null;
  email: string | null;
  hydrated: boolean;
  setSession: (token: string, phone: string, email?: string | null) => void;
  hydrate: () => Promise<void>;
  clear: () => void;
};

const tokenKey = 'cutly.accessToken';
const phoneKey = 'cutly.phone';
const emailKey = 'cutly.email';

export const useSessionStore = create<SessionState>((set) => ({
  accessToken: null,
  phone: null,
  email: null,
  hydrated: false,
  setSession: (accessToken, phone, email = null) => {
    set({ accessToken, phone, email });
    void SecureStore.setItemAsync(tokenKey, accessToken);
    void SecureStore.setItemAsync(phoneKey, phone);
    void SecureStore.setItemAsync(emailKey, email || '');
  },
  hydrate: async () => {
    const [accessToken, phone, email] = await Promise.all([
      SecureStore.getItemAsync(tokenKey),
      SecureStore.getItemAsync(phoneKey),
      SecureStore.getItemAsync(emailKey)
    ]);
    set({ accessToken, phone: phone || null, email: email || null, hydrated: true });
  },
  clear: () => {
    set({ accessToken: null, phone: null, email: null });
    void SecureStore.deleteItemAsync(tokenKey);
    void SecureStore.deleteItemAsync(phoneKey);
    void SecureStore.deleteItemAsync(emailKey);
  }
}));
