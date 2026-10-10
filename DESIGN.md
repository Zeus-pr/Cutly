# CUTLY — Design system

## Brand

- **Name:** CUTLY (hero-level on role / welcome; never only nav chrome).
- **Color System 02:** cream / navy / coral (replaced teal `#0EC9A5`).
- **Profile hero:** always `#141110` even in light mode.
- **Type:** **Clash Grotesk** (Regular / Medium / Semibold / Bold) app-wide via `constants/fonts.ts`. Root layout **gates** the Stack until Clash is loaded (2.5s failsafe) so customer/partner never flash system type. Also embedded via `expo-font` plugin in `app.json` for native builds. Poppins only on legacy splash native assets until rebuilt.
## Tokens (`constants/theme.ts`)

| Token | Light | Dark | Role |
| --- | --- | --- | --- |
| canvas | `#F7F4EE` cream | `#121820` | Page background |
| surface | `#FFFFFF` paper | `#1C2636` | Cards |
| ink | `#17263C` navy | `#F7F4EE` | Primary text / nav |
| muted | `#667386` slate | `#9AA6B5` | Secondary text |
| sand | `#E9DED0` | `#2A3344` | Subtle selected panels |
| accent | `#F06B55` coral | `#F06B55` | Primary actions |
| accentDark | `#D45540` | `#FF8B78` | Icons / pressed accent |
| success / danger | green / red | | Slide accept / reject |

Spacing: `xs…xxl`. Radii: `sm 10` · `md 14` · `lg 20` · `pill 999`.

Hooks: `useColors()`, `useThemedStyles(factory)`, `useThemeStore` (SecureStore `cutly.theme`).

## Navigation

- **Partner:** Expanding coral capsule tab bar — `components/ExpandingTabBar.tsx` (Home / Floor / Profile).
- **Customer:** Flush Luzo-style bar — `components/CustomerTabBar.tsx`: **Home · Salons · Pay Bill · Studios · Spas**. Sliding coral underline (~240ms). No outer margin/padding around the bar — surface flush to screen bottom (+ safe inset). **Pay Bill** coral FAB opens **Visits** (`bookings`); Visits/Profile also via Home (hidden tabs).
- **Draft cart pill:** Menu checkboxes select only until **Add to cart**; then toggles sync the store (unselect clears/updates pill). Pill enters with `SlideInDown` (drops into place). Teal `#05998C`. Tap body → `/booking`; circular **×** (deep teal) clears cart. Persisted in SecureStore across app relaunch.
- Category tabs open Luzo-style explore (`CategoryExploreScreen` + `ExploreShopCard`): location, search, browse chips, shop cards with promo strip. **Salons** = BARBER/SALON/PARLOUR; **Studios** = TATTOO+PIERCING; **Spas** = facial/spa/massage menu hints.
- Motion: tab underline + haptics; **TabSceneEnter** soft slide on tab focus; stack `slide_from_right` for `/category/[id]`, `/visits`, booking, etc. Respect Reduce Motion.
- Home tiles → stack `/category/[id]` (slide); Plus → `/search`; My Visits → `/visits`.
- **Unknown route / crash shell:** cream canvas, looping cat Lottie (`assets/animations/404-cat.json`), copy **“We cannot find the page you are looking for.”**, coral **Go home** (`app/+not-found`, root `ErrorBoundary`).

## Customer auth

- Launch: solid coral system splash (no logo) → **PatternWavesSplash** (exact silk) with **`cutly-logo-clear.png`** wordmark (no coral fill, +25% size) + **Get Started** → **customer auth**. Legacy SVG field unused.
- Flow: **phone** (+91) → CodeSlots OTP → **complete-profile** (name, email, gender, optional invite) → location permission → home. Secondary: email + Google. Auth footer (phone mode): **Become a partner** (opens `EXPO_PUBLIC_PARTNER_SITE_URL` / www) + **Already a partner** → partner sign-in.
- Booking details: Timings | Get Directions equal half-row; Timings opens hours bottom sheet (timed slide up/down — no spring bounce).

