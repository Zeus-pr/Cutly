import { CategoryExploreScreen } from '@/components/CategoryExploreScreen';
import { TabSceneEnter } from '@/components/TabSceneEnter';

export default function StudiosTab() {
  return (
    <TabSceneEnter>
      <CategoryExploreScreen categoryId="studios" />
    </TabSceneEnter>
  );
}
