import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { api } from '@/services/api';
import { useSessionStore } from '@/store/useSessionStore';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false
  })
});

export async function ensureNotificationPermissions() {
  if (!Device.isDevice && Platform.OS === 'ios') return false;
  const current = await Notifications.getPermissionsAsync();
  if (current.granted || current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) return true;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted || asked.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
}

export async function registerForPushNotifications() {
  const allowed = await ensureNotificationPermissions();
  if (!allowed) return null;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('bookings', {
      name: 'Bookings',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 180, 120, 180],
      lightColor: '#0EC9A5'
    });
  }
  const projectId =
    Constants.easConfig?.projectId ||
    Constants.expoConfig?.extra?.eas?.projectId ||
    undefined;
  try {
    const token = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    if (useSessionStore.getState().accessToken) {
      await api.registerPush(token.data).catch(() => undefined);
    }
    return token.data;
  } catch {
    return null;
  }
}

export async function notifyBookingConfirmed(input: {
  shopName: string;
  serviceName: string;
  startsAt: string;
  bookingCode: string;
}) {
  const allowed = await ensureNotificationPermissions();
  if (!allowed) return;
  const when = new Date(input.startsAt).toLocaleString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit'
  });
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Booking confirmed',
      body: `${input.serviceName} at ${input.shopName} · ${when} · ${input.bookingCode}`,
      sound: true,
      data: { type: 'booking' },
      ...(Platform.OS === 'android' ? { channelId: 'bookings' } : {})
    },
    trigger: null
  });
}
