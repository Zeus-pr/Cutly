import { bookingOccupiesChair } from './activeBooking';

/** Half-open [start, end) overlap. */
export function rangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Active tickets that block another booking for the same customer.
 * Chair-free statuses + COMPLETED (visit already done).
 */
export function customerTicketBlocksOverlap(status: string) {
  if (status === 'COMPLETED') return false;
  return bookingOccupiesChair(status);
}

export const CUSTOMER_OVERLAP_MESSAGE =
  'You already have a booking that overlaps this time. Cancel or finish that visit first.';
