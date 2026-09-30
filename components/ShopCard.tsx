import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@/constants/theme';
import type { Shop } from '@/types/domain';
import { formatINR } from '@/utils/money';
import { formatTime } from '@/utils/time';

export function ShopCard({ shop, onPress }: { shop: Shop; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <Image source={shop.imageUrl} style={styles.image} contentFit="cover" transition={180} />
      <View style={styles.body}>
        <View style={styles.row}>
          <Text style={styles.name}>{shop.name}</Text>
          <View style={styles.rating}>
            <Ionicons name="star" size={12} color={colors.ink} />
            <Text style={styles.ratingText}>{shop.rating.toFixed(1)}</Text>
          </View>
        </View>
        <Text style={styles.meta}>
          {shop.distanceKm.toFixed(1)} km
          <Text style={{ color: shop.isOpen ? colors.success : colors.muted }}>{shop.isOpen ? '  ·  Open' : '  ·  Closed'}</Text>
          {`  ·  ${shop.reviewCount} reviews`}
        </Text>
        <Text style={styles.price}>{shop.services[0]} from {formatINR(shop.priceFromPaise)}</Text>
        {shop.nextAvailableAt ? (
          <Text style={styles.next}>Next at {formatTime(shop.nextAvailableAt)}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radii.lg, overflow: 'hidden', marginBottom: spacing.md },
  pressed: { opacity: 0.86 },
  image: { height: 168, width: '100%' },
  body: { padding: spacing.md, gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  name: { ...typography.heading, color: colors.ink },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  ratingText: { ...typography.caption, color: colors.ink, fontWeight: '600' },
  meta: { ...typography.caption, color: colors.muted, marginTop: 2 },
  price: { ...typography.body, color: colors.ink, marginTop: 6 },
  next: { ...typography.caption, color: colors.accent, marginTop: 6, fontWeight: '600' }
});
