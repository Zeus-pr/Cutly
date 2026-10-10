import type { AvailabilitySlot, Barber, Booking, Service, Shop, ShopReview } from '@/types/domain';
import { useSessionStore } from '@/store/useSessionStore';

import { getApiBaseUrl } from '@/services/apiBase';

const base = getApiBaseUrl();

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const token = useSessionStore.getState().accessToken;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers || {})
      }
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Server timed out. Is the CUTLY API running on :4000?');
    }
    throw new Error('Cannot reach the CUTLY server. Is the API running?');
  } finally {
    clearTimeout(timer);
  }
  const payload = await response.json().catch(() => ({} as { error?: string }));
  if (!response.ok) {
    if (response.status === 530 || response.status === 502 || response.status === 1033) {
      throw new Error('CutLy API tunnel is down. Keep the Mac awake with the cutly-api tunnel running.');
    }
    throw new Error(payload.error || `Request failed (${response.status})`);
  }
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
  shops: async (params?: {
    query?: string;
    openNow?: boolean;
    lat?: number;
    lng?: number;
    radiusKm?: number;
    serviceName?: string;
    kinds?: string;
    serviceHints?: string;
  }) =>
    call<Shop[]>(`/shops${qs({
      query: params?.query,
      // Omit when false — avoid openNow=false query string (server must treat it as off).
      openNow: params?.openNow ? true : undefined,
      lat: params?.lat,
      lng: params?.lng,
      radiusKm: params?.radiusKm ?? 25,
      serviceName: params?.serviceName,
      kinds: params?.kinds,
      serviceHints: params?.serviceHints
    })}`),
  shop: async (id: string, origin?: { lat?: number; lng?: number }) =>
    call<Shop>(`/shops/${id}${qs({ lat: origin?.lat, lng: origin?.lng })}`),
  services: async (id: string) => call<Service[]>(`/shops/${id}/services`),
  shopHours: async (id: string) =>
    call<{ shopId: string; shopName: string; days: { weekday: number; opensAt: string; closesAt: string }[] }>(
      `/shops/${id}/hours`
    ),
  barbers: async (id: string) => call<Barber[]>(`/shops/${id}/barbers`),
  shopReviews: async (id: string) => call<ShopReview[]>(`/shops/${id}/reviews`),
  availability: async (shopId: string, serviceIds: string | string[], date: string, barberId?: string) => {
    const ids = Array.isArray(serviceIds) ? serviceIds : [serviceIds];
    return call<AvailabilitySlot[]>(
      `/shops/${shopId}/availability${qs({
        serviceIds: ids.join(','),
        serviceId: ids[0],
        date,
        barberId
      })}`
    );
  },
  createHold: async (input: {
    shopId: string;
    serviceId?: string;
    serviceIds?: string[];
    barberId?: string;
    startsAt: string;
  }) =>
    call<{
      id: string;
      status: string;
      expiresAt: string;
      startsAt: string;
      barberId: string;
      serviceIds?: string[];
    }>('/bookings/hold', {
      method: 'POST',
      body: JSON.stringify(input)
    }),
  createBooking: async (input: {
    shopId: string;
    serviceId?: string;
    serviceIds?: string[];
    barberId?: string;
    startsAt: string;
    holdId: string;
    idempotencyKey: string;
    payMode?: 'shop' | 'app';
  }) =>
    call<
      Booking & {
        checkout: {
          keyId: string;
          orderId: string;
          amountPaise: number;
          currency: string;
          description: string;
        } | null;
      }
    >('/bookings', { method: 'POST', body: JSON.stringify(input) }),
  favourites: async (origin?: { lat?: number; lng?: number }) =>
    call<Shop[]>(`/favourites${qs({ lat: origin?.lat, lng: origin?.lng })}`),
  isFavourite: async (shopId: string) => call<{ favourite: boolean }>(`/favourites/${shopId}`),
  setFavourite: async (shopId: string, favourite: boolean) =>
    call<{ shopId: string; favourite: boolean }>(`/favourites/${shopId}`, {
      method: favourite ? 'POST' : 'DELETE',
      body: favourite ? '{}' : undefined
    }),
  confirmPayment: async (
    bookingId: string,
    input: { razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string }
  ) => call<Booking>(`/bookings/${bookingId}/confirm-payment`, { method: 'POST', body: JSON.stringify(input) }),
  abandonPayment: async (bookingId: string) =>
    call<{ abandoned: boolean; status: string }>(`/bookings/${bookingId}/abandon-payment`, {
      method: 'POST',
      body: '{}'
    }),
  bookings: async () => call<Booking[]>('/bookings'),
  booking: async (id: string) => call<Booking>(`/bookings/${id}`),
  notifications: async () =>
    call<{
      items: {
        id: string;
        type: string;
        title: string;
        body: string;
        data: { bookingId?: string; screen?: string; couponCode?: string; type?: string } | null;
        readAt: string | null;
        createdAt: string;
      }[];
      unreadCount: number;
    }>('/notifications'),
  markNotificationRead: async (id: string) =>
    call<{ ok: boolean }>(`/notifications/${id}/read`, { method: 'POST', body: '{}' }),
  markAllNotificationsRead: async () =>
    call<{ ok: boolean }>('/notifications/read-all', { method: 'POST', body: '{}' }),
  cancelBooking: async (id: string) => call<Booking>(`/bookings/${id}/cancel`, { method: 'POST', body: '{}' }),
  rescheduleBooking: async (
    id: string,
    input: { startsAt: string; barberId?: string; holdId: string }
  ) => call<Booking>(`/bookings/${id}/reschedule`, { method: 'POST', body: JSON.stringify(input) }),
  createReview: async (
    bookingId: string,
    input: { shopRating: number; barberRating: number; text?: string }
  ) =>
    call<{ id: string; shopRating: number; barberRating: number; text: string | null; createdAt: string }>(
      `/bookings/${bookingId}/review`,
      { method: 'POST', body: JSON.stringify(input) }
    ),
  registerPush: async (pushToken: string) =>
    call<{ saved: boolean }>('/push/register', { method: 'POST', body: JSON.stringify({ pushToken }) }),
  baseUrl: base
};
