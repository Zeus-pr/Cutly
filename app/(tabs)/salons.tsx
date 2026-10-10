import { CategoryExploreScreen } from '@/components/CategoryExploreScreen';
import { TabSceneEnter } from '@/components/TabSceneEnter';

export default function SalonsTab() {
  return (
    <TabSceneEnter>
      <CategoryExploreScreen categoryId="salons" />
    </TabSceneEnter>
  );
}
