import { View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { HugeiconsIcon } from '@hugeicons/react-native';
import ScissorsIcon from '@hugeicons/core-free-icons/dist/esm/ScissorsIcon';
import ShowerHeadIcon from '@hugeicons/core-free-icons/dist/esm/ShowerHeadIcon';
import SmileIcon from '@hugeicons/core-free-icons/dist/esm/SmileIcon';
import SparklesIcon from '@hugeicons/core-free-icons/dist/esm/SparklesIcon';

const size = 56;

export function ServiceMark({ kind, color }: { kind: 'Haircut' | 'Beard' | 'Hair Wash' | 'Facial'; color: string }) {
  if (kind === 'Haircut') {
    return <HugeiconsIcon icon={ScissorsIcon} size={size} color={color} strokeWidth={1.8} />;
  }
  if (kind === 'Beard') {
    return <MaterialCommunityIcons name="razor-double-edge" size={size} color={color} />;
  }
  if (kind === 'Hair Wash') {
    return <HugeiconsIcon icon={ShowerHeadIcon} size={size} color={color} strokeWidth={1.8} />;
  }
  return (
    <View style={{ width: size, height: size }}>
      <HugeiconsIcon icon={SmileIcon} size={size} color={color} strokeWidth={1.8} />
      <View style={{ position: 'absolute', top: -6, right: -8 }}>
        <HugeiconsIcon icon={SparklesIcon} size={22} color={color} strokeWidth={1.8} />
      </View>
    </View>
  );
}
