import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated';
import { PressScale } from '@/components/PressScale';
import { fontFamily } from '@/constants/fonts';
import { radii, spacing, type Palette } from '@/constants/theme';
import { useColors, useThemedStyles } from '@/store/useThemeStore';
import type { HomeServiceTile } from '@/constants/homeTiles';

type Props = {
  tile: HomeServiceTile;
  onPress: () => void;
  index?: number;
};

/** Luzo-style tile: title + tag top-left, art bottom-right. */
export function HomeServiceTileCard({ tile, onPress, index = 0 }: Props) {
  const colors = useColors();
  const styles = useThemedStyles(tileStyles);
  const isAll = tile.serviceName === null;
  const hasArt = Boolean(tile.image);

  return (
    <Animated.View
      style={styles.cell}
      entering={FadeInDown.delay(Math.min(index, 5) * 55)
        .duration(380)
        .reduceMotion(ReduceMotion.System)}
    >
      <PressScale
        style={[styles.card, isAll && styles.cardAll]}
        onPress={onPress}
        haptic
        pressedScale={0.9}
        accessibilityRole="button"
        accessibilityLabel={isAll ? 'View all services' : `${tile.title}. ${tile.subtitle}`}
      >
        {isAll ? (
          <View style={styles.plusWrap}>
            <Ionicons name="add" size={52} color={colors.accent} />
            <Text style={styles.plusLabel}>View all</Text>
          </View>
        ) : (
          <>
            <View style={[styles.copy, hasArt && styles.copyWithArt]}>
              {/* One Text per line — stops iOS soft-wrapping “WELLNESS” into both lines and eating “& SPA”. */}
              {tile.title.split('\n').map((line, i) => (
                <Text
                  key={`${tile.id}-t-${i}`}
                  style={[styles.title, i > 0 && styles.titleNext]}
                  numberOfLines={1}
                  allowFontScaling={false}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                >
                  {line}
                </Text>
              ))}
              {tile.subtitle.split('\n').map((line, i) => (
                <Text
                  key={`${tile.id}-s-${i}`}
                  style={[styles.sub, i === 0 && styles.subFirst]}
                  numberOfLines={1}
                  allowFontScaling={false}
                >
                  {line}
                </Text>
              ))}
            </View>
            {tile.image ? (
              <View
                style={[
                  styles.artWrap,
                  tile.imageOffset && {
                    right: tile.imageOffset.right ?? -10,
                    bottom: tile.imageOffset.bottom ?? -8
                  }
                ]}
                pointerEvents="none"
              >
                <Image source={tile.image} style={styles.art} contentFit="contain" />
              </View>
            ) : (
              <View style={[styles.iconBlob, { backgroundColor: `${tile.tint}18` }]}>
                <Ionicons name={tile.icon} size={30} color={tile.tint} />
              </View>
            )}
          </>
        )}
      </PressScale>
    </Animated.View>
  );
}

function tileStyles(colors: Palette) {
  return StyleSheet.create({
    cell: {
      width: '48%',
      marginBottom: spacing.sm
    },
    card: {
      width: '100%',
      height: 132,
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.line,
      paddingTop: spacing.md,
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.md,
      overflow: 'hidden'
    },
    cardAll: {
      alignItems: 'center',
      justifyContent: 'center',
      borderColor: colors.accent,
      borderStyle: 'dashed'
    },
    copy: {
      alignSelf: 'stretch',
      paddingRight: 56,
      zIndex: 2
    },
    copyWithArt: {
      paddingRight: 4,
      // Wider than art overlap so “WELLNESS” doesn’t soft-wrap mid-word on iPhone SE/mini.
      maxWidth: '72%'
    },
    title: {
      fontFamily: fontFamily.bold,
      fontSize: 15,
      letterSpacing: 0,
      color: colors.ink,
      lineHeight: 18
    },
    titleNext: { marginTop: 1 },
    sub: {
      fontFamily: fontFamily.regular,
      fontSize: 13,
      color: colors.muted,
      lineHeight: 17
    },
    subFirst: { marginTop: 6 },
    iconBlob: {
      position: 'absolute',
      right: 10,
      bottom: 10,
      width: 56,
      height: 56,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center'
    },
    artWrap: {
      position: 'absolute',
      right: -10,
      bottom: -8,
      width: 136,
      height: 90,
      zIndex: 1,
      justifyContent: 'flex-end',
      alignItems: 'flex-end'
    },
    art: {
      width: 136,
      height: 85
    },
    plusWrap: { alignItems: 'center', justifyContent: 'center', gap: 4 },
    plusLabel: {
      fontFamily: fontFamily.semibold,
      fontSize: 14,
      color: colors.accent
    }
  });
}
