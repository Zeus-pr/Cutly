import { useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Animated, {
  Easing,
  FadeInDown,
  FadeInUp,
  interpolateColor,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useFonts } from 'expo-font';
import { radii, spacing, typography, type Palette } from '@/constants/theme';
import { useSessionStore } from '@/store/useSessionStore';
import { useColors, useThemedStyles } from '@/store/useThemeStore';

type Role = 'customer' | 'partner';

const ACTIVE = '#0EC9A5';
const INACTIVE = '#0A0C0B';
const ease = Easing.bezier(0.22, 1, 0.36, 1);

export default function RoleGate() {
  const styles = useThemedStyles(roleStyles);
  const reduceMotion = useReducedMotion();
  const leaving = useRef(false);
  // 0 = customer active, 1 = partner active
  const pick = useSharedValue(0);
  const [fonts] = useFonts({
    PoppinsExtraBold: require('@/assets/fonts/Poppins-ExtraBold.ttf'),
    PoppinsMedium: require('@/assets/fonts/Poppins-Medium.ttf')
  });

  function go(next: Role) {
    if (leaving.current) return;
    leaving.current = true;
    useSessionStore.getState().setAudience(next);
    router.replace(next === 'partner' ? '/partner/auth' : '/welcome');
  }

  function choose(next: Role) {
    if (leaving.current) return;
    void Haptics.selectionAsync();
    const target = next === 'partner' ? 1 : 0;
    const duration = reduceMotion ? 0 : 320;
    pick.value = withTiming(target, { duration, easing: ease }, (finished) => {
      if (finished) runOnJS(go)(next);
    });
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.glow} pointerEvents="none" />
      <Animated.View entering={reduceMotion ? undefined : FadeInDown.duration(420).delay(40)} style={styles.brand}>
        <Text style={[styles.mark, fonts && { fontFamily: 'PoppinsExtraBold' }]}>CUTLY</Text>
        <Text style={[styles.title, fonts && { fontFamily: 'PoppinsExtraBold' }]}>Who’s using the app?</Text>
        <Text style={styles.body}>Pick once for this visit. You’ll see this again until you sign in.</Text>
      </Animated.View>

      <View style={styles.choices}>
        <ChoiceCard
          label="I’m a customer"
          detail="Book a chair nearby"
          role="customer"
          pick={pick}
          delay={120}
          onPress={() => choose('customer')}
        />
        <ChoiceCard
          label="I’m a partner"
          detail="Run your shop floor"
          role="partner"
          pick={pick}
          delay={200}
          onPress={() => choose('partner')}
        />
      </View>
    </SafeAreaView>
  );
}

function ChoiceCard({
  label,
  detail,
  role,
  pick,
  delay,
  onPress
}: {
  label: string;
  detail: string;
  role: Role;
  pick: SharedValue<number>;
  delay: number;
  onPress: () => void;
}) {
  const styles = useThemedStyles(roleStyles);
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);

  const cardStyle = useAnimatedStyle(() => {
    // How “on” this card is: 1 at its active end, 0 at the other
    const on = role === 'customer' ? 1 - pick.value : pick.value;
    return {
      backgroundColor: interpolateColor(on, [0, 1], [INACTIVE, ACTIVE]),
      transform: [{ scale: scale.value }],
      borderColor: interpolateColor(on, [0, 1], ['rgba(255,255,255,0.08)', ACTIVE])
    };
  });

  const labelStyle = useAnimatedStyle(() => {
    const on = role === 'customer' ? 1 - pick.value : pick.value;
    return {
      color: interpolateColor(on, [0, 1], ['rgba(244,246,245,0.92)', '#FFFFFF'])
    };
  });

  const detailStyle = useAnimatedStyle(() => {
    const on = role === 'customer' ? 1 - pick.value : pick.value;
    return {
      color: interpolateColor(on, [0, 1], ['rgba(244,246,245,0.48)', 'rgba(255,255,255,0.82)'])
    };
  });

  return (
    <Animated.View entering={reduceMotion ? undefined : FadeInUp.duration(380).delay(delay)}>
      <Pressable
        onPressIn={() => {
          if (!reduceMotion) scale.value = withTiming(0.98, { duration: 120, easing: Easing.out(Easing.quad) });
        }}
        onPressOut={() => {
          if (!reduceMotion) scale.value = withTiming(1, { duration: 180, easing: ease });
        }}
        onPress={onPress}
      >
        <Animated.View style={[styles.card, cardStyle]}>
          <Animated.Text style={[styles.cardLabel, labelStyle]}>{label}</Animated.Text>
          <Animated.Text style={[styles.cardDetail, detailStyle]}>{detail}</Animated.Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

function roleStyles(colors: Palette) {
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: colors.canvas,
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.xl,
      justifyContent: 'space-between'
    },
    glow: {
      position: 'absolute',
      top: -80,
      right: -40,
      width: 260,
      height: 260,
      borderRadius: 130,
      backgroundColor: colors.accent,
      opacity: 0.08
    },
    brand: { flex: 1, justifyContent: 'flex-end', paddingBottom: spacing.xxl, gap: spacing.sm },
    mark: {
      color: colors.accent,
      fontSize: 15,
      fontWeight: '700',
      letterSpacing: 2.4,
      textTransform: 'uppercase'
    },
    title: { ...typography.display, color: colors.ink, fontSize: 36, lineHeight: 42, letterSpacing: -0.8 },
    body: { ...typography.body, color: colors.muted, maxWidth: 300, marginTop: spacing.xs },
    choices: { gap: spacing.md },
    card: {
      borderRadius: radii.lg,
      paddingVertical: spacing.lg,
      paddingHorizontal: spacing.lg,
      minHeight: 92,
      justifyContent: 'center',
      borderWidth: 1.5,
      backgroundColor: ACTIVE
    },
    cardLabel: { fontSize: 19, lineHeight: 24, fontWeight: '700', letterSpacing: -0.3, color: '#FFFFFF' },
    cardDetail: { marginTop: 6, fontSize: 14, lineHeight: 20, color: 'rgba(255,255,255,0.82)' }
  });
}
