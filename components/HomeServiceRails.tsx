import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { PressScale } from '@/components/PressScale';
import { SkeletonBone } from '@/components/Skeleton';
import { fontFamily } from '@/constants/fonts';
import { radii, spacing, type Palette } from '@/constants/theme';
import { api } from '@/services/api';
import { DEFAULT_PLACE } from '@/services/device-location';
import { usePlaceStore } from '@/store/usePlaceStore';
import { useColors, useThemedStyles } from '@/store/useThemeStore';
import type { Shop } from '@/types/domain';
import { formatINR } from '@/utils/money';

const RAILS = [
  {
    serviceName: 'Haircut',
    categoryId: 'hair-essentials',
    match: /haircut/i,
    title: 'Ready for a haircut?'
  },
  {
    serviceName: 'Facial',
    categoryId: 'face',
    match: /facial|cleanup/i,
    title: 'Time for a facial?'
  },
  {
    serviceName: 'Manicure',
    categoryId: 'mani-pedi',
    match: /manicure|pedicure|gel\s*nails?|nail\s*art|acrylic/i,
    title: 'Want your nails done?'
  },
  {
    serviceName: 'Flash / small tattoo',
    categoryId: 'tattoo',
    match: /tattoo|cover-up|blackwork/i,
    title: 'A small tattoo'
  },
  {
    serviceName: 'Ear lobe',
    categoryId: 'piercing',
    match: /ear\s*lobe|\blobe\b|helix|tragus|conch/i,
    title: 'Ear piercing'
  }
] as const;

function offeredLine(services: string[], match: RegExp, fallback: string) {
  return services.find((name) => match.test(name)) || fallback;
}

function fromPricePaise(shop: Shop, match: RegExp) {
  const prices = (shop.menu || [])
    .filter((row) => match.test(row.name) && row.pricePaise > 0)
    .map((row) => row.pricePaise);
  if (!prices.length) return null;
  return Math.min(...prices);
}

function distanceLabel(km: number) {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

export function HomeServiceRails() {
  const colors = useColors();
  const styles = useThemedStyles(railStyles);
  const active = usePlaceStore((state) => state.active);
  const lat = active?.latitude ?? DEFAULT_PLACE.latitude;
  const lng = active?.longitude ?? DEFAULT_PLACE.longitude;

  const { data = [], isPending } = useQuery({
    queryKey: ['shops', 'home-rails', lat, lng],
    queryFn: () => api.shops({ lat, lng, radiusKm: 30 })
  });

  const rails = RAILS.map((rail) => ({
    ...rail,
    shops: data
      .filter((shop) => shop.services.some((name) => rail.match.test(name)))
      .slice(0, 8)
  })).filter((rail) => rail.shops.length > 0);

  if (isPending) return <RailsSkeleton />;
  if (!rails.length) return null;

  return (
    <View style={styles.wrap}>
      {rails.map((rail) => (
        <View key={rail.serviceName} style={styles.section}>
          <View style={styles.head}>
            <View style={styles.headCopy}>
              <Text style={styles.title}>{rail.title}</Text>
            </View>
            <PressScale
              onPress={() =>
                router.push({ pathname: '/search/[service]', params: { service: rail.serviceName } })
              }
              accessibilityRole="button"
              accessibilityLabel={`See all shops for ${rail.title}`}
              haptic
            >
              <Text style={[styles.seeAll, { color: colors.accent }]}>See all</Text>
            </PressScale>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.row}
            decelerationRate="fast"
            snapToInterval={232}
            snapToAlignment="start"
          >
            {rail.shops.map((shop) => (
              <ShopChip
                key={shop.id}
                shop={shop}
                serviceLine={offeredLine(shop.services, rail.match, rail.title)}
                fromPaise={fromPricePaise(shop, rail.match)}
                onPress={() =>
                router.push({
                  pathname: '/shop/[id]/menu',
                  params: { id: shop.id, category: rail.categoryId }
                })
              }
              />
            ))}
          </ScrollView>
        </View>
      ))}
    </View>
  );
}

