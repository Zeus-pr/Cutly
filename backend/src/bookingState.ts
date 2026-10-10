export type BookingState =
  | 'AVAILABLE'
  | 'HELD'
  | 'PAYMENT_PENDING'
  | 'AWAITING_SHOP'
  | 'CONFIRMED'
  | 'ARRIVED'
  | 'IN_SERVICE'
  | 'COMPLETED'
  | 'EXPIRED'
  | 'FAILED'
  | 'CANCELLED'
  | 'REJECTED'
  | 'NO_SHOW'
  | 'REFUNDED';

const transitions: Record<BookingState, BookingState[]> = {
  AVAILABLE: ['HELD'],
  HELD: ['PAYMENT_PENDING', 'AWAITING_SHOP', 'EXPIRED'],
  PAYMENT_PENDING: ['AWAITING_SHOP', 'FAILED', 'EXPIRED'],
  AWAITING_SHOP: ['CONFIRMED', 'REJECTED', 'CANCELLED', 'EXPIRED'],
  CONFIRMED: ['ARRIVED', 'CANCELLED', 'NO_SHOW', 'AWAITING_SHOP'],
  ARRIVED: ['IN_SERVICE', 'NO_SHOW'],
  IN_SERVICE: ['COMPLETED'],
  COMPLETED: [],
  EXPIRED: [],
  // Recover when Razorpay captured but client abandon raced ahead of confirm.
  FAILED: ['AWAITING_SHOP'],
  CANCELLED: ['REFUNDED'],
  REJECTED: [],
  NO_SHOW: [],
  REFUNDED: []
};

/**
 * Partner Floor primary actions (CJ-17) — only after shop accepted.
 * CONFIRMED → Start (code) opens PIN modal; `startBookingWithPin` marks ARRIVED then IN_SERVICE (CJ-51 / PS-25).
 * No separate Arrived button — check-in and start are one step.
 */
export const floorActions: Partial<Record<BookingState, { to: BookingState; label: string }[]>> = {
  CONFIRMED: [
    { to: 'IN_SERVICE', label: 'Start (code)' },
    { to: 'NO_SHOW', label: 'No-show' }
  ],
  ARRIVED: [
    { to: 'IN_SERVICE', label: 'Start (code)' },
    { to: 'NO_SHOW', label: 'No-show' }
  ],
  /** Done collects any remaining balance at shop + marks COMPLETED (revenue). */
  IN_SERVICE: [{ to: 'COMPLETED', label: 'Done' }]
};

/** Partner request panel (accept / reject). */
export const shopRequestActions: Partial<Record<BookingState, { to: BookingState; label: string }[]>> = {
  AWAITING_SHOP: [
    { to: 'CONFIRMED', label: 'Accept' },
    { to: 'REJECTED', label: 'Reject' }
  ]
};

export function canTransition(from: BookingState, to: BookingState) {
  return transitions[from].includes(to);
}

export function assertTransition(from: BookingState, to: BookingState) {
  if (!canTransition(from, to)) throw new Error(`Invalid booking transition: ${from} -> ${to}`);
}

export function nextFloorActions(status: BookingState) {
  return floorActions[status] || [];
}

export function nextShopRequestActions(status: BookingState) {
  return shopRequestActions[status] || [];
}
