import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BackButton } from '@/components/BackButton';
import { PressScale } from '@/components/PressScale';
import { ServiceMark } from '@/components/ServiceMark';
import { ShopCard } from '@/components/ShopCard';
import { ShopListSkeleton } from '@/components/Skeleton';
import { shopMatchesServicePick } from '@/constants/homeServices';
import { spacing, typography, type Palette } from '@/constants/theme';
import { api } from '@/services/api';
import { DEFAULT_PLACE } from '@/services/device-location';
import { usePlaceStore } from '@/store/usePlaceStore';
import { useColors, useThemedStyles } from '@/store/useThemeStore';

export default function ServiceShopsScreen() {
  const colors = useColors();
  const styles = useThemedStyles(resultsStyles);
  const params = useLocalSearchParams<{ service?: string }>();
  const raw = typeof params.service === 'string' ? params.service : '';
  const service = (() => {
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  })();
  const active = usePlaceStore((state) => state.active);

  const { data = [], isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ['shops', 'service', service, active?.latitude, active?.longitude],
    queryFn: () =>
      api.shops({
        lat: active?.latitude ?? DEFAULT_PLACE.latitude,
        lng: active?.longitude ?? DEFAULT_PLACE.longitude,
        radiusKm: 30,
        serviceName: service
      }),
    enabled: service.length > 0
  });

  const shops = useMemo(
    () => data.filter((shop) => shopMatchesServicePick(shop.services, shop.name, service)),
    [data, service]
  );

  const title = service || 'Service';
  const subtitle = isLoading
    ? ' '
    : shops.length
      ? `${shops.length} shop${shops.length === 1 ? '' : 's'} near you`
      : 'No shops nearby for this service';

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.topBar}>
        <BackButton
          label=""
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/search'))}
        />
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <ServiceMark kind={title} color={colors.accentDark} size={22} />
          </View>
          <View style={styles.heroCopy}>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            <Text style={styles.sub} numberOfLines={1}>
              {subtitle}
            </Text>
          </View>
        </View>
      </View>

      <FlatList
        data={shops}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        refreshing={isRefetching}
        onRefresh={refetch}
        ListEmptyComponent={
          isLoading ? (
            <ShopListSkeleton count={3} />
          ) : (
            <Text style={styles.empty}>
              {isError
                ? error instanceof Error
                  ? error.message
                  : 'Cannot reach the CUTLY server.'
                : 'Nothing nearby offers this service yet. Try another tile.'}
            </Text>
          )
        }
        renderItem={({ item }) => (
          <ShopCard
            shop={item}
            onPress={() => router.push({ pathname: '/shop/[id]', params: { id: item.id } })}
          />
        )}
      />
    </SafeAreaView>
  );
}

function resultsStyles(colors: Palette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.canvas },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      paddingBottom: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.line
    },
    back: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center'
    },
    hero: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm
    },
    heroIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      alignItems: 'center',
      justifyContent: 'center'
    },
    heroCopy: { flex: 1 },
    title: { ...typography.heading, color: colors.ink },
    sub: { ...typography.caption, color: colors.muted, marginTop: 2 },
    content: { paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: 40 },
    empty: { color: colors.muted, paddingVertical: spacing.xl, textAlign: 'center' }
  });
}
