import type { ShopKindId } from '@/constants/catalogue';
import { normalizeShopKind } from '@/constants/catalogue';

export type ExploreCategoryId = 'salons' | 'studios' | 'spas';

export type ExploreCategory = {
  id: ExploreCategoryId;
  title: string;
  heading: string;
  searchPlaceholder: string;
  browseLabel: string;
  browseChips: string[];
  kinds: ShopKindId[];
  /** Extra legacy kinds still matched when reading old shops. */
  legacyKinds?: string[];
  serviceHints: string[];
  promoLine: string;
};

export const EXPLORE_CATEGORIES: Record<ExploreCategoryId, ExploreCategory> = {
  salons: {
    id: 'salons',
    title: 'Salons',
    heading: 'Salons near you',
    searchPlaceholder: 'Search for a salon or service',
    browseLabel: 'Salon by products',
    browseChips: ['L’Oréal', 'Schwarzkopf', 'QOD', 'Moroccanoil', 'Kerastase', 'Matrix'],
    kinds: ['SALON', 'NAILS'],
    legacyKinds: ['BARBER', 'PARLOUR'],
    serviceHints: [],
    promoLine: 'Get 30% OFF via CutLy'
  },
  studios: {
    id: 'studios',
    title: 'Studios',
    heading: 'Studios near you',
    searchPlaceholder: 'Search tattoo or piercing',
    browseLabel: 'Studio vibes',
    browseChips: ['Flash', 'Fine line', 'Blackwork', 'Cover-up', 'Helix', 'Septum'],
    kinds: ['TATTOO', 'PIERCING'],
    serviceHints: [],
    promoLine: 'Book your next ink or pierce'
  },
  spas: {
    id: 'spas',
    title: 'Spas',
    heading: 'Spas near you',
    searchPlaceholder: 'Search spa or wellness',
    browseLabel: 'Treatments',
    browseChips: ['Facial', 'Hair spa', 'Massage', 'Cleanup', 'Detan', 'Body'],
    kinds: ['SPA'],
    serviceHints: [],
    promoLine: 'Unwind — offers on wellness'
  }
};

/** Home service tile → category tab. */
export const TILE_EXPLORE_TAB: Record<string, ExploreCategoryId | null> = {
  salon: 'salons',
  wellness: 'spas',
  nails: 'salons',
  tattoo: 'studios',
  piercing: 'studios',
  all: null
};

export function categoryKindQuery(category: ExploreCategory): string {
  return [...category.kinds, ...(category.legacyKinds || [])].join(',');
}

export function shopMatchesCategory(
  shop: { kind?: string | null; kinds?: string[]; services: string[] },
  category: ExploreCategory
): boolean {
  const set = new Set(
    [...category.kinds, ...(category.legacyKinds || [])].map((k) => k.toUpperCase())
  );
  const shopKinds = (shop.kinds?.length ? shop.kinds : shop.kind ? [shop.kind] : []).map((k) =>
    (normalizeShopKind(k) || k).toUpperCase()
  );
  if (shopKinds.some((k) => set.has(k) || set.has(normalizeShopKind(k) || ''))) return true;
  if (!category.kinds.length && category.serviceHints.length) {
    const hay = shop.services.join(' ').toLowerCase();
    return category.serviceHints.some((hint) => hay.includes(hint.toLowerCase()));
  }
  return false;
}
