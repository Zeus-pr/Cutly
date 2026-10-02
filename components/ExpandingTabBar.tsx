import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useLayoutEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { radii } from '@/constants/theme';
import { useColors } from '@/store/useThemeStore';

const icons: Record<string, { on: keyof typeof Ionicons.glyphMap; off: keyof typeof Ionicons.glyphMap }> = {
  index: { on: 'home', off: 'home-outline' },
  explore: { on: 'compass', off: 'compass-outline' },
  bookings: { on: 'calendar', off: 'calendar-outline' },
  floor: { on: 'grid', off: 'grid-outline' },
  profile: { on: 'person', off: 'person-outline' },
};

const barHeight = 64;
const iconSize = 22;
const labelGap = 8;
const pillPad = 16;
const move = { duration: 220, easing: Easing.bezier(0.77, 0, 0.175, 1), reduceMotion: ReduceMotion.System };
const fade = { duration: 140, easing: Easing.bezier(0.23, 1, 0.32, 1), reduceMotion: ReduceMotion.System };

type Route = { key: string; name: string };
type Props = {
  state: { index: number; routes: Route[] };
  descriptors: Record<string, { options: { title?: string } }>;
  navigation: {
    emit: (event: { type: 'tabPress'; target: string; canPreventDefault: true }) => { defaultPrevented: boolean };
    navigate: (name: string) => void;
  };
  insets: { bottom: number };
};

export function ExpandingTabBar({ state, descriptors, navigation, insets }: Props) {
  const colors = useColors();
  const reduced = useReducedMotion();
  const routes = state.routes.filter((route) => !route.name.startsWith('_'));
  const [barWidth, setBarWidth] = useState(0);
  const [labelWidths, setLabelWidths] = useState<number[]>(() => routes.map(() => 56));
  const pillLeft = useSharedValue(0);
  const pillWidth = useSharedValue(0);
  const labelOpacity = useSharedValue(1);
  const slot0 = useSharedValue(0);
  const slot1 = useSharedValue(0);
  const slot2 = useSharedValue(0);
  const slot3 = useSharedValue(0);
  const size0 = useSharedValue(0);
  const size1 = useSharedValue(0);
  const size2 = useSharedValue(0);
  const size3 = useSharedValue(0);
  const slots = [slot0, slot1, slot2, slot3].slice(0, Math.max(routes.length, 1));
  const sizes = [size0, size1, size2, size3].slice(0, Math.max(routes.length, 1));
  const placed = useRef(false);

  useLayoutEffect(() => {
    if (barWidth <= 0 || routes.length === 0) return;
    const widths = labelWidths.length === routes.length ? labelWidths : routes.map((_, i) => labelWidths[i] ?? 56);
    const frames = framesFor(barWidth, state.index, widths);
    const active = frames[state.index];
    if (!active) return;
    const first = !placed.current;
    placed.current = true;
    const place = (value: SharedValue<number>, next: number) => {
      if (reduced || first) value.set(next);
      else value.set(withTiming(next, move));
    };
    frames.forEach((frame, index) => {
      const left = slots[index];
      const width = sizes[index];
      if (!left || !width) return;
      place(left, frame.x);
      place(width, frame.w);
    });
    place(pillLeft, active.x);
    place(pillWidth, active.w);
    labelOpacity.set(reduced || first ? 1 : withTiming(1, fade));
    // Shared values are stable; the slot arrays are rebuilt each render but point at those same values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barWidth, labelWidths, reduced, state.index]);

  const pillStyle = useAnimatedStyle(() => ({
    left: pillLeft.get(),
    width: pillWidth.get(),
  }));
  const labelStyle = useAnimatedStyle(() => ({ opacity: labelOpacity.get() }));

  const onPress = (route: Route, focused: boolean) => {
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (focused || event.defaultPrevented) return;
    void Haptics.selectionAsync();
    if (!reduced) labelOpacity.set(0);
    navigation.navigate(route.name);
  };

  const active = routes[state.index];
  const activeIcon = icons[active?.name ?? '']?.on ?? 'ellipse';
  const activeTitle = active ? descriptors[active.key]?.options.title ?? active.name : '';

  return (
    <View style={[styles.wrap, { backgroundColor: colors.canvas, paddingBottom: Math.max(insets.bottom, 10) }]}>
      <View
        onLayout={(event) => setBarWidth(event.nativeEvent.layout.width)}
        style={[
          styles.bar,
          {
            backgroundColor: colors.canvas === '#FFFFFF' ? colors.white : colors.surface,
            borderColor: colors.line,
          },
        ]}
      >
        <Animated.View style={[styles.pill, { backgroundColor: colors.accent }, pillStyle]}>
          <Ionicons name={activeIcon} size={iconSize} color={colors.white} />
          <Animated.Text style={[styles.label, labelStyle]} numberOfLines={1}>
            {activeTitle}
          </Animated.Text>
        </Animated.View>
        {routes.map((route, index) => (
          <Slot
            key={route.key}
            left={slots[index]!}
            width={sizes[index]!}
            label={descriptors[route.key]?.options.title ?? route.name}
            focused={state.index === index}
            icon={icons[route.name]?.off ?? 'ellipse-outline'}
            color={colors.muted}
            onPress={() => onPress(route, state.index === index)}
          />
        ))}
        <View pointerEvents="none" style={styles.measure}>
          {routes.map((route, index) => (
            <Text
              key={route.key}
              style={styles.label}
              onLayout={(event) => {
                const next = event.nativeEvent.layout.width;
                setLabelWidths((current) => {
                  const base = current.length === routes.length ? current : routes.map((_, i) => current[i] ?? 56);
                  if (Math.abs((base[index] ?? 0) - next) < 1) return base;
                  return base.map((value, i) => (i === index ? next : value));
                });
              }}
            >
              {descriptors[route.key]?.options.title ?? route.name}
            </Text>
          ))}
        </View>
      </View>
    </View>
  );
}

function framesFor(width: number, active: number, labels: number[]) {
  const count = Math.max(labels.length, 1);
  const zone = width / count;
  return labels.map((_, index) => {
    if (index === active) {
      const labelW = labels[active] ?? 48;
      const ideal = pillPad + iconSize + labelGap + labelW + pillPad;
      const w = Math.min(zone - 6, Math.max(ideal, 72));
      return { x: index * zone + (zone - w) / 2, w };
    }
    return { x: index * zone, w: zone };
  });
}

function Slot({
  left,
  width,
  label,
  focused,
  icon,
  color,
  onPress,
}: {
  left: SharedValue<number>;
  width: SharedValue<number>;
  label: string;
  focused: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  onPress: () => void;
}) {
  const position = useAnimatedStyle(() => ({ left: left.get(), width: width.get() }));
  return (
    <Animated.View style={[styles.slot, position]}>
      <Pressable
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={label}
        onPress={onPress}
        style={styles.hit}
      >
        {focused ? null : <Ionicons name={icon} size={iconSize} color={color} />}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingTop: 6, paddingHorizontal: 16 },
  bar: {
    height: barHeight,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    shadowColor: '#141110',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  pill: {
    position: 'absolute',
    top: 6,
    bottom: 6,
    borderRadius: radii.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: labelGap,
    overflow: 'hidden',
    paddingHorizontal: pillPad,
  },
  label: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  slot: { position: 'absolute', top: 0, bottom: 0 },
  hit: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  measure: { position: 'absolute', opacity: 0, left: 0, top: 0, flexDirection: 'row' },
});
