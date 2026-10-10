import type { ComponentProps } from 'react';
import { Ionicons } from '@expo/vector-icons';
import type { Service, ServiceAudience } from '@/types/domain';

type IonName = ComponentProps<typeof Ionicons>['name'];

export type ServiceGroupDef = {
  id: string;
  label: string;
  match: RegExp;
};

export type ServiceCategoryDef = {
  id: string;
  label: string;
  /** Short label for tight 4-col grid (optional). */
  gridLabel?: string;
  icon: IonName;
  /** Soft photo-placeholder gradient when `image` is missing. */
  tint: [string, string];
  /** Bundled tile/sidebar photo (`require(...)`). */
  image?: number;
  match: RegExp;
  groups: ServiceGroupDef[];
  /** Shown on Services tab grid even when shop has no matching SKUs yet. */
  alwaysShow?: boolean;
};

/**
 * Luzo-style browse categories — full 12-tile set on shop Services tab.
 * Matching is name-based against live `ShopService` rows.
 */
export const SERVICE_CATEGORIES: ServiceCategoryDef[] = [
  /** Listed first so “Kids cut” / baby lines are claimed here before Hair Essentials. */
  {
    id: 'kids',
    label: 'Kids & Baby Care',
    gridLabel: 'Kids & Baby',
    icon: 'happy-outline',
    tint: ['#E0F0F5', '#C0E0EC'],
    image: require('@/assets/service-tiles/kids.jpg'),
    alwaysShow: true,
    match: /kids|baby|child/i,
    groups: [{ id: 'kids', label: 'Kids', match: /kids|baby|child/i }]
  },
  {
    id: 'hair-essentials',
    label: 'Hair Essentials',
    icon: 'cut-outline',
    tint: ['#F2D6C9', '#E8B8A4'],
    image: require('@/assets/service-tiles/hair-essentials.jpg'),
    alwaysShow: true,
    match: /haircut|beard|shave|wash|blow|styling|conditioning/i,
    groups: [
      { id: 'haircut', label: 'Haircut', match: /haircut|beard|shave/i },
      { id: 'wash-dry', label: 'Wash OR Dry', match: /wash|blow|conditioning/i },
      { id: 'styling', label: 'Styling', match: /styling|bridal\s*hair/i }
    ]
  },
  {
    id: 'hair-colour',
    label: 'Hair Colour',
    icon: 'color-palette-outline',
    tint: ['#E8D4F0', '#D4B0E8'],
    image: require('@/assets/service-tiles/hair-colour.jpg'),
    alwaysShow: true,
    match: /colour|color|highlight|balayage|root|keratin|straighten|smooth/i,
    groups: [
      { id: 'colour', label: 'Colour', match: /colour|color|root/i },
      { id: 'highlights', label: 'Highlights', match: /highlight|balayage/i },
      { id: 'smoothing', label: 'Smoothing', match: /keratin|straighten|smooth/i }
    ]
  },
  {
    id: 'nail-bar',
    label: 'Nail Bar',
    icon: 'hand-left-outline',
    tint: ['#F0D4E4', '#E8B0D0'],
    image: require('@/assets/service-tiles/nail-bar.jpg'),
    alwaysShow: true,
    match: /gel\s*nail|nail\s*art|nail\s*bar/i,
    groups: [{ id: 'nails-art', label: 'Nails', match: /gel|nail/i }]
  },
  {
    id: 'face',
    label: 'Face',
    icon: 'happy-outline',
    tint: ['#F5E6C8', '#E8D0A0'],
    image: require('@/assets/service-tiles/face.jpg'),
    alwaysShow: true,
    match: /facial|cleanup/i,
    groups: [{ id: 'facial', label: 'Facial', match: /facial|cleanup/i }]
  },
  {
    id: 'treatments',
    label: 'Treatments',
    icon: 'sparkles-outline',
    tint: ['#D8E8F0', '#B8D4E8'],
    image: require('@/assets/service-tiles/treatments.jpg'),
    alwaysShow: true,
    match: /treatment|keratin|smooth|straighten/i,
    groups: [{ id: 'treat', label: 'Treatments', match: /treatment|keratin|smooth|straighten/i }]
  },
  {
    id: 'massage-spa',
    label: 'Massage & Spa',
    icon: 'leaf-outline',
    tint: ['#D4EBE0', '#B0DCC8'],
    image: require('@/assets/service-tiles/massage-spa.jpg'),
    alwaysShow: true,
    match: /massage|hair\s*spa|body\s*massage|head\s*massage/i,
    groups: [{ id: 'massage', label: 'Massage', match: /massage|spa/i }]
  },
  {
    id: 'mens-grooming',
    label: "Men's Grooming",
    icon: 'man-outline',
    tint: ['#D8DEE8', '#B8C4D8'],
    image: require('@/assets/service-tiles/mens-grooming.jpg'),
    alwaysShow: true,
    match: /beard|shave|men|groom/i,
    groups: [{ id: 'mens', label: "Men's", match: /beard|shave|men|groom|haircut/i }]
  },
  {
    id: 'mani-pedi',
    label: 'Manicure & Pedicure',
    gridLabel: 'Mani & Pedi',
    icon: 'finger-print-outline',
    tint: ['#F0E0D8', '#E0C8B8'],
    image: require('@/assets/service-tiles/mani-pedi.jpg'),
    alwaysShow: true,
    match: /manicure|pedicure/i,
    groups: [
      { id: 'mani', label: 'Manicure', match: /manicure/i },
      { id: 'pedi', label: 'Pedicure', match: /pedicure/i }
    ]
  },
  {
    id: 'waxing',
    label: 'Waxing, Bleaching & Threading',
    gridLabel: 'Wax & Thread',
    icon: 'remove-outline',
    tint: ['#F0E8D0', '#E0D4B0'],
    image: require('@/assets/service-tiles/waxing.jpg'),
    alwaysShow: true,
    match: /wax|thread|bleach|detan/i,
    groups: [{ id: 'wax', label: 'Waxing', match: /wax|thread|bleach|detan/i }]
  },
  {
    id: 'semi-permanent',
    label: 'Semi Permanent Make Up',
    gridLabel: 'Semi Permanent',
    icon: 'eyedrop-outline',
    tint: ['#E8D8E8', '#D4C0D8'],
    image: require('@/assets/service-tiles/semi-permanent.jpg'),
    alwaysShow: true,
    match: /semi\s*permanent|microblad|pmu/i,
    groups: [{ id: 'pmu', label: 'PMU', match: /semi|microblad|pmu/i }]
  },
  {
    id: 'bridal-makeup',
    label: 'Bridal & Makeup',
    gridLabel: 'Bridal & Makeup',
    icon: 'brush-outline',
    tint: ['#F5D8E0', '#E8B8C8'],
    image: require('@/assets/service-tiles/bridal-makeup.jpg'),
    alwaysShow: true,
    // Word-bound lash — otherwise “Flash tattoo” wrongly claims Bridal (CJ-71).
    match: /makeup|bridal|\blash(es| lift| extensions)?\b/i,
    groups: [
      { id: 'makeup', label: 'Makeup', match: /makeup|bridal/i },
      { id: 'lash', label: 'Lashes', match: /\blash(es| lift| extensions)?\b/i }
    ]
  },
  {
    id: 'tattoo',
    label: 'Tattoo',
    icon: 'color-fill-outline',
    tint: ['#2A2A2A', '#4A4A4A'],
    image: require('@/assets/service-tiles/tattoo.jpg'),
    /** Only when shop sells tattoo SKUs or has TATTOO kind. */
    match: /tattoo|ink|cover-up|blackwork|touch-up/i,
    groups: [{ id: 'ink', label: 'Ink', match: /tattoo|ink|cover|blackwork|touch/i }]
  },
  {
    id: 'piercing',
    label: 'Piercing',
    icon: 'ellipse-outline',
    tint: ['#3A3A48', '#5A5A6A'],
    image: require('@/assets/service-tiles/piercing.jpg'),
    /** Only when shop sells piercing SKUs or has PIERCING kind. */
    match: /pierc|lobe|helix|tragus|conch|nostril|septum|navel|jewellery/i,
    groups: [{ id: 'pierce', label: 'Piercing', match: /pierc|lobe|helix|tragus|conch|nostril|septum|navel|jewellery/i }]
  },
  {
    id: 'other',
    label: 'More',
    icon: 'grid-outline',
    tint: ['#E8E4DE', '#D4D0C8'],
    match: /.*/,
    groups: [{ id: 'all', label: 'All', match: /.*/ }]
  }
];

