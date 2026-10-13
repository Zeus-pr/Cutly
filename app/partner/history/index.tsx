import { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BackButton } from '@/components/BackButton';
import { PressScale } from '@/components/PressScale';
import { ListRowsSkeleton } from '@/components/Skeleton';
import { fontFamily } from '@/constants/fonts';
import { radii, spacing, typography, type Palette } from '@/constants/theme';
import { partnerApi, type PartnerHistoryItem } from '@/services/partner';
import { useColors, useThemedStyles } from '@/store/useThemeStore';
import { formatINR } from '@/utils/money';
import { formatDateTime } from '@/utils/time';
import { HISTORY_FILTERS, historyItemMatchesFilter, type HistoryFilter } from '@/utils/historyFilter';

export default function PartnerHistory() {
  const colors = useColors();
  const styles = useThemedStyles(historyStyles);
  const [items, setItems] = useState<PartnerHistoryItem[]>([]);
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (mode: 'focus' | 'refresh' = 'focus') => {
    if (mode === 'refresh') setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const next = await partnerApi.history();
      setItems(next.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load history.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load('focus');
    }, [load])
  );

  const visible = useMemo(
    () => items.filter((row) => historyItemMatchesFilter(row.status, filter)),
    [items, filter]
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.top}>
        <BackButton label="" />
        <Text style={styles.title}>History</Text>
        <View style={styles.backSpacer} />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filters}
        style={styles.filterRail}
      >
        {HISTORY_FILTERS.map((chip) => {
          const on = filter === chip.id;
          return (
            <PressScale
              key={chip.id}
              style={[styles.chip, on && styles.chipOn]}
              onPress={() => setFilter(chip.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              selected={on}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{chip.label}</Text>
            </PressScale>
          );
        })}
      </ScrollView>

      <FlatList
        data={visible}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void load('refresh')} tintColor={colors.accent} />
        }
        ListEmptyComponent={
          loading ? (
            <ListRowsSkeleton count={4} />
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>
                {error ? 'Could not load' : filter === 'all' ? 'No past bookings' : `No ${filter} visits`}
              </Text>
              <Text style={styles.emptyBody}>
                {error ||
                  (filter === 'all'
                    ? 'Accepted, completed, missed, rejected, cancelled, and no-shows show up here.'
                    : 'Try another filter or pull to refresh.')}
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <PressScale
            style={styles.card}
            onPress={() => router.push(`/partner/history/${item.id}`)}
            haptic
            accessibilityRole="button"
            accessibilityLabel={`${item.name}, ${item.statusLabel}`}
          >
            <View style={styles.cardTop}>
              <View style={styles.cardCopy}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.meta}>
                  {item.service} · {item.barberName}
                </Text>
                <Text style={styles.when}>{formatDateTime(item.startsAt)}</Text>
                <Text style={styles.code}>
                  {item.bookingCode} · {formatINR(item.totalPaise || item.advancePaise)}
                  {item.paymentStatus === 'REFUNDED' ? ' · refunded' : ''}
                </Text>
              </View>
              <View style={styles.cardTrail}>
                <View
                  style={[
                    styles.badgePill,
                    (item.status === 'EXPIRED' || item.status === 'NO_SHOW' || item.status === 'REJECTED') &&
                      styles.badgePillMissed,
                    (item.status === 'CONFIRMED' ||
                      item.status === 'ARRIVED' ||
                      item.status === 'IN_SERVICE' ||
                      item.status === 'COMPLETED') &&
                      styles.badgePillOk
                  ]}
                >
                  <Text
                    style={[
                      styles.badge,
                      (item.status === 'EXPIRED' || item.status === 'NO_SHOW' || item.status === 'REJECTED') &&
                        styles.badgeMissed,
                      (item.status === 'CONFIRMED' ||
                        item.status === 'ARRIVED' ||
                        item.status === 'IN_SERVICE' ||
                        item.status === 'COMPLETED') &&
                        styles.badgeAccepted
                    ]}
                  >
                    {item.statusLabel}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              </View>
            </View>
          </PressScale>
        )}
      />
    </SafeAreaView>
  );
}

function historyStyles(colors: Palette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.canvas },
    top: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.sm,
      gap: spacing.sm
    },
    backSpacer: { width: 40 },
    title: { ...typography.heading, color: colors.ink, flex: 1, textAlign: 'center', fontSize: 18 },
    filterRail: { flexGrow: 0 },
    filters: {
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.sm,
      gap: 8
    },
    chip: {
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: radii.pill,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line
    },
    chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
    chipText: { ...typography.caption, color: colors.ink, fontWeight: '700' },
    chipTextOn: { color: colors.white },
    content: { padding: spacing.md, paddingBottom: 40, flexGrow: 1 },
    empty: { paddingTop: 80, alignItems: 'center', gap: spacing.sm },
    emptyTitle: { ...typography.heading, color: colors.ink },
    emptyBody: { ...typography.body, color: colors.muted, textAlign: 'center', maxWidth: 280 },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radii.lg,
      padding: spacing.md,
      marginBottom: spacing.sm,
      borderWidth: 1,
      borderColor: colors.line
    },
    cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm },
    cardCopy: { flex: 1, gap: 4 },
    cardTrail: { alignItems: 'flex-end', gap: 10, paddingTop: 2 },
    name: { fontFamily: fontFamily.semibold, fontSize: 17, color: colors.ink },
    badgePill: {
      backgroundColor: colors.sand,
      borderRadius: radii.pill,
      paddingHorizontal: 10,
      paddingVertical: 5
    },
    badgePillMissed: { backgroundColor: 'rgba(180,35,24,0.12)' },
    badgePillOk: { backgroundColor: 'rgba(240,107,85,0.14)' },
    badge: {
      fontFamily: fontFamily.semibold,
      fontSize: 11,
      color: colors.ink
    },
    badgeMissed: { color: colors.danger },
    badgeAccepted: { color: colors.accentDark },
    meta: { ...typography.caption, color: colors.muted },
    when: { fontFamily: fontFamily.medium, fontSize: 14, color: colors.ink, marginTop: 2 },
    code: { ...typography.caption, color: colors.muted }
  });
}
