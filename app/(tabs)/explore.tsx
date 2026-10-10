import { Redirect } from 'expo-router';

/** Legacy Explore tab → Salons category. */
export default function ExploreRedirect() {
  return <Redirect href="/(tabs)/salons" />;
}
