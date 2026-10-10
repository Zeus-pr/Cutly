import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  LayoutChangeEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming
} from 'react-native-reanimated';
import { ScreenBack } from '@/components/ScreenBack';
import { PressScale } from '@/components/PressScale';
import { ServiceMark } from '@/components/ServiceMark';
import { ExploreShopCard } from '@/components/ExploreShopCard';
import { ShopListSkeleton } from '@/components/Skeleton';
import { homeServicePicks } from '@/constants/homeServices';
import { fontFamily } from '@/constants/fonts';
import { radii, spacing, type Palette } from '@/constants/theme';
import { api } from '@/services/api';
import { DEFAULT_PLACE } from '@/services/device-location';
import { usePlaceStore } from '@/store/usePlaceStore';
import { useColors, useThemedStyles } from '@/store/useThemeStore';
import { flatSubstringMatch } from '@/utils/placeTrust';

const ALL_SERVICES = homeServicePicks();
const COLS = 3;
const H_PAD = spacing.md;
const TILE_GAP = 12;
const move = { duration: 220, easing: Easing.bezier(0.77, 0, 0.175, 1), reduceMotion: ReduceMotion.System };

type SearchTab = 'places' | 'services';

function tileSize() {
  const w = Dimensions.get('window').width;
  const inner = w - H_PAD * 2;
  return Math.floor((inner - TILE_GAP * (COLS - 1)) / COLS);
}

