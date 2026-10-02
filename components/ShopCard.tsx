import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radii, spacing, typography, type Palette } from '@/constants/theme';
import { useThemedStyles } from '@/store/useThemeStore';
import type { Shop } from '@/types/domain';
import { formatTime } from '@/utils/time';

export function ShopCard({ shop, onPress }: { shop: Shop; onPress: () => void }) {
  const styles = useThemedStyles(cardStyles);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View>
        <Image source={shop.imageUrl} style={styles.image} contentFit="cover" transition={180} />
        <View style={styles.chips}>
          <Text style={styles.chip}>{shop.isOpen ? 'Open · Closes 9:00 PM' : 'Closed'}</Text>
          {shop.nextAvailableAt ? <Text style={styles.chip}>Next slot {formatTime(shop.nextAvailableAt)}</Text> : null}
        </View>
      </View>
      <View style={styles.body}>
        <Text style={styles.name}>{shop.name}</Text>
        <View style={styles.meta}>
          <Ionicons name="star" size={13} color="#C48A12" />
          <Text style={styles.metaText}>{shop.rating.toFixed(1)} ({shop.reviewCount})</Text>
          <Text style={styles.metaText}>{shop.distanceKm.toFixed(1)} km</Text>
        </View>
      </View>
    </Pressable>
  );
}

function cardStyles(colors: Palette) {
  return StyleSheet.create({
  card: { backgroundColor: colors.canvas, marginBottom: spacing.lg },
  pressed: { opacity: 0.92 },
  image: { height: 168, width: '100%', borderRadius: radii.lg },
  chips: { position: 'absolute', left: 10, right: 10, bottom: 10, flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  chip: {
    overflow: 'hidden',
    backgroundColor: 'rgba(14,201,165,0.92)',
    color: colors.white,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.45)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 12,
    fontWeight: '600'
  },
  body: { paddingTop: spacing.sm, gap: 4 },
  name: { ...typography.heading, color: colors.ink },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { ...typography.caption, color: colors.muted }
});
}
