import type { CatalogueService, ShopKindId } from '@/constants/catalogue';
import { getApiBaseUrl } from '@/services/apiBase';
import { useSessionStore } from '@/store/useSessionStore';

const base = getApiBaseUrl();

export type PartnerBarber = { id: string; name: string; rating: number | null };

export type PartnerShop = {
  id: string;
  name: string;
  address: string;
  city: string;
  /** Public shop contact customers dial from shop page Contact. */
  phone?: string | null;
  kind: ShopKindId | null;
  kinds?: string[];
  productBrands?: string[];
  chairCount: number;
  setupDone: boolean;
  acceptingAppointments?: boolean;
  /** ISO — pause new bookings for today only until shop close (IST). */
  acceptingPausedUntil?: string | null;
  amenities: string[];
  photos: string[];
  services: (CatalogueService & { id?: string })[];
  barbers: PartnerBarber[];
  today: { date: string; workersPresent: number; chairsInUse: number };
};

export type HourBucket = { hour: number; label: string; count: number };

export type FloorAction = { to: string; label: string };

export type FloorVisit = {
  kind: 'booking' | 'walkin';
  id: string;
  bookingCode: string;
  status: string;
  startsAt: string;
  endsAt: string;
  name: string;
  phone: string | null;
  service: string;
  serviceId: string | null;
  shopId: string | null;
  barberName: string;
  barberId: string;
  canNoShow: boolean;
  canReschedule: boolean;
  noShowAvailableAt: string;
  actions: FloorAction[];
  totalPaise?: number;
  advancePaise?: number;
  collectedPaise?: number;
  remainingPaise?: number;
  balanceSettled?: boolean;
  shopSettledAt?: string | null;
};

export type BookingRequest = {
  id: string;
  bookingCode: string;
  status: string;
  startsAt: string;
  endsAt: string;
  name: string;
  phone: string | null;
  service: string;
  barberName: string;
  barberId: string;
  totalPaise: number;
  advancePaise: number;
  actions: FloorAction[];
};

export type PartnerDashboard = {
  shop: PartnerShop | null;
  next: { id: string; name: string; service: string; startsAt: string; status: string } | null;
  visits: FloorVisit[];
  requests: BookingRequest[];
  requestCount: number;
  todayCount: number;
  waiting: number;
  inService: number;
  done: number;
  revenuePaise: number;
  advanceCollectedPaise?: number;
  remainingPaise?: number;
  openSlots: number;
  peakHour: string | null;
  byHour: HourBucket[];
};

export type PartnerHistoryItem = {
  id: string;
  bookingCode: string;
  status: string;
  statusLabel: string;
  startsAt: string;
  endsAt: string;
  name: string;
  phone: string | null;
  service: string;
  barberName: string;
  barberId: string;
  advancePaise: number;
  totalPaise?: number;
  collectedPaise?: number;
  remainingPaise?: number;
  paymentStatus: string | null;
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
    kind?: ShopKindId;
    kinds: ShopKindId[];
    productBrands?: string[];
    services: CatalogueService[];
    chairCount: number;
    workersPresent: number;
  }) => {
    const shop = await call<PartnerShop>('/partner/shop', { method: 'POST', body: JSON.stringify(body) });
    useSessionStore.getState().markSetup(true);
    return shop;
  },
  shop: () => call<PartnerShop>('/partner/shop'),
  floor: (workersPresent: number, chairsInUse: number) =>
    call<PartnerShop>('/partner/floor', { method: 'PATCH', body: JSON.stringify({ workersPresent, chairsInUse }) }),
  barbers: (barbers: { id?: string; name: string }[]) =>
    call<PartnerShop>('/partner/barbers', { method: 'PATCH', body: JSON.stringify({ barbers }) }),
  amenities: (amenities: string[]) => call<PartnerShop>('/partner/amenities', { method: 'PATCH', body: JSON.stringify({ amenities }) }),
  setPhone: (phone: string | null) =>
    call<PartnerShop>('/partner/shop/phone', { method: 'PATCH', body: JSON.stringify({ phone: phone ?? '' }) }),
  photos: (photos: string[]) => call<PartnerShop>('/partner/photos', { method: 'PATCH', body: JSON.stringify({ photos }) }),
  hours: () =>
    call<{ shopId: string; days: { weekday: number; opensAt: string; closesAt: string }[] }>('/partner/hours'),
  setHours: (days: { weekday: number; opensAt: string; closesAt: string }[]) =>
    call<{ shopId: string; days: { weekday: number; opensAt: string; closesAt: string }[] }>('/partner/hours', {
      method: 'PUT',
      body: JSON.stringify({ days })
    }),
  setAcceptingAppointments: (mode: 'open' | 'today' | 'temporary') =>
    call<PartnerShop>('/partner/accepting', {
      method: 'PATCH',
      body: JSON.stringify({ mode })
    }),
  setServices: (
    services: {
      id?: string;
      name: string;
      durationMinutes: number;
      pricePaise: number;
      bufferMinutes?: number;
      audience?: 'MEN' | 'WOMEN' | 'KIDS' | 'UNISEX';
    }[]
  ) => call<PartnerShop>('/partner/services', { method: 'PUT', body: JSON.stringify({ services }) }),
  dashboard: () => call<PartnerDashboard>('/partner/dashboard'),
  requests: () => call<{ items: BookingRequest[]; requestCount: number }>('/partner/requests'),
  history: () => call<{ items: PartnerHistoryItem[] }>('/partner/history'),
  setBookingStatus: (id: string, status: 'ARRIVED' | 'IN_SERVICE' | 'COMPLETED' | 'NO_SHOW') =>
    call<FloorVisit>(`/partner/bookings/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    }),
  startBookingWithPin: (id: string, verifyPin: string) =>
    call<FloorVisit>(`/partner/bookings/${id}/start`, {
      method: 'POST',
      body: JSON.stringify({ verifyPin })
    }),
  collectBalance: (id: string) =>
    call<FloorVisit>(`/partner/bookings/${id}/collect-balance`, {
      method: 'POST',
      body: '{}'
    }),
  respondToRequest: (id: string, decision: 'ACCEPT' | 'REJECT') =>
    call<BookingRequest>(`/partner/bookings/${id}/respond`, {
      method: 'POST',
      body: JSON.stringify({ decision })
    }),
  rescheduleBooking: (id: string, body: { startsAt: string; barberId?: string }) =>
    call<FloorVisit>(`/partner/bookings/${id}/reschedule`, {
      method: 'POST',
      body: JSON.stringify(body)
    }),
  createWalkIn: (body: { barberId: string; durationMinutes: number; guestName?: string }) =>
    call<FloorVisit>('/partner/walk-ins', { method: 'POST', body: JSON.stringify(body) }),
  setWalkInStatus: (id: string, status: 'COMPLETED' | 'CANCELLED') =>
    call<FloorVisit>(`/partner/walk-ins/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    }),
  deleteAccount: () => call<{ deleted: boolean }>('/partner/account', { method: 'DELETE' }),
  registerPush: (pushToken: string) =>
    call<{ saved: boolean }>('/partner/push/register', {
      method: 'POST',
      body: JSON.stringify({ pushToken })
    })
};