/**
 * SERVICE_CATEGORIES order is *claim* priority (Kids first so Kids cut isn't taken by Hair Essentials).
 * UI order keeps Kids & Baby where it always was — after Bridal & Makeup, before Tattoo.
 */
const DISPLAY_RANK = (() => {
  const kids = SERVICE_CATEGORIES.find((c) => c.id === 'kids')!;
  const rest = SERVICE_CATEGORIES.filter((c) => c.id !== 'kids');
  const at = rest.findIndex((c) => c.id === 'tattoo');
  const ordered = [...rest.slice(0, at), kids, ...rest.slice(at)];
  return new Map(ordered.map((c, index) => [c.id, index] as const));
})();

function byDisplayOrder<T>(rows: T[], idOf: (row: T) => string): T[] {
  return [...rows].sort((a, b) => (DISPLAY_RANK.get(idOf(a)) ?? 999) - (DISPLAY_RANK.get(idOf(b)) ?? 999));
}

export type GroupedServices = {
  category: ServiceCategoryDef;
  groups: { group: ServiceGroupDef; services: Service[] }[];
  services: Service[];
};

function resolveCategoryId(service: Service): string {
  // Prefer Ops categoryId even for tiles added later (not in bundled SERVICE_CATEGORIES).
  if (service.categoryId?.trim()) return service.categoryId.trim();
  for (const category of SERVICE_CATEGORIES) {
    if (category.id === 'other') continue;
    if (category.match.test(service.name)) return category.id;
  }
  return 'other';
}

