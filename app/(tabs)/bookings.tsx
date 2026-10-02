import { useCallback } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/services/api';
import { radii, spacing, typography, type Palette } from '@/constants/theme';
import { useColors, useThemedStyles } from '@/store/useThemeStore';
import { formatINR } from '@/utils/money';
import type { Booking } from '@/types/domain';

export default function Bookings() {
  const colors = useColors();
  const styles = useThemedStyles(bookingStyles);
  const { data = [], isLoading, refetch, isRefetching, isError, error } = useQuery({
    queryKey: ['bookings'],
    queryFn: () => api.bookings()
  });

  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch])
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.accent} />}
        ListHeaderComponent={<Text style={styles.title}>Bookings</Text>}
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={styles.mark}>
              <Ionicons name="calendar-outline" size={28} color={colors.ink} />
            </View>
            <Text style={styles.heading}>{isLoading ? 'Loading…' : isError ? 'Could not load bookings' : 'No bookings yet'}</Text>
            <Text style={styles.body}>
              {isError
                ? error instanceof Error
                  ? error.message
                  : 'Try again.'
                : 'When you book a chair, it will show up here.'}
            </Text>
            {!isLoading && !isError ? (
              <Pressable style={styles.cta} onPress={() => router.push('/(tabs)')}>
                <Text style={styles.ctaText}>Find a shop</Text>
              </Pressable>
            ) : null}
          </View>
        }
        renderItem={({ item }) => <BookingRow booking={item} />}
      />
    </SafeAreaView>
  );
}

function BookingRow({ booking }: { booking: Booking }) {
  const styles = useThemedStyles(bookingStyles);
  const when = new Date(booking.startsAt);
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <Text style={styles.shop}>{booking.shop.name}</Text>
        <Text style={styles.status}>{booking.status.replace('_', ' ')}</Text>
      </View>
      <Text style={styles.meta}>
        {booking.service.name} · {booking.barber.name}
      </Text>
      <Text style={styles.when}>
        {when.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })} ·{' '}
        {when.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}
      </Text>
      <Text style={styles.code}>
        {booking.bookingCode} · {formatINR(booking.advancePaise)} paid
      </Text>
    </View>
  );
}

function bookingStyles(colors: Palette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.canvas },
    content: { padding: spacing.md, paddingBottom: 120, flexGrow: 1 },
    title: { ...typography.display, color: colors.ink, marginBottom: spacing.md },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 80, paddingTop: 80 },
    mark: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.md
    },
    heading: { ...typography.heading, color: colors.ink },
    body: { ...typography.body, color: colors.muted, textAlign: 'center', marginTop: spacing.sm, maxWidth: 260 },
    cta: {
      marginTop: spacing.lg,
      backgroundColor: colors.accent,
      borderRadius: radii.pill,
      paddingHorizontal: 22,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center'
    },
    ctaText: { color: colors.white, fontWeight: '700' },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radii.lg,
      padding: spacing.md,
      marginBottom: spacing.sm,
      gap: 4
    },
    cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
    shop: { ...typography.heading, color: colors.ink, flex: 1 },
    status: {
      ...typography.caption,
      color: colors.accent,
      fontWeight: '700',
      textTransform: 'capitalize'
    },
    meta: { ...typography.body, color: colors.muted },
    when: { ...typography.body, color: colors.ink, fontWeight: '600', marginTop: 4 },
    code: { ...typography.caption, color: colors.muted, marginTop: 2 }
  });
}
