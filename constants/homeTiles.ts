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
  /** Nudge art further into the corner (negative = more clipped off edge). */
  imageOffset?: { right?: number; bottom?: number };
};

/**
 * Six home tiles: five shop categories + Plus (view all).
 * Illustrations: add `image: require('@/assets/home-tiles/….svg')` when ready.
 */
export const HOME_SERVICE_TILES: HomeServiceTile[] = [
  {
    id: 'salon',
    title: 'SALON',
    subtitle: 'Style and care',
    serviceName: 'Haircut',
    icon: 'cut-outline',
    tint: '#F06B55',
    image: require('@/assets/home-tiles/salon.png')
  },
  {
    id: 'wellness',
    title: 'WELLNESS\n& SPA',
    subtitle: 'Sit back and relax',
    serviceName: 'Facial',
    icon: 'leaf-outline',
    tint: '#2F6F4E',
    image: require('@/assets/home-tiles/wellness.png'),
    imageOffset: { right: -28, bottom: -8 }
  },
  {
    id: 'nails',
    title: 'NAILS & LASHES',
    subtitle: 'You deserve\nto be\npampered',
    serviceName: 'Manicure',
    icon: 'sparkles-outline',
    tint: '#D45540',
    image: require('@/assets/home-tiles/nails.png'),
    imageOffset: { right: -36, bottom: -10 }
  },
  {
    id: 'tattoo',
    title: 'TATTOO STUDIO',
    subtitle: 'Wear your story',
    serviceName: 'Flash / small tattoo',
    icon: 'brush-outline',
    tint: '#17263C',
    image: require('@/assets/home-tiles/tattoo.png'),
    imageOffset: { right: -14, bottom: -6 }
  },
  {
    id: 'piercing',
    title: 'PIERCING STUDIO',
    subtitle: 'Feeling funky?',
    serviceName: 'Ear lobe',
    icon: 'ellipse-outline',
    tint: '#C48A12',
    image: require('@/assets/home-tiles/piercing.png'),
    imageOffset: { right: -12, bottom: -4 }
  },
  {
    id: 'all',
    title: 'MORE',
    subtitle: 'View all',
    serviceName: null,
    icon: 'add',
    tint: '#F06B55'
  }
];
