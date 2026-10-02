# CUTLY — Design system

## Brand

- **Name:** CUTLY (hero-level on role / welcome; never only nav chrome).
- **Accent teal:** `#0EC9A5` (light + dark). Darker companion `#0BA888` / `#5EEAD4` in dark.
- **Profile hero:** always `#141110` even in light mode.
- **Type:** Poppins ExtraBold / Medium where loaded; otherwise theme weights. Avoid Inter/Roboto as brand face.

## Tokens (`constants/theme.ts`)

| Token | Light | Dark |
| --- | --- | --- |
| canvas | `#FFFFFF` | `#101412` |
| surface | `#F4F6F6` | `#1C2421` |
| ink | `#141110` | `#F4F6F5` |
| muted / line | translucent ink | translucent ink |
| accent | `#0EC9A5` | `#0EC9A5` |

Spacing: `xs…xxl`. Radii: `sm 10` · `md 14` · `lg 20` · `pill 999`.

Hooks: `useColors()`, `useThemedStyles(factory)`, `useThemeStore` (SecureStore `cutly.theme`).

## Navigation

- **Expanding teal capsule tab bar** — `components/ExpandingTabBar.tsx`.
  - Customer: Home / Explore / Bookings / Profile.
  - Partner: Home / Floor / Profile (equal thirds so Floor stays centered).
- Motion: ~220ms pill move; haptics on tab change; respect Reduce Motion.

## Partner setup / auth patterns

- One question per screen; progress `n / total` + animated bar.
- Step content: slide in/out (Reanimated).
- Primary CTAs: **teal pill**, full-width where primary (`accent`, white label). Never `colors.ink` as button fill in dark mode (reads white-on-white).
- Shop type + features: **list rows** (selectable cards), not tiny chips-only for features.
- Service price/duration: large fields (minutes / ₹), not cramped boxes.
- Success after save: full-screen canvas + **animated teal check bubble** (`SuccessOverlay`).

## Role gate

- Customer starts teal; selecting Partner cross-fades Partner → teal, Customer → near-black `#0A0C0B`, then navigates.

## Customer surfaces

- Home: location sheet entry, greeting with given name, service marks, nearby `ShopCard`s.
- Explore: filters (Open now wired; others visual until product asks).
- Bookings: list from API or designed empty state.
- Shop / booking flow: keep existing CUTLY card language; 30% advance copy.

## Design skills in repo

Taste pack under `.agents/skills/` (design-taste-frontend, redesign-existing-projects, brandkit, …). Prefer **redesign-existing-projects** + existing tokens for in-app product UI; landing-only skills for marketing pages.

## Anti-patterns

- Purple AI gradients, Inter-only UI, flat single-color hero without atmosphere on marketing.
- Lottie as Expo **config plugin** (breaks Expo Go). Use Reanimated/SVG for in-app motion.
- Cards everywhere; prefer spacing + accent for hierarchy unless interaction needs a container.

---

*Update when tokens, tab bar, setup UX, or brand rules change.*
