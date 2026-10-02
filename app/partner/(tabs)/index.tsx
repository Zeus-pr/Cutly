import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { radii, spacing, typography, type Palette } from '@/constants/theme';
import { partnerApi, type PartnerDashboard } from '@/services/partner';
import { givenName, useSessionStore } from '@/store/useSessionStore';
import { useThemedStyles } from '@/store/useThemeStore';

export default function PartnerHome() {
  const styles = useThemedStyles(homeStyles);
  const name = useSessionStore((state) => state.name);
  const [board, setBoard] = useState<PartnerDashboard | null>(null);
  const [error, setError] = useState('');

  useFocusEffect(
    useCallback(() => {
      let live = true;
      partnerApi
        .dashboard()
        .then((next) => {
          if (live) setBoard(next);
        })
        .catch((err) => {
          if (live) setError(err instanceof Error ? err.message : 'Could not load today.');
        });
      return () => {
        live = false;
      };
    }, [])
  );

  const shop = board?.shop;
  const staffed = shop ? Math.min(shop.today.workersPresent, shop.today.chairsInUse) : 0;
  const maxHour = useMemo(() => Math.max(1, ...(board?.byHour.map((item) => item.count) || [0])), [board?.byHour]);
  const revenue = Math.round((board?.revenuePaise || 0) / 100);
  const fill = board?.openSlots ? Math.min(100, Math.round(((board.waiting + board.inService) / Math.max(board.openSlots, 1)) * 100)) : 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.hello}>Good to see you, {givenName(name) || 'partner'}</Text>
        <Text style={styles.title}>{shop?.name || 'Your shop'}</Text>
        <Text style={styles.body}>{shop ? shop.address : 'Finish setup to open the floor.'}</Text>

        <View style={styles.grid}>
          <Metric label="Today" value={String(board?.todayCount ?? 0)} />
          <Metric label="Waiting" value={String(board?.waiting ?? 0)} />
          <Metric label="In service" value={String(board?.inService ?? 0)} />
          <Metric label="Done" value={String(board?.done ?? 0)} />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardKicker}>Bookings by hour</Text>
          <Text style={styles.cardTitle}>Today’s pace</Text>
          <View style={styles.chart}>
            {(board?.byHour || []).map((bucket) => {
              const height = Math.max(6, Math.round((bucket.count / maxHour) * 96));
              return (
                <View key={bucket.hour} style={styles.barCol}>
                  <View style={[styles.bar, { height }, bucket.count > 0 && styles.barOn]} />
                  <Text style={styles.barLabel}>{bucket.label}</Text>
                </View>
              );
            })}
          </View>
          {!board?.todayCount ? <Text style={styles.body}>Bars fill as bookings land through the day.</Text> : null}
        </View>

        <View style={styles.grid}>
          <Metric label="Revenue" value={revenue ? `₹${revenue}` : '₹0'} />
          <Metric label="Peak hour" value={board?.peakHour || '—'} />
          <Metric label="Open chairs" value={String(board?.openSlots ?? staffed)} />
          <Metric label="Floor load" value={`${fill}%`} />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{board?.next ? board.next.name : 'No one booked yet'}</Text>
          <Text style={styles.body}>
            {board?.next
              ? `${board.next.service} · ${new Date(board.next.startsAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
              : 'New bookings show up here.'}
          </Text>
          {shop ? (
            <Text style={styles.body}>
              {staffed} of {shop.chairCount} chairs staffed today
            </Text>
          ) : null}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  const styles = useThemedStyles(homeStyles);
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function homeStyles(colors: Palette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.canvas },
    content: { padding: spacing.lg, gap: spacing.md, paddingBottom: 120 },
    hello: { ...typography.body, color: colors.muted },
    title: { ...typography.title, color: colors.ink, fontSize: 28, letterSpacing: -0.5 },
    body: { ...typography.body, color: colors.muted },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    metric: { width: '48%', backgroundColor: colors.surface, borderRadius: radii.lg, padding: spacing.md },
    metricValue: { fontSize: 26, fontWeight: '700', color: colors.ink, letterSpacing: -0.6 },
    metricLabel: { ...typography.caption, color: colors.muted, marginTop: 4 },
    card: { backgroundColor: colors.surface, borderRadius: radii.lg, padding: spacing.lg, gap: 8 },
    cardKicker: { ...typography.caption, color: colors.accent, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
    cardTitle: { ...typography.heading, color: colors.ink, fontSize: 18 },
    chart: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      height: 120,
      marginTop: spacing.sm,
      gap: 2
    },
    barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 6 },
    bar: { width: '70%', borderRadius: 6, backgroundColor: colors.line, minHeight: 6 },
    barOn: { backgroundColor: colors.accent },
    barLabel: { fontSize: 9, color: colors.muted, fontWeight: '600' },
    error: { color: colors.danger }
  });
}
