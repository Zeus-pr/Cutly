export const shopKinds = [
  { id: 'BARBER', label: 'Barber', hint: 'Men’s cuts, beard, shave' },
  { id: 'SALON', label: 'Salon', hint: 'Hair, colour, treatments' },
  { id: 'PARLOUR', label: 'Parlour', hint: 'Beauty, wax, bridal' },
  { id: 'TATTOO', label: 'Tattoo studio', hint: 'Ink, cover-ups, touch-ups' },
  { id: 'PIERCING', label: 'Piercing', hint: 'Ears, nose, body' }
] as const;

export type ShopKindId = (typeof shopKinds)[number]['id'];

export type CatalogueService = { name: string; durationMinutes: number; pricePaise: number };

export const catalogue: Record<ShopKindId, CatalogueService[]> = {
  BARBER: [
    { name: 'Haircut', durationMinutes: 30, pricePaise: 30000 },
    { name: 'Beard trim', durationMinutes: 20, pricePaise: 15000 },
    { name: 'Haircut + beard', durationMinutes: 45, pricePaise: 45000 },
    { name: 'Hair wash', durationMinutes: 15, pricePaise: 12000 },
    { name: 'Hot towel shave', durationMinutes: 25, pricePaise: 20000 },
    { name: 'Kids cut', durationMinutes: 25, pricePaise: 25000 },
    { name: 'Hair colour', durationMinutes: 60, pricePaise: 80000 },
    { name: 'Head massage', durationMinutes: 20, pricePaise: 20000 },
    { name: 'Facial', durationMinutes: 40, pricePaise: 50000 }
  ],
  SALON: [
    { name: 'Haircut', durationMinutes: 45, pricePaise: 50000 },
    { name: 'Blow dry / styling', durationMinutes: 35, pricePaise: 40000 },
    { name: 'Global colour', durationMinutes: 90, pricePaise: 150000 },
    { name: 'Highlights / balayage', durationMinutes: 120, pricePaise: 250000 },
    { name: 'Root touch-up', durationMinutes: 60, pricePaise: 90000 },
    { name: 'Keratin treatment', durationMinutes: 150, pricePaise: 400000 },
    { name: 'Straightening / smoothening', durationMinutes: 180, pricePaise: 350000 },
    { name: 'Hair spa', durationMinutes: 45, pricePaise: 80000 },
    { name: 'Hair wash + conditioning', durationMinutes: 25, pricePaise: 30000 },
    { name: 'Bridal hairstyling', durationMinutes: 120, pricePaise: 500000 }
  ],
  PARLOUR: [
    { name: 'Threading', durationMinutes: 15, pricePaise: 8000 },
    { name: 'Cleanup', durationMinutes: 30, pricePaise: 40000 },
    { name: 'Facial', durationMinutes: 45, pricePaise: 70000 },
    { name: 'Bleach / detan', durationMinutes: 40, pricePaise: 50000 },
    { name: 'Waxing — arms', durationMinutes: 25, pricePaise: 25000 },
    { name: 'Waxing — full legs', durationMinutes: 40, pricePaise: 45000 },
    { name: 'Manicure', durationMinutes: 35, pricePaise: 40000 },
    { name: 'Pedicure', durationMinutes: 45, pricePaise: 50000 },
    { name: 'Party makeup', durationMinutes: 60, pricePaise: 150000 },
    { name: 'Bridal makeup', durationMinutes: 120, pricePaise: 800000 },
    { name: 'Hair styling', durationMinutes: 45, pricePaise: 60000 }
  ],
  TATTOO: [
    { name: 'Consultation', durationMinutes: 20, pricePaise: 0 },
    { name: 'Flash / small tattoo', durationMinutes: 60, pricePaise: 200000 },
    { name: 'Medium tattoo', durationMinutes: 120, pricePaise: 500000 },
    { name: 'Large / custom piece', durationMinutes: 240, pricePaise: 1200000 },
    { name: 'Cover-up', durationMinutes: 180, pricePaise: 800000 },
    { name: 'Touch-up', durationMinutes: 45, pricePaise: 100000 },
    { name: 'Blackwork / linework session', durationMinutes: 90, pricePaise: 400000 }
  ],
  PIERCING: [
    { name: 'Consultation', durationMinutes: 15, pricePaise: 0 },
    { name: 'Ear lobe', durationMinutes: 15, pricePaise: 40000 },
    { name: 'Helix / cartilage', durationMinutes: 20, pricePaise: 60000 },
    { name: 'Tragus / conch', durationMinutes: 25, pricePaise: 70000 },
    { name: 'Nose (nostril)', durationMinutes: 15, pricePaise: 50000 },
    { name: 'Septum', durationMinutes: 20, pricePaise: 70000 },
    { name: 'Eyebrow', durationMinutes: 20, pricePaise: 60000 },
    { name: 'Navel', durationMinutes: 20, pricePaise: 80000 },
    { name: 'Jewellery change', durationMinutes: 15, pricePaise: 20000 }
  ]
};

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