function servicesByCategory(services: Service[]): Map<string, Service[]> {
  const map = new Map<string, Service[]>();
  for (const service of services) {
    const id = resolveCategoryId(service);
    const list = map.get(id) || [];
    list.push(service);
    map.set(id, list);
  }
  return map;
}

/** Bundled tile art, or a neutral def for Ops-created categories. */
export function categoryDefFor(
  id: string,
  labelHint?: string | null
): ServiceCategoryDef {
  const known = SERVICE_CATEGORIES.find((c) => c.id === id);
  if (known) return known;
  const label = (labelHint || id).trim() || id;
  return {
    id,
    label,
    gridLabel: label.length > 14 ? `${label.slice(0, 12)}…` : label,
    icon: 'grid-outline',
    tint: ['#E8E4DE', '#D4D0C8'],
    match: /$a/,
    groups: [{ id: `${id}-all`, label: 'Services', match: /.*/ }]
  };
}

/**
 * Services-tab grid — only tiles this shop actually offers (Ops categoryId / migrate).
 * Tattoo-only shop → Tattoo tile only (CJ-71). Supports Ops-added categories.
 */
export function browseGridCategories(services: Service[], _shopKinds?: string[]): ServiceCategoryDef[] {
  const byCat = servicesByCategory(services);
  const out: ServiceCategoryDef[] = [];
  for (const [id, list] of byCat) {
    if (!list.length) continue;
    if (id === 'other') continue;
    const labelHint = list.find((s) => s.categoryLabel)?.categoryLabel;
    out.push(categoryDefFor(id, labelHint));
  }
  const ordered = byDisplayOrder(out, (c) => c.id);
  // Unknown Ops tiles (no DISPLAY_RANK) keep relative order after known ones.
  ordered.sort((a, b) => {
    const ra = DISPLAY_RANK.get(a.id);
    const rb = DISPLAY_RANK.get(b.id);
    if (ra != null && rb != null) return ra - rb;
    if (ra != null) return -1;
    if (rb != null) return 1;
    return a.label.localeCompare(b.label);
  });
  if ((byCat.get('other')?.length || 0) > 0) {
    const other = SERVICE_CATEGORIES.find((c) => c.id === 'other');
    if (other) ordered.push(other);
  }
  return ordered;
}

