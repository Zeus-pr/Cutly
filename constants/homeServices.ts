import { catalogue, type ShopKindId } from '@/constants/catalogue';

export const HOME_SERVICE_ALL = 'All';

export {
  HOME_SORT_OPTIONS,
  homeSortChipLabel,
  sortFamily,
  sortShops,
  type HomeSort,
  type HomeSortFamily,
  type HomeSortOption
} from '@/utils/homeSort';

/** Unique partner-catalogue service names (Barber → … → Piercing). */
export function homeServicePicks(): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  const kinds: ShopKindId[] = ['SALON', 'SPA', 'NAILS', 'TATTOO', 'PIERCING'];
  for (const kind of kinds) {
    for (const row of catalogue[kind]) {
      const name = row.name.trim();
      if (!name || seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      ordered.push(name);
    }
  }
  return ordered;
}

/** Carousel chips: All + every partner catalogue service. */
export function homeServiceCarousel(): string[] {
  return [HOME_SERVICE_ALL, ...homeServicePicks()];
}

/** Loose match: shop services / name vs selected catalogue pick. */
export function shopMatchesServicePick(shopServices: string[], shopName: string, pick: string): boolean {
  if (!pick || pick === HOME_SERVICE_ALL) return true;
  const needle = pick.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!needle) return true;
  const hay = `${shopName} ${shopServices.join(' ')}`.toLowerCase();
  if (hay.includes(needle)) return true;
  const tokens = needle.split(/[^a-z0-9]+/).filter((t) => t.length > 2);
  if (tokens.length && tokens.every((t) => hay.includes(t))) return true;
  if (needle.includes('beard') || needle.includes('shave')) {
    return hay.includes('beard') || hay.includes('shave');
  }
  if (needle.includes('wash')) return hay.includes('wash');
  if (needle.includes('colour') || needle.includes('color')) {
    return hay.includes('colour') || hay.includes('color') || hay.includes('highlight');
  }
  if (needle.includes('spa') || needle.includes('wellness') || needle.includes('massage')) {
    return (
      hay.includes('spa') ||
      hay.includes('massage') ||
      hay.includes('facial') ||
      hay.includes('keratin') ||
      hay.includes('detan')
    );
  }
  if (needle.includes('nail') || needle.includes('lash') || needle.includes('manicure') || needle.includes('pedicure')) {
    return (
      hay.includes('manicure') ||
      hay.includes('pedicure') ||
      hay.includes('nail') ||
      hay.includes('lash') ||
      hay.includes('wax') ||
      hay.includes('threading')
    );
  }
  if (needle.includes('tattoo') || needle.includes('cover-up') || needle.includes('blackwork')) {
    return hay.includes('tattoo') || hay.includes('ink') || hay.includes('cover');
  }
  if (needle.includes('pierc')) return hay.includes('pierc') || hay.includes('lobe') || hay.includes('helix');
  return false;
}
