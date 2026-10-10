export const shopKinds = [
  { id: 'SALON', label: 'Salon', hint: 'Haircut, colour, styling, men’s & unisex' },
  { id: 'SPA', label: 'Wellness & Spa', hint: 'Facial, massage, hair spa, relax' },
  { id: 'NAILS', label: 'Nails & Lashes', hint: 'Manicure, pedicure, lashes, wax' },
  { id: 'TATTOO', label: 'Tattoo studio', hint: 'Ink, cover-ups, touch-ups' },
  { id: 'PIERCING', label: 'Piercing', hint: 'Ears, nose, body' }
] as const;

export type ShopKindId = (typeof shopKinds)[number]['id'];

/** Legacy DB values still accepted when reading shops. */
export type LegacyShopKindId = ShopKindId | 'BARBER' | 'PARLOUR';

export type CatalogueService = {
  name: string;
  durationMinutes: number;
  pricePaise: number;
  /** Chair turnover after service (CJ-11). Default 10; short services may use 0. */
  bufferMinutes?: number;
  /** Who the line is for. Omitted → server infers from the name. */
  audience?: 'MEN' | 'WOMEN' | 'KIDS' | 'UNISEX';
};

function svc(
  name: string,
  durationMinutes: number,
  pricePaise: number,
  bufferMinutes?: number
): CatalogueService {
  const buffer =
    bufferMinutes != null ? bufferMinutes : /consultation/i.test(name) ? 0 : 10;
  return { name, durationMinutes, pricePaise, bufferMinutes: buffer };
}

export const catalogue: Record<ShopKindId, CatalogueService[]> = {
  SALON: [
    svc('Haircut', 30, 30000),
    svc('Haircut + beard', 45, 45000),
    svc('Beard trim', 20, 15000),
    svc('Kids cut', 25, 25000),
    svc('Blow dry / styling', 35, 40000),
    svc('Global colour', 90, 150000),
    svc('Highlights / balayage', 120, 250000),
    svc('Root touch-up', 60, 90000),
    svc('Keratin treatment', 150, 400000),
    svc('Straightening / smoothening', 180, 350000),
    svc('Hair wash + conditioning', 25, 30000),
    svc('Bridal hairstyling', 120, 500000),
    svc('Hot towel shave', 25, 20000)
  ],
  SPA: [
    svc('Facial', 45, 70000),
    svc('Cleanup', 30, 40000),
    svc('Hair spa', 45, 80000),
    svc('Head massage', 20, 20000),
    svc('Body massage', 60, 120000),
    svc('Bleach / detan', 40, 50000),
    svc('Threading', 15, 8000)
  ],
  NAILS: [
    svc('Manicure', 35, 40000),
    svc('Pedicure', 45, 50000),
    svc('Gel nails', 60, 90000),
    svc('Nail art', 45, 70000),
    svc('Lash lift', 45, 80000),
    svc('Lash extensions', 90, 150000),
    svc('Waxing — arms', 25, 25000),
    svc('Waxing — full legs', 40, 45000),
    svc('Party makeup', 60, 150000),
    svc('Bridal makeup', 120, 800000)
  ],
  TATTOO: [
    svc('Flash / small tattoo', 60, 200000),
    svc('Medium tattoo', 120, 500000),
    svc('Large / custom piece', 240, 1200000),
    svc('Cover-up', 180, 800000),
    svc('Touch-up', 45, 100000),
    svc('Blackwork / linework session', 90, 400000)
  ],
  PIERCING: [
    svc('Ear lobe', 15, 40000),
    svc('Helix / cartilage', 20, 60000),
    svc('Tragus / conch', 25, 70000),
    svc('Nose (nostril)', 15, 50000),
    svc('Septum', 20, 70000),
    svc('Eyebrow', 20, 60000),
    svc('Navel', 20, 80000),
    svc('Jewellery change', 15, 20000)
  ]
};

/** Union menu for multi-selected kinds (deduped by name). */
export function catalogueForKinds(kinds: ShopKindId[]): CatalogueService[] {
  const seen = new Set<string>();
  const out: CatalogueService[] = [];
  for (const kind of kinds) {
    for (const row of catalogue[kind] || []) {
      const key = row.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(row);
    }
  }
  return out;
}

/** Which kind a service name belongs to (first match). */
export function kindForServiceName(name: string, preferred?: ShopKindId[]): ShopKindId {
  const needle = name.toLowerCase();
  const order = preferred?.length ? preferred : (shopKinds.map((k) => k.id) as ShopKindId[]);
  for (const kind of order) {
    if ((catalogue[kind] || []).some((row) => row.name.toLowerCase() === needle)) return kind;
  }
  return preferred?.[0] || 'SALON';
}

/** Map legacy DB kinds onto the 5 home types. */
export function normalizeShopKind(kind: string | null | undefined): ShopKindId | null {
  if (!kind) return null;
  const k = kind.toUpperCase();
  if (k === 'BARBER') return 'SALON';
  if (k === 'PARLOUR') return 'NAILS';
  if ((shopKinds as readonly { id: string }[]).some((row) => row.id === k)) return k as ShopKindId;
  return null;
}

export const productBrandSuggestions = [
  'L’Oréal',
  'Schwarzkopf',
  'Matrix',
  'Moroccanoil',
  'Kérastase',
  'Wella',
  'TIGI',
  'Lakmé',
  'Mamaearth',
  'The Body Shop',
  'Forest Essentials',
  'Innisfree',
  'Olaplex',
  'QOD',
  'Streax'
] as const;

export const amenities = [
  'AC',
  'Cushioned chair',
  'Adjustable height',
  'Parking',
  'Card payment',
  'Wi-Fi',
  'Walk-ins',
  'Private room'
];
