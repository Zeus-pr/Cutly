import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import type { AuthMethod } from '@/utils/deleteFlow';

export type Audience = 'customer' | 'partner';

type SessionState = {
  accessToken: string | null;
  phone: string | null;
  email: string | null;
  name: string | null;
  /** male | female | other | prefer_not — from /auth/me. */
  gender: string | null;
  /** YYYY-MM-DD from the native date picker. */
  dateOfBirth: string | null;
  googleLinked: boolean;
  /** #46: from /auth/me — picks the re-auth method for Delete account. */
  hasPassword: boolean;
  authMethods: AuthMethod[] | null;
  /** T4 (#9): from /auth/me — the Profile "Not verified" pill + Verify banner. */
  emailVerified: boolean;
  /** T4 (#9): the address was released to its proven owner (screen 14). */
  emailReleased: boolean;
  /** #46: set by a sign-in that cancelled a pending deletion (C9 / P3), cleared once shown. */
  restoredNotice: Audience | null;
  /** #46: epoch ms when re-auth may be tried again after a 429 (session-only, survives navigation). */
  reauthRetryAt: number | null;
  setRestoredNotice: (audience: Audience | null) => void;
  setReauthRetryAt: (retryAt: number | null) => void;
  city: string;
  introDone: boolean;
  /** Session-only: PatternWaves launch → Get Started tapped. */
  launchDone: boolean;
  hydrated: boolean;
  audience: Audience | null;
  partnerToken: string | null;
  setupDone: boolean;
  setSession: (token: string, phone: string, email?: string | null, name?: string | null) => void;
  setAudience: (audience: Audience | null) => void;
  setPartnerSession: (token: string, email: string | null, name: string | null, setupDone: boolean) => void;
  markSetup: (setupDone: boolean) => void;
  clearPartner: () => void;
  setProfile: (profile: {
    phone?: string | null;
    email?: string | null;
    name?: string | null;
    gender?: string | null;
    dateOfBirth?: string | null;
    googleLinked?: boolean;
    hasPassword?: boolean;
    authMethods?: AuthMethod[] | null;
    emailVerified?: boolean;
    emailReleased?: boolean;
  }) => void;
  setCity: (city: string) => void;
  passIntro: () => void;
  passLaunch: () => void;
  hydrate: () => Promise<void>;
  clear: () => void;
};

const tokenKey = 'cutly.accessToken';
const phoneKey = 'cutly.phone';
const emailKey = 'cutly.email';
const nameKey = 'cutly.name';
const genderKey = 'cutly.gender';
const dateOfBirthKey = 'cutly.dateOfBirth';
const cityKey = 'cutly.city';
const audienceKey = 'cutly.audience';
const partnerTokenKey = 'cutly.partnerToken';
const partnerEmailKey = 'cutly.partnerEmail';
const partnerNameKey = 'cutly.partnerName';
const setupKey = 'cutly.partnerSetup';

export function givenName(name: string | null | undefined) {
  return name?.trim().split(/\s+/)[0] || '';
}

/** Home is allowed only after name, gender, and a date of birth. */
export function customerProfileReady(profile: {
  name?: string | null;
  gender?: string | null;
  dateOfBirth?: string | null;
}) {
  return Boolean(profile.name?.trim() && profile.gender?.trim() && profile.dateOfBirth);
}

