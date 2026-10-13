import { PrismaClient } from '@prisma/client';
import { assertTransition } from './bookingState';
import { formatIST } from './ist';
import { notifyUser } from './push';
import { notifyWaitingStarted } from './waitingNotify';
import { archivedIdempotencyKey } from './money';

const prisma = new PrismaClient();

export type ExpireFilter = {
  shopId?: string;
  userId?: string;
  bookingId?: string;
  now?: Date;
};

/**
 * AWAITING_SHOP past slot start (no grace) → EXPIRED + advance REFUNDED + customer notify.
 * Slot frees immediately because clash queries exclude EXPIRED.
 */
export async function expireMissedAwaitingBookings(filter: ExpireFilter = {}) {
  const now = filter.now ?? new Date();
  const rows = await prisma.booking.findMany({
    where: {
      status: 'AWAITING_SHOP',
      startsAt: { lte: now },
      ...(filter.shopId ? { shopId: filter.shopId } : {}),
      ...(filter.userId ? { userId: filter.userId } : {}),
      ...(filter.bookingId ? { id: filter.bookingId } : {})
    },
    include: {
      payment: true,
      shop: true,
      services: { include: { service: true } }
    }
  });

  let expired = 0;
  for (const row of rows) {
    assertTransition('AWAITING_SHOP', 'EXPIRED');
    const didExpire = await prisma.$transaction(async (tx) => {
      const updated = await tx.booking.updateMany({
        where: { id: row.id, status: 'AWAITING_SHOP' },
        data: { status: 'EXPIRED', idempotencyKey: archivedIdempotencyKey(row.id) }
      });
      if (updated.count === 0) return false;
      if (row.payment && row.payment.status !== 'REFUNDED') {
        await tx.bookingPayment.update({
          where: { bookingId: row.id },
          data: { status: 'REFUNDED' }
        });
      }
      return true;
    });
    if (!didExpire) continue;
    expired += 1;

    const when = formatIST(row.startsAt, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit'
    });
    void notifyUser(row.userId, {
      title: 'Booking not confirmed',
      body: `${row.shop.name} did not confirm before ${when}`,
      data: { bookingId: row.id, screen: 'booking' }
    });
  }

  return expired;
}

/** Periodic sweep while API is awake (pairs with expire-on-read). */
export function startAwaitingExpirySweep(intervalMs = 60_000) {
  const tick = () => {
    void expireMissedAwaitingBookings().catch(() => undefined);
    void notifyWaitingStarted().catch(() => undefined);
  };
  tick();
  return setInterval(tick, intervalMs);
}
