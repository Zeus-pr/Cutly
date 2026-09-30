export type Shop = {
  id: string; name: string; imageUrl: string; rating: number; reviewCount: number;
  distanceKm: number; isOpen: boolean; address: string; city: string;
  priceFromPaise: number; nextAvailableAt: string | null; services: string[]; tags: string[];
};
export type Service = { id: string; name: string; durationMinutes: number; pricePaise: number; description?: string };
export type Barber = { id: string; name: string; imageUrl?: string; rating: number; nextAvailableAt?: string | null };
export type AvailabilitySlot = { start: string; end: string; available: boolean; barberId?: string };
export type BookingStatus = 'HELD' | 'PAYMENT_PENDING' | 'CONFIRMED' | 'ARRIVED' | 'IN_SERVICE' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW' | 'EXPIRED';
export type Booking = { id: string; shop: Pick<Shop, 'id' | 'name' | 'imageUrl' | 'address'>; service: Service; barber: Barber; startsAt: string; endsAt: string; totalPaise: number; advancePaise: number; status: BookingStatus; bookingCode: string };
