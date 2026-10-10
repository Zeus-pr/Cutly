import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ExploreShopCard } from '@/components/ExploreShopCard';
import { HomeSortSheet } from '@/components/HomeSortSheet';
import { PressScale } from '@/components/PressScale';
import { ScreenBack } from '@/components/ScreenBack';
import { ShopListSkeleton } from '@/components/Skeleton';
import { EXPLORE_CATEGORIES, categoryKindQuery, type ExploreCategoryId } from '@/constants/exploreCategories';
import { fontFamily } from '@/constants/fonts';
import { radii, spacing, type Palette } from '@/constants/theme';
import { api } from '@/services/api';
import { DEFAULT_PLACE } from '@/services/device-location';
import { givenName, useSessionStore } from '@/store/useSessionStore';
import { usePlaceStore } from '@/store/usePlaceStore';
import { useColors, useThemedStyles } from '@/store/useThemeStore';
import { homeSortChipLabel, sortFamily, sortShops, type HomeSort, type HomeSortFamily } from '@/utils/homeSort';

type Props = { categoryId: ExploreCategoryId; showBack?: boolean };

/** Sort chips under the section title — one sort at a time; each opens its family in HomeSortSheet. */
const SORT_CHIPS: { family: HomeSortFamily; defaultSort: HomeSort; label: string }[] = [
  { family: 'nearest', defaultSort: 'nearest', label: 'Nearest' },
  { family: 'earliest', defaultSort: 'earliest', label: 'Earliest' },
  { family: 'price', defaultSort: 'price_asc', label: 'Price' },
  { family: 'rating', defaultSort: 'rating_desc', label: 'Rating' }
];

export function CategoryExploreScreen({ categoryId, showBack }: Props) {
  const category = EXPLORE_CATEGORIES[categoryId];
  const colors = useColors();
  const styles = useThemedStyles(screenStyles);
  const [query, setQuery] = useState('');
  const [chip, setChip] = useState<string | null>(null);
  const [sort, setSort] = useState<HomeSort>('nearest');
  const [sortSheet, setSortSheet] = useState<HomeSortFamily | null>(null);
  const customer = givenName(useSessionStore((s) => s.name));
  const initial = (customer || 'U').slice(0, 1).toUpperCase();
  const active = usePlaceStore((state) => state.active);
  const areaConfirmed = usePlaceStore((state) => state.areaConfirmed);
  const placeTitle = active?.area || DEFAULT_PLACE.area;
  const lat = active?.latitude ?? DEFAULT_PLACE.latitude;
  const lng = active?.longitude ?? DEFAULT_PLACE.longitude;

  const kindsParam = categoryKindQuery(category);
  const hintsParam = category.serviceHints.length ? category.serviceHints.join(',') : undefined;

  const { data = [], isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ['explore-category', categoryId, kindsParam, hintsParam, lat, lng],
    enabled: areaConfirmed,
    queryFn: () =>
      api.shops({
        lat,
        lng,
        radiusKm: 30,
        kinds: kindsParam || undefined,
        serviceHints: hintsParam
      })
  });

  const shops = useMemo(() => {
    let list = data;
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((shop) => {
        const hay = [shop.name, shop.city, shop.address, ...shop.services].join(' ').toLowerCase();
        return hay.includes(q);
      });
    }
    if (chip) {
      const c = chip.toLowerCase();
      list = list.filter((shop) => {
        const hay = [shop.name, ...shop.services, ...shop.tags].join(' ').toLowerCase();
        return hay.includes(c) || hay.includes(c.replace(/’/g, "'"));
      });
    }
    return sortShops(list, sort);
  }, [data, query, chip, sort]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <FlatList
        data={shops}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.accent} />}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View>
            <View style={styles.topRow}>
              {showBack ? (
                <ScreenBack />
              ) : null}
              <Pressable
                style={styles.location}
                onPress={() => usePlaceStore.getState().openSheet()}
                accessibilityRole="button"
                accessibilityLabel={`Location, ${placeTitle}`}
              >
                <Ionicons name="location" size={16} color={colors.accent} />
                <Text style={styles.locationText} numberOfLines={1}>
                  {placeTitle}
                </Text>
                <Ionicons name="chevron-down" size={14} color={colors.muted} />
              </Pressable>
              <PressScale
                onPress={() => router.push('/profile')}
                accessibilityRole="button"
                accessibilityLabel="Profile"
                style={styles.avatar}
                haptic
              >
                <Text style={styles.avatarText}>{initial}</Text>
              </PressScale>
            </View>

            <View style={styles.search}>
              <Ionicons name="search" size={18} color={colors.accent} />
              <TextInput
                style={styles.searchInput}
                placeholder={category.searchPlaceholder}
                placeholderTextColor={colors.muted}
                value={query}
                onChangeText={setQuery}
                returnKeyType="search"
                autoCorrect={false}
              />
            </View>

            <Text style={styles.browseLabel}>{category.browseLabel.toUpperCase()}</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}
            >
              {category.browseChips.map((label) => {
                const on = chip === label;
                return (
                  <PressScale
                    key={label}
                    style={[styles.chip, on && styles.chipOn]}
                    onPress={() => setChip(on ? null : label)}
                    selected={on}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                  >
                    <View style={[styles.chipBlob, on && styles.chipBlobOn]}>
                      <Text style={[styles.chipInitial, on && styles.chipInitialOn]}>
                        {label.slice(0, 1)}
                      </Text>
                    </View>
                    <Text style={[styles.chipText, on && styles.chipTextOn]} numberOfLines={1}>
                      {label}
                    </Text>
                  </PressScale>
                );
              })}
            </ScrollView>

            <Text style={styles.sectionTitle}>{category.heading}</Text>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.sortRow}
              style={styles.sortScroll}
            >
              {SORT_CHIPS.map((item) => {
                const on = sortFamily(sort) === item.family;
                const label = on && item.family === 'price' ? homeSortChipLabel(sort) : item.label;
                return (
                  <PressScale
                    key={item.family}
                    style={[styles.sortChip, on && styles.sortChipOn]}
                    onPress={() => setSortSheet(item.family)}
                    selected={on}
                    haptic
                    accessibilityRole="button"
                    accessibilityLabel={`Sort by ${item.label}`}
                    accessibilityState={{ selected: on }}
                  >
                    <Text style={[styles.sortChipText, on && styles.sortChipTextOn]}>{label}</Text>
                    <Ionicons name="chevron-down" size={12} color={on ? colors.white : colors.muted} />
                  </PressScale>
                );
              })}
            </ScrollView>

            {!areaConfirmed ? (
              <Pressable
                style={styles.areaGate}
                onPress={() => usePlaceStore.getState().openSheet()}
                accessibilityRole="button"
              >
                <Ionicons name="locate-outline" size={16} color={colors.ink} />
                <Text style={styles.areaGateText}>Confirm your area to load shops.</Text>
              </Pressable>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          !areaConfirmed ? (
            <Text style={styles.empty}>Confirm your area to explore nearby shops.</Text>
          ) : isLoading ? (
            <ShopListSkeleton count={3} />
          ) : (
            <Text style={styles.empty}>
              {isError
                ? error instanceof Error
                  ? error.message
                  : 'Cannot reach the CUTLY server.'
                : `No ${category.title.toLowerCase()} nearby yet.`}
            </Text>
          )
        }
        renderItem={({ item }) => (
          <ExploreShopCard
            shop={item}
            promoLine={category.promoLine}
            onPress={() => router.push({ pathname: '/shop/[id]', params: { id: item.id } })}
          />
        )}
      />
      <HomeSortSheet
        visible={sortSheet !== null}
        value={sort}
        family={sortSheet}
        onSelect={setSort}
        onClose={() => setSortSheet(null)}
      />
    </SafeAreaView>
  );
}

