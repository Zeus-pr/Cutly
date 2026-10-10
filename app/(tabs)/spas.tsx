import { CategoryExploreScreen } from '@/components/CategoryExploreScreen';
import { TabSceneEnter } from '@/components/TabSceneEnter';

export default function SpasTab() {
  return (
    <TabSceneEnter>
      <CategoryExploreScreen categoryId="spas" />
    </TabSceneEnter>
  );
}
