import type { AvailabilitySlot, Barber, Booking, Service, Shop } from '@/types/domain';
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || process.env.API_BASE_URL || 'http://localhost:4000/api';
const mockShops: Shop[] = [
  { id: 'shop_urban', name: 'Urban Cuts', imageUrl: 'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=900', rating: 4.7, reviewCount: 128, distanceKm: 0.8, isOpen: true, address: '44 GT Road, Burdwan', city: 'Burdwan', priceFromPaise: 25000, nextAvailableAt: new Date(Date.now() + 12 * 60000).toISOString(), services: ['Haircut', 'Beard trim', 'Haircut + Beard'], tags: ['Fade specialists', 'Walk-ins welcome'] },
  { id: 'shop_blend', name: 'Blend Studio', imageUrl: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=900', rating: 4.9, reviewCount: 86, distanceKm: 1.4, isOpen: true, address: 'Station Road, Burdwan', city: 'Burdwan', priceFromPaise: 35000, nextAvailableAt: new Date(Date.now() + 34 * 60000).toISOString(), services: ['Haircut', 'Colour', 'Beard trim'], tags: ['Premium'] },
  { id: 'shop_classic', name: 'Classic Gents', imageUrl: 'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=900', rating: 4.5, reviewCount: 214, distanceKm: 2.1, isOpen: false, address: 'Sadar Bazaar, Burdwan', city: 'Burdwan', priceFromPaise: 18000, nextAvailableAt: null, services: ['Haircut', 'Beard trim'], tags: ['Value'] }
];
const services: Service[] = [{ id: 'svc_haircut', name: 'Haircut', durationMinutes: 30, pricePaise: 35000, description: 'A clean cut styled to your preference.' }, { id: 'svc_combo', name: 'Haircut + Beard', durationMinutes: 45, pricePaise: 50000, description: 'Fresh haircut with a beard trim and finish.' }, { id: 'svc_beard', name: 'Beard trim', durationMinutes: 20, pricePaise: 22000, description: 'Shape, line-up and finish.' }];
const barbers: Barber[] = [{ id: 'barber_rahul', name: 'Rahul', rating: 4.8, imageUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200', nextAvailableAt: new Date(Date.now() + 12 * 60000).toISOString() }, { id: 'barber_aman', name: 'Aman', rating: 4.7, imageUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200', nextAvailableAt: new Date(Date.now() + 42 * 60000).toISOString() }];
const wait = <T,>(value: T): Promise<T> => Promise.resolve(value);
export const api = {
  shops: async (params?: { query?: string; openNow?: boolean }) => wait(mockShops.filter((s) => (!params?.openNow || s.isOpen) && (!params?.query || [s.name, s.city, ...s.services].join(' ').toLowerCase().includes(params.query.toLowerCase())))),
  shop: async (id: string) => wait(mockShops.find((s) => s.id === id) || mockShops[0]),
  services: async (_id: string) => wait(services),
  barbers: async (_id: string) => wait(barbers),
  availability: async (_shopId: string, _serviceId: string, date: string, barberId?: string): Promise<AvailabilitySlot[]> => { const base = new Date(`${date}T10:00:00`); return Array.from({ length: 16 }, (_, i) => { const start = new Date(base.getTime() + i * 30 * 60000); return { start: start.toISOString(), end: new Date(start.getTime() + 30 * 60000).toISOString(), available: i !== 4 && i !== 9 && (!barberId || barberId === 'barber_rahul' || i % 3 !== 0), barberId: barberId || (i % 2 ? 'barber_rahul' : 'barber_aman') }; }); },
  createHold: async (input: { shopId: string; serviceId: string; barberId?: string; startsAt: string }) => wait({ holdId: `hold_${Date.now()}`, expiresAt: new Date(Date.now() + 5 * 60000).toISOString(), ...input }),
  createBooking: async (input: any): Promise<Booking> => wait({ id: `booking_${Date.now()}`, bookingCode: 'CU-4H7K2', status: 'CONFIRMED', shop: mockShops[0], service: services[0], barber: barbers[0], startsAt: input.startsAt, endsAt: new Date(new Date(input.startsAt).getTime() + 30 * 60000).toISOString(), totalPaise: 35000, advancePaise: 10500 }),
  bookings: async (): Promise<Booking[]> => wait([]),
  baseUrl: API_BASE_URL
};
