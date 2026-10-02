import { Tabs } from 'expo-router';
import { ExpandingTabBar } from '@/components/ExpandingTabBar';
import { LocationSheet } from '@/components/LocationSheet';
import { useColors } from '@/store/useThemeStore';

export default function TabsLayout() {
  const colors = useColors();
  return (
    <>
      <Tabs
        tabBar={(props) => <ExpandingTabBar {...props} />}
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: colors.canvas,
            borderTopWidth: 0,
            elevation: 0,
            shadowOpacity: 0,
          },
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Home' }} />
        <Tabs.Screen name="explore" options={{ title: 'Explore' }} />
        <Tabs.Screen name="bookings" options={{ title: 'Bookings' }} />
        <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
      </Tabs>
      <LocationSheet />
    </>
  );
}
