import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

export type Audience = 'customer' | 'partner';

type SessionState = {
  accessToken: string | null;
  phone: string | null;
  email: string | null;
  name: string | null;
  city: string;
  introDone: boolean;
  hydrated: boolean;
  audience: Audience | null;
  partnerToken: string | null;
  setupDone: boolean;
  setSession: (token: string, phone: string, email?: string | null, name?: string | null) => void;
  setAudience: (audience: Audience | null) => void;
  setPartnerSession: (token: string, email: string | null, name: string | null, setupDone: boolean) => void;
  markSetup: (setupDone: boolean) => void;
  clearPartner: () => void;
  setProfile: (profile: { phone?: string | null; email?: string | null; name?: string | null }) => void;
  setCity: (city: string) => void;
  passIntro: () => void;
  hydrate: () => Promise<void>;
  clear: () => void;
};

const tokenKey = 'cutly.accessToken';
const phoneKey = 'cutly.phone';
const emailKey = 'cutly.email';
const nameKey = 'cutly.name';
const cityKey = 'cutly.city';
const audienceKey = 'cutly.audience';
const partnerTokenKey = 'cutly.partnerToken';
const partnerEmailKey = 'cutly.partnerEmail';
const partnerNameKey = 'cutly.partnerName';
const setupKey = 'cutly.partnerSetup';

export function givenName(name: string | null | undefined) {
  return name?.trim().split(/\s+/)[0] || '';
}

export const useSessionStore = create<SessionState>((set, get) => ({
  accessToken: null,
  phone: null,
  email: null,
  name: null,
  city: 'Burdwan',
  introDone: false,
  hydrated: false,
  audience: null,
  partnerToken: null,
  setupDone: false,
  setSession: (accessToken, phone, email = null, name = null) => {
    set({ accessToken, phone, email, name, audience: 'customer' });
    void SecureStore.setItemAsync(tokenKey, accessToken);
    void SecureStore.setItemAsync(phoneKey, phone);
    void SecureStore.setItemAsync(emailKey, email || '');
    void SecureStore.setItemAsync(nameKey, name || '');
    void SecureStore.setItemAsync(audienceKey, 'customer');
  },
  setProfile: (profile) => {
    const next = {
      phone: profile.phone === undefined ? get().phone : profile.phone,
      email: profile.email === undefined ? get().email : profile.email,
      name: profile.name === undefined ? get().name : profile.name
    };
    set(next);
    void SecureStore.setItemAsync(phoneKey, next.phone || '');
    void SecureStore.setItemAsync(emailKey, next.email || '');
    void SecureStore.setItemAsync(nameKey, next.name || '');
  },
  setCity: (city) => {
    const next = city.trim() || 'Burdwan';
    set({ city: next });
    void SecureStore.setItemAsync(cityKey, next);
  },
  setAudience: (audience) => {
    set({ audience });
    // Choice is session-only until sign-in. Cold start without a token returns to the role gate.
  },
  setPartnerSession: (partnerToken, email, name, setupDone) => {
    set({ partnerToken, audience: 'partner', email, name, setupDone });
    void SecureStore.setItemAsync(partnerTokenKey, partnerToken);
    void SecureStore.setItemAsync(audienceKey, 'partner');
    void SecureStore.setItemAsync(partnerEmailKey, email || '');
    void SecureStore.setItemAsync(partnerNameKey, name || '');
    void SecureStore.setItemAsync(setupKey, setupDone ? '1' : '0');
  },
  markSetup: (setupDone) => {
    set({ setupDone });
    void SecureStore.setItemAsync(setupKey, setupDone ? '1' : '0');
  },
  clearPartner: () => {
    set({ partnerToken: null, setupDone: false, audience: null, email: null, name: null });
    void SecureStore.deleteItemAsync(partnerTokenKey);
    void SecureStore.deleteItemAsync(audienceKey);
    void SecureStore.setItemAsync(setupKey, '0');
  },
  passIntro: () => set({ introDone: true }),
  hydrate: async () => {
    const [accessToken, phone, email, name, city, partnerToken, partnerEmail, partnerName, setup] = await Promise.all([
      SecureStore.getItemAsync(tokenKey),
      SecureStore.getItemAsync(phoneKey),
      SecureStore.getItemAsync(emailKey),
      SecureStore.getItemAsync(nameKey),
      SecureStore.getItemAsync(cityKey),
      SecureStore.getItemAsync(partnerTokenKey),
      SecureStore.getItemAsync(partnerEmailKey),
      SecureStore.getItemAsync(partnerNameKey),
      SecureStore.getItemAsync(setupKey)
    ]);
    // Audience only sticks after an actual sign-in. Unsigned users always see the role gate.
    const nextAudience: Audience | null = partnerToken ? 'partner' : accessToken ? 'customer' : null;
    if (!nextAudience) void SecureStore.deleteItemAsync(audienceKey);
    else void SecureStore.setItemAsync(audienceKey, nextAudience);
    const partnerSession = nextAudience === 'partner';
    set({
      accessToken,
      phone: phone || null,
      email: (partnerSession ? partnerEmail : email) || null,
      name: (partnerSession ? partnerName : name) || null,
      city: city || 'Burdwan',
      audience: nextAudience,
      partnerToken,
      setupDone: partnerSession && setup === '1',
      introDone: false,
      hydrated: true
    });
  },
  clear: () => {
    set({ accessToken: null, phone: null, email: null, name: null, introDone: false, audience: null });
    void SecureStore.deleteItemAsync(tokenKey);
    void SecureStore.deleteItemAsync(phoneKey);
    void SecureStore.deleteItemAsync(emailKey);
    void SecureStore.deleteItemAsync(nameKey);
    void SecureStore.deleteItemAsync(audienceKey);
  }
}));
