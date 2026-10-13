import { useCallback, useEffect, useMemo } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ListRowsSkeleton } from '@/components/Skeleton';
import { PressScale } from '@/components/PressScale';
import { ScreenBack } from '@/components/ScreenBack';
import { api } from '@/services/api';
import { fontFamily } from '@/constants/fonts';
import { radii, spacing, type Palette } from '@/constants/theme';
import { isVisitTab, useVisitTabStore } from '@/store/useVisitTabStore';
import { useColors, useThemedStyles } from '@/store/useThemeStore';
import { formatINR } from '@/utils/money';
import { formatDateTime } from '@/utils/time';
import { filterVisits, visitTabCounts, VISIT_TABS, type VisitTabId } from '@/utils/visitTabs';
import type { Booking } from '@/types/domain';

export default function MyAppointmentsScreen() {
  const colors = useColors();
  const styles = useThemedStyles(bookingStyles);
  const params = useLocalSearchParams<{ tab?: string }>();
  const tab = useVisitTabStore((s) => s.tab);
  const setTab = useVisitTabStore((s) => s.setTab);
  const paramTab = Array.isArray(params.tab) ? params.tab[0] : params.tab;

  // Deep link / replace('/visits', { tab }) wins once; otherwise keep whatever chip was last selected.
  useEffect(() => {
    if (isVisitTab(paramTab)) setTab(paramTab);
  }, [paramTab, setTab]);

  const { data = [], isLoading, refetch, isRefetching, isError, error } = useQuery({
    queryKey: ['bookings'],
    queryFn: () => api.bookings()
  });

  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch])
  );

  const filtered = useMemo(() => filterVisits(data, tab), [data, tab]);
  const counts = useMemo(() => visitTabCounts(data), [data]);
  const activeCount = counts.awaiting + counts.today + counts.upcoming;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <ScreenBack />
          <View style={styles.heroCopy}>
            <Text style={styles.heroTitle}>My Visits</Text>
            <Text style={styles.heroSub}>
              {isLoading
                ? 'Loading…'
                : activeCount === 0
                  ? 'No upcoming visits'
                  : `${activeCount} active · tap a card for your visit code`}
            </Text>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          {VISIT_TABS.map((item) => {
            const selected = tab === item.id;
            const count = counts[item.id];
            return (
              <PressScale
                key={item.id}
                onPress={() => setTab(item.id)}
                style={[styles.chip, selected && styles.chipOn]}
                haptic
                accessibilityRole="tab"
                accessibilityState={{ selected }}
              >
                <Text style={[styles.chipLabel, selected && styles.chipLabelOn]}>{item.label}</Text>
                {count > 0 ? (
                  <View style={[styles.chipBadge, selected && styles.chipBadgeOn]}>
                    <Text style={[styles.chipBadgeText, selected && styles.chipBadgeTextOn]}>{count}</Text>
                  </View>
                ) : null}
              </PressScale>
            );
          })}
        </ScrollView>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.accent} />
        }
        ListEmptyComponent={
          isLoading ? (
            <ListRowsSkeleton count={4} />
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                {isError
                  ? error instanceof Error
                    ? error.message
                    : 'Could not load visits.'
                  : emptyCopy(tab)}
              </Text>
              {!isError ? (
                <PressScale style={styles.cta} onPress={() => router.push('/(tabs)/salons')} haptic>
                  <Text style={styles.ctaText}>Find a shop</Text>
                </PressScale>
              ) : null}
            </View>
          )
        }
        renderItem={({ item }) => <BookingRow booking={item} fromTab={tab} />}
      />
    </SafeAreaView>
  );
}

function emptyCopy(tab: VisitTabId) {
  if (tab === 'awaiting') return 'Nothing waiting on the shop right now.';
  if (tab === 'today') return 'No visits scheduled for today.';
  if (tab === 'upcoming') return 'No upcoming confirmed visits.';
  if (tab === 'served') return 'Completed visits will show here.';
  return 'No cancelled visits.';
}

