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
import { PayBillSheet } from '@/components/PayBillSheet';
import { fontFamily } from '@/constants/fonts';
import { type Palette } from '@/constants/theme';
import { useColors, useThemedStyles } from '@/store/useThemeStore';

const BAR_TABS = new Set(['index', 'bookings', 'profile']);

/** Explicit labels — avoid descriptor truncation / Clash glyph clip on edge tabs. */
const TAB_LABELS: Record<string, string> = {
  index: 'Home',
  bookings: 'Visits',
  profile: 'Profile'
};

const icons: Record<string, { on: keyof typeof Ionicons.glyphMap; off: keyof typeof Ionicons.glyphMap }> = {
  index: { on: 'home', off: 'home-outline' },
  bookings: { on: 'calendar', off: 'calendar-outline' },
  profile: { on: 'person', off: 'person-outline' }
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
  // React Navigation 8 (SDK 58): custom tab bars get `emitter` + `navigateToTab(routeKey)` instead of `navigation`.
  emitter: { emit: (event: { type: 'tabPress'; target: string; canPreventDefault: true }) => { defaultPrevented: boolean } };
  navigateToTab: (routeKey: string) => void;
  insets: { bottom: number };
};

type TabLayout = { x: number; width: number };

/** Home · Discover · Pay Bill · Visits · Profile. Salons / Studios / Spas stay as hidden tabs. */
export function CustomerTabBar({ state, descriptors, emitter, navigateToTab, insets }: Props) {
  const colors = useColors();
  const styles = useThemedStyles(barStyles);
  const reduced = useReducedMotion();
  const routes = state.routes.filter((route) => BAR_TABS.has(route.name));
  // Stable order: Home, Salons | Pay Bill | Studios, Spas
  const ordered = ['index', 'bookings', 'profile']
    .map((name) => routes.find((r) => r.name === name))
    .filter((r): r is Route => Boolean(r));
  const home = ordered.filter((r) => r.name === 'index');
  const right = ordered.filter((r) => r.name === 'bookings' || r.name === 'profile');

  const [layouts, setLayouts] = useState<Record<string, TabLayout>>({});
  const [payOpen, setPayOpen] = useState(false);
  const underlineX = useSharedValue(0);
  const underlineW = useSharedValue(UNDERLINE);

  const focusedRoute = state.routes[state.index];
  const discoverFocused = focusedRoute?.name === 'explore';
  const focusedVisible = Boolean(focusedRoute && ordered.some((r) => r.key === focusedRoute.key));
  const showUnderline = focusedVisible || discoverFocused;

  useEffect(() => {
    if (!showUnderline) return;
    const layoutKey = discoverFocused ? 'discover' : focusedRoute?.key;
    if (!layoutKey) return;
    const layout = layouts[layoutKey];
    if (!layout) return;
    const nextX = layout.x + (layout.width - UNDERLINE) / 2;
    if (reduced) {
      underlineX.set(nextX);
      underlineW.set(UNDERLINE);
      return;
    }
    underlineX.set(withTiming(nextX, move));
    underlineW.set(withTiming(UNDERLINE, move));
  }, [discoverFocused, focusedRoute, layouts, reduced, showUnderline, underlineX, underlineW]);

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
    const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (focused || event.defaultPrevented) return;
    void Haptics.selectionAsync();
    navigateToTab(route.key);
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
        {home.map(renderTab)}
        <Pressable
          style={styles.tab}
          onLayout={(e) => onTabLayout('discover', e)}
          onPress={() => {
            if (discoverFocused) return;
            void Haptics.selectionAsync();
            const explore = state.routes.find((r) => r.name === 'explore');
            if (explore) navigateToTab(explore.key);
          }}
          accessibilityRole="tab"
          accessibilityState={{ selected: discoverFocused }}
          accessibilityLabel="Discover"
        >
          <Ionicons
            name={discoverFocused ? 'search' : 'search-outline'}
            size={22}
            color={discoverFocused ? colors.accent : colors.muted}
          />
          <Text style={[styles.label, discoverFocused && styles.labelOn]} allowFontScaling={false} numberOfLines={1}>
            Discover
          </Text>
        </Pressable>

        <View style={styles.fabSlot}>
          <Pressable
            style={styles.fab}
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setPayOpen(true);
            }}
            accessibilityRole="button"
            accessibilityLabel="Pay Bill"
          >
            <Ionicons name="qr-code" size={26} color={colors.white} />
          </Pressable>
          <Text style={styles.fabLabel} allowFontScaling={false} numberOfLines={1}>
            Pay Bill
          </Text>
        </View>

        {right.map(renderTab)}

        {showUnderline ? (
          <Animated.View style={[styles.underline, underlineStyle]} pointerEvents="none" />
        ) : null}
      </View>
      <PayBillSheet visible={payOpen} onClose={() => setPayOpen(false)} />
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
      justifyContent: 'flex-end',
      zIndex: 2,
      overflow: 'visible',
      paddingBottom: 6
    },
    fab: {
      width: 56,
      height: 56,
      marginTop: -28,
      borderRadius: 28,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 4,
      borderColor: colors.surface,
      shadowColor: colors.ink,
      shadowOpacity: 0.16,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 8
    },
    fabLabel: {
      marginTop: 2,
      fontFamily: fontFamily.medium,
      fontSize: 11,
      lineHeight: 14,
      color: colors.muted,
      textAlign: 'center',
      includeFontPadding: false
    }
  });
}
