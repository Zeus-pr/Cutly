/**
 * Global browse categories (same ids as customer tiles).
 * Used for Ops catalogue + auto-migrate claim order (Kids before Hair Essentials).
 */
export type CategoryMeta = {
  id: string;
  label: string;
  gridLabel?: string;
  sortOrder: number;
  /** Name regex for first-time migrate / new partner SKUs. */
  match: RegExp;
};

/** Claim priority = array order. Display order uses sortOrder. */
export const CATEGORY_META: CategoryMeta[] = [
  {
    id: 'kids',
    label: 'Kids & Baby Care',
    gridLabel: 'Kids & Baby',
    sortOrder: 12,
    match: /kids|baby|child/i
  },
  {
    id: 'hair-essentials',
    label: 'Hair Essentials',
    sortOrder: 1,
    match: /haircut|beard|shave|wash|blow|styling|conditioning/i
  },
  {
    id: 'hair-colour',
    label: 'Hair Colour',
    sortOrder: 2,
    match: /colour|color|highlight|balayage|root|keratin|straighten|smooth/i
  },
  {
    id: 'nail-bar',
    label: 'Nail Bar',
    sortOrder: 3,
    match: /gel\s*nail|nail\s*art|nail\s*bar/i
  },
  {
    id: 'face',
    label: 'Face',
    sortOrder: 4,
    match: /facial|cleanup/i
  },
  {
    id: 'treatments',
    label: 'Treatments',
    sortOrder: 5,
    match: /treatment|keratin|smooth|straighten/i
  },
  {
    id: 'massage-spa',
    label: 'Massage & Spa',
    sortOrder: 6,
    match: /massage|hair\s*spa|body\s*massage|head\s*massage/i
  },
  {
    id: 'mens-grooming',
    label: "Men's Grooming",
    sortOrder: 7,
    match: /beard|shave|men|groom/i
  },
  {
    id: 'mani-pedi',
    label: 'Manicure & Pedicure',
    gridLabel: 'Mani & Pedi',
    sortOrder: 8,
    match: /manicure|pedicure/i
  },
  {
    id: 'waxing',
    label: 'Waxing, Bleaching & Threading',
    gridLabel: 'Wax & Thread',
    sortOrder: 9,
    match: /wax|thread|bleach|detan/i
  },
  {
    id: 'semi-permanent',
    label: 'Semi Permanent Make Up',
    gridLabel: 'Semi Permanent',
    sortOrder: 10,
    match: /semi\s*permanent|microblad|pmu/i
  },
  {
    id: 'bridal-makeup',
    label: 'Bridal & Makeup',
    gridLabel: 'Bridal & Makeup',
    sortOrder: 11,
    // Word-bound lash — otherwise “Flash tattoo” wrongly claims Bridal (CJ-71).
    match: /makeup|bridal|\blash(es| lift| extensions)?\b/i
  },
  {
    id: 'tattoo',
    label: 'Tattoo',
    sortOrder: 13,
    match: /tattoo|ink|cover-up|blackwork|touch-up/i
  },
  {
    id: 'piercing',
    label: 'Piercing',
    sortOrder: 14,
    match: /pierc|lobe|helix|tragus|conch|nostril|septum|navel|jewellery/i
  },
  {
    id: 'other',
    label: 'More',
    sortOrder: 99,
    match: /.*/
  }
];

/** First matching category id (Kids before Hair Essentials). Never returns empty. */
export function claimCategoryId(serviceName: string): string {
  const name = serviceName.trim();
  for (const cat of CATEGORY_META) {
    if (cat.id === 'other') continue;
    if (cat.match.test(name)) return cat.id;
  }
  return 'other';
}
