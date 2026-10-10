import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ServiceCategoryDef } from '@/constants/serviceCategories';
import { useColors } from '@/store/useThemeStore';

type Props = {
  category: ServiceCategoryDef;
  size: number;
  /** Circle (sidebar) vs rounded square (shop grid). */
  shape?: 'circle' | 'square';
  selected?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** Shared tile / sidebar thumb — photo when bundled, tint+icon otherwise. */
export function ServiceCategoryThumb({
  category,
  size,
  shape = 'square',
  selected = false,
  style
}: Props) {
  const colors = useColors();
  const radius = shape === 'circle' ? size / 2 : 12;
  const darkIcon = category.id === 'tattoo' || category.id === 'piercing';

  return (
    <View
      style={[
        styles.wrap,
        {
          width: size,
          height: size,
          borderRadius: radius,
          borderWidth: selected ? 2 : 0,
          borderColor: selected ? colors.accent : 'transparent'
        },
        style
      ]}
    >
      {category.image ? (
        <Image
          source={category.image}
          style={{ width: size, height: size }}
          contentFit="cover"
          cachePolicy="memory-disk"
          accessibilityLabel={category.label}
        />
      ) : (
        <LinearGradient
          colors={category.tint}
          style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons
            name={category.icon}
            size={Math.round(size * 0.42)}
            color={darkIcon ? '#FFF' : colors.ink}
          />
        </LinearGradient>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', backgroundColor: '#EDE8E2' }
});
