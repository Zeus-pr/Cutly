import { useCallback } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { BackButton } from '@/components/BackButton';
import { ListRowsSkeleton } from '@/components/Skeleton';
import { radii, spacing, typography, type Palette } from '@/constants/theme';
import { api } from '@/services/api';
import { useColors, useThemedStyles } from '@/store/useThemeStore';
import { formatDateTime } from '@/utils/time';

type InboxItem = Awaited<ReturnType<typeof api.notifications>>['items'][number];

export default function NotificationsScreen() {
  const colors = useColors();
  const styles = useThemedStyles(inboxStyles);
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.notifications()
  });

  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch])
  );

  const items = data?.items || [];

  async function openItem(item: InboxItem) {
    if (!item.readAt) {
      try {
        await api.markNotificationRead(item.id);
        void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      } catch {
        // still navigate
      }
    }
    // T4 (#9) screen 13 → 14: an email released to its owner opens Profile.
    if (item.type === 'email_released' || item.type === 'email_changed' || item.data?.screen === 'profile') {
      router.push('/(tabs)/profile');
      return;
    }
    const bookingId = item.data?.bookingId;
    if (bookingId) {
      router.push({ pathname: '/booking/[id]', params: { id: bookingId } });
      return;
    }
    if (item.data?.screen === 'visits' || item.type.includes('booking')) {
      router.push('/(tabs)/bookings');
    }
  }

  async function markAll() {
    try {
      await api.markAllNotificationsRead();
      void refetch();
    } catch {
      // ignore
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.top}>
        <BackButton label="" />
        <Text style={styles.title}>Alerts</Text>
        {data && data.unreadCount > 0 ? (
          <Pressable onPress={() => void markAll()} hitSlop={8} accessibilityRole="button">
            <Text style={styles.markAll}>Read all</Text>
          </Pressable>
        ) : (
          <View style={styles.topSpacer} />
        )}
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.accent} />
        }
        ListEmptyComponent={
          isLoading ? (
            <ListRowsSkeleton count={5} />
          ) : (
            <View style={styles.empty}>
              <View style={styles.emptyMark}>
                <Ionicons name="notifications-outline" size={28} color={colors.ink} />
              </View>
              <Text style={styles.emptyTitle}>{isError ? 'Could not load' : 'You’re all caught up'}</Text>
              <Text style={styles.emptyBody}>
                {isError
                  ? error instanceof Error
                    ? error.message
                    : 'Try again.'
                  : 'Booking updates land here. Coupons and offers will show up later too.'}
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => {
          const unread = !item.readAt;
          return (
            <Pressable
              style={[styles.card, unread && styles.cardUnread]}
              onPress={() => void openItem(item)}
              accessibilityRole="button"
              accessibilityLabel={`${item.title}. ${item.body}`}
            >
              <View style={styles.cardTop}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {item.title}
                </Text>
                {unread ? <View style={styles.dot} /> : null}
              </View>
              <Text style={styles.cardBody} numberOfLines={item.type === 'email_released' ? undefined : 2 /* V17: full body */}>
                {item.body}
              </Text>
              <Text style={styles.when}>{formatDateTime(item.createdAt)}</Text>
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}

function inboxStyles(colors: Palette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.canvas },
    top: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.sm,
      gap: spacing.sm
    },
    title: { ...typography.heading, color: colors.ink, flex: 1, textAlign: 'center', fontSize: 18 },
    topSpacer: { minWidth: 64 },
    markAll: { ...typography.caption, color: colors.accent, fontWeight: '700', minWidth: 64, textAlign: 'right' },
    content: { padding: spacing.md, paddingBottom: 40, flexGrow: 1 },
    empty: { paddingTop: 72, alignItems: 'center', gap: spacing.sm },
    emptyMark: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.sand,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.sm
    },
    emptyTitle: { ...typography.heading, color: colors.ink },
    emptyBody: { ...typography.body, color: colors.muted, textAlign: 'center', maxWidth: 280 },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.line,
      padding: spacing.md,
      marginBottom: spacing.sm,
      gap: 4
    },
    cardUnread: {
      borderColor: colors.accent,
      backgroundColor: colors.sand
    },
    cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    cardTitle: { ...typography.heading, color: colors.ink, flex: 1, fontSize: 16 },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.accent
    },
    cardBody: { ...typography.body, color: colors.muted },
    when: { ...typography.caption, color: colors.muted, marginTop: 2 }
  });
}
