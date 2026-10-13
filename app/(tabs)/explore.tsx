import { CategoryExploreScreen } from '@/components/CategoryExploreScreen';
import { TabSceneEnter } from '@/components/TabSceneEnter';

/** Discover — every nearby shop, not a single category. */
export default function ExploreTab() {
  return (
    <TabSceneEnter>
      <CategoryExploreScreen allShops />
    </TabSceneEnter>
  );
}