export default function SearchScreen() {
  const colors = useColors();
  const styles = useThemedStyles(searchStyles);
  const reduced = useReducedMotion();
  const params = useLocalSearchParams<{ q?: string }>();
  const initialQ = typeof params.q === 'string' ? params.q : '';
  const [query, setQuery] = useState(initialQ);
  const [debounced, setDebounced] = useState(initialQ.trim());
  const [tab, setTab] = useState<SearchTab>('places');
  const [tabLayouts, setTabLayouts] = useState<Record<string, { x: number; width: number }>>({});
  const inputRef = useRef<TextInput>(null);
  const cell = tileSize();
  const active = usePlaceStore((state) => state.active);
  const lat = active?.latitude ?? DEFAULT_PLACE.latitude;
  const lng = active?.longitude ?? DEFAULT_PLACE.longitude;
  const underlineX = useSharedValue(0);
  const underlineW = useSharedValue(48);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (typeof params.q === 'string') setQuery(params.q);
  }, [params.q]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 280);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    const layout = tabLayouts[tab];
    if (!layout) return;
    if (reduced) {
      underlineX.set(layout.x);
      underlineW.set(layout.width);
      return;
    }
    underlineX.set(withTiming(layout.x, move));
    underlineW.set(withTiming(layout.width, move));
  }, [tab, tabLayouts, reduced, underlineX, underlineW]);

  const underlineStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: underlineX.get() }],
    width: underlineW.get()
  }));

  const shopQueryEnabled = debounced.length >= 2;
  const { data: shops = [], isFetching } = useQuery({
    queryKey: ['search-shops', debounced, lat, lng],
    enabled: shopQueryEnabled && tab === 'places',
    queryFn: () =>
      api.shops({
        query: debounced,
        lat,
        lng,
        radiusKm: 30
      })
  });

  const serviceTiles = useMemo(() => {
    if (!debounced) return ALL_SERVICES.slice(0, 18);
    return ALL_SERVICES.filter((name) => flatSubstringMatch(name, query));
  }, [query, debounced]);

  function openService(name: string) {
    router.push({ pathname: '/search/[service]', params: { service: name } });
  }

  function clearQuery() {
    setQuery('');
    inputRef.current?.focus();
  }

  function onTabLayout(key: SearchTab, e: LayoutChangeEvent) {
    const { x, width } = e.nativeEvent.layout;
    setTabLayouts((prev) => {
      const cur = prev[key];
      if (cur && Math.abs(cur.x - x) < 0.5 && Math.abs(cur.width - width) < 0.5) return prev;
      return { ...prev, [key]: { x, width } };
    });
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <ScreenBack />
        <Text style={styles.headerTitle}>Search for a place or service</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.search}>
        <Ionicons name="search" size={18} color={colors.accent} />
        <TextInput
          ref={inputRef}
          value={query}
          onChangeText={setQuery}
          placeholder="Search for a place or service"
          placeholderTextColor={colors.muted}
          style={styles.input}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="never"
        />
        {query.length > 0 ? (
          <Pressable onPress={clearQuery} hitSlop={8} accessibilityLabel="Clear search">
            <Ionicons name="close" size={18} color={colors.accent} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.tabs}>
        {(['places', 'services'] as SearchTab[]).map((id) => {
          const on = tab === id;
          return (
            <Pressable
              key={id}
              style={styles.tab}
              onLayout={(e) => onTabLayout(id, e)}
              onPress={() => setTab(id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
            >
              <Text style={[styles.tabLabel, on && styles.tabLabelOn]}>
                {id === 'places' ? 'Places' : 'Services'}
              </Text>
            </Pressable>
          );
        })}
        <Animated.View style={[styles.tabUnderline, underlineStyle]} pointerEvents="none" />
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        {tab === 'places' ? (
          !shopQueryEnabled ? (
            <Text style={styles.note}>Type at least 2 characters to find shops.</Text>
          ) : isFetching && shops.length === 0 ? (
            <ShopListSkeleton count={2} />
          ) : shops.length === 0 ? (
            <Text style={styles.note}>No places match “{debounced}”.</Text>
          ) : (
            shops.map((shop) => (
              <ExploreShopCard
                key={shop.id}
                shop={shop}
                promoLine="Book on CutLy"
                onPress={() => router.push({ pathname: '/shop/[id]', params: { id: shop.id } })}
              />
            ))
          )
        ) : serviceTiles.length === 0 ? (
          <Text style={styles.note}>No services match.</Text>
        ) : (
          <View style={styles.grid}>
            {serviceTiles.map((name) => (
              <PressScale
                key={name}
                style={[styles.tile, { width: cell }]}
                onPress={() => openService(name)}
                accessibilityRole="button"
                accessibilityLabel={`${name}, show shops`}
                pressedScale={0.92}
              >
                <View style={styles.tileCircle}>
                  <ServiceMark kind={name} color={colors.accentDark} size={28} />
                </View>
                <Text style={styles.tileLabel} numberOfLines={2}>
                  {name}
                </Text>
              </PressScale>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function searchStyles(colors: Palette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.canvas },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      paddingBottom: spacing.sm,
      gap: spacing.sm
    },
    headerTitle: {
      flex: 1,
      textAlign: 'center',
      fontFamily: fontFamily.semibold,
      fontSize: 16,
      color: colors.ink
    },
    headerSpacer: { width: 36 },
    search: {
      marginHorizontal: H_PAD,
      backgroundColor: colors.surface,
      borderRadius: radii.pill,
      height: 48,
      paddingHorizontal: spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.line,
      gap: spacing.sm
    },
    input: {
      flex: 1,
      fontFamily: fontFamily.regular,
      color: colors.ink,
      fontSize: 15,
      paddingVertical: 0
    },
    tabs: {
      flexDirection: 'row',
      marginHorizontal: H_PAD,
      marginTop: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.line,
      position: 'relative'
    },
    tab: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12
    },
    tabLabel: {
      fontFamily: fontFamily.medium,
      fontSize: 15,
      color: colors.muted,
      textAlign: 'center'
    },
    tabLabelOn: { color: colors.accent, fontFamily: fontFamily.semibold },
    tabUnderline: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      height: 2.5,
      borderRadius: 2,
      backgroundColor: colors.accent
    },
    content: { paddingHorizontal: H_PAD, paddingTop: spacing.md, paddingBottom: 40 },
    note: {
      fontFamily: fontFamily.regular,
      fontSize: 14,
      color: colors.muted,
      textAlign: 'center',
      marginTop: 48
    },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: TILE_GAP },
    tile: { alignItems: 'center', gap: 8 },
    tileCircle: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: colors.surface,
      borderWidth: 1.5,
      borderColor: colors.line,
      alignItems: 'center',
      justifyContent: 'center'
    },
    tileLabel: {
      fontFamily: fontFamily.semibold,
      fontSize: 12,
      color: colors.muted,
      textAlign: 'center',
      minHeight: 32,
      lineHeight: 15,
      width: '100%'
    }
  });
}
