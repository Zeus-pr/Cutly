import { PrismaClient } from '@prisma/client';
import { recordUserNotification } from './notifications';

const prisma = new PrismaClient();

type PushMessage = {
  title: string;
  body: string;
  data?: Record<string, string>;
  /** Android notification channel (must exist on device). */
  channelId?: string;
};

type ExpoTicket = {
  status?: string;
  id?: string;
  message?: string;
  details?: { error?: string };
};

export async function sendExpoPush(to: string, message: PushMessage) {
  if (!to?.trim()) return { ok: false as const, reason: 'empty_token' };
  try {
    const payload: Record<string, unknown> = {
      to,
      sound: 'default',
      priority: 'high',
      ttl: 3600,
      title: message.title,
      body: message.body,
      data: message.data || { type: 'booking' }
    };
    if (message.channelId) payload.channelId = message.channelId;
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate'
      },
      body: JSON.stringify(payload)
    });
    const json = (await response.json().catch(() => ({}))) as {
      data?: ExpoTicket | ExpoTicket[];
      errors?: { message?: string }[];
    };
    const ticket = Array.isArray(json.data) ? json.data[0] : json.data;
    if (!response.ok || ticket?.status === 'error') {
      const err =
        ticket?.details?.error ||
        ticket?.message ||
        json.errors?.[0]?.message ||
        `expo_push_http_${response.status}`;
      console.warn('[push] Expo send failed', { to: to.slice(0, 24), err });
      if (err === 'DeviceNotRegistered') {
        return { ok: false as const, reason: 'DeviceNotRegistered' as const };
      }
      return { ok: false as const, reason: err };
    }
    return { ok: true as const };
  } catch (err) {
    console.warn('[push] Expo send threw', err instanceof Error ? err.message : err);
    return { ok: false as const, reason: 'network' };
  }
}

export async function notifyUser(
  userId: string,
  message: { title: string; body: string; data?: Record<string, string> }
) {
  await recordUserNotification(userId, message).catch((err) => {
    console.warn('[push] inbox persist failed', err instanceof Error ? err.message : err);
  });
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.pushToken) {
    console.warn('[push] customer has no pushToken', userId);
    return;
  }
  const result = await sendExpoPush(user.pushToken, {
    ...message,
    channelId: 'visits_v2',
    data: { type: 'booking', ...(message.data || {}) }
  });
  if (result.reason === 'DeviceNotRegistered') {
    await prisma.user.update({ where: { id: userId }, data: { pushToken: null } }).catch(() => undefined);
  }
}

/** CJ-25: ping shop owner — works with partner app background/killed when token registered. */
export async function notifyShopPartner(
  shopId: string,
  message: { title: string; body: string; data?: Record<string, string> }
) {
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    include: { owner: true }
  });
  const owner = shop?.owner;
  const token = owner?.pushToken;
  if (!token) {
    console.warn('[push] partner has no pushToken for shop', shopId, owner?.id || 'no-owner');
    return;
  }
  const result = await sendExpoPush(token, {
    ...message,
    channelId: 'shop_requests_v2',
    data: { type: 'shop_booking', ...(message.data || {}) }
  });
  if (result.reason === 'DeviceNotRegistered' && owner) {
    await prisma.partner
      .update({ where: { id: owner.id }, data: { pushToken: null } })
      .catch(() => undefined);
  }
}