## Partner setup / auth patterns

- One question per screen; progress `n / total` + animated bar.
- Step content: slide in/out (Reanimated).
- Primary CTAs: **coral pill**, full-width where primary (`accent`, white label). Never `colors.ink` as button fill in dark mode (reads white-on-white).
- Back controls: `components/BackButton.tsx` (pill with chevron + label) — not bare arrows/text.
- **Launch (prod):** Static PatternWaves frame + **SplashWordmark** (72% width, shared asset) from first frame → live JS PatternWaves (same wordmark size signed-in/out) → UI.
- Shop type: **multi-select** list rows for Salon / Wellness & Spa / Nails & Lashes / Tattoo / Piercing (matches customer home tiles).
- Brands step: common product chips + custom brand names (`Shop.productBrands`).
- Shop type + features: **list rows** (selectable cards), not tiny chips-only for features.
- Service price/duration: large fields (minutes / ₹), not cramped boxes.
- Success after save: full-screen canvas + **animated coral check bubble** (`SuccessOverlay`).

## Partner auth entry

- No role gate. Partner path is two footer buttons under customer auth; partner screen is **sign-in only** (no create account).

## Customer surfaces

- Home (Luzo-inspired): **CutLy** coral wordmark top-left (`CutlyWordmark` → `CutlyLogo` / `assets/cutly-logo.png`, not Clash text) + profile avatar; location; search; **My Visits** coral card; hero = coral **PatternWaves** promo **or** today’s visit card (fixed **186** height): **teal** upcoming (time + PIN + shop/service/price), **gold** started (no time — “Service started” + shop details), **purple navy** completed (centered “Service completed!” / “Tell us how it was” / **Review** + **Dismiss**, no time). Bookings poll ~4s on Home. **SERVICES FOR YOU** 2×3 tiles.
- **Today’s visit hero:** Shows for IST-today `CONFIRMED` / `ARRIVED` / `IN_SERVICE` (next upcoming start). Upcoming card: white field, teal dots; **Upcoming visits** teal; time and visit code **black** with a short teal rule under the time; coral hint **Share this when arrived at the shop**; shop name + price teal, service gray, right-aligned. Started is centered black type on gold dots (“Service started” large). Completed is navy. Tap → `/booking/[id]`. Gone after complete/cancel/reject → coral promo returns. Same-day reschedule refreshes time via bookings query.
- **Booking success interstitial:** Cream `/booking/success` Moti teal (`#05998C`) check bubble + **“Appointment requested”** (no expo-av — Expo Go safe), then replaces to details (review + pay paths).
- **Search:** centered title, Places | Services tabs **equal-width** (50/50) with sliding underline under the active half, coral search chrome.
- **My Account (Profile):** Luzo-style sections — profile card + EDIT, My Appointments / Notifications / Favourites tiles, **Preferences** (dark/light switch), Spread the love, More (Contact / FAQ / Terms / Privacy / Logout), app version.
- **My Visits:** hero title + short status line; pill chips **Awaiting / Today / Upcoming / Served / Cancelled** with counts; empty copy per tab.
- **Booking details:** Support, status banner, visit **4-digit code**, what-to-do / remember, partner + **map**, timings/directions, appointment rows, sticky Cancel / Reschedule / Pay Bill, and **Go home** (`dismissTo` `/(tabs)` so a new request does not walk back through My Visits and the shop).
- **Search (`/search`)**: Home search bar → blank `/search`. After typing: **Shops** (name-first `query=`) then **Services** 3-col tiles → `/search/[service]`.
- **Area trust:** Home shows Confirm/Change gate before listing when pin is unconfirmed default; stale saved pin Alert (keep vs GPS).
- Explore: Open now + Nearest / Earliest / Price (same as Home; distance **km**, no ETA).
- Visits: list from API; tap row → **`/booking/[id]`** details — header **Visit details** (back · title · Support); visit PIN; **live OSM Leaflet map** → Directions; cancel/reschedule/rate. Service lines = **name + price** only (no minutes). **Pay Bill** only when `remainingPaise > 0`; settled visits show “paid in full” and no pay CTA.
- **Alerts (`/notifications`)**: Home bell (coral unread badge) + Profile → Notifications. List rows; tap marks read + deep-links to booking/Visits. Coupons later via `type`/`data`.
- **Shop detail (`/shop/[id]`):** Luzo-style — hero collage, name/city + Unisex·₹₹, favourite/share, open-hours chip → Timings sheet, square **Get Directions** / **Contact** tiles (Contact dials `Shop.phone` when set; else “No number yet”), CutLy offer card, tabs **Services | Gallery | About | Reviews**, sticky full-width **Book services** only (no Pay bill on shop). Services tab = 4-col category tiles (`ServiceCategoryThumb` — all 12 browse photos in `assets/service-tiles/`) → **`/shop/[id]/menu`** (64px photo-circle rail, Men/Women, accordions → cart). Menu rows = **name + price** (no duration).
- **Booking cart:** Slot times use thin (`regular`) type; show **12 slots** then **View all**. Bill Details row: title left + small **Add** box right → shop menu (`fromBooking`); return via `dismissTo` booking (no stacked bookings). Line meta = price only (no “X min”). No per-line Edit.
- **Back arrows:** bare `chevron-back` (24) via `components/ScreenBack` — no circle/pill/border, hit 40×40, `marginLeft -4`; on photos (shop hero) white + soft text shadow. `BackButton` = same chevron + optional label.
- **Explore (Salons/Studios/Spas):** sort chip row under section title (Nearest / Earliest / Price / Rating → `HomeSortSheet`, ink-filled when active). **Shop detail:** one scroll page, sticky Services / Gallery / About / Reviews tabs scroll to sections. **Menu:** Men / Women / Kids pills (Kids amber). **Booking details:** white help card (offer, cancellation, bill) above bottom spacer.
- `ShopCard` meta: **New** or `★ rating (count)` · km · from ₹price.
- Stars: `components/StarRating.tsx` (Ionicons; gold `#C48A12`).
- Shop / booking flow: keep existing CUTLY card language; 30% advance copy when payments on.
- Booking day strip: horizontal IST calendar chips (**7 days** from today); weekday + day + month; sand/coral selected state. Slots refetch per selected `YYYY-MM-DD` within shop hours.
- Review-booking hold banner: coral countdown when held; idle “Seat not held yet” until Pay now.

