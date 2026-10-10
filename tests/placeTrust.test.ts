import { describe, expect, it } from 'vitest';
import {
  compareShopsByQueryThenDistance,
  flatSubstringMatch,
  isDefaultPlaceCoords,
  isStaleSavedPin,
  shopQueryRank,
  STALE_PIN_KM
} from '../utils/placeTrust';

/** Mirror DEFAULT_PLACE without importing react-native via device-location. */
const BARDHAMAN = { latitude: 23.2324, longitude: 87.8615 };

describe('placeTrust (CJ-29 / 30 / 35)', () => {
  it('detects default Bardhaman coords', () => {
    expect(isDefaultPlaceCoords(BARDHAMAN)).toBe(true);
    expect(isDefaultPlaceCoords({ latitude: 22.5, longitude: 88.3 })).toBe(false);
  });

  it('flags stale saved pin beyond threshold', () => {
    const home = { latitude: 23.2324, longitude: 87.8615, savedId: 'p1' };
    const far = { latitude: 22.5726, longitude: 88.3639 }; // Kolkata
    expect(isStaleSavedPin(far, home)).toBe(true);
    expect(isStaleSavedPin(home, home)).toBe(false);
    expect(isStaleSavedPin(far, { ...home, savedId: null })).toBe(false);
    expect(STALE_PIN_KM).toBe(2);
  });

  it('flat substring is case/whitespace insensitive', () => {
    expect(flatSubstringMatch('Fade  King', 'fade')).toBe(true);
    expect(flatSubstringMatch('Haircut', 'cut')).toBe(true);
    expect(flatSubstringMatch('Beard', 'colour')).toBe(false);
  });

  it('ranks shop name before menu before address', () => {
    const shop = {
      name: 'TESTALL',
      city: 'Burdwan',
      address: 'Indrakanan',
      services: ['Haircut', 'Beard trim'],
      distanceKm: 1
    };
    expect(shopQueryRank(shop, 'TESTALL')).toBe(0);
    expect(shopQueryRank(shop, 'Haircut')).toBe(1);
    expect(shopQueryRank(shop, 'Indrakanan')).toBe(2);
    expect(shopQueryRank(shop, 'zzz')).toBe(3);

    const a = { ...shop, name: 'Far Shop', services: ['Haircut'], distanceKm: 5 };
    const b = { ...shop, name: 'Haircut Hub', services: [], distanceKm: 9 };
    expect(compareShopsByQueryThenDistance(b, a, 'Haircut')).toBeLessThan(0);
  });
});
