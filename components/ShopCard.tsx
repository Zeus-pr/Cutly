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
      <View style={styles.media}>
        <Image source={shop.imageUrl} style={styles.image} contentFit="cover" transition={180} />
        <View style={styles.chips}>
          <Text style={[styles.chip, !shop.isOpen && styles.chipClosed]}>
            {shop.hoursChip || (shop.isOpen ? 'Open' : 'Closed')}
          </Text>
          {shop.isOpen && shop.nextAvailableAt ? (
            <Text style={styles.chip}>Next slot {formatTime(shop.nextAvailableAt)}</Text>
          ) : null}
        </View>
      </View>
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>
          {shop.name}
        </Text>
        <View style={styles.meta}>
          {shop.rating != null && shop.reviewCount > 0 ? (
            <>
              <Ionicons name="star" size={13} color="#C48A12" />
              <Text style={styles.metaText}>
                {shop.rating.toFixed(1)} ({shop.reviewCount})
              </Text>
            </>
          ) : (
            <Text style={styles.metaText}>New</Text>
          )}
          <Text style={styles.dot}>·</Text>
          <Text style={styles.metaText}>{shop.distanceKm.toFixed(1)} km</Text>
          {shop.priceFromPaise > 0 ? (
            <>
              <Text style={styles.dot}>·</Text>
              <Text style={styles.metaText}>from ₹{Math.round(shop.priceFromPaise / 100)}</Text>
            </>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

function cardStyles(colors: Palette) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.line,
      overflow: 'hidden',
      marginBottom: spacing.md
    },
    pressed: { opacity: 0.94 },
    media: { position: 'relative' },
    image: { height: 168, width: '100%' },
    chips: {
      position: 'absolute',
      left: 10,
      right: 10,
      bottom: 10,
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 8
    },
    chip: {
      overflow: 'hidden',
      backgroundColor: colors.accent,
      color: colors.white,
      borderRadius: radii.pill,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.45)',
      paddingHorizontal: 10,
      paddingVertical: 6,
      fontSize: 12,
      fontWeight: '600',
      maxWidth: '70%'
    },
    chipClosed: {
      backgroundColor: 'rgba(20,17,16,0.72)',
      borderColor: 'rgba(255,255,255,0.28)'
    },
    body: { paddingHorizontal: spacing.md, paddingVertical: spacing.md, gap: 6 },
    name: { ...typography.heading, color: colors.ink },
    meta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    metaText: { ...typography.caption, color: colors.muted },
    dot: { ...typography.caption, color: colors.muted }
  });
}
