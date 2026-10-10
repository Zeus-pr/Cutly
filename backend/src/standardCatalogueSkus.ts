/**
 * Common India / salon-spa menu lines under each global tile.
 * Ops picks these onto a shop (per-shop price) or adds a shop-specific SKU.
 * Durations = booking defaults; prices = suggested defaults (shop overrides).
 */
export type StandardSku = {
  name: string;
  durationMinutes: number;
  /** Suggested default ₹ in paise — shop sets real price on Menu. */
  pricePaise: number;
  bufferMinutes?: number;
};

export const STANDARD_SKUS_BY_CATEGORY: Record<string, StandardSku[]> = {
  'hair-essentials': [
    { name: 'Haircut', durationMinutes: 30, pricePaise: 30000 },
    { name: 'Haircut + beard', durationMinutes: 45, pricePaise: 45000 },
    { name: 'Blow dry / styling', durationMinutes: 35, pricePaise: 40000 },
    { name: 'Hair wash + conditioning', durationMinutes: 25, pricePaise: 30000 },
    { name: 'Trim', durationMinutes: 20, pricePaise: 20000 },
    { name: 'Fringe / bangs trim', durationMinutes: 15, pricePaise: 15000, bufferMinutes: 5 }
  ],
  'mens-grooming': [
    { name: 'Beard trim', durationMinutes: 20, pricePaise: 15000 },
    { name: 'Hot towel shave', durationMinutes: 25, pricePaise: 20000 },
    { name: 'Head shave', durationMinutes: 25, pricePaise: 25000 },
    { name: 'Mustache trim', durationMinutes: 10, pricePaise: 10000, bufferMinutes: 5 },
    { name: 'Gentleman haircut', durationMinutes: 30, pricePaise: 35000 }
  ],
  kids: [
    { name: 'Kids cut', durationMinutes: 25, pricePaise: 25000 },
    { name: 'Kids cut + wash', durationMinutes: 35, pricePaise: 35000 },
    { name: 'Baby first haircut', durationMinutes: 20, pricePaise: 30000 }
  ],
  'hair-colour': [
    { name: 'Global colour', durationMinutes: 90, pricePaise: 150000 },
    { name: 'Root touch-up', durationMinutes: 60, pricePaise: 90000 },
    { name: 'Highlights / balayage', durationMinutes: 120, pricePaise: 250000 },
    { name: 'Partial highlights', durationMinutes: 90, pricePaise: 180000 },
    { name: 'Colour gloss / toner', durationMinutes: 45, pricePaise: 80000 },
    { name: 'Bleach & tone', durationMinutes: 120, pricePaise: 280000 }
  ],
  treatments: [
    { name: 'Keratin treatment', durationMinutes: 150, pricePaise: 400000 },
    { name: 'Straightening / smoothening', durationMinutes: 180, pricePaise: 350000 },
    { name: 'Hair spa', durationMinutes: 45, pricePaise: 80000 },
    { name: 'Deep conditioning treatment', durationMinutes: 40, pricePaise: 60000 },
    { name: 'Scalp treatment', durationMinutes: 30, pricePaise: 50000 },
    { name: 'Olaplex / bond repair', durationMinutes: 45, pricePaise: 120000 }
  ],
  face: [
    { name: 'Facial', durationMinutes: 45, pricePaise: 70000 },
    { name: 'Cleanup', durationMinutes: 30, pricePaise: 40000 },
    { name: 'Fruit facial', durationMinutes: 45, pricePaise: 60000 },
    { name: 'Gold facial', durationMinutes: 60, pricePaise: 120000 },
    { name: 'Acne facial', durationMinutes: 50, pricePaise: 90000 }
  ],
  'massage-spa': [
    { name: 'Head massage', durationMinutes: 20, pricePaise: 20000 },
    { name: 'Body massage', durationMinutes: 60, pricePaise: 120000 },
    { name: 'Back & shoulder massage', durationMinutes: 30, pricePaise: 60000 },
    { name: 'Foot massage', durationMinutes: 30, pricePaise: 50000 },
    { name: 'Aromatherapy massage', durationMinutes: 60, pricePaise: 150000 }
  ],
  'mani-pedi': [
    { name: 'Manicure', durationMinutes: 35, pricePaise: 40000 },
    { name: 'Pedicure', durationMinutes: 45, pricePaise: 50000 },
    { name: 'Mani + pedi', durationMinutes: 75, pricePaise: 85000 },
    { name: 'Gel manicure', durationMinutes: 45, pricePaise: 70000 },
    { name: 'Gel pedicure', durationMinutes: 55, pricePaise: 80000 }
  ],
  'nail-bar': [
    { name: 'Gel nails', durationMinutes: 60, pricePaise: 90000 },
    { name: 'Nail art', durationMinutes: 45, pricePaise: 70000 },
    { name: 'Acrylic full set', durationMinutes: 90, pricePaise: 150000 },
    { name: 'Acrylic fill', durationMinutes: 60, pricePaise: 90000 },
    { name: 'Gel removal', durationMinutes: 20, pricePaise: 25000 },
    { name: 'Polish change', durationMinutes: 15, pricePaise: 15000, bufferMinutes: 5 }
  ],
  waxing: [
    { name: 'Threading', durationMinutes: 15, pricePaise: 8000, bufferMinutes: 5 },
    { name: 'Eyebrow threading', durationMinutes: 15, pricePaise: 10000, bufferMinutes: 5 },
    { name: 'Upper lip wax', durationMinutes: 10, pricePaise: 8000, bufferMinutes: 5 },
    { name: 'Waxing — arms', durationMinutes: 25, pricePaise: 25000 },
    { name: 'Waxing — full legs', durationMinutes: 40, pricePaise: 45000 },
    { name: 'Waxing — underarms', durationMinutes: 15, pricePaise: 15000 },
    { name: 'Full face wax', durationMinutes: 30, pricePaise: 40000 },
    { name: 'Bleach / detan', durationMinutes: 40, pricePaise: 50000 }
  ],
  'bridal-makeup': [
    { name: 'Party makeup', durationMinutes: 60, pricePaise: 150000 },
    { name: 'Bridal makeup', durationMinutes: 120, pricePaise: 800000 },
    { name: 'Bridal hairstyling', durationMinutes: 120, pricePaise: 500000 },
    { name: 'Engagement makeup', durationMinutes: 90, pricePaise: 400000 },
    { name: 'Lash lift', durationMinutes: 45, pricePaise: 80000 },
    { name: 'Lash extensions', durationMinutes: 90, pricePaise: 150000 }
  ],
  'semi-permanent': [
    { name: 'Microblading', durationMinutes: 120, pricePaise: 800000 },
    { name: 'Ombre brows', durationMinutes: 120, pricePaise: 900000 },
    { name: 'Lip tint / blush', durationMinutes: 90, pricePaise: 600000 },
    { name: 'Eyeliner PMU', durationMinutes: 90, pricePaise: 550000 },
    { name: 'PMU touch-up', durationMinutes: 60, pricePaise: 250000 }
  ],
  tattoo: [
    { name: 'Flash / small tattoo', durationMinutes: 60, pricePaise: 200000 },
    { name: 'Medium tattoo', durationMinutes: 120, pricePaise: 500000 },
    { name: 'Large / custom piece', durationMinutes: 240, pricePaise: 1200000 },
    { name: 'Cover-up', durationMinutes: 180, pricePaise: 800000 },
    { name: 'Touch-up', durationMinutes: 45, pricePaise: 100000 },
    { name: 'Blackwork / linework session', durationMinutes: 90, pricePaise: 400000 }
  ],
  piercing: [
    { name: 'Ear lobe', durationMinutes: 15, pricePaise: 40000 },
    { name: 'Helix / cartilage', durationMinutes: 20, pricePaise: 60000 },
    { name: 'Tragus / conch', durationMinutes: 25, pricePaise: 70000 },
    { name: 'Nose (nostril)', durationMinutes: 15, pricePaise: 50000 },
    { name: 'Septum', durationMinutes: 20, pricePaise: 70000 },
    { name: 'Eyebrow', durationMinutes: 20, pricePaise: 60000 },
    { name: 'Navel', durationMinutes: 20, pricePaise: 80000 },
    { name: 'Jewellery change', durationMinutes: 15, pricePaise: 20000 }
  ],
  other: [{ name: 'Consultation', durationMinutes: 15, pricePaise: 10000, bufferMinutes: 0 }]
};
