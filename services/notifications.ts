import { AppState, Platform } from 'react-native';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { api } from '@/services/api';
import { partnerApi } from '@/services/partner';
import { useSessionStore } from '@/store/useSessionStore';
import { formatDateTime } from '@/utils/time';

type NotificationsModule = typeof import('expo-notifications');

/**
 * Expo Go (SDK 53+) removed Android remote push from `expo-notifications` and throws on import.
 * Dev build / iOS Expo Go still load the module. Lazy-require so Android Expo Go does not crash.
 * @see https://docs.expo.dev/develop/development-builds/introduction/
 */
function loadNotifications(): NotificationsModule | null {
  // Store client = Expo Go
  if (Constants.appOwnership === 'expo' && Platform.OS === 'android') {
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-notifications') as NotificationsModule;
  } catch {
    return null;
  }
}

const Notifications = loadNotifications();

if (Notifications) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false
    })
  });
}

let lastRegisterError: string | null = null;
let lastRegisterOk = false;

export function getPushRegisterStatus() {
  return {
    supported: Boolean(Notifications),
    ok: lastRegisterOk,
    error: lastRegisterError
  };
}

export async function ensureNotificationPermissions() {
  if (!Notifications) {
    lastRegisterError = Platform.OS === 'android' ? 'Use the CUTLY APK (not Expo Go) for partner alerts.' : 'Notifications unavailable.';
    return false;
  }
  if (!Device.isDevice && Platform.OS === 'ios') {
    lastRegisterError = 'Push needs a physical device.';
    return false;
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted || current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) return true;
  const asked = await Notifications.requestPermissionsAsync();
  const ok = asked.granted || asked.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
  if (!ok) lastRegisterError = 'Notification permission denied.';
  return ok;
}

/**
 * Android channels are immutable after first create — bump id when sound/importance changes.
 * Do not set sound: 'default' (treated as missing custom file). Omit sound → system default.
 */
export const ANDROID_CHANNEL_VISITS = 'visits_v2';
export const ANDROID_CHANNEL_SHOP = 'shop_requests_v2';

async function ensureAndroidChannels() {
  if (!Notifications || Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_VISITS, {
    name: 'Visits',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 180, 120, 180],
    lightColor: '#F06B55',
    enableVibrate: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd: false
  });
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_SHOP, {
    name: 'Shop requests',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 120, 250, 120, 250],
    lightColor: '#F06B55',
    enableVibrate: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd: true
  });
}

function resolveProjectId(): string | null {
  const fromConfig =
    Constants.easConfig?.projectId ||
    Constants.expoConfig?.extra?.eas?.projectId ||
    (Constants as { manifest2?: { extra?: { eas?: { projectId?: string } } } }).manifest2?.extra?.eas
      ?.projectId ||
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
  if (typeof fromConfig === 'string' && fromConfig.trim()) return fromConfig.trim();
  return null;
}

export async function registerForPushNotifications() {
  if (!Notifications) {
    lastRegisterOk = false;
    lastRegisterError =
      Platform.OS === 'android'
        ? 'Partner alerts need the CUTLY APK (Expo Go cannot receive Android push).'
        : 'Notifications module missing.';
    return null;
  }
  const allowed = await ensureNotificationPermissions();
  if (!allowed) {
    lastRegisterOk = false;
    return null;
  }
  await ensureAndroidChannels();
  const projectId = resolveProjectId();
  if (!projectId) {
    lastRegisterOk = false;
    lastRegisterError =
      'Missing Expo projectId (app.json extra.eas.projectId or EXPO_PUBLIC_EAS_PROJECT_ID).';
    return null;
  }
  let expoToken: string;
  try {
    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    expoToken = token.data;
  } catch (err) {
    lastRegisterOk = false;
    const msg = err instanceof Error ? err.message : 'Could not get push token.';
    console.warn('[push] getExpoPushTokenAsync failed:', msg);
    // Only blame missing google-services when Expo native truly cannot load FirebaseMessaging.
    const missingNativeFcm =
      msg.includes('googleServicesFile') ||
      msg.includes('Unable to get Firebase Messaging instance') ||
      (msg.includes('Default FirebaseApp is not initialized') && msg.includes('Firebase'));
    lastRegisterError = missingNativeFcm
      ? 'Firebase/FCM not configured — need google-services.json + rebuild (install on this device).'
      : msg.length > 160
        ? `${msg.slice(0, 157)}…`
        : msg;
    return null;
  }

  try {
    const session = useSessionStore.getState();
    if (session.accessToken) {
      await api.registerPush(expoToken);
    }
    if (session.partnerToken) {
      await partnerApi.registerPush(expoToken);
    }
    if (!session.accessToken && !session.partnerToken) {
      lastRegisterOk = false;
      lastRegisterError = 'Sign in to save the alert token.';
      return expoToken;
    }
    lastRegisterOk = true;
    lastRegisterError = null;
    return expoToken;
  } catch (err) {
    lastRegisterOk = false;
    const msg = err instanceof Error ? err.message : 'Could not save push token.';
    console.warn('[push] registerPush failed:', msg);
    lastRegisterError = msg.length > 160 ? `${msg.slice(0, 157)}…` : msg;
    return expoToken;
  }
}

