import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '@/services/api';
import { colors, radii, spacing, typography } from '@/constants/theme';
import { ShopCard } from '@/components/ShopCard';

const filters = ['Open now', 'Earliest', 'Nearest', 'Price'] as const;

export default function Explore() {
  const [open, setOpen] = useState(false);
  const { data = [] } = useQuery({ queryKey: ['explore', open], queryFn: () => api.shops({ openNow: open }) });

  return (
    <SafeAreaView style={styles.safe}>
      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View>
            <Text style={styles.title}>Explore</Text>
            <Text style={styles.sub}>Barbers around Burdwan</Text>
            <View style={styles.filters}>
              {filters.map((label) => {
                const active = label === 'Open now' && open;
                return (
                  <Pressable
                    key={label}
                    style={[styles.filter, active && styles.active]}
                    onPress={() => { if (label === 'Open now') setOpen(!open); }}
                  >
                    <Text style={[styles.filterText, active && styles.filterTextActive]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
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
  title: { ...typography.display, color: colors.ink },
  sub: { ...typography.body, color: colors.muted, marginTop: 4 },
  filters: { flexDirection: 'row', gap: 8, marginTop: spacing.lg, marginBottom: spacing.lg },
  filter: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radii.pill, backgroundColor: colors.surface },
  active: { backgroundColor: colors.accent },
  filterText: { ...typography.caption, color: colors.ink, fontWeight: '500' },
  filterTextActive: { color: colors.white, fontWeight: '600' }
});
