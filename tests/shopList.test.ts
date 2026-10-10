import { describe, expect, it } from 'vitest';
import { resolveListService, shopRatingFromReviews } from '../backend/src/shopList';
import { assertPaidPricePaise, MIN_SERVICE_PRICE_PAISE } from '../backend/src/price';

describe('shop list metrics (CJ-32 / 33 / 34)', () => {
  const services = [
    { pricePaise: 30000, service: { id: 'a', name: 'Haircut', durationMinutes: 30 } },
    { pricePaise: 15000, service: { id: 'b', name: 'Beard trim', durationMinutes: 15 } },
    { pricePaise: 50000, service: { id: 'c', name: 'Colour', durationMinutes: 60 } }
  ];

  it('uses min price + shortest service when no name', () => {
    const resolved = resolveListService(services);
    expect(resolved?.pricePaise).toBe(15000);
    expect(resolved?.serviceId).toBe('b');
  });

  it('resolves chosen service price for sort', () => {
    const resolved = resolveListService(services, 'Haircut');
    expect(resolved?.pricePaise).toBe(30000);
    expect(resolved?.serviceId).toBe('a');
  });

  it('returns null rating when there are no reviews', () => {
    expect(shopRatingFromReviews([])).toEqual({ rating: null, reviewCount: 0 });
    expect(shopRatingFromReviews([{ rating: 5 }, { rating: 4 }])).toEqual({
      rating: 4.5,
      reviewCount: 2
    });
  });
});

describe('paid price (CJ-42)', () => {
  it('rejects zero and negative', () => {
    expect(MIN_SERVICE_PRICE_PAISE).toBe(1);
    expect(() => assertPaidPricePaise(0)).toThrow(/₹1/);
    expect(() => assertPaidPricePaise(-100)).toThrow(/₹1/);
    expect(() => assertPaidPricePaise(100)).not.toThrow();
  });
});