## Partner surfaces

- History: horizontal **PressScale** chips — All / Accepted / Rejected / Missed / Cancelled (cream/sand idle, coral selected) matching Home filter language. Rows open **`/partner/history/[id]`** (customer, service, staff, times, payment, Call).
- Floor: **Done** completes the visit and collects any remaining at shop in one step (label **Done · ₹…** when due + confirm). Revenue / Remaining update together. No separate Paid at shop button.
- Floor header: pill **Shop settings** → `/partner/settings` (shop phone + hours + menu; large minute/₹ fields).
- Floor live cards (site mock): sand status pill; meta `service · time · staff`; coral **Start with code** / **Done** + side **Call**; outline pill buttons for **No-show** / **Cancel** / **Reschedule** (locked show “after +5m”). Due = sand/gold chip. Visit-code sheet: grab handle + 4-box `CodeSlots` (coral digits) + **Start service**. Walk-in Staff + duration chips = **equal-width** coral/outline pills (same language as Seat walk-in), not left-hugging wrap.
- Partner Home: coral chip top-left — **CutLy** (`cutly-logo-clear` mark crop) + **Partner** underlabel (`CutlyWordmark partner`) + History; **Open for appointments** card + Switch under greeting (coral border when on; sand when off). Turning off opens **ChoiceSheet** with **Close for today** / **Close temporary**; top-right **×** and backdrop dismiss (no “Keep open”).
- Shop hours editor: tap chip → native time picker (`@react-native-community/datetimepicker` — iOS spinner / Android dialog, 12-hour). Close must be after open (e.g. 9:00 AM–8:30 PM).
- Customer visit PIN on booking details: **coral** digits on surface card (readable in dark mode).
- Shop **Timings** sheet: progress slide (not Layout entering); shop Book/Pay footer unmounted while open (Android cold-open overlap).
- **Partner With Us** (`site/`): cream/navy/coral, Clash Grotesk, island nav; Motion scroll springs + phone-frame mocks; footer with ©, Terms (`#/terms`), Privacy (`#/privacy`) draft pages; phone lead form. Not mixed into Expo `app/`.

