import { useCallback, useMemo, useState } from 'react';
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { DetailScreenSkeleton } from '@/components/Skeleton';
import { PressScale } from '@/components/PressScale';
import { ScreenBack } from '@/components/ScreenBack';
import { ShopHoursSheet } from '@/components/ShopHoursSheet';
import { ShopMapPreview } from '@/components/ShopMapPreview';
import { api } from '@/services/api';
import { fontFamily } from '@/constants/fonts';
import { radii, spacing, type Palette } from '@/constants/theme';
import { appAlert, appConfirm } from '@/store/useDialogStore';
import { isVisitTab } from '@/store/useVisitTabStore';
import { useColors, useThemedStyles } from '@/store/useThemeStore';
import { formatINR } from '@/utils/money';
import { formatDateLong, formatTime } from '@/utils/time';

function totalLine(status: string, totalPaise: number, remainingPaise: number, billSettled: boolean) {
  const amount = `Total ${formatINR(totalPaise)}`;
  if (status === 'CANCELLED') return `${amount} · cancelled`;
  if (status === 'REJECTED' || status === 'EXPIRED') return `${amount} · not charged`;
  if (status === 'NO_SHOW') return `${amount} · no-show`;
  if (billSettled) return `${amount} · paid in full`;
  return `${amount}${remainingPaise > 0 ? ` · pay at shop ${formatINR(remainingPaise)}` : ' · pay at shop'}`;
}

function openGoogleMapsDirections(lat: number, lng: number, label: string) {
  const q = encodeURIComponent(label || 'Shop');
  const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving&dir_action=navigate`;
  const fallback = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}(${q})`;
  void Linking.openURL(url).catch(() => Linking.openURL(fallback));
}

