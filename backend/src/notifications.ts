import { PrismaClient } from '@prisma/client';
import { userFromToken } from './auth';

const prisma = new PrismaClient();

export type InboxNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  data: { bookingId?: string; screen?: string; couponCode?: string; type?: string } | null;
  readAt: string | null;
  createdAt: string;
};

function parseData(raw: string | null): InboxNotification['data'] {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as InboxNotification['data'];
  } catch {
    return null;
  }
}

function mapRow(row: {
  id: string;
  type: string;
  title: string;
  body: string;
  data: string | null;
  readAt: Date | null;
  createdAt: Date;
}): InboxNotification {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    data: parseData(row.data),
    readAt: row.readAt?.toISOString() || null,
    createdAt: row.createdAt.toISOString()
  };
}

export async function listUserNotifications(token: string) {
  const user = await userFromToken(token);
  const rows = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 80
  });
  const items = rows.map(mapRow);
  return {
    items,
    unreadCount: items.filter((row) => !row.readAt).length
  };
}

export async function markNotificationRead(token: string, notificationId: string) {
  const user = await userFromToken(token);
  const row = await prisma.notification.findFirst({ where: { id: notificationId, userId: user.id } });
  if (!row) throw new Error('Notification not found.');
  if (!row.readAt) {
    await prisma.notification.update({
      where: { id: row.id },
      data: { readAt: new Date() }
    });
  }
  return { ok: true as const };
}

export async function markAllNotificationsRead(token: string) {
  const user = await userFromToken(token);
  await prisma.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() }
  });
  return { ok: true as const };
}

/** Persist inbox row even when push token is missing. */
export async function recordUserNotification(
  userId: string,
  message: { title: string; body: string; data?: Record<string, string> }
) {
  const type = message.data?.type || 'booking';
  const data =
    message.data && Object.keys(message.data).length ? JSON.stringify(message.data) : null;
  await prisma.notification.create({
    data: {
      userId,
      type,
      title: message.title,
      body: message.body,
      data
    }
  });
}
