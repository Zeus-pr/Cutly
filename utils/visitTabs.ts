import type { Booking, BookingStatus } from '@/types/domain';
import { todayKeyIST } from '@/utils/time';

export type VisitTabId = 'awaiting' | 'today' | 'upcoming' | 'served' | 'cancelled';

export const VISIT_TABS: { id: VisitTabId; label: string }[] = [
  { id: 'awaiting', label: 'Awaiting' },
  { id: 'today', label: 'Today' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'served', label: 'Served' },
  { id: 'cancelled', label: 'Cancelled' }
];

export function visitTabCounts(bookings: Booking[], now = new Date()): Record<VisitTabId, number> {
  return {
    awaiting: filterVisits(bookings, 'awaiting', now).length,
    today: filterVisits(bookings, 'today', now).length,
    upcoming: filterVisits(bookings, 'upcoming', now).length,
    served: filterVisits(bookings, 'served', now).length,
    cancelled: filterVisits(bookings, 'cancelled', now).length
  };
}

const AWAITING: BookingStatus[] = ['AWAITING_SHOP', 'PAYMENT_PENDING', 'HELD'];
const LIVE: BookingStatus[] = ['CONFIRMED', 'ARRIVED', 'IN_SERVICE'];
const SERVED: BookingStatus[] = ['COMPLETED'];
const CANCELLED: BookingStatus[] = ['CANCELLED', 'REJECTED', 'EXPIRED', 'NO_SHOW'];

function dayKey(iso: string) {
  return todayKeyIST(new Date(iso));
}

export function filterVisits(bookings: Booking[], tab: VisitTabId, now = new Date()): Booking[] {
  const today = todayKeyIST(now);
  return bookings
    .filter((b) => {
      const day = dayKey(b.startsAt);
      if (tab === 'awaiting') return AWAITING.includes(b.status);
      if (tab === 'today') return LIVE.includes(b.status) && day === today;
      if (tab === 'upcoming') {
        return LIVE.includes(b.status) && day > today;
      }
      if (tab === 'served') return SERVED.includes(b.status);
      if (tab === 'cancelled') return CANCELLED.includes(b.status);
      return false;
    })
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
}
