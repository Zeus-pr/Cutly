import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/services/api';
import { colors, radii, spacing, typography } from '@/constants/theme';
import { ShopCard } from '@/components/ShopCard';
import { SectionTitle } from '@/components/SectionTitle';
import { useSessionStore } from '@/store/useSessionStore';

const picks = [
  { label: 'Haircut', icon: 'cut-outline' as const },
  { label: 'Beard', icon: 'man-outline' as const },
  { label: 'Hair + Beard', icon: 'sparkles-outline' as const }
];

export default function Home() {
  const [query, setQuery] = useState('');
  const email = useSessionStore((state) => state.email);
  const initial = (email || 'C').trim().charAt(0).toUpperCase();
  const { data = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['shops', query],
    queryFn: () => api.shops({ query })
  });
  const asap = useMemo(() => data.filter((shop) => shop.isOpen && shop.nextAvailableAt), [data]);

  return (
    <SafeAreaView style={styles.safe}>
      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.ink} />}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View>
            <View style={styles.top}>
              <Pressable style={styles.location}>
                <Ionicons name="location" size={16} color={colors.accent} />
                <Text style={styles.locationText}>Burdwan</Text>
                <Ionicons name="chevron-down" size={14} color={colors.muted} />
              </Pressable>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initial}</Text>
              </View>
            </View>
            <Text style={styles.greeting}>Where do you{'\n'}want to go today?</Text>
            <View style={styles.search}>
              <Ionicons name="search" size={18} color={colors.muted} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Shops, services, barbers"
                placeholderTextColor={colors.muted}
                style={styles.input}
                returnKeyType="search"
              />
            </View>
            <Pressable style={styles.asap} onPress={() => router.push('/explore')}>
              <View style={styles.asapIcon}>
                <Ionicons name="flash" size={18} color={colors.white} />
              </View>
              <View style={styles.asapCopy}>
                <Text style={styles.asapTitle}>Need a haircut now?</Text>
                <Text style={styles.asapSub}>
                  {asap.length ? `${asap.length} shops open nearby` : 'Find the next open chair'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </Pressable>
            <SectionTitle title="Quick picks" />
            <View style={styles.picks}>
              {picks.map((item) => (
                <Pressable key={item.label} style={styles.pick} onPress={() => setQuery(item.label)}>
                  <Ionicons name={item.icon} size={20} color={colors.ink} />
                  <Text style={styles.pickText}>{item.label}</Text>
                </Pressable>
              ))}
            </View>
            <SectionTitle title="Nearby" action="See all" onAction={() => router.push('/explore')} />
          </View>
        }
        ListEmptyComponent={
          <Text style={styles.empty}>
            {isLoading ? 'Finding shops near you…' : 'Nothing nearby matches that search.'}
          </Text>
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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: spacing.md, paddingBottom: 120 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  location: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  locationText: { ...typography.heading, color: colors.ink },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.white, fontWeight: '600', fontSize: 15 },
  greeting: { ...typography.display, color: colors.ink, marginTop: spacing.lg },
  search: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    height: 44,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.lg
  },
  input: { flex: 1, marginLeft: spacing.sm, color: colors.ink, fontSize: 17 },
  asap: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.xl
  },
  asapIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', marginRight: spacing.md },
  asapCopy: { flex: 1 },
  asapTitle: { ...typography.heading, color: colors.ink },
  asapSub: { ...typography.caption, color: colors.muted, marginTop: 2 },
  picks: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xl },
  pick: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 8
  },
  pickText: { ...typography.caption, color: colors.ink, fontWeight: '500' },
  empty: { color: colors.muted, paddingVertical: spacing.xl, textAlign: 'center' }
});
