import { Tabs } from 'expo-router';
import { ExpandingTabBar } from '@/components/ExpandingTabBar';
import { useColors } from '@/store/useThemeStore';

export default function PartnerTabsLayout() {
  const colors = useColors();
  return (
    <Tabs
      tabBar={(props) => <ExpandingTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.canvas,
          borderTopWidth: 0,
          elevation: 0,
          shadowOpacity: 0
        }
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="floor" options={{ title: 'Floor' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
