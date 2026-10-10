import { Tabs } from 'expo-router';
import { CustomerTabBar } from '@/components/CustomerTabBar';
import { FloatingCartPill } from '@/components/FloatingCartPill';
import { LocationSheet } from '@/components/LocationSheet';
import { useColors } from '@/store/useThemeStore';

export default function TabsLayout() {
  const colors = useColors();
  return (
    <>
      <Tabs
        tabBar={(props) => <CustomerTabBar {...props} />}
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: colors.surface,
            borderTopWidth: 0,
            elevation: 0,
            shadowOpacity: 0
          }
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Home' }} />
        <Tabs.Screen name="salons" options={{ title: 'Salons' }} />
        <Tabs.Screen name="studios" options={{ title: 'Studios' }} />
        <Tabs.Screen name="spas" options={{ title: 'Spas' }} />
        {/* Reachable from Home — not in the bottom bar */}
        <Tabs.Screen name="bookings" options={{ href: null, title: 'Visits' }} />
        <Tabs.Screen name="profile" options={{ href: null, title: 'Profile' }} />
        <Tabs.Screen name="explore" options={{ href: null, title: 'Explore' }} />
      </Tabs>
      {/* Sibling overlay — must not live inside tabBar or RN paints a cream strip. */}
      <FloatingCartPill placement="tabs" />
      <LocationSheet />
    </>
  );
}
