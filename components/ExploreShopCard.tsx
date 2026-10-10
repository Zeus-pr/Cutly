import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PressScale } from '@/components/PressScale';
import { fontFamily } from '@/constants/fonts';
import { radii, spacing, type Palette } from '@/constants/theme';
import { useColors, useThemedStyles } from '@/store/useThemeStore';
import type { Shop } from '@/types/domain';
import { formatTime } from '@/utils/time';

function priceTier(paise: number): string {
  if (paise <= 0) return '₹';
  const rupees = paise / 100;
  if (rupees < 400) return '₹';
  if (rupees < 900) return '₹₹';
  return '₹₹₹';
}

function kindLabel(kind?: string | null, kinds?: string[]): string {
  const primary = (kinds?.[0] || kind || '').toUpperCase();
  switch (primary) {
    case 'BARBER':
    case 'SALON':
      return 'Salon';
    case 'SPA':
      return 'Spa';
    case 'PARLOUR':
    case 'NAILS':
      return 'Nails';
    case 'TATTOO':
      return 'Tattoo';
    case 'PIERCING':
      return 'Piercing';
    default:
      return 'Shop';
  }
}

type Props = {
  shop: Shop;
  promoLine: string;
  onPress: () => void;
};

/** Luzo-style explore card: cover + open chip, promo, name, stars, meta. */
export function ExploreShopCard({ shop, promoLine, onPress }: Props) {
  const colors = useColors();
  const styles = useThemedStyles(cardStyles);
  const km =
    shop.distanceKm < 1
      ? `${Math.round(shop.distanceKm * 1000)} m`
      : `${shop.distanceKm.toFixed(2)} Kms`;

  return (
    <PressScale style={styles.card} onPress={onPress} pressedScale={0.985} haptic accessibilityRole="button">
      <View style={styles.media}>
        <Image source={shop.imageUrl} style={styles.image} contentFit="cover" transition={180} />
        <View style={styles.chips}>
          <Text style={[styles.chip, !shop.isOpen && styles.chipClosed]}>
            {shop.hoursChip || (shop.isOpen ? 'Open now' : 'Closed now')}
          </Text>
          {shop.isOpen && shop.nextAvailableAt ? (
            <Text style={styles.chip}>Next {formatTime(shop.nextAvailableAt)}</Text>
          ) : null}
        </View>
      </View>
      <View style={[styles.promo, { backgroundColor: `${colors.accent}22` }]}>
        <Text style={styles.promoText} numberOfLines={1}>
          {promoLine}
        </Text>
      </View>
      <View style={styles.body}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {shop.name}
          </Text>
          <Text style={styles.metaRight} numberOfLines={1}>
            {kindLabel(shop.kind, shop.kinds)} | {priceTier(shop.priceFromPaise)}
          </Text>
        </View>
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
          <Text style={styles.metaText}>{km}</Text>
          {shop.priceFromPaise > 0 ? (
            <>
              <Text style={styles.dot}>·</Text>
              <Text style={styles.metaText}>from ₹{Math.round(shop.priceFromPaise / 100)}</Text>
            </>
          ) : null}
        </View>
        <Text style={styles.addr} numberOfLines={1}>
          {shop.address || shop.city}
        </Text>
      </View>
    </PressScale>
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
    media: { position: 'relative', backgroundColor: colors.ink },
    image: { height: 148, width: '100%' },
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
      fontFamily: fontFamily.semibold,
      maxWidth: '70%'
    },
    chipClosed: {
      backgroundColor: 'rgba(20,17,16,0.72)',
      borderColor: 'rgba(255,255,255,0.28)'
    },
    promo: {
      paddingHorizontal: spacing.md,
      paddingVertical: 10
    },
    promoText: {
      fontFamily: fontFamily.semibold,
      fontSize: 13,
      color: colors.accentDark,
      letterSpacing: 0.2
    },
    body: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      paddingBottom: spacing.md,
      gap: 4
    },
    nameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8
    },
    name: {
      flex: 1,
      fontFamily: fontFamily.bold,
      fontSize: 17,
      color: colors.ink
    },
    metaRight: {
      fontFamily: fontFamily.medium,
      fontSize: 13,
      color: colors.muted
    },
    meta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    metaText: {
      fontFamily: fontFamily.regular,
      fontSize: 13,
      color: colors.muted
    },
    dot: {
      fontFamily: fontFamily.regular,
      fontSize: 13,
      color: colors.muted
    },
    addr: {
      fontFamily: fontFamily.regular,
      fontSize: 13,
      color: colors.muted
    }
  });
}
