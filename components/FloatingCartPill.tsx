import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router, usePathname } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { fontFamily } from '@/constants/fonts';
import { type Palette, radii, spacing } from '@/constants/theme';
import { api } from '@/services/api';
import { useBookingCartStore } from '@/store/useBookingCartStore';
import { useColors, useThemedStyles } from '@/store/useThemeStore';
import { formatINR } from '@/utils/money';

/** Cart pill teal (product pick). */
export const CART_PILL_GREEN = '#05998C';
const CART_PILL_GREEN_DEEP = '#048578';

/** CustomerTabBar row height (excludes safe inset). */
const TAB_BAR_ROW = 58;
/** Pay Bill FAB extends ~30px above the tab row. */
const FAB_OVERHANG = 30;
const PILL_GAP = 8;

type Props = {
  /**
   * `tabs` — absolute float above CustomerTabBar (transparent; no cream strip).
   * `stack` — absolute above safe-area bottom (category / tile explore).
   * `shop` — absolute above shop sticky footer.
   */
  placement?: 'tabs' | 'stack' | 'shop';
  /** When set, only show if the draft cart is for this shop. */
  forShopId?: string;
  /** Extra bottom offset for `shop` (footer height + safe inset). */
  bottomOffset?: number;
};

/** Blinkit-style “View cart” chip — truly floating (no opaque wrapper). */
export function FloatingCartPill({ placement = 'tabs', forShopId, bottomOffset }: Props) {
  const colors = useColors();
  const styles = useThemedStyles(pillStyles);
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const shopId = useBookingCartStore((s) => s.shopId);
  const serviceIds = useBookingCartStore((s) => s.serviceIds);
  const clearCart = useBookingCartStore((s) => s.clearCart);
  const count = serviceIds.length;

  const { data: services = [] } = useQuery({
    queryKey: ['services', shopId],
    queryFn: () => api.services(shopId || ''),
    enabled: Boolean(shopId && count)
  });

  const selected = useMemo(
    () => serviceIds.map((id) => services.find((s) => s.id === id)).filter(Boolean),
    [services, serviceIds]
  );

  const cartTotalPaise = selected.reduce((sum, s) => sum + (s?.pricePaise ?? 0), 0);

  const serviceLabel = useMemo(() => {
    const names = selected.map((s) => s!.name);
    if (!names.length) {
      return count === 1 ? '1 service' : `${count} services`;
    }
    if (names.length === 1) return names[0];
    if (names.length === 2) return `${names[0]} · ${names[1]}`;
    return `${names[0]} +${names.length - 1} more`;
  }, [selected, count]);

  const subLabel =
    cartTotalPaise > 0 ? `${serviceLabel} · ${formatINR(cartTotalPaise)}` : serviceLabel;

  const onMenu = pathname.includes('/menu');
  // Menu mounts its own pill above the Add-to-cart footer — hide tab/stack overlays there.
  const visible =
    count > 0 &&
    Boolean(shopId) &&
    (forShopId == null || shopId === forShopId) &&
    !pathname.startsWith('/booking') &&
    !pathname.startsWith('/partner') &&
    !(onMenu && placement !== 'shop');

  let bottom = Math.max(insets.bottom, 12) + PILL_GAP;
  if (placement === 'tabs') {
    bottom = insets.bottom + TAB_BAR_ROW + FAB_OVERHANG + PILL_GAP;
  } else if (placement === 'shop') {
    bottom = bottomOffset ?? 56 + Math.max(insets.bottom, 10) + PILL_GAP;
  }

  function openBooking() {
    if (!shopId || !serviceIds.length) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push({
      pathname: '/booking',
      params: { shopId, serviceIds: serviceIds.join(',') }
    });
  }

  function discardCart() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    clearCart();
  }

  // Keep host mounted; toggle Animated.View so `exiting` can slide down (not jump/unmount).
  return (
    <>
      {visible ? (
        <Animated.View
          entering={SlideInDown.springify().damping(18).stiffness(200).mass(0.9)}
          exiting={SlideOutDown.duration(280)}
          style={[styles.float, { bottom }]}
          pointerEvents="box-none"
        >
          <View style={styles.pill}>
            <Pressable
              style={styles.mainHit}
              onPress={openBooking}
              accessibilityRole="button"
              accessibilityLabel={`View cart, ${subLabel}`}
            >
              <View style={styles.thumb}>
                <Ionicons name="calendar" size={18} color={colors.white} />
              </View>
              <View style={styles.copy}>
                <Text style={styles.title} allowFontScaling={false}>
                  View cart
                </Text>
                <Text style={styles.sub} allowFontScaling={false} numberOfLines={1}>
                  {subLabel}
                </Text>
              </View>
            </Pressable>
            <Pressable
              style={styles.clearHit}
              onPress={discardCart}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Clear cart"
            >
              <View style={styles.clearBtn}>
                <Ionicons name="close" size={16} color={colors.white} />
              </View>
            </Pressable>
          </View>
        </Animated.View>
      ) : null}
    </>
  );
}

function pillStyles(colors: Palette) {
  return StyleSheet.create({
    float: {
      position: 'absolute',
      left: spacing.md,
      right: spacing.md,
      zIndex: 50,
      elevation: 14,
      backgroundColor: 'transparent'
    },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: CART_PILL_GREEN,
      borderRadius: radii.pill,
      paddingVertical: 10,
      paddingLeft: 10,
      paddingRight: 8,
      gap: 6,
      shadowColor: colors.ink,
      shadowOpacity: 0.18,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 6
    },
    mainHit: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      minWidth: 0
    },
    thumb: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: 'rgba(255,255,255,0.28)',
      alignItems: 'center',
      justifyContent: 'center'
    },
    copy: { flex: 1, minWidth: 0 },
    title: {
      fontFamily: fontFamily.semibold,
      fontSize: 15,
      lineHeight: 18,
      color: colors.white
    },
    sub: {
      fontFamily: fontFamily.regular,
      fontSize: 12,
      lineHeight: 15,
      color: 'rgba(255,255,255,0.92)',
      marginTop: 1
    },
    clearHit: {
      padding: 2
    },
    clearBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: CART_PILL_GREEN_DEEP,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255,255,255,0.28)',
      alignItems: 'center',
      justifyContent: 'center'
    }
  });
}
