export type LegalBlock = { heading: string; body: string[] };

export const TERMS: LegalBlock[] = [
  {
    heading: 'Who we are',
    body: [
      'CutLy helps you find nearby salons, spas, and studios and request a visit. The service itself is provided by the shop.'
    ]
  },
  {
    heading: 'Your account',
    body: [
      'You sign in with your phone or another method we offer. You are responsible for activity on your account and for keeping your details accurate.'
    ]
  },
  {
    heading: 'Bookings',
    body: [
      'A request is not confirmed until the shop accepts it. You pay the bill at the shop. Cancel free until 12 hours before a confirmed visit. Inside that window, ask the shop first.'
    ]
  },
  {
    heading: 'Acceptable use',
    body: [
      'Do not misuse CutLy: no fraud, spam, fake bookings, or harassment. We may suspend an account if these rules are broken.'
    ]
  },
  {
    heading: 'Changes',
    body: [
      'We may update these terms as CutLy grows. The date on this screen is the latest draft. These are product terms, not a lawyer’s opinion.'
    ]
  }
];

export const PRIVACY: LegalBlock[] = [
  {
    heading: 'What we collect',
    body: [
      'Account: phone, email, name, and optional gender.',
      'Bookings: shop, services, time, visit code, and whether the bill was settled at the shop.',
      'Device: app version, and your location only when you allow it so we can show nearby shops.'
    ]
  },
  {
    heading: 'How we use it',
    body: [
      'To sign you in, show shops, send booking updates, and run the visit with the shop you chose. We do not sell your personal information.'
    ]
  },
  {
    heading: 'Who sees it',
    body: [
      'The shop you book sees the details they need to serve you. We use processors for hosting, messages, and maps.'
    ]
  },
  {
    heading: 'Deletion',
    body: [
      'Delete account in My Account removes your login, bookings, saved places, and favourites. Some shop records of a completed visit may remain on the partner side until that shop’s own records are removed.'
    ]
  }
];

export const FAQ: { q: string; a: string }[] = [
  {
    q: 'How do I book?',
    a: 'Pick a shop, choose services, then a time. The shop has to accept before the visit is confirmed.'
  },
  {
    q: 'When do I pay?',
    a: 'At the shop, for the full bill. CutLy does not take a 30% advance.'
  },
  {
    q: 'Can I cancel?',
    a: 'Yes, until 12 hours before a confirmed visit. Inside 12 hours, contact the shop.'
  },
  {
    q: 'What is the visit code?',
    a: 'A 4-digit code on your booking. Show it at the shop so they can start the service.'
  },
  {
    q: 'How do I delete my account?',
    a: 'My Account → Delete account. You will be asked to confirm. This cannot be undone.'
  }
];
