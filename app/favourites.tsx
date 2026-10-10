import { useQuery } from '@tanstack/react-query';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { BackButton } from '@/components/BackButton';
import { ShopCard } from '@/components/ShopCard';
import { ShopListSkeleton } from '@/components/Skeleton';
import { radii, spacing, typography, type Palette } from '@/constants/theme';
import { api } from '@/services/api';
import { usePlaceStore } from '@/store/usePlaceStore';
import { useColors, useThemedStyles } from '@/store/useThemeStore';

export default function FavouritesScreen() {
  const colors = useColors();
  const styles = useThemedStyles(favStyles);
  const active = usePlaceStore((s) => s.active);
  const { data = [], isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ['favourites', active?.latitude, active?.longitude],
    queryFn: () => api.favourites({ lat: active?.latitude, lng: active?.longitude })
  });

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.top}>
        <BackButton label="" />
        <Text style={styles.title}>Favourites</Text>
        <View style={styles.spacer} />
      </View>
      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        refreshing={isRefetching}
        onRefresh={() => void refetch()}
        ListEmptyComponent={
          isLoading ? (
            <ShopListSkeleton count={3} />
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>{isError ? 'Could not load' : 'No favourites yet'}</Text>
              <Text style={styles.emptyBody}>
                {isError
                  ? error instanceof Error
                    ? error.message
                    : 'Try again.'
                  : 'Tap the heart on any shop to save it here.'}
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <ShopCard shop={item} onPress={() => router.push({ pathname: '/shop/[id]', params: { id: item.id } })} />
        )}
      />
    </SafeAreaView>
  );
}

function favStyles(colors: Palette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.canvas },
    top: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.sm
    },
    title: { ...typography.heading, color: colors.ink, flex: 1, textAlign: 'center' },
    spacer: { width: 40 },
    content: { padding: spacing.md, paddingBottom: spacing.xxl, gap: spacing.sm },
    empty: {
      marginTop: spacing.xl,
      padding: spacing.lg,
      backgroundColor: colors.surface,
      borderRadius: radii.md
    },
    emptyTitle: { ...typography.heading, color: colors.ink },
    emptyBody: { ...typography.body, color: colors.muted, marginTop: spacing.sm }
  });
}