function RailsSkeleton() {
  const styles = useThemedStyles(railStyles);
  return (
    <View style={styles.wrap} accessibilityLabel="Loading shops">
      {[0, 1].map((section) => (
        <View key={section} style={styles.section}>
          <View style={styles.head}>
            <View style={styles.headCopy}>
              <SkeletonBone width={88} height={12} />
              <SkeletonBone width={180} height={22} style={{ marginTop: 8 }} />
            </View>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
            {[0, 1, 2].map((card) => (
              <View key={card} style={styles.card}>
                <SkeletonBone height={112} radius={0} />
                <View style={styles.boneCopy}>
                  <SkeletonBone width="78%" height={14} />
                  <SkeletonBone width="56%" height={12} style={{ marginTop: 8 }} />
                  <SkeletonBone width="40%" height={12} style={{ marginTop: 8 }} />
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      ))}
    </View>
  );
}

function ShopChip({
  shop,
  serviceLine,
  fromPaise,
  onPress
}: {
  shop: Shop;
  serviceLine: string;
  fromPaise: number | null;
  onPress: () => void;
}) {
  const styles = useThemedStyles(railStyles);
  return (
    <PressScale
      style={styles.card}
      onPress={onPress}
      haptic
      pressedScale={0.97}
      accessibilityRole="button"
      accessibilityLabel={
        fromPaise != null ? `${shop.name}, ${serviceLine}, from ${formatINR(fromPaise)}` : `${shop.name}, ${serviceLine}`
      }
    >
      <Image source={shop.imageUrl} style={styles.photo} contentFit="cover" />
      <Text style={styles.name} numberOfLines={1}>
        {shop.name}
      </Text>
      <Text style={styles.service} numberOfLines={1}>
        {serviceLine}
      </Text>
      {fromPaise != null ? (
        <Text style={styles.price} numberOfLines={1}>
          From {formatINR(fromPaise)}
        </Text>
      ) : null}
      <Text style={styles.meta} numberOfLines={1}>
        {distanceLabel(shop.distanceKm)}
        {shop.isOpen ? ' · Open' : ''}
      </Text>
    </PressScale>
  );
}

function railStyles(colors: Palette) {
  return StyleSheet.create({
    wrap: { marginTop: spacing.lg },
    section: { marginBottom: spacing.lg },
    head: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      gap: spacing.md,
      marginBottom: spacing.sm
    },
    headCopy: { flex: 1, minWidth: 0 },
    title: {
      fontFamily: fontFamily.bold,
      fontSize: 20,
      lineHeight: 24,
      letterSpacing: -0.3,
      color: colors.ink
    },
    seeAll: {
      fontFamily: fontFamily.semibold,
      fontSize: 14,
      paddingBottom: 2
    },
    row: {
      gap: 12,
      paddingRight: spacing.md
    },
    card: {
      width: 220,
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.line,
      overflow: 'hidden',
      paddingBottom: 12
    },
    boneCopy: {
      paddingTop: 10,
      paddingHorizontal: 12,
      paddingBottom: 4
    },
    photo: {
      width: '100%',
      height: 112,
      backgroundColor: colors.sand
    },
    name: {
      marginTop: 10,
      marginHorizontal: 12,
      fontFamily: fontFamily.bold,
      fontSize: 15,
      lineHeight: 18,
      color: colors.ink
    },
    service: {
      marginTop: 3,
      marginHorizontal: 12,
      fontFamily: fontFamily.medium,
      fontSize: 13,
      lineHeight: 16,
      color: colors.accentDark
    },
    price: {
      marginTop: 4,
      marginHorizontal: 12,
      fontFamily: fontFamily.semibold,
      fontSize: 13,
      lineHeight: 16,
      color: colors.ink
    },
    meta: {
      marginTop: 4,
      marginHorizontal: 12,
      fontFamily: fontFamily.regular,
      fontSize: 12,
      lineHeight: 15,
      color: colors.muted
    }
  });
}
