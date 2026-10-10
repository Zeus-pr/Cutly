/**
 * Cancelled / missed / rejected — free for dashboard lists + EXCLUDE.
 * COMPLETED stays in partner Home revenue / hour bars (not listed here).
 */
export const BOOKING_FREE_STATUSES = [
  'CANCELLED',
  'EXPIRED',
  'FAILED',
  'NO_SHOW',
  'REJECTED'
] as const;

/** Chair / slot grid free set — includes Done so early finish can rebook (CJ-69). */
export const AVAILABILITY_FREE_STATUSES = [...BOOKING_FREE_STATUSES, 'COMPLETED'] as const;

export function bookingOccupiesChair(status: string) {
  return !(AVAILABILITY_FREE_STATUSES as readonly string[]).includes(status);
}