/**
 * Menu sidebar + grouping — only categories with SKUs on this shop.
 * Sidebar mirrors the grid (no empty always-show tiles).
 */
export function categoriesForServices(services: Service[], _shopKinds?: string[]): GroupedServices[] {
  const byCat = servicesByCategory(services);
  const out: GroupedServices[] = [];

  for (const [id, matched] of byCat) {
    if (id === 'other' || !matched.length) continue;
    const labelHint = matched.find((s) => s.categoryLabel)?.categoryLabel;
    const category = categoryDefFor(id, labelHint);
    const groups = category.groups
      .map((group) => ({
        group,
        services: matched.filter((s) => group.match.test(s.name))
      }))
      .filter((g) => g.services.length > 0);
    const inGroups = new Set(groups.flatMap((g) => g.services.map((s) => s.id)));
    const leftovers = matched.filter((s) => !inGroups.has(s.id));
    if (leftovers.length) {
      groups.push({
        group: { id: `${category.id}-more`, label: 'More', match: /.*/ },
        services: leftovers
      });
    }
    if (!groups.length) {
      groups.push({
        group: { id: `${category.id}-all`, label: category.label, match: /.*/ },
        services: matched
      });
    }
    out.push({ category, groups, services: matched });
  }

  out.sort((a, b) => {
    const ra = DISPLAY_RANK.get(a.category.id);
    const rb = DISPLAY_RANK.get(b.category.id);
    if (ra != null && rb != null) return ra - rb;
    if (ra != null) return -1;
    if (rb != null) return 1;
    return a.category.label.localeCompare(b.category.label);
  });

  const rest = byCat.get('other') || [];
  if (rest.length) {
    const other = SERVICE_CATEGORIES.find((c) => c.id === 'other')!;
    out.push({
      category: other,
      groups: [{ group: other.groups[0], services: rest }],
      services: rest
    });
  }

  return out;
}

export function findCategory(id: string): ServiceCategoryDef | undefined {
  return SERVICE_CATEGORIES.find((c) => c.id === id);
}

/** Luzo-style breadcrumb for cart lines — “Hair Essentials | Haircut”. */
export function serviceBrowsePath(serviceName: string, categoryId?: string | null): string {
  const category =
    (categoryId && SERVICE_CATEGORIES.find((c) => c.id === categoryId)) ||
    SERVICE_CATEGORIES.find((c) => c.id !== 'other' && c.match.test(serviceName));
  if (!category || category.id === 'other') return 'Services';
  for (const group of category.groups) {
    if (group.match.test(serviceName)) return `${category.label} | ${group.label}`;
  }
  return category.label;
}

export type AudienceFilter = 'all' | 'men' | 'women' | 'kids';

/**
 * Name-based audience guess — mirrors backend/src/serviceAudience.ts (partner forms default to this;
 * also the fallback when an older API omits `audience`).
 */
export function inferServiceAudience(name: string): ServiceAudience {
  if (/kids|baby|child/i.test(name)) return 'KIDS';
  if (/(^|[^a-z])men('?s)?([^a-z]|$)|beard|shave/i.test(name) && !/women/i.test(name)) return 'MEN';
  if (/bridal|lash|makeup|women/i.test(name)) return 'WOMEN';
  return 'UNISEX';
}

/**
 * Men / Women / Kids menu pills. Prefers `service.audience` (partner-set) over name guessing.
 * UNISEX shows under Men and Women, never under Kids. Kids cut never appears under Men.
 */
export function filterByAudience(services: Service[], audience: AudienceFilter): Service[] {
  if (audience === 'all') return services;
  return services.filter((s) => {
    const kind = s.audience || inferServiceAudience(s.name);
    if (audience === 'kids') return kind === 'KIDS';
    if (kind === 'KIDS') return false;
    if (audience === 'men') return kind === 'MEN' || kind === 'UNISEX';
    return kind === 'WOMEN' || kind === 'UNISEX';
  });
}