export const useSessionStore = create<SessionState>((set, get) => ({
  accessToken: null,
  phone: null,
  email: null,
  name: null,
  gender: null,
  dateOfBirth: null,
  googleLinked: false,
  hasPassword: false,
  authMethods: null,
  emailVerified: false,
  emailReleased: false,
  restoredNotice: null,
  reauthRetryAt: null,
  setRestoredNotice: (restoredNotice) => set({ restoredNotice }),
  setReauthRetryAt: (reauthRetryAt) => set({ reauthRetryAt }),
  city: 'Burdwan',
  introDone: false,
  launchDone: false,
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
      name: profile.name === undefined ? get().name : profile.name,
      gender: profile.gender === undefined ? get().gender : profile.gender,
      dateOfBirth: profile.dateOfBirth === undefined ? get().dateOfBirth : profile.dateOfBirth,
      googleLinked: profile.googleLinked === undefined ? get().googleLinked : profile.googleLinked,
      hasPassword: profile.hasPassword === undefined ? get().hasPassword : profile.hasPassword,
      authMethods: profile.authMethods === undefined ? get().authMethods : profile.authMethods,
      emailVerified: profile.emailVerified === undefined ? get().emailVerified : profile.emailVerified,
      emailReleased: profile.emailReleased === undefined ? get().emailReleased : profile.emailReleased
    };
    set(next);
    void SecureStore.setItemAsync(phoneKey, next.phone || '');
    void SecureStore.setItemAsync(emailKey, next.email || '');
    void SecureStore.setItemAsync(nameKey, next.name || '');
    void SecureStore.setItemAsync(genderKey, next.gender || '');
    void SecureStore.setItemAsync(dateOfBirthKey, next.dateOfBirth || '');
  },
  setCity: (city) => {
    const next = city.trim() || 'Burdwan';
    set({ city: next });
    void SecureStore.setItemAsync(cityKey, next);
  },
  setAudience: (audience) => {
    set({ audience });
    // Session-only until sign-in. Cold start without a token lands on customer auth.
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
  passLaunch: () => set({ launchDone: true }),
  hydrate: async () => {
    // Fast path — only what SessionGate needs to reach home (cuts cold-start SecureStore waits).
    const [accessToken, name, gender, dateOfBirth, partnerToken, partnerName, setup] = await Promise.all([
      SecureStore.getItemAsync(tokenKey),
      SecureStore.getItemAsync(nameKey),
      SecureStore.getItemAsync(genderKey),
      SecureStore.getItemAsync(dateOfBirthKey),
      SecureStore.getItemAsync(partnerTokenKey),
      SecureStore.getItemAsync(partnerNameKey),
      SecureStore.getItemAsync(setupKey)
    ]);
    const nextAudience: Audience | null = partnerToken ? 'partner' : accessToken ? 'customer' : null;
    const partnerSession = nextAudience === 'partner';
    set({
      accessToken,
      name: (partnerSession ? partnerName : name) || null,
      gender: partnerSession ? null : gender || null,
      dateOfBirth: partnerSession || !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth || '') ? null : dateOfBirth,
      audience: nextAudience,
      partnerToken,
      setupDone: partnerSession && setup === '1',
      introDone: false,
      launchDone: false,
      hydrated: true
    });
    if (!nextAudience) void SecureStore.deleteItemAsync(audienceKey);
    else void SecureStore.setItemAsync(audienceKey, nextAudience);

    // Slow path — non-blocking for first paint.
    void Promise.all([
      SecureStore.getItemAsync(phoneKey),
      SecureStore.getItemAsync(emailKey),
      SecureStore.getItemAsync(cityKey),
      SecureStore.getItemAsync(partnerEmailKey)
    ]).then(([phone, email, city, partnerEmail]) => {
      const cur = get();
      const partner = Boolean(cur.partnerToken);
      set({
        phone: phone || null,
        email: (partner ? partnerEmail : email) || null,
        city: city || cur.city || 'Burdwan'
      });
    });
  },
  clear: () => {
    set({
      accessToken: null,
      phone: null,
      email: null,
      name: null,
      gender: null,
      dateOfBirth: null,
      googleLinked: false,
      hasPassword: false,
      authMethods: null,
      emailVerified: false,
      emailReleased: false,
      reauthRetryAt: null,
      introDone: false,
      launchDone: false,
      audience: null
    });
    void SecureStore.deleteItemAsync(tokenKey);
    void SecureStore.deleteItemAsync(phoneKey);
    void SecureStore.deleteItemAsync(emailKey);
    void SecureStore.deleteItemAsync(nameKey);
    void SecureStore.deleteItemAsync(genderKey);
    void SecureStore.deleteItemAsync(dateOfBirthKey);
    void SecureStore.deleteItemAsync('cutly.birthYear');
    void SecureStore.deleteItemAsync(audienceKey);
  }
}));