## Dialogs & sheets

- **Never** use system `Alert.alert` (Android Material teal buttons). Use `appAlert` / `appConfirm` (`store/useDialogStore` + `AppDialogHost`) — cream surface, navy text, coral/danger pills.
- Multi-option pickers (pay method, etc.): bottom `ChoiceSheet` (slide up, swipe dismiss), same motion language as Home sort sheet.

## Cart / booking (CJ-27)

- Shop booking: category tiles / Book services → menu screen multi-select (PressScale rows) → sticky **Go to cart**.
- Cart (`/booking`): Luzo-clean checkout — shop header + Support, white cards on cream canvas, **Select date & time** (banner + ink pill day strip + 4-col slots), **Preferred staff** rail, **Choose offer** row (placeholder), **Bill details** (expandable service rows with category path, remove, approx total), tax disclaimer tint box, policy/offer/request rows, sticky **Book & pay after services** + legal line → pay **ChoiceSheet** (Pay at shop / Pay from app 30%). After book (or pay confirm), **`replace` → `/booking/[id]`** (visit code + map), not the old confirmed interstitial.

## Deferred booking depth (taste locked)

When shipping **CJ-38** (who sits / persons) and **CJ-28** (custom cut note + photo), reuse CUTLY tokens — cream canvas, navy ink, coral accent, sand chips — plus **PressScale** on every control. No Material defaults, no purple AI chrome, no generic form stacks. Match booking day-strip / Home chip motion.

## Motion (product UI)

- **Loading:** content fetch states use `components/Skeleton.tsx` (Moti opacity pulse on `sand` bones). Prefer shape-matched skeletons over spinners/“Loading…” copy. Honor Reduce Motion (static bones). Keep `ActivityIndicator` only for irreversible actions (e.g. payment WebView).
- **Every new tappable control** (chips, pills, primary buttons, sheet rows) must use `PressScale` (or equivalent Reanimated press scale + spring release). Instant static presses are not acceptable.
- Sheets / dropdowns: slide + fade with Reanimated (`animationType="none"` on Modal), matching `LocationSheet` / `HomeSortSheet`. Swipe down to dismiss when the sheet is a bottom sheet. Honor `prefers-reduced-motion` (skip transform, snap state).
- Motions exist for feedback and state change only - not decoration. Selection can add a short pop when becoming active.
- Haptics: selection feedback on chip/sort presses (via `PressScale` by default).

## Design skills in repo

Taste pack under `.agents/skills/` (design-taste-frontend, redesign-existing-projects, brandkit, …). Prefer **redesign-existing-projects** + existing tokens for in-app product UI; landing-only skills for marketing pages. Product motion: follow **Motion (product UI)** above when taste skills call for interaction feedback.

## Reference libraries (not product chrome)

- **Motion:** **`moti`** (on Reanimated) — modern springs / enter-exit. Helpers: `constants/motionReference.ts`. Prefer Moti + existing `PressScale` over Paper’s Material animation.
- **Components:** **`react-native-paper`** — a11y / control patterns only (token bridge `constants/paperReference.ts`). Do not ship Material motion or default Material chrome.

## Anti-patterns

- Purple AI gradients, Inter-only UI, flat single-color hero without atmosphere on marketing.
- Lottie as Expo **config plugin** (breaks Expo Go). Use Reanimated/SVG for in-app motion.
- Cards everywhere; prefer spacing + accent for hierarchy unless interaction needs a container.
- New buttons/chips without press animation (use `PressScale`).

---

*Update when tokens, tab bar, setup UX, or brand rules change.*
