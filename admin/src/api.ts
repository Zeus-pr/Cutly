const SECRET_KEY = 'cutly.adminSecret';
const PARTNER_TOKEN_KEY = 'cutly.adminPartnerToken';
const PARTNER_ID_KEY = 'cutly.adminPartnerId';

/** Hit API directly (not Vite proxy) — survives proxy 500 when API briefly restarts. */
const API_BASE =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE) ||
  'http://127.0.0.1:4001/api';

/**
 * Partner routes (`/api/partner/*`) live only on the public app (:4000). The admin listener
 * (:4001) 404s every non-admin path before CORS runs, so the browser reports "Failed to fetch".
 */
const PARTNER_API_BASE =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_PARTNER_API_BASE) ||
  'http://127.0.0.1:4000/api';

export function getAdminSecret() {
  return sessionStorage.getItem(SECRET_KEY) || '';
}

export function setAdminSecret(secret: string) {
  sessionStorage.setItem(SECRET_KEY, secret.trim());
}

export function clearAdminSession() {
  sessionStorage.removeItem(SECRET_KEY);
  sessionStorage.removeItem(PARTNER_TOKEN_KEY);
  sessionStorage.removeItem(PARTNER_ID_KEY);
}

export function getPartnerToken() {
  return sessionStorage.getItem(PARTNER_TOKEN_KEY) || '';
}

export function setPartnerSession(partnerId: string, token: string) {
  sessionStorage.setItem(PARTNER_ID_KEY, partnerId);
  sessionStorage.setItem(PARTNER_TOKEN_KEY, token);
}

export function getActivePartnerId() {
  return sessionStorage.getItem(PARTNER_ID_KEY) || '';
}

type ApiEnvelope<T> = { data?: T; error?: string };

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function parse<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as ApiEnvelope<T> & Record<string, unknown>;
  if (!res.ok) {
    const msg = typeof body.error === 'string' ? body.error : '';
    throw new Error(msg || `Request failed (${res.status})`);
  }
  if (body.data !== undefined) return body.data;
  return body as T;
}

async function fetchWithRetry(url: string, init: RequestInit, attempts = 5): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, init);
      // Retry while API is coming back up
      if (res.status === 502 || res.status === 503 || res.status === 504) {
        await sleep(400 + i * 250);
        continue;
      }
      return res;
    } catch (err) {
      lastErr = err;
      await sleep(400 + i * 250);
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error('Cannot reach CUTLY admin API on 127.0.0.1:4001. Run: npm run api:ensure');
}

/** Admin routes — `x-admin-secret` only. */
export async function adminFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const secret = getAdminSecret();
  if (!secret) throw new Error('Enter ADMIN_SECRET first.');
  const headers = new Headers(init.headers);
  headers.set('x-admin-secret', secret);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const res = await fetchWithRetry(`${API_BASE}${path}`, { ...init, headers });
  return parse<T>(res);
}

/** Existing partner APIs — Bearer token minted by admin. */
export async function partnerFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getPartnerToken();
  if (!token) throw new Error('Open a partner first (mint token).');
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const res = await fetchWithRetry(`${PARTNER_API_BASE}${path}`, { ...init, headers });
  return parse<T>(res);
}

export type AdminPartnerRow = {
  id: string;
  email: string | null;
  name: string | null;
  phone: string | null;
  createdAt: string;
  shop: {
    id: string;
    name: string;
    city: string;
    phone: string | null;
    setupDone: boolean;
    isActive: boolean;
    kinds: string[];
    acceptingAppointments: boolean;
  } | null;
};

export type PartnerShop = {
  id: string;
  name: string;
  address: string;
  city: string;
  phone: string | null;
  latitude: number;
  longitude: number;
  kind: string | null;
  kinds: string[];
  productBrands: string[];
  chairCount: number;
  setupDone: boolean;
  acceptingAppointments: boolean;
  amenities: string[];
  photos: string[];
  services: {
    id?: string;
    name: string;
    durationMinutes: number;
    bufferMinutes: number;
    pricePaise: number;
    audience?: 'MEN' | 'WOMEN' | 'KIDS' | 'UNISEX';
    categoryId?: string | null;
  }[];
  barbers: { id: string; name: string; rating: number }[];
  today: { date: string; workersPresent: number; chairsInUse: number };
};

export type HourDay = { weekday: number; opensAt: string; closesAt: string };
