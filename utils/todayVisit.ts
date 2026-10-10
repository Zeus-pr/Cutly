import type { Booking, BookingStatus } from '../types/domain';
import { todayKeyIST } from './time';

export type TodayVisitPhase = 'upcoming' | 'started' | 'completed';

/** Teal — upcoming confirmed / arrived. */
export const VISIT_TILE_TEAL = '#05998C';
/** Golden yellow — service in progress. */
export const VISIT_TILE_GOLD = '#D4A017';
/** Purple navy — completed, ask for review. */
export const VISIT_TILE_NAVY = '#2A2758';

/**
 * Home hero visit for today (IST).
 * Priority: IN_SERVICE → CONFIRMED/ARRIVED → COMPLETED needing review (not dismissed).
 */
export function pickTodayVisit(
  bookings: Booking[],
  now = new Date(),
  opts?: { dismissedReviewIds?: Set<string> | string[] }
): Booking | null {
  const today = todayKeyIST(now);
  const dismissed = toIdSet(opts?.dismissedReviewIds);

  const inService = bookings
    .filter((b) => b.status === 'IN_SERVICE' && todayKeyIST(new Date(b.startsAt)) === today)
    .sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime());
  if (inService.length) return inService[0];

  const live = bookings.filter(
    (b) =>
      (b.status === 'CONFIRMED' || b.status === 'ARRIVED') &&
      todayKeyIST(new Date(b.startsAt)) === today
  );
  if (live.length) {
    const nowMs = now.getTime();
    const upcoming = live
      .filter((b) => new Date(b.startsAt).getTime() >= nowMs)
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
    if (upcoming.length) return upcoming[0];
    return live.sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime())[0];
  }

  const needsReview = bookings
    .filter(
      (b) =>
        b.status === 'COMPLETED' &&
        todayKeyIST(new Date(b.startsAt)) === today &&
        b.canReview !== false &&
        !b.hasReview &&
        !dismissed.has(b.id)
    )
    .sort((a, b) => new Date(b.endsAt).getTime() - new Date(a.endsAt).getTime());
  return needsReview[0] || null;
}

export function todayVisitPhase(status: BookingStatus): TodayVisitPhase {
  if (status === 'IN_SERVICE') return 'started';
  if (status === 'COMPLETED') return 'completed';
  return 'upcoming';
}

export function todayVisitBg(phase: TodayVisitPhase): string {
  if (phase === 'started') return VISIT_TILE_GOLD;
  if (phase === 'completed') return VISIT_TILE_NAVY;
  return VISIT_TILE_TEAL;
}

export function todayVisitTitle(status: BookingStatus): string {
  if (status === 'IN_SERVICE') return 'Service started';
  if (status === 'COMPLETED') return 'Service completed!';
  return 'Upcoming visits';
}

export function todayVisitShowsPin(status: BookingStatus): boolean {
  return status === 'CONFIRMED' || status === 'ARRIVED';
}

export function todayVisitServiceLabel(booking: Booking): string {
  if (booking.services?.length) {
    return booking.services.map((s) => s.name).join(' · ');
  }
  return booking.service.name;
}

function toIdSet(ids?: Set<string> | string[]) {
  if (!ids) return new Set<string>();
  return ids instanceof Set ? ids : new Set(ids);
}
