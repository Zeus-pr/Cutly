import type { ComponentProps } from 'react';
import { Ionicons } from '@expo/vector-icons';
import type { ImageSourcePropType } from 'react-native';

export type HomeServiceTile = {
  id: string;
  title: string;
  subtitle: string;
  /**
   * Drives search/[service] filter (existing shop-menu match).
   * null = Plus → blank search / view all.
   */
  serviceName: string | null;
  /** Fallback Ionicons until Magnific / custom SVG is dropped in. */
  icon: ComponentProps<typeof Ionicons>['name'];
  tint: string;
  /** Optional illustration — set when you provide an SVG/PNG under assets/home-tiles. */
  image?: ImageSourcePropType;
};

/**
 * Six home tiles: five shop categories + Plus (view all).
 * Illustrations: add `image: require('@/assets/home-tiles/….svg')` when ready.
 */
export const HOME_SERVICE_TILES: HomeServiceTile[] = [
  {
    id: 'salon',
    title: 'Salon',
    subtitle: 'Cut, colour, finish',
    serviceName: 'Haircut',
    icon: 'cut-outline',
    tint: '#F06B55',
    image: require('@/assets/home-photos/hair.jpg')
  },
  {
    id: 'wellness',
    title: 'Wellness',
    subtitle: 'Face, body, quiet',
    serviceName: 'Facial',
    icon: 'leaf-outline',
    tint: '#2F6F4E',
    image: require('@/assets/home-photos/wellness.jpg')
  },
  {
    id: 'nails',
    title: 'Nails',
    subtitle: 'Hands and lashes',
    serviceName: 'Manicure',
    icon: 'sparkles-outline',
    tint: '#D45540',
    image: require('@/assets/home-photos/nails.jpg')
  },
  {
    id: 'tattoo',
    title: 'Tattoo',
    subtitle: 'Flash and custom',
    serviceName: 'Flash / small tattoo',
    icon: 'brush-outline',
    tint: '#17263C',
    image: require('@/assets/home-photos/tattoo.jpg')
  },
  {
    id: 'piercing',
    title: 'Piercing',
    subtitle: 'Lobe to cartilage',
    serviceName: 'Ear lobe',
    icon: 'ellipse-outline',
    tint: '#C48A12',
    image: require('@/assets/home-photos/piercing.jpg')
  },
  {
    id: 'all',
    title: 'More',
    subtitle: 'The rest of the menu',
    serviceName: null,
    icon: 'add',
    tint: '#F06B55'
  }
];
