import type { BookingStatus } from '@prisma/client';
import { AppError } from './httpError';

/**
 * Booking lifecycle state = the Prisma `BookingStatus` enum (T6).
 * Refunds live on `BookingPayment.status`, never on the booking.
 */
export type BookingState = BookingStatus;

const transitions: Record<BookingState, BookingState[]> = {
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
  CANCELLED: [],
  REJECTED: [],
  NO_SHOW: []
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

/**
 * T6: the only moves a partner may make via PATCH /api/partner/bookings/:id/status.
 * Starting service (→ IN_SERVICE) goes through the PIN flow; accept/reject and cancel have their own routes.
 */
export const PARTNER_FLOOR_TRANSITIONS: Partial<Record<BookingState, readonly BookingState[]>> = {
  CONFIRMED: ['NO_SHOW'],
  ARRIVED: ['NO_SHOW'],
  IN_SERVICE: ['COMPLETED']
};

export const PARTNER_FLOOR_TARGETS = ['NO_SHOW', 'COMPLETED'] as const;
export type PartnerFloorTarget = (typeof PARTNER_FLOOR_TARGETS)[number];

export function canPartnerTransition(from: BookingState, to: BookingState) {
  return (PARTNER_FLOOR_TRANSITIONS[from] || []).includes(to);
}

/** 400 for a target partners can never set; 409 when the booking's current state doesn't allow it. */
export function assertPartnerTransition(from: BookingState, to: BookingState) {
  if (!(PARTNER_FLOOR_TARGETS as readonly string[]).includes(to)) {
    throw new AppError('Pick a valid floor status.', 400);
  }
  if (!canPartnerTransition(from, to)) {
    throw new AppError(`Can’t change a ${from} booking to ${to}.`, 409);
  }
}

type ConditionalUpdater = {
  booking: {
    updateMany(args: {
      where: { id: string; status: BookingState };
      data: { status: BookingState };
    }): Promise<{ count: number }>;
  };
};

/** Compare-and-set: only moves the booking if it is still in `from` (guards races with expiry/other devices). */
export async function setBookingStatusIfCurrent(
  db: ConditionalUpdater,
  bookingId: string,
  from: BookingState,
  to: BookingState
) {
  const { count } = await db.booking.updateMany({ where: { id: bookingId, status: from }, data: { status: to } });
  if (count !== 1) throw new AppError('This booking changed in the meantime. Refresh and try again.', 409);
}

type TransactionalDb<Tx extends ConditionalUpdater> = {
  $transaction<R>(fn: (tx: Tx) => Promise<R>): Promise<R>;
};

/**
 * T6: guarded status change + side effect (e.g. settle balance at shop) in ONE interactive
 * transaction. If the side effect throws, the status change rolls back too.
 */
export async function transitionWithSideEffect<Tx extends ConditionalUpdater>(
  db: TransactionalDb<Tx>,
  bookingId: string,
  from: BookingState,
  to: BookingState,
  effect: (tx: Tx) => Promise<void>
) {
  await db.$transaction(async (tx) => {
    await setBookingStatusIfCurrent(tx, bookingId, from, to);
    await effect(tx);
  });
}
