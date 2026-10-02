import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ServiceMark } from '@/components/ServiceMark';
import { api } from '@/services/api';
import { radii, spacing, typography, type Palette } from '@/constants/theme';
import { useColors, useThemedStyles } from '@/store/useThemeStore';
import { ShopCard } from '@/components/ShopCard';
import { usePlaceStore } from '@/store/usePlaceStore';
import { givenName, useSessionStore } from '@/store/useSessionStore';

const picks = ['Haircut', 'Beard', 'Hair Wash', 'Facial'] as const;

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function Home() {
  const colors = useColors();
  const styles = useThemedStyles(homeStyles);
  const [query, setQuery] = useState('');
  const [pick, setPick] = useState('Haircut');
  const city = useSessionStore((state) => state.city);
  const customer = givenName(useSessionStore((state) => state.name));
  const active = usePlaceStore((state) => state.active);
  const placeTitle = active?.area || city;
  const placeLine = active?.address && active.address !== placeTitle ? active.address : null;
  const { data = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['shops', query, active?.latitude, active?.longitude],
    queryFn: () => api.shops({
      query,
      lat: active?.latitude ?? 23.2324,
      lng: active?.longitude ?? 87.8615,
      radiusKm: 30
    })
  });
  const shops = useMemo(() => {
    const needle = pick.toLowerCase();
    return data.filter((shop) => shop.services.some((service) => service.toLowerCase().includes(needle)) || shop.name.toLowerCase().includes(needle));
  }, [data, pick]);

  return (
    <SafeAreaView style={styles.safe}>
      <FlatList
        data={shops}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.accent} />}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View>
            <View style={styles.top}>
              <Pressable
                style={styles.location}
                onPress={() => usePlaceStore.getState().openSheet()}
                accessibilityRole="button"
                accessibilityLabel={`Location, ${placeTitle}`}
              >
                <Ionicons name="location" size={16} color={colors.accent} />
                <View style={styles.locationCopy}>
                  <View style={styles.locationLine}>
                    <Text style={styles.locationText} numberOfLines={1}>{placeTitle}</Text>
                    <Ionicons name="chevron-down" size={14} color={colors.muted} />
                  </View>
                  {placeLine ? <Text style={styles.locationSub} numberOfLines={1}>{placeLine}</Text> : null}
                </View>
              </Pressable>
              <Ionicons name="notifications-outline" size={22} color={colors.ink} />
            </View>
            <Text style={styles.hello}>{customer ? `${greeting()}, ${customer}` : greeting()}</Text>
            <Text style={styles.greeting}>Find your next cut</Text>
            <View style={styles.search}>
              <Ionicons name="search" size={18} color={colors.muted} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search barber shops or services"
                placeholderTextColor={colors.muted}
                style={styles.input}
                returnKeyType="search"
              />
            </View>
            <View style={styles.grid}>
              {[picks.slice(0, 2), picks.slice(2)].map((row) => (
                <View key={row[0]} style={styles.gridRow}>
                  {row.map((item) => {
                    const selected = pick === item;
                    return (
                      <Pressable key={item} onPress={() => setPick(item)} style={[styles.tile, selected && styles.tileOn]}>
                        <ServiceMark kind={item} color={selected ? colors.white : colors.limeDark} />
                        <Text style={[styles.tileText, selected && styles.tileTextOn]}>{item}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </View>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Available near you</Text>
              <Pressable onPress={() => router.push('/explore')}>
                <Text style={styles.seeAll}>See all</Text>
              </Pressable>
            </View>
          </View>
        }
        ListEmptyComponent={
          <Text style={styles.empty}>
            {isLoading ? 'Finding shops near you…' : 'Nothing nearby matches that search.'}
          </Text>
        }
        renderItem={({ item }) => (
          <ShopCard shop={item} onPress={() => router.push({ pathname: '/shop/[id]', params: { id: item.id } })} />
        )}
      />
    </SafeAreaView>
  );
}

function homeStyles(colors: Palette) {
  return StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: spacing.md, paddingBottom: 120 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  location: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, marginRight: spacing.md },
  locationCopy: { flex: 1 },
  locationLine: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  locationText: { ...typography.heading, color: colors.ink, flexShrink: 1 },
  locationSub: { ...typography.caption, color: colors.muted },
  hello: { ...typography.body, color: colors.muted, marginTop: spacing.lg },
  greeting: { ...typography.display, color: colors.ink, marginTop: 2 },
  search: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    height: 48,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.lg
  },
  input: { flex: 1, marginLeft: spacing.sm, color: colors.ink, fontSize: 16 },
  grid: { gap: 12, marginTop: spacing.lg },
  gridRow: { flexDirection: 'row', gap: 12 },
  tile: {
    flex: 1,
    height: 108,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8
  },
  tileOn: { backgroundColor: colors.accent },
  tileText: { ...typography.body, color: colors.ink, fontWeight: '600' },
  tileTextOn: { color: colors.white },
  section: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  sectionTitle: { ...typography.heading, color: colors.ink },
  seeAll: { ...typography.body, color: colors.accent },
  empty: { color: colors.muted, paddingVertical: spacing.xl, textAlign: 'center' }
});
}