/** CJ-25: register Expo push for the signed-in partner (shop pings). */
export async function registerPartnerPushNotifications() {
  return registerForPushNotifications();
}

type PushData = {
  type?: string;
  bookingId?: string;
  screen?: string;
};

function routeFromPushData(data: PushData | undefined) {
  if (!data) return;
  const session = useSessionStore.getState();
  if (data.type === 'shop_booking' || data.screen === 'requests') {
    if (session.partnerToken) router.push('/partner/requests');
    return;
  }
  if (data.bookingId && session.accessToken) {
    router.push({ pathname: '/booking/[id]', params: { id: String(data.bookingId) } });
    return;
  }
  if (data.screen === 'booking' && session.accessToken) {
    router.push('/(tabs)/bookings');
  }
}

let pushListenersAttached = false;

/**
 * Wire remote push → deep link. Works when app is background/killed (tap) or foreground (received).
 * Call once from root layout after hydrate.
 */
export function attachPushResponseListeners(onForeground?: (data: PushData) => void) {
  if (!Notifications || pushListenersAttached) {
    return () => undefined;
  }
  pushListenersAttached = true;

  const received = Notifications.addNotificationReceivedListener((notification) => {
    const data = (notification.request.content.data || {}) as PushData;
    onForeground?.(data);
  });

  const response = Notifications.addNotificationResponseReceivedListener((event) => {
    const data = (event.notification.request.content.data || {}) as PushData;
    routeFromPushData(data);
  });

  void Notifications.getLastNotificationResponseAsync().then((last) => {
    if (!last) return;
    const data = (last.notification.request.content.data || {}) as PushData;
    routeFromPushData(data);
  });

  const appState = AppState.addEventListener('change', (state) => {
    if (state === 'active') void registerForPushNotifications();
  });

  return () => {
    pushListenersAttached = false;
    received.remove();
    response.remove();
    appState.remove();
  };
}

/** Loud local banner when partner poll finds a new request (works even if remote push token missing). */
export async function notifyShopRequestLocal(input: {
  bookingId: string;
  bookingCode: string;
  serviceName: string;
  whenLabel: string;
}) {
  if (!Notifications) return;
  const allowed = await ensureNotificationPermissions();
  if (!allowed) return;
  await ensureAndroidChannels();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'New booking request',
      body: `Accept or reject · ${input.serviceName} · ${input.whenLabel} · ${input.bookingCode}`,
      sound: true,
      data: { type: 'shop_booking', bookingId: input.bookingId, screen: 'requests' },
      ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_SHOP } : {})
    },
    trigger: null
  });
}

const seenRequestIds = new Set<string>();
let requestBaselineReady = false;

/** Call after each partner requests fetch — fires sound for newly appeared ids. */
export async function alertNewShopRequests(
  items: { id: string; bookingCode: string; service: string; startsAt: string }[]
) {
  const ids = items.map((row) => row.id);
  if (!requestBaselineReady) {
    ids.forEach((id) => seenRequestIds.add(id));
    requestBaselineReady = true;
    return;
  }
  const fresh = items.filter((row) => !seenRequestIds.has(row.id));
  ids.forEach((id) => seenRequestIds.add(id));
  for (const row of fresh) {
    await notifyShopRequestLocal({
      bookingId: row.id,
      bookingCode: row.bookingCode,
      serviceName: row.service,
      whenLabel: formatDateTime(row.startsAt)
    });
  }
}

export function resetShopRequestAlertBaseline() {
  seenRequestIds.clear();
  requestBaselineReady = false;
}

export async function notifyBookingConfirmed(input: {
  shopName: string;
  serviceName: string;
  startsAt: string;
  bookingCode: string;
  bookingId?: string;
}) {
  if (!Notifications) return;
  const allowed = await ensureNotificationPermissions();
  if (!allowed) return;
  await ensureAndroidChannels();
  const when = formatDateTime(input.startsAt);
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Booking confirmed',
      body: `${input.serviceName} at ${input.shopName} · ${when} · ${input.bookingCode}`,
      sound: true,
      data: { type: 'booking', bookingId: input.bookingId || '', screen: 'booking' },
      ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_VISITS } : {})
    },
    trigger: null
  });
}

/** Local banner after pay — shop still must Accept. */
export async function notifyAwaitingShop(input: {
  shopName: string;
  serviceName: string;
  startsAt: string;
  bookingCode: string;
  bookingId?: string;
}) {
  if (!Notifications) return;
  const allowed = await ensureNotificationPermissions();
  if (!allowed) return;
  await ensureAndroidChannels();
  const when = formatDateTime(input.startsAt);
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Payment confirmed',
      body: `Awaiting shop confirmation · ${input.serviceName} at ${input.shopName} · ${when}`,
      sound: true,
      data: {
        type: 'awaiting_shop',
        bookingCode: input.bookingCode,
        bookingId: input.bookingId || '',
        screen: 'booking'
      },
      ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_VISITS } : {})
    },
    trigger: null
  });
}
