import { View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { HugeiconsIcon } from '@hugeicons/react-native';
import ScissorsIcon from '@hugeicons/core-free-icons/dist/esm/ScissorsIcon';
import ShowerHeadIcon from '@hugeicons/core-free-icons/dist/esm/ShowerHeadIcon';
import SmileIcon from '@hugeicons/core-free-icons/dist/esm/SmileIcon';
import SparklesIcon from '@hugeicons/core-free-icons/dist/esm/SparklesIcon';

const sizeDefault = 36;

type Props = { kind: string; color: string; size?: number };

export function ServiceMark({ kind, color, size = sizeDefault }: Props) {
  const key = kind.toLowerCase();

  if (key.includes('haircut') || key.includes('kids cut') || key === 'cut') {
    return <HugeiconsIcon icon={ScissorsIcon} size={size} color={color} strokeWidth={1.8} />;
  }
  if (key.includes('beard') || key.includes('shave')) {
    return <MaterialCommunityIcons name="razor-double-edge" size={size} color={color} />;
  }
  if (key.includes('wash') || key.includes('spa') || key.includes('conditioning')) {
    return <HugeiconsIcon icon={ShowerHeadIcon} size={size} color={color} strokeWidth={1.8} />;
  }
  if (key.includes('facial') || key.includes('cleanup') || key.includes('bleach') || key.includes('detan')) {
    return (
      <View style={{ width: size, height: size }}>
        <HugeiconsIcon icon={SmileIcon} size={size} color={color} strokeWidth={1.8} />
        <View style={{ position: 'absolute', top: -4, right: -6 }}>
          <HugeiconsIcon icon={SparklesIcon} size={Math.round(size * 0.4)} color={color} strokeWidth={1.8} />
        </View>
      </View>
    );
  }
  if (key.includes('colour') || key.includes('color') || key.includes('highlight') || key.includes('balayage') || key.includes('root')) {
    return <MaterialCommunityIcons name="palette-outline" size={size} color={color} />;
  }
  if (key.includes('massage')) {
    return <MaterialCommunityIcons name="hand-heart-outline" size={size} color={color} />;
  }
  if (key.includes('keratin') || key.includes('straight') || key.includes('smooth')) {
    return <MaterialCommunityIcons name="hair-dryer-outline" size={size} color={color} />;
  }
  if (key.includes('blow') || key.includes('styl')) {
    return <MaterialCommunityIcons name="hair-dryer" size={size} color={color} />;
  }
  if (key.includes('bridal') || key.includes('makeup') || key.includes('party')) {
    return <MaterialCommunityIcons name="lipstick" size={size} color={color} />;
  }
  if (key.includes('wax') || key.includes('thread')) {
    return <MaterialCommunityIcons name="content-cut" size={size} color={color} />;
  }
  if (key.includes('manicure') || key.includes('pedicure')) {
    return <MaterialCommunityIcons name="hand-back-right-outline" size={size} color={color} />;
  }
  if (key.includes('tattoo') || key.includes('cover-up') || key.includes('blackwork') || key.includes('flash') || key.includes('linework') || key.includes('touch-up')) {
    return <MaterialCommunityIcons name="needle" size={size} color={color} />;
  }
  if (
    key.includes('pierc') ||
    key.includes('lobe') ||
    key.includes('helix') ||
    key.includes('tragus') ||
    key.includes('conch') ||
    key.includes('nose') ||
    key.includes('septum') ||
    key.includes('eyebrow') ||
    key.includes('navel') ||
    key.includes('jewellery')
  ) {
    return <MaterialCommunityIcons name="circle-outline" size={size} color={color} />;
  }
  if (key.includes('consult')) {
    return <MaterialCommunityIcons name="chat-outline" size={size} color={color} />;
  }

  return <HugeiconsIcon icon={SparklesIcon} size={size} color={color} strokeWidth={1.8} />;
}
