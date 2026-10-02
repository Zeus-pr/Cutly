import type { CatalogueService, ShopKindId } from '@/constants/catalogue';
import { useSessionStore } from '@/store/useSessionStore';

const base = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://10.0.2.2:4000/api';

export type PartnerShop = {
  id: string;
  name: string;
  address: string;
  city: string;
  kind: ShopKindId | null;
  chairCount: number;
  setupDone: boolean;
  amenities: string[];
  photos: string[];
  services: CatalogueService[];
  today: { date: string; workersPresent: number; chairsInUse: number };
};

export type HourBucket = { hour: number; label: string; count: number };

export type PartnerDashboard = {
  shop: PartnerShop | null;
  next: { id: string; name: string; service: string; startsAt: string; status: string } | null;
  todayCount: number;
  waiting: number;
  inService: number;
  done: number;
  revenuePaise: number;
  openSlots: number;
  peakHour: string | null;
  byHour: HourBucket[];
};

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const token = useSessionStore.getState().partnerToken;
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers || {})
      }
    });
  } catch {
    throw new Error('Cannot reach the CUTLY server.');
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Request failed');
  return payload.data as T;
}

function save(session: { token: string; partner: { email: string | null; name: string | null }; shop: PartnerShop | null }) {
  useSessionStore.getState().setPartnerSession(session.token, session.partner.email, session.partner.name, Boolean(session.shop?.setupDone));
}

export const partnerApi = {
  signUp: async (email: string, password: string, name: string) => {
    const session = await call<{ token: string; partner: { email: string | null; name: string | null }; shop: PartnerShop | null }>('/partner/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password, name })
    });
    save(session);
  },
  signIn: async (email: string, password: string) => {
    const session = await call<{ token: string; partner: { email: string | null; name: string | null }; shop: PartnerShop | null }>('/partner/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    save(session);
    return session.shop;
  },
  setup: async (body: {
    name: string;
    address: string;
    city: string;
    latitude: number;
    longitude: number;
    kind: ShopKindId;
    services: CatalogueService[];
    chairCount: number;
    workersPresent: number;
  }) => {
    const shop = await call<PartnerShop>('/partner/shop', { method: 'POST', body: JSON.stringify(body) });
    useSessionStore.getState().markSetup(true);
    return shop;
  },
  floor: (workersPresent: number, chairsInUse: number) =>
    call<PartnerShop>('/partner/floor', { method: 'PATCH', body: JSON.stringify({ workersPresent, chairsInUse }) }),
  amenities: (amenities: string[]) => call<PartnerShop>('/partner/amenities', { method: 'PATCH', body: JSON.stringify({ amenities }) }),
  photos: (photos: string[]) => call<PartnerShop>('/partner/photos', { method: 'PATCH', body: JSON.stringify({ photos }) }),
  dashboard: () => call<PartnerDashboard>('/partner/dashboard'),
  deleteAccount: () => call<{ deleted: boolean }>('/partner/account', { method: 'DELETE' })
};