function BookingRow({ booking, fromTab }: { booking: Booking; fromTab: VisitTabId }) {
  const styles = useThemedStyles(bookingStyles);
  return (
    <PressScale
      style={styles.card}
      onPress={() => router.push({ pathname: '/booking/[id]', params: { id: booking.id, fromTab } })}
      pressedScale={0.98}
      haptic
      accessibilityRole="button"
      accessibilityLabel={`Booking details for ${booking.shop.name}`}
    >
      <View style={styles.cardTop}>
        <Text style={styles.shop} numberOfLines={1}>
          {booking.shop.name}
        </Text>
        <Text style={styles.status}>{statusLabel(booking.status)}</Text>
      </View>
      <Text style={styles.meta}>
        {booking.service.name} · {booking.barber.name}
      </Text>
      <Text style={styles.when}>{formatDateTime(booking.startsAt)}</Text>
      {booking.verifyPin ? <Text style={styles.pin}>Visit code {booking.verifyPin}</Text> : null}
      <Text style={styles.code}>
        {booking.bookingCode} · {formatINR(booking.totalPaise)}
      </Text>
    </PressScale>
  );
}

function statusLabel(status: Booking['status']) {
  if (status === 'AWAITING_SHOP') return 'Awaiting';
  if (status === 'REJECTED') return 'Rejected';
  if (status === 'EXPIRED') return 'Expired';
  return status.replace(/_/g, ' ');
}

function bookingStyles(colors: Palette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.canvas },
    hero: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      paddingBottom: spacing.md,
      gap: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.line,
      backgroundColor: colors.canvas
    },
    heroTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
    heroCopy: { flex: 1, gap: 4 },
    heroTitle: {
      fontFamily: fontFamily.bold,
      fontSize: 28,
      lineHeight: 34,
      letterSpacing: -0.4,
      color: colors.ink
    },
    heroSub: {
      fontFamily: fontFamily.regular,
      fontSize: 13,
      lineHeight: 18,
      color: colors.muted
    },
    chips: { gap: 8, paddingRight: spacing.md },
    chip: {
      height: 36,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 14,
      borderRadius: radii.pill,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line
    },
    chipOn: {
      backgroundColor: colors.accent,
      borderColor: colors.accent
    },
    chipLabel: {
      fontFamily: fontFamily.semibold,
      fontSize: 13,
      lineHeight: 16,
      color: colors.muted
    },
    chipLabelOn: { color: colors.white },
    chipBadge: {
      minWidth: 20,
      height: 20,
      paddingHorizontal: 6,
      borderRadius: 10,
      backgroundColor: colors.sand,
      alignItems: 'center',
      justifyContent: 'center'
    },
    chipBadgeOn: { backgroundColor: 'rgba(255,255,255,0.22)' },
    chipBadgeText: {
      fontFamily: fontFamily.bold,
      fontSize: 11,
      color: colors.ink
    },
    chipBadgeTextOn: { color: colors.white },
    content: { padding: spacing.md, paddingBottom: 120, flexGrow: 1 },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 100, gap: spacing.md },
    emptyText: {
      fontFamily: fontFamily.regular,
      fontSize: 15,
      color: colors.muted,
      textAlign: 'center',
      paddingHorizontal: spacing.lg
    },
    cta: {
      marginTop: spacing.sm,
      backgroundColor: colors.accent,
      borderRadius: radii.pill,
      paddingHorizontal: 22,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center'
    },
    ctaText: { fontFamily: fontFamily.bold, color: colors.white, fontSize: 15 },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.line,
      padding: spacing.md,
      marginBottom: spacing.sm,
      gap: 4
    },
    cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
    shop: { fontFamily: fontFamily.bold, fontSize: 16, color: colors.ink, flex: 1 },
    status: { fontFamily: fontFamily.semibold, fontSize: 12, color: colors.accent },
    meta: { fontFamily: fontFamily.regular, fontSize: 14, color: colors.muted },
    when: { fontFamily: fontFamily.medium, fontSize: 14, color: colors.ink },
    pin: { fontFamily: fontFamily.bold, fontSize: 14, color: colors.accentDark, marginTop: 2 },
    code: { fontFamily: fontFamily.regular, fontSize: 12, color: colors.muted, marginTop: 2 }
  });
}