export default function BookingDetails() {
  const colors = useColors();
  const styles = useThemedStyles(detailsStyles);
  const queryClient = useQueryClient();
  const { id, fromTab: fromTabParam, from: fromParam } = useLocalSearchParams<{
    id: string;
    fromTab?: string;
    from?: string;
  }>();
  const bookingId = String(id || '');
  const [hoursOpen, setHoursOpen] = useState(false);
  const fromTab = isVisitTab(fromTabParam) ? fromTabParam : null;
  const fromHome = fromParam === 'home';

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ['booking', bookingId],
    queryFn: () => api.booking(bookingId),
    enabled: Boolean(bookingId)
  });

  useFocusEffect(
    useCallback(() => {
      if (bookingId) void refetch();
    }, [bookingId, refetch])
  );

  const pin = data?.verifyPin || null;
  const lat = data?.shop.latitude ?? null;
  const lng = data?.shop.longitude ?? null;
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng) && lat != null && lng != null;
  const services = data?.services?.length ? data.services : data ? [data.service] : [];
  const remainingPaise = data?.remainingPaise ?? 0;
  const inactive = Boolean(
    data && ['CANCELLED', 'REJECTED', 'EXPIRED', 'NO_SHOW'].includes(data.status)
  );
  const billSettled = Boolean(data?.balanceSettled) && !inactive;
  const showPayBill =
    Boolean(data) &&
    !billSettled &&
    remainingPaise > 0 &&
    !['CANCELLED', 'REJECTED', 'EXPIRED', 'NO_SHOW'].includes(data!.status);

  const statusBanner = useMemo(() => {
    if (!data) return null;
    if (data.status === 'AWAITING_SHOP') {
      return `${data.shop.name} will confirm your appointment soon.`;
    }
    if (data.status === 'CONFIRMED') return 'Show your visit code when you arrive.';
    if (data.status === 'ARRIVED') return 'You’re checked in — wait for service to start.';
    if (data.status === 'IN_SERVICE') return 'Service in progress.';
    if (data.status === 'COMPLETED') return 'Visit completed.';
    if (data.status === 'REJECTED') return 'Shop could not take this visit.';
    if (data.status === 'EXPIRED') return 'Shop did not confirm before the slot.';
    if (data.status === 'CANCELLED') return 'This visit was cancelled.';
    if (data.status === 'NO_SHOW') return 'Marked as no-show.';
    return data.status.replace(/_/g, ' ');
  }, [data]);

  const cancel = () => {
    if (!data) return;
    const policy =
      data.cancelPolicyLabel ||
      (data.refundOnCancel
        ? 'Cancel free (12h+ before visit). Pay at the shop.'
        : 'Inside 12 hours, ask the shop before cancelling.');
    appConfirm({
      title: 'Cancel booking?',
      message: `${data.bookingCode}\n${policy}`,
      cancelLabel: 'Keep visit',
      confirmLabel: 'Cancel visit',
      destructive: true,
      onConfirm: () => {
        void (async () => {
          try {
            await api.cancelBooking(data.id);
            void queryClient.invalidateQueries({ queryKey: ['bookings'] });
            void queryClient.invalidateQueries({ queryKey: ['booking', data.id] });
            void refetch();
          } catch (err) {
            appAlert('Could not cancel', err instanceof Error ? err.message : 'Try again.');
          }
        })();
      }
    });
  };

  const reschedule = () => {
    if (!data) return;
    const ids = services.map((s) => s.id).join(',');
    router.push({
      pathname: '/booking',
      params: {
        shopId: data.shop.id,
        serviceIds: ids,
        rescheduleId: data.id
      }
    });
  };

  /** Clears shop / cart / visits and lands on Home. */
  const goHome = () => {
    router.dismissTo('/(tabs)');
  };

  /** Home today-tile → home. Visits list → pop. Fresh request → Home, not Visits. */
  const goBack = () => {
    if (fromHome) {
      if (router.canGoBack()) router.back();
      else router.replace('/(tabs)');
      return;
    }
    if (fromTab && router.canGoBack()) {
      router.back();
      return;
    }
    goHome();
  };

  const cancelPolicy = data
    ? data.cancelPolicyLabel ||
      (data.refundOnCancel
        ? 'Cancel free (12h+ before visit). Pay at the shop.'
        : 'Inside 12 hours, ask the shop before cancelling.')
    : '';

  const helpRows: { label: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void }[] = [
    {
      label: 'How to avail this offer?',
      icon: 'information-circle-outline',
      onPress: () =>
        appAlert(
          'How to avail this offer?',
          'Arrive at the shop on time and show your 4-digit visit code. Pay the bill at the counter.'
        )
    },
    {
      label: 'Cancellation policy',
      icon: 'shield-checkmark-outline',
      onPress: () => appAlert('Cancellation policy', cancelPolicy || 'See the shop policy at the counter.')
    },
    {
      label: 'Calculate your bill with offer',
      icon: 'calculator-outline',
      onPress: () =>
        data &&
        appAlert(
          'Your bill',
          `Services total ${formatINR(data.totalPaise)}\n${
            data.status === 'CANCELLED'
              ? 'Cancelled. Nothing was collected.'
              : inactive
                ? 'This visit did not go ahead.'
                : billSettled
                  ? 'Nothing left to pay.'
                  : `Pay at shop ${formatINR(remainingPaise || data.totalPaise)}`
          }`
        )
    }
  ];

  const payBill = () => {
    if (!data) return;
    router.push({ pathname: '/booking/pay', params: { bookingId: data.id } });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.top}>
        <View style={styles.topSide}>
          <ScreenBack onPress={goBack} accessibilityLabel="Back to visits" />
        </View>
        <Text style={styles.topTitle} numberOfLines={1}>
          Visit details
        </Text>
        <View style={[styles.topSide, styles.topSideEnd]}>
          <PressScale
            style={styles.support}
            onPress={() => void Linking.openURL('https://wa.me/919000000000')}
            haptic
          >
            <Ionicons name="headset-outline" size={18} color={colors.accent} />
            <Text style={styles.supportText}>Support</Text>
          </PressScale>
        </View>
      </View>

      {isLoading && !data ? (
        <DetailScreenSkeleton />
      ) : isError || !data ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>Could not load</Text>
          <Text style={styles.emptyBody}>{error instanceof Error ? error.message : 'Try again.'}</Text>
          <PressScale style={styles.retry} onPress={() => void refetch()} haptic>
            <Text style={styles.retryText}>{isRefetching ? 'Loading…' : 'Retry'}</Text>
          </PressScale>
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            {statusBanner ? (
              <View style={styles.banner}>
                <View style={styles.bannerDot} />
                <Text style={styles.bannerText}>{statusBanner}</Text>
              </View>
            ) : null}

            {pin &&
            (data.status === 'CONFIRMED' || data.status === 'ARRIVED' || data.status === 'AWAITING_SHOP') ? (
              <View style={styles.pinCard}>
                <Text style={styles.pinLabel}>Visit code</Text>
                <Text style={styles.pinDigits}>{pin}</Text>
                <Text style={styles.pinHint}>Show this 4-digit code at the shop to start.</Text>
              </View>
            ) : null}

            <Text style={styles.section}>What to do next</Text>
            {data.status === 'AWAITING_SHOP' ? (
              <Bullet icon="walk-outline" text="Visit the location only after receiving a confirmation." />
            ) : null}
            {data.status === 'COMPLETED' && billSettled ? (
              <Bullet icon="checkmark-circle-outline" text="Bill settled — thanks for visiting with CutLy." />
            ) : null}
            {showPayBill ? (
              <Bullet
                icon="phone-portrait-outline"
                text={`Pay your bill on CutLy to settle the remaining ${formatINR(remainingPaise)}.`}
              />
            ) : null}
            {data.status === 'CONFIRMED' || data.status === 'ARRIVED' ? (
              <Bullet icon="keypad-outline" text="Show your visit code at the shop to start." />
            ) : null}

            <Text style={styles.section}>Things to remember</Text>
            <Bullet text="You can change or add services at the location (shop policy)." />
            {!billSettled && !inactive && data.status !== 'COMPLETED' ? (
              <Bullet text="Bring your visit code for a faster start." />
            ) : null}

            <Text style={styles.section}>Partner details</Text>
            <Text style={styles.partnerTitle}>
              {data.shop.name}
              {data.shop.address ? `, ${data.shop.address}` : ''}
            </Text>

            {hasCoords ? (
              <ShopMapPreview
                latitude={lat as number}
                longitude={lng as number}
                label={data.shop.name}
                onDirections={() => openGoogleMapsDirections(lat as number, lng as number, data.shop.name)}
              />
            ) : (
              <PressScale
                style={styles.mapFallback}
                onPress={() => {
                  const q = encodeURIComponent(`${data.shop.name} ${data.shop.address}`);
                  void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${q}`);
                }}
                haptic
              >
                <Ionicons name="map-outline" size={22} color={colors.ink} />
                <Text style={styles.mapFallbackText}>Open in Google Maps</Text>
              </PressScale>
            )}

            <View style={styles.quickRow}>
              <View style={styles.quickCell}>
                <PressScale style={styles.quick} onPress={() => setHoursOpen(true)} haptic>
                  <Ionicons name="time-outline" size={18} color={colors.accent} />
                  <Text style={styles.quickText}>Timings</Text>
                </PressScale>
              </View>
              <View style={styles.quickDivider} />
              <View style={styles.quickCell}>
                <PressScale
                  style={styles.quick}
                  onPress={() => {
                    if (hasCoords) openGoogleMapsDirections(lat as number, lng as number, data.shop.name);
                  }}
                  haptic
                >
                  <Ionicons name="navigate-outline" size={18} color={colors.accent} />
                  <Text style={styles.quickText}>Get Directions</Text>
                </PressScale>
              </View>
            </View>

            <ShopHoursSheet
              shopId={data.shop.id}
              shopName={data.shop.name}
              visible={hoursOpen}
              onClose={() => setHoursOpen(false)}
            />

            <Text style={styles.section}>Appointment details</Text>
            <DetailRow icon="keypad-outline" text={pin ? `Visit code ${pin}` : data.bookingCode} />
            <DetailRow icon="calendar-outline" text={formatDateLong(data.startsAt)} />
            <DetailRow icon="time-outline" text={formatTime(data.startsAt)} />
            <DetailRow
              icon="pricetag-outline"
              text={totalLine(data.status, data.totalPaise, remainingPaise, billSettled)}
            />

            <Text style={styles.section}>Services booked</Text>
            {services.map((svc) => (
              <View key={svc.id} style={styles.serviceCard}>
                <View style={styles.serviceRow}>
                  <Text style={styles.serviceName}>{svc.name}</Text>
                  <Text style={styles.servicePrice}>{formatINR(svc.pricePaise)}</Text>
                </View>
                <Text style={styles.serviceBarber}>with {data.barber.name}</Text>
              </View>
            ))}

            {data.canReview ? (
              <PressScale
                style={styles.rateRow}
                onPress={() =>
                  router.push({
                    pathname: '/booking/rate',
                    params: {
                      bookingId: data.id,
                      shopName: data.shop.name,
                      barberName: data.barber.name
                    }
                  })
                }
                haptic
              >
                <Ionicons name="star-outline" size={18} color={colors.accent} />
                <Text style={styles.rateText}>Rate this visit</Text>
              </PressScale>
            ) : null}

            <View style={styles.helpCard}>
              {helpRows.map((row, index) => (
                <PressScale
                  key={row.label}
                  style={[styles.helpRow, index === helpRows.length - 1 && styles.helpRowLast]}
                  onPress={row.onPress}
                  pressedScale={0.98}
                  haptic
                  accessibilityRole="button"
                  accessibilityLabel={row.label}
                >
                  <Ionicons name={row.icon} size={22} color={colors.accent} />
                  <Text style={styles.helpLabel}>{row.label}</Text>
                  <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                </PressScale>
              ))}
            </View>

            <View style={{ height: 188 }} />
          </ScrollView>

          <View style={styles.footer}>
              {data.canCancel || data.canReschedule ? (
                <View style={styles.footerRow}>
                  {data.canCancel ? (
                    <View style={styles.footerSlot}>
                      <PressScale style={[styles.footerBtn, styles.cancelBtn]} onPress={cancel} haptic>
                        <Ionicons name="close" size={18} color={colors.danger} />
                        <Text style={styles.cancelText}>Cancel</Text>
                      </PressScale>
                    </View>
                  ) : null}
                  {data.canReschedule ? (
                    <View style={styles.footerSlot}>
                      <PressScale style={[styles.footerBtn, styles.rescheduleBtn]} onPress={reschedule} haptic>
                        <Ionicons name="time-outline" size={18} color={colors.white} />
                        <Text style={styles.rescheduleText}>Reschedule</Text>
                      </PressScale>
                    </View>
                  ) : null}
                </View>
              ) : null}
              {showPayBill ? (
                <PressScale style={[styles.footerBtn, styles.payBtn]} onPress={payBill} haptic>
                  <Ionicons name="card-outline" size={18} color={colors.white} />
                  <Text style={styles.payText}>Pay Bill · {formatINR(remainingPaise)}</Text>
                </PressScale>
              ) : null}
              <PressScale
                style={[styles.footerBtn, styles.homeBtn]}
                onPress={goHome}
                haptic
                accessibilityRole="button"
                accessibilityLabel="Go home"
              >
                <Ionicons name="home-outline" size={18} color={colors.ink} />
                <Text style={styles.homeText}>Go home</Text>
              </PressScale>
            </View>
        </>
      )}
    </SafeAreaView>
  );
}

function Bullet({ icon, text }: { icon?: keyof typeof Ionicons.glyphMap; text: string }) {
  const colors = useColors();
  const styles = useThemedStyles(detailsStyles);
  return (
    <View style={styles.bullet}>
      {icon ? <Ionicons name={icon} size={18} color={colors.accent} /> : <View style={styles.bulletDot} />}
      <Text style={styles.bulletText}>{text}</Text>
    </View>
  );
}

function DetailRow({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  const colors = useColors();
  const styles = useThemedStyles(detailsStyles);
  return (
    <View style={styles.detailRow}>
      <Ionicons name={icon} size={18} color={colors.accent} />
      <Text style={styles.detailText}>{text}</Text>
    </View>
  );
}

function detailsStyles(colors: Palette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.canvas },
    top: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.sm,
      gap: spacing.sm
    },
    topSide: { minWidth: 88, justifyContent: 'center' },
    topSideEnd: { alignItems: 'flex-end' },
    topTitle: {
      flex: 1,
      textAlign: 'center',
      fontFamily: fontFamily.bold,
      fontSize: 17,
      color: colors.ink
    },
    support: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    supportText: { fontFamily: fontFamily.semibold, fontSize: 14, color: colors.accent },
    content: { paddingHorizontal: spacing.md, paddingBottom: 24 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
    emptyTitle: { fontFamily: fontFamily.bold, fontSize: 18, color: colors.ink },
    emptyBody: { fontFamily: fontFamily.regular, fontSize: 14, color: colors.muted, textAlign: 'center', marginTop: 8 },
    retry: {
      marginTop: spacing.md,
      backgroundColor: colors.accent,
      borderRadius: radii.pill,
      paddingHorizontal: 22,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center'
    },
    retryText: { fontFamily: fontFamily.bold, color: colors.white },
    banner: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      marginBottom: spacing.md,
      paddingVertical: 4
    },
    bannerDot: {
      width: 14,
      height: 14,
      borderRadius: 7,
      borderWidth: 3,
      borderColor: colors.accent,
      marginTop: 2
    },
    bannerText: { flex: 1, fontFamily: fontFamily.medium, fontSize: 14, color: '#C48A12', lineHeight: 20 },
    pinCard: {
      backgroundColor: colors.surface,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.line,
      padding: spacing.lg,
      alignItems: 'center',
      gap: 6,
      marginBottom: spacing.md
    },
    pinLabel: {
      fontFamily: fontFamily.bold,
      fontSize: 11,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      color: colors.muted
    },
    pinDigits: {
      fontFamily: fontFamily.bold,
      fontSize: 40,
      letterSpacing: 12,
      color: colors.accent,
      fontVariant: ['tabular-nums']
    },
    pinHint: { fontFamily: fontFamily.regular, fontSize: 13, color: colors.muted, textAlign: 'center' },
    section: {
      fontFamily: fontFamily.bold,
      fontSize: 16,
      color: colors.ink,
      marginTop: spacing.lg,
      marginBottom: spacing.sm
    },
    bullet: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
    bulletDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.muted,
      marginTop: 7,
      marginLeft: 6
    },
    bulletText: { flex: 1, fontFamily: fontFamily.regular, fontSize: 14, color: colors.ink, lineHeight: 20 },
    partnerTitle: { fontFamily: fontFamily.medium, fontSize: 14, color: colors.muted, marginBottom: spacing.sm },
    mapFallback: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.line,
      padding: spacing.md,
      marginBottom: spacing.sm
    },
    mapFallbackText: { fontFamily: fontFamily.semibold, fontSize: 15, color: colors.ink },
    quickRow: {
      flexDirection: 'row',
      alignItems: 'stretch',
      marginTop: spacing.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: colors.line,
      minHeight: 52
    },
    quickCell: { flex: 1, justifyContent: 'center' },
    quick: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 14
    },
    quickDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: colors.line },
    quickText: { fontFamily: fontFamily.semibold, fontSize: 14, color: colors.accent },
    detailRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
    detailText: { flex: 1, fontFamily: fontFamily.medium, fontSize: 15, color: colors.ink },
    serviceCard: {
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.line,
      padding: spacing.md,
      marginBottom: spacing.sm,
      gap: 4
    },
    serviceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm
    },
    serviceName: { flex: 1, fontFamily: fontFamily.bold, fontSize: 16, color: colors.ink },
    servicePrice: { fontFamily: fontFamily.semibold, fontSize: 15, color: colors.ink },
    serviceBarber: { fontFamily: fontFamily.medium, fontSize: 13, color: colors.muted },
    helpCard: {
      marginTop: spacing.lg,
      backgroundColor: colors.surface,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.line,
      overflow: 'hidden'
    },
    helpRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingHorizontal: spacing.md,
      paddingVertical: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.line
    },
    helpRowLast: { borderBottomWidth: 0 },
    helpLabel: { flex: 1, fontFamily: fontFamily.semibold, fontSize: 15, color: colors.ink },
    rateRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: spacing.md,
      paddingVertical: 12
    },
    rateText: { fontFamily: fontFamily.semibold, fontSize: 15, color: colors.accent },
    footer: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      paddingBottom: spacing.md,
      backgroundColor: colors.canvas,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.line,
      gap: spacing.sm
    },
    footerRow: { flexDirection: 'row', gap: spacing.sm },
    footerSlot: { flex: 1 },
    footerBtn: {
      width: '100%',
      height: 52,
      borderRadius: radii.md,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderWidth: 1.5,
      borderColor: 'transparent'
    },
    cancelBtn: {
      borderColor: colors.danger,
      backgroundColor: colors.surface
    },
    cancelText: { fontFamily: fontFamily.bold, fontSize: 15, color: colors.danger },
    rescheduleBtn: {
      backgroundColor: colors.ink,
      borderColor: colors.ink
    },
    rescheduleText: { fontFamily: fontFamily.bold, fontSize: 15, color: colors.canvas },
    payBtn: {
      backgroundColor: colors.accent,
      borderColor: colors.accent
    },
    payText: { fontFamily: fontFamily.bold, fontSize: 15, color: colors.white },
    homeBtn: {
      backgroundColor: colors.surface,
      borderColor: colors.line
    },
    homeText: { fontFamily: fontFamily.bold, fontSize: 15, color: colors.ink }
  });
}
