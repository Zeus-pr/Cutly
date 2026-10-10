export type Shop = {
  id: string;
  name: string;
  /** Partner setup ShopKind — SALON | SPA | NAILS | TATTOO | PIERCING (+ legacy) */
  kind?: string | null;
  /** Multi-select kinds when set. */
  kinds?: string[];
  imageUrl: string;
  /** Null when no reviews yet — UI shows “New”. */
  rating: number | null;
  reviewCount: number;
  distanceKm: number;
  isOpen: boolean;
  /** Card chip from server hours, e.g. "Open · Closes 9:00 PM" */
  hoursChip: string;
  /** Detail subtitle, e.g. "Closes at 9:00 PM" */
  hoursDetail: string;
  address: string;
  city: string;
  /** Public shop contact (E.164). Contact tile dials this when set. */
  phone?: string | null;
  priceFromPaise: number;
  nextAvailableAt: string | null;
  services: string[];
  tags: string[];
  /** Full amenity list (shop detail About). */
  amenities?: string[];
  /** Product brands (shop detail). */
  productBrands?: string[];
  /** Gallery URLs (hero collage); may be empty → UI placeholders. */
  photos?: string[];
  latitude?: number;
  longitude?: number;
};
export type ServiceAudience = 'MEN' | 'WOMEN' | 'KIDS' | 'UNISEX';
export type Service = {
  id: string;
  name: string;
  durationMinutes: number;
  pricePaise: number;
  description?: string;
  /** Who the line is for (partner-set). Null/absent on older shops → name heuristic. */
  audience?: ServiceAudience | null;
  /** Ops global browse tile id (CJ-71). Null → name-match fallback. */
  categoryId?: string | null;
  /** Label for Ops-added tiles not in the bundled SERVICE_CATEGORIES list. */
  categoryLabel?: string | null;
};
export type Barber = {
  id: string;
  name: string;
  imageUrl?: string;
  rating: number | null;
  reviewCount?: number;
  nextAvailableAt?: string | null;
};
export type ShopReview = {
  id: string;
  shopRating: number;
  barberRating: number;
  text: string | null;
  createdAt: string;
  customerName: string;
  barber: { id: string; name: string };
};
export type AvailabilitySlot = { start: string; end: string; available: boolean; barberId?: string };
export type BookingStatus =
  | 'HELD'
  | 'PAYMENT_PENDING'
  | 'AWAITING_SHOP'
  | 'CONFIRMED'
  | 'ARRIVED'
  | 'IN_SERVICE'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'REJECTED'
  | 'NO_SHOW'
  | 'EXPIRED';
export type Booking = {
  id: string;
  shop: Pick<Shop, 'id' | 'name' | 'imageUrl' | 'address'> & {
    latitude?: number | null;
    longitude?: number | null;
  };
  service: Service;
  /** CJ-27 multi-service package lines (when present). */
  services?: Service[];
  barber: Barber;
  startsAt: string;
  endsAt: string;
  totalPaise: number;
  advancePaise: number;
  /** Remaining to collect (0 when fully paid / settled at shop). */
  remainingPaise?: number;
  /** True when captured amount covers total. */
  balanceSettled?: boolean;
  status: BookingStatus;
  bookingCode: string;
  /** Rapido/Uber-style 4-digit code — show to partner to start service. */
  verifyPin?: string | null;
  canCancel?: boolean;
  canReschedule?: boolean;
  canReview?: boolean;
  hasReview?: boolean;
  refundOnCancel?: boolean;
  cancelPolicyLabel?: string;
};
