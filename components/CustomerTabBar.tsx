import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming
} from 'react-native-reanimated';
import { fontFamily } from '@/constants/fonts';
import { type Palette } from '@/constants/theme';
import { useColors, useThemedStyles } from '@/store/useThemeStore';

const BAR_TABS = new Set(['index', 'salons', 'studios', 'spas']);

/** Explicit labels — avoid descriptor truncation / Clash glyph clip on edge tabs. */
const TAB_LABELS: Record<string, string> = {
  index: 'Home',
  salons: 'Salons',
  studios: 'Studios',
  spas: 'Spas'
};

const icons: Record<string, { on: keyof typeof Ionicons.glyphMap; off: keyof typeof Ionicons.glyphMap }> = {
  index: { on: 'home', off: 'home-outline' },
  salons: { on: 'cut', off: 'cut-outline' },
  studios: { on: 'brush', off: 'brush-outline' },
  spas: { on: 'leaf', off: 'leaf-outline' }
};

const move = {
  duration: 240,
  easing: Easing.bezier(0.77, 0, 0.175, 1),
  reduceMotion: ReduceMotion.System
};

const UNDERLINE = 20;

type Route = { key: string; name: string };
type Props = {
  state: { index: number; routes: Route[] };
  descriptors: Record<string, { options: { title?: string; href?: string | null } }>;
  navigation: {
    emit: (event: { type: 'tabPress'; target: string; canPreventDefault: true }) => { defaultPrevented: boolean };
    navigate: (name: string) => void;
  };
  insets: { bottom: number };
};

type TabLayout = { x: number; width: number };

/** Flush Luzo-style bar: Home / Salons · Pay Bill · Studios / Spas + sliding underline. */
export function CustomerTabBar({ state, descriptors, navigation, insets }: Props) {
  const colors = useColors();
  const styles = useThemedStyles(barStyles);
  const reduced = useReducedMotion();
  const routes = state.routes.filter((route) => BAR_TABS.has(route.name));
  // Stable order: Home, Salons | Pay Bill | Studios, Spas
  const ordered = ['index', 'salons', 'studios', 'spas']
    .map((name) => routes.find((r) => r.name === name))
    .filter((r): r is Route => Boolean(r));
  const left = ordered.filter((r) => r.name === 'index' || r.name === 'salons');
  const right = ordered.filter((r) => r.name === 'studios' || r.name === 'spas');

  const [layouts, setLayouts] = useState<Record<string, TabLayout>>({});
  const underlineX = useSharedValue(0);
  const underlineW = useSharedValue(UNDERLINE);

  const focusedRoute = state.routes[state.index];
  const focusedVisible = Boolean(focusedRoute && ordered.some((r) => r.key === focusedRoute.key));

  useEffect(() => {
    if (!focusedVisible || !focusedRoute) return;
    const layout = layouts[focusedRoute.key];
    if (!layout) return;
    const nextX = layout.x + (layout.width - UNDERLINE) / 2;
    if (reduced) {
      underlineX.set(nextX);
      underlineW.set(UNDERLINE);
      return;
    }
    underlineX.set(withTiming(nextX, move));
    underlineW.set(withTiming(UNDERLINE, move));
  }, [focusedRoute, focusedVisible, layouts, reduced, underlineX, underlineW]);

  const underlineStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: underlineX.get() }],
    width: underlineW.get()
  }));

  const onTabLayout = useCallback((key: string, e: LayoutChangeEvent) => {
    const { x, width } = e.nativeEvent.layout;
    setLayouts((prev) => {
      const cur = prev[key];
      if (cur && Math.abs(cur.x - x) < 0.5 && Math.abs(cur.width - width) < 0.5) return prev;
      return { ...prev, [key]: { x, width } };
    });
  }, []);

  function onPress(route: Route, focused: boolean) {
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (focused || event.defaultPrevented) return;
    void Haptics.selectionAsync();
    navigation.navigate(route.name);
  }

  function renderTab(route: Route) {
    const focused = state.index === state.routes.indexOf(route);
    const title = TAB_LABELS[route.name] ?? descriptors[route.key]?.options.title ?? route.name;
    const icon = icons[route.name]?.[focused ? 'on' : 'off'] ?? 'ellipse-outline';
    return (
      <Pressable
        key={route.key}
        style={styles.tab}
        onPress={() => onPress(route, focused)}
        onLayout={(e) => onTabLayout(route.key, e)}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={title}
      >
        <Ionicons name={icon} size={22} color={focused ? colors.accent : colors.muted} />
        <Text style={[styles.label, focused && styles.labelOn]} allowFontScaling={false} numberOfLines={1}>
          {title}
        </Text>
      </Pressable>
    );
  }

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 6) }]}>
      <View style={styles.bar}>
        {left.map(renderTab)}

        <View style={styles.fabSlot}>
          <Pressable
            style={styles.fab}
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              navigation.navigate('bookings');
            }}
            accessibilityRole="button"
            accessibilityLabel="Pay Bill"
          >
            {/* Single Text — Clash Bold clips “y” when each word is its own narrow line. */}
            <Text style={styles.fabText} allowFontScaling={false} numberOfLines={2}>
              {'Pay\nBill'}
            </Text>
          </Pressable>
        </View>

        {right.map(renderTab)}

        {focusedVisible ? (
          <Animated.View style={[styles.underline, underlineStyle]} pointerEvents="none" />
        ) : null}
      </View>
    </View>
  );
}

function barStyles(colors: Palette) {
  return StyleSheet.create({
    wrap: {
      backgroundColor: colors.surface,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.line,
      overflow: 'visible'
    },
    bar: {
      height: 58,
      flexDirection: 'row',
      alignItems: 'center',
      position: 'relative',
      overflow: 'visible'
    },
    tab: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: 6,
      paddingBottom: 8,
      paddingHorizontal: 2,
      gap: 2,
      overflow: 'visible'
    },
    label: {
      fontFamily: fontFamily.medium,
      fontSize: 11,
      lineHeight: 15,
      color: colors.muted,
      textAlign: 'center',
      includeFontPadding: false,
      width: '100%'
    },
    labelOn: { color: colors.accent, fontFamily: fontFamily.semibold },
    underline: {
      position: 'absolute',
      top: 2,
      left: 0,
      height: 2.5,
      borderRadius: 2,
      backgroundColor: colors.accent
    },
    fabSlot: {
      width: 76,
      alignItems: 'center',
      justifyContent: 'flex-start',
      zIndex: 2,
      overflow: 'visible'
    },
    fab: {
      width: 68,
      height: 68,
      marginTop: -30,
      borderRadius: 34,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 6,
      borderWidth: 4,
      borderColor: colors.surface,
      shadowColor: colors.ink,
      shadowOpacity: 0.14,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 8,
      overflow: 'visible'
    },
    fabText: {
      fontFamily: fontFamily.semibold,
      color: colors.white,
      fontSize: 12,
      lineHeight: 14,
      letterSpacing: 0,
      textAlign: 'center',
      includeFontPadding: false,
      width: 52
    }
  });
}
