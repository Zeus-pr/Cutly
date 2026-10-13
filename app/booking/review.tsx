import { router, useLocalSearchParams } from 'expo-router';
import { appAlert, appConfirm } from '@/store/useDialogStore';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BackButton } from '@/components/BackButton';
import { PrimaryButton } from '@/components/PrimaryButton';
import { type Palette, radii, spacing, typography } from '@/constants/theme';
import { api } from '@/services/api';
import { notifyAwaitingShop, registerForPushNotifications } from '@/services/notifications';
import { useColors, useThemedStyles } from '@/store/useThemeStore';
import { formatHoldCountdown, holdSecondsLeft } from '@/utils/hold';
import { bookingIntentKey } from '@/utils/idempotency';
import { formatINR } from '@/utils/money';
import { formatDate, formatTime } from '@/utils/time';

export default function ReviewBooking() {
  const colors = useColors();
  const styles = useThemedStyles(screenStyles);
  const params = useLocalSearchParams<{
    shopId: string;
    serviceId: string;
    barberId: string;
    startsAt: string;
    rescheduleId?: string;
  }>();
  const isReschedule = Boolean(params.rescheduleId);
  const queryClient = useQueryClient();
  const [working, setWorking] = useState(false);
  const [holdId, setHoldId] = useState<string | null>(null);
  const [holdExpiresAt, setHoldExpiresAt] = useState<string | null>(null);
  const [heldBarberId, setHeldBarberId] = useState(params.barberId || '');
  const [secondsLeft, setSecondsLeft] = useState(0);
  const paymentsOn = process.env.EXPO_PUBLIC_PAYMENTS_ENABLED === '1';
  const idempotencyKey = useMemo(
    () =>
      bookingIntentKey({
        shopId: params.shopId || '',
        serviceId: params.serviceId || '',
        barberId: heldBarberId || params.barberId || '',
        startsAt: params.startsAt || ''
      }),
    [params.shopId, params.serviceId, heldBarberId, params.barberId, params.startsAt]
  );

  const shop = useQuery({ queryKey: ['shop', params.shopId], queryFn: () => api.shop(params.shopId || '') }).data;
  const service = useQuery({
    queryKey: ['services', params.shopId],
    queryFn: () => api.services(params.shopId || '')
  }).data?.find((s) => s.id === params.serviceId);
  const barber = useQuery({
    queryKey: ['barbers', params.shopId],
    queryFn: () => api.barbers(params.shopId || '')
  }).data?.find((s) => s.id === (heldBarberId || params.barberId));

  useEffect(() => {
    if (!holdExpiresAt) {
      setSecondsLeft(0);
      return;
    }
    const tick = () => setSecondsLeft(holdSecondsLeft(holdExpiresAt));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [holdExpiresAt]);

  if (!shop || !service) return null;
  const holdActive = Boolean(holdId && holdExpiresAt);
  const holdExpired = holdActive && secondsLeft <= 0;

  const payNow = async () => {
    if (working) return;
    setWorking(true);
    try {
      // Hold starts only when Pay now is pressed (not on entering review).
      let nextHoldId = holdId;
      let nextBarberId = heldBarberId || params.barberId;
      if (!nextHoldId || holdExpired) {
        const hold = await api.createHold({
          shopId: params.shopId,
          serviceId: params.serviceId,
          barberId: params.barberId || undefined,
          startsAt: params.startsAt
        });
        nextHoldId = hold.id;
        nextBarberId = hold.barberId;
        setHoldId(hold.id);
        setHoldExpiresAt(hold.expiresAt);
        setHeldBarberId(hold.barberId);
        setSecondsLeft(holdSecondsLeft(hold.expiresAt));
      }

      if (isReschedule && params.rescheduleId) {
        await api.rescheduleBooking(params.rescheduleId, {
          startsAt: params.startsAt,
          barberId: nextBarberId,
          holdId: nextHoldId
        });
        await queryClient.invalidateQueries({ queryKey: ['bookings'] });
        await queryClient.invalidateQueries({ queryKey: ['availability'] });
        appAlert('New time requested', 'Awaiting shop confirmation again.');
        router.replace('/(tabs)/bookings');
        return;
      }

      await registerForPushNotifications();
      const booking = await api.createBooking({
        shopId: params.shopId,
        serviceId: params.serviceId,
        barberId: nextBarberId,
        startsAt: params.startsAt,
        holdId: nextHoldId,
        idempotencyKey
      });
      await queryClient.invalidateQueries({ queryKey: ['availability'] });
      if (booking.checkout) {
        router.push({
          pathname: '/booking/pay',
          params: {
            bookingId: booking.id,
            keyId: booking.checkout.keyId,
            orderId: booking.checkout.orderId,
            amountPaise: String(booking.checkout.amountPaise),
            description: booking.checkout.description,
            shopName: shop.name,
            serviceName: service.name,
            barberName: barber?.name || 'Staff',
            startsAt: booking.startsAt,
            total: String(booking.totalPaise)
          }
        });
        setWorking(false);
        return;
      }
      await notifyAwaitingShop({
        shopName: shop.name,
        serviceName: service.name,
        startsAt: booking.startsAt,
        bookingCode: booking.bookingCode,
        bookingId: booking.id
      });
      await queryClient.invalidateQueries({ queryKey: ['bookings'] });
      await queryClient.invalidateQueries({ queryKey: ['booking', booking.id] });
      router.replace({ pathname: '/booking/success', params: { id: booking.id } });
    } catch (err) {
      appAlert(
        isReschedule ? 'Reschedule failed' : 'Booking failed',
        err instanceof Error ? err.message : 'Try another slot.'
      );
      setWorking(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <BackButton label="Review" />
        <Text style={styles.title}>{isReschedule ? 'Confirm new time.' : 'Almost there.'}</Text>
        <Text style={styles.sub}>
          {isReschedule
            ? 'The shop will need to accept the new time.'
            : paymentsOn
              ? 'Review the visit, then tap Pay now to hold this time for 8 minutes and check out.'
              : 'Review the visit, then tap Pay now to hold this time for 8 minutes and send the request.'}
        </Text>
        {!isReschedule ? (
          <View style={styles.testBadge}>
            <Text style={styles.testBadgeText}>
              {paymentsOn ? 'RAZORPAY TEST MODE · no real money' : 'PAYMENTS OFF · direct request'}
            </Text>
          </View>
        ) : null}

        {holdActive ? (
          <View style={[styles.holdBanner, holdExpired && styles.holdBannerExpired]}>
            <Text style={styles.holdLabel}>{holdExpired ? 'Hold expired' : 'Slot held for'}</Text>
            <Text style={styles.holdTimer}>{holdExpired ? '0:00' : formatHoldCountdown(secondsLeft)}</Text>
            <Text style={styles.holdHint}>
              {holdExpired
                ? 'Tap Pay now again to try holding this slot.'
                : paymentsOn
                  ? 'Complete payment before the timer runs out.'
                  : 'Finish before the timer runs out.'}
            </Text>
          </View>
        ) : (
          <View style={styles.holdBannerIdle}>
            <Text style={styles.holdLabel}>Seat not held yet</Text>
            <Text style={styles.holdHint}>
              Review freely — the 8‑minute lock starts only when you tap Pay now.
            </Text>
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.shop}>{shop.name}</Text>
          <Text style={styles.muted}>{shop.address}</Text>
          <View style={styles.divider} />
          <Row label="Service" value={service.name} />
          <Row label="Staff" value={barber?.name || 'Any / assigned on pay'} />
          <Row label="When" value={`${formatDate(params.startsAt)} · ${formatTime(params.startsAt)}`} />
        </View>
        {!isReschedule ? (
          <View style={styles.card}>
            <Row label="Service total" value={formatINR(service.pricePaise)} strong />
            <Row label="Pay at shop" value={formatINR(service.pricePaise)} />
            <Text style={styles.note}>Shop will confirm the visit. Pay the full bill at the shop.</Text>
          </View>
        ) : null}
      </ScrollView>
      <View style={styles.footer}>
        <PrimaryButton
          label={
            working
              ? holdActive
                ? 'Confirming…'
                : 'Holding seat…'
              : isReschedule
                ? 'Confirm new time'
                : 'Pay now'
          }
          onPress={() => void payNow()}
          disabled={working}
        />
      </View>
    </SafeAreaView>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  const styles = useThemedStyles(screenStyles);
  return (
    <View style={styles.row}>
      <Text style={styles.muted}>{label}</Text>
      <Text style={[styles.value, strong && { fontWeight: '900' }]}>{value}</Text>
    </View>
  );
}

function screenStyles(colors: Palette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.canvas },
    content: { padding: spacing.md, paddingBottom: 120 },
    back: { ...typography.heading, color: colors.ink },
    title: { ...typography.display, color: colors.ink, marginTop: spacing.xl },
    sub: { ...typography.body, color: colors.muted, marginTop: spacing.sm },
    holdBanner: {
      marginTop: spacing.lg,
      padding: spacing.md,
      borderRadius: radii.lg,
      backgroundColor: 'rgba(240,107,85,0.14)',
      borderWidth: 1,
      borderColor: colors.accent
    },
    holdBannerIdle: {
      marginTop: spacing.lg,
      padding: spacing.md,
      borderRadius: radii.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line
    },
    holdBannerExpired: {
      backgroundColor: 'rgba(180,35,24,0.10)',
      borderColor: colors.danger
    },
    holdLabel: { ...typography.caption, color: colors.muted, fontWeight: '600' },
    holdTimer: { fontSize: 28, fontWeight: '800', color: colors.ink, marginTop: 4 },
    holdHint: { ...typography.caption, color: colors.muted, marginTop: 4 },
    testBadge: {
      marginTop: spacing.md,
      alignSelf: 'flex-start',
      backgroundColor: 'rgba(240,107,85,0.16)',
      borderRadius: radii.pill,
      paddingHorizontal: 12,
      paddingVertical: 6
    },
    testBadgeText: { ...typography.caption, color: colors.accent, fontWeight: '800', letterSpacing: 0.4 },
    card: { backgroundColor: colors.surface, borderRadius: radii.lg, padding: spacing.md, marginTop: spacing.lg },
    shop: { ...typography.heading, color: colors.ink },
    muted: { ...typography.body, color: colors.muted },
    divider: { height: 1, backgroundColor: colors.line, marginVertical: spacing.md },
    row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7 },
    value: { ...typography.body, color: colors.ink, fontWeight: '700' },
    note: {
      ...typography.caption,
      color: colors.muted,
      marginTop: spacing.md,
      backgroundColor: colors.canvas,
      padding: spacing.sm,
      borderRadius: radii.sm
    },
    footer: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: spacing.md, backgroundColor: colors.canvas }
  });
}
