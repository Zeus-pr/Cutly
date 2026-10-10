import { CategoryExploreScreen } from '@/components/CategoryExploreScreen';
import { FloatingCartPill } from '@/components/FloatingCartPill';
import { EXPLORE_CATEGORIES, type ExploreCategoryId } from '@/constants/exploreCategories';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

function isCategory(id: string): id is ExploreCategoryId {
  return id in EXPLORE_CATEGORIES;
}

/** Stack route for home tile → animated slide into category shop list. */
export default function CategoryStack() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const categoryId = String(id || '');
  if (!isCategory(categoryId)) return <Redirect href="/(tabs)" />;
  return (
    <View style={{ flex: 1 }}>
      <CategoryExploreScreen categoryId={categoryId} showBack />
      {/* Stack has no tab bar — same cart pill as tabs, above safe bottom. */}
      <FloatingCartPill placement="stack" />
    </View>
  );
}
