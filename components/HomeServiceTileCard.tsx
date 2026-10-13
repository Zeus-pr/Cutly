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

  return (
    <Animated.View
      style={styles.cell}
      entering={FadeInDown.delay(Math.min(index, 5) * 55)
        .duration(380)
        .reduceMotion(ReduceMotion.System)}
    >
      <PressScale
        style={styles.card}
        onPress={onPress}
        haptic
        pressedScale={0.9}
        accessibilityRole="button"
        accessibilityLabel={isAll ? 'View all services' : `${tile.title}. ${tile.subtitle}`}
      >
        <>
            <View style={styles.copy}>
              <Text style={styles.title} numberOfLines={1} allowFontScaling={false}>
                {tile.title}
              </Text>
              <Text style={styles.sub} numberOfLines={1} allowFontScaling={false}>
                {tile.subtitle}
              </Text>
            </View>
            {tile.image ? (
              <View style={styles.artWrap} pointerEvents="none">
                <Image source={tile.image} style={styles.art} contentFit="contain" />
              </View>
            ) : (
              <View style={[styles.iconBlob, { backgroundColor: `${tile.tint}18` }]}>
                <Ionicons name={isAll ? 'add' : tile.icon} size={28} color={tile.tint} />
              </View>
            )}
        </>
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
      shadowColor: '#000000',
      shadowOpacity: 0.08,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
      paddingTop: spacing.md,
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.md,
      overflow: 'hidden'
    },
    copy: {
      alignSelf: 'stretch',
      paddingRight: 72,
      zIndex: 2
    },
    title: {
      fontFamily: fontFamily.bold,
      fontSize: 16,
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
      right: 0,
      bottom: 0,
      width: 112,
      height: 88,
      zIndex: 1,
      justifyContent: 'flex-end',
      alignItems: 'flex-end'
    },
    art: {
      width: 112,
      height: 84
    }
  });
}