function screenStyles(colors: Palette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.canvas },
    content: { paddingHorizontal: spacing.md, paddingBottom: 110 },
    topRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
      marginTop: spacing.xs
    },
    location: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
    locationText: {
      flexShrink: 1,
      fontFamily: fontFamily.semibold,
      fontSize: 15,
      color: colors.ink
    },
    avatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center'
    },
    avatarText: {
      fontFamily: fontFamily.bold,
      fontSize: 15,
      color: colors.white
    },
    search: {
      marginTop: spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.surface,
      borderRadius: radii.pill,
      borderWidth: 1,
      borderColor: colors.line,
      paddingHorizontal: spacing.md,
      paddingVertical: 12
    },
    searchInput: {
      flex: 1,
      fontFamily: fontFamily.regular,
      fontSize: 15,
      color: colors.ink,
      padding: 0
    },
    browseLabel: {
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
      fontFamily: fontFamily.bold,
      fontSize: 12,
      letterSpacing: 1.1,
      color: colors.muted
    },
    chips: { gap: 14, paddingRight: spacing.md, paddingBottom: spacing.sm },
    chip: { width: 72, alignItems: 'center', gap: 6 },
    chipOn: {},
    chipBlob: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.sand,
      borderWidth: 1,
      borderColor: colors.line,
      alignItems: 'center',
      justifyContent: 'center'
    },
    chipBlobOn: {
      backgroundColor: `${colors.accent}22`,
      borderColor: colors.accent
    },
    chipInitial: {
      fontFamily: fontFamily.bold,
      fontSize: 18,
      color: colors.ink
    },
    chipInitialOn: { color: colors.accentDark },
    chipText: {
      fontFamily: fontFamily.medium,
      fontSize: 11,
      color: colors.muted,
      textAlign: 'center'
    },
    chipTextOn: { color: colors.accentDark },
    sectionTitle: {
      marginTop: spacing.md,
      marginBottom: spacing.sm,
      fontFamily: fontFamily.bold,
      fontSize: 18,
      color: colors.ink
    },
    sortScroll: { marginBottom: spacing.md, marginHorizontal: -spacing.md },
    sortRow: { gap: 8, paddingHorizontal: spacing.md },
    sortChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: radii.pill,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line
    },
    sortChipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
    sortChipText: { fontFamily: fontFamily.semibold, fontSize: 13, color: colors.muted },
    sortChipTextOn: { color: colors.white },
    areaGate: {
      marginBottom: spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      padding: spacing.md,
      borderRadius: radii.md,
      backgroundColor: colors.sand,
      borderWidth: 1,
      borderColor: colors.line
    },
    areaGateText: {
      fontFamily: fontFamily.semibold,
      fontSize: 13,
      color: colors.ink,
      flex: 1
    },
    empty: {
      fontFamily: fontFamily.regular,
      color: colors.muted,
      paddingVertical: spacing.xl,
      textAlign: 'center'
    }
  });
}
