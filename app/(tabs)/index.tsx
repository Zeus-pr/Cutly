import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/services/api';
import { colors, radii, spacing, typography } from '@/constants/theme';
import { ShopCard } from '@/components/ShopCard';
import { useSessionStore } from '@/store/useSessionStore';

const picks = ['Haircut', 'Beard', 'Hair Wash', 'Facial'];

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function Home() {
  const [query, setQuery] = useState('');
  const [pick, setPick] = useState('Haircut');
  const city = useSessionStore((state) => state.city);
  const { data = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['shops', query],
    queryFn: () => api.shops({ query })
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
              <View style={styles.location}>
                <Ionicons name="location" size={16} color={colors.accent} />
                <Text style={styles.locationText}>{city}</Text>
                <Ionicons name="chevron-down" size={14} color={colors.muted} />
              </View>
              <Ionicons name="notifications-outline" size={22} color={colors.ink} />
            </View>
            <Text style={styles.hello}>{greeting()}</Text>
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
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.picks}>
              {picks.map((label) => {
                const selected = pick === label;
                return (
                  <Pressable key={label} onPress={() => setPick(label)} style={[styles.pick, selected && styles.pickOn]}>
                    <Text style={[styles.pickText, selected && styles.pickTextOn]}>{label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: spacing.md, paddingBottom: 120 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  location: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  locationText: { ...typography.heading, color: colors.ink },
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
  picks: { gap: spacing.sm, paddingVertical: spacing.lg },
  pick: {
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.canvas
  },
  pickOn: {
    backgroundColor: 'rgba(14,201,165,0.92)',
    borderColor: 'rgba(255,255,255,0.7)'
  },
  pickText: { ...typography.body, color: colors.ink },
  pickTextOn: { color: colors.white, fontWeight: '600' },
  section: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  sectionTitle: { ...typography.heading, color: colors.ink },
  seeAll: { ...typography.body, color: colors.accent },
  empty: { color: colors.muted, paddingVertical: spacing.xl, textAlign: 'center' }
});
