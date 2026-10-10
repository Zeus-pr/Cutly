import { PrismaClient } from '@prisma/client';
import { formatIST } from './ist';
import { notifyUser } from './push';

const prisma = new PrismaClient();

/**
 * CONFIRMED (not Arrived) at/after startsAt → one-time “waiting time started” push.
 */
export async function notifyWaitingStarted(filter: { shopId?: string; userId?: string } = {}) {
  const now = new Date();
  const rows = await prisma.booking.findMany({
    where: {
      status: 'CONFIRMED',
      startsAt: { lte: now },
      waitingStartedNotifiedAt: null,
      ...(filter.shopId ? { shopId: filter.shopId } : {}),
      ...(filter.userId ? { userId: filter.userId } : {})
    },
    include: { shop: true }
  });

  let sent = 0;
  for (const row of rows) {
    const marked = await prisma.booking.updateMany({
      where: { id: row.id, status: 'CONFIRMED', waitingStartedNotifiedAt: null },
      data: { waitingStartedNotifiedAt: now }
    });
    if (marked.count === 0) continue;
    const when = formatIST(row.startsAt, { hour: 'numeric', minute: '2-digit' });
    void notifyUser(row.userId, {
      title: 'Waiting time started',
      body: `${row.shop.name} · your ${when} visit has started — please arrive soon`,
      data: { bookingId: row.id, screen: 'booking' }
    });
    sent += 1;
  }
  return sent;
}
