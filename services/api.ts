import type { AvailabilitySlot, Barber, Booking, Service, Shop } from '@/types/domain';
import { useSessionStore } from '@/store/useSessionStore';

const base = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://10.0.2.2:4000/api';

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const token = useSessionStore.getState().accessToken;
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

function qs(params: Record<string, string | number | boolean | undefined | null>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    search.set(key, String(value));
  });
  const text = search.toString();
  return text ? `?${text}` : '';
}

export const api = {
  shops: async (params?: { query?: string; openNow?: boolean; lat?: number; lng?: number; radiusKm?: number }) =>
    call<Shop[]>(`/shops${qs({
      query: params?.query,
      openNow: params?.openNow,
      lat: params?.lat,
      lng: params?.lng,
      radiusKm: params?.radiusKm ?? 25
    })}`),
  shop: async (id: string, origin?: { lat?: number; lng?: number }) =>
    call<Shop>(`/shops/${id}${qs({ lat: origin?.lat, lng: origin?.lng })}`),
  services: async (id: string) => call<Service[]>(`/shops/${id}/services`),
  barbers: async (id: string) => call<Barber[]>(`/shops/${id}/barbers`),
  availability: async (shopId: string, serviceId: string, date: string, barberId?: string) =>
    call<AvailabilitySlot[]>(`/shops/${shopId}/availability${qs({ serviceId, date, barberId })}`),
  createHold: async (input: { shopId: string; serviceId: string; barberId?: string; startsAt: string }) =>
    call<{ id: string; status: string; expiresAt: string }>('/bookings/hold', {
      method: 'POST',
      body: JSON.stringify({ ...input, idempotencyKey: `hold_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` })
    }),
  createBooking: async (input: { shopId: string; serviceId: string; barberId?: string; startsAt: string }) =>
    call<Booking>('/bookings', { method: 'POST', body: JSON.stringify(input) }),
  bookings: async () => call<Booking[]>('/bookings'),
  registerPush: async (pushToken: string) =>
    call<{ saved: boolean }>('/push/register', { method: 'POST', body: JSON.stringify({ pushToken }) }),
  baseUrl: base
};
