# CUTLY — Architecture

## Stack

| Layer | Choice |
| --- | --- |
| App | Expo Router ~57, React Native 0.86, React 19, Reanimated 4, TanStack Query |
| API | Express on `0.0.0.0:$PORT` (default **4000**), `tsx watch` |
| DB | Postgres · Prisma 6 · migrations under `prisma/migrations/` · **local Postgres.app preferred for daily dev**; Neon Free (us-east-2) optional / slow from India |
| Auth | JWT (`JWT_SECRET`), bcrypt passwords, Twilio OTP hooks, Google ID token |
| Push | `expo-notifications` + **Firebase FCM** (`cutly-buzz`). Client: `google-services.json` via `android.googleServicesFile`. Server send: Expo Push API with EAS FCM V1 key (`cutly-fcm@…`). Channels `visits_v2` / `shop_requests_v2`. EAS project `@zeus-pr/cutly`. Partner Home also local-alerts on poll. |

## Repo layout

```
app/                    Expo Router screens (customer + partner)
components/             UI (ExpandingTabBar, SuccessOverlay, ShopCard, …)
constants/              theme.ts, catalogue.ts
services/               api.ts, auth.ts, partner.ts, notifications.ts, device-location.ts
store/                  useSessionStore, usePlaceStore, useThemeStore
backend/src/            server.ts, auth.ts, partner.ts, customer.ts, partnerLeads.ts, mail.ts, …
site/                   Separate Vite + React marketing package (Partner With Us) → dist on www/apex (Host-gated)
prisma/                 schema + migrations
```

## Session & routing

- SecureStore keys: `cutly.accessToken`, `cutly.partnerToken`, `cutly.audience` (only after sign-in), theme, place (`cutly.place` / `cutly.savedPlaces` / `cutly.placeMeta` for areaConfirmed + originKind), partner setup flag.
- **Audience is session-only until sign-in.** Cold start without a token → splash → **/auth** (customer).
- Gate: `app/_layout.tsx` `SessionGate` + cold-start launch Lottie (`PatternWavesSplash`, Android coral CutLy. cover until the player loads; signed-in continues home after the clip). Unsigned: Get Started → **/auth** → OTP → **complete-profile** if no name → location → tabs. Auth footer → website (`EXPO_PUBLIC_PARTNER_SITE_URL`) or **/partner/auth** (sign-in only; no in-app partner signup).
- Customer tabs: `app/(tabs)/` Home / Discover (all nearby shops) / Pay Bill sheet / Visits / Profile. Salons / Studios / Spas stay registered, not in the bar. Center **Pay Bill** FAB opens `PayBillSheet` (how to pay; the charge is still on the visit). Stack slides: `/category/[id]`, `/visits`, `/complete-profile`, `/legal/terms`, `/legal/privacy`, `/legal/faq`.
- Bookings are pay-at-shop. `POST /bookings` writes `advancePaise` 0 and does not open Razorpay. `DELETE /api/auth/account` deletes the customer and their bookings.
- Customer search: `app/search/index.tsx` blank → type (≥2 chars) → **Shops** via `GET /shops?query=` (name-first rank) + **Services** catalogue tiles; tile → `app/search/[service].tsx`.
- Partner tabs: `app/partner/(tabs)/` Home / Floor / Profile.
- Partner setup: `app/partner/setup.tsx` (step state + slide motion).

## Data flow (current)

```
Customer screens → services/api.ts → EXPO_PUBLIC_API_BASE_URL
Partner screens  → services/partner.ts → same base
                      ↓
              backend/src/server.ts
                      ↓
              Prisma → Postgres (local cutly / optional Neon)
```

Dev hosts:

- Android emulator API: `http://10.0.2.2:4000/api`
- Expo Go / iPhone: Mac LAN IP, e.g. `http://192.168.1.11:4000/api` (`10.0.2.2` is emulator-only)
- Remote (Mac on): Cloudflare Tunnel → `https://api.cutly.buzz` once DNS points at the tunnel (domain currently on BigRock NS; needs CNAME or move to Cloudflare).
- Prefer `node ./node_modules/expo/bin/cli` and `node ./node_modules/.bin/tsx` (avoid `npx` deadlock in this agent shell).

## Key API groups

| Area | Routes (prefix `/api`) |
| --- | --- |
| Auth | `/auth/signup`, `/login`, `/google`, `/otp/*`, `/me`, `/profile` (name/email/gender/`dateOfBirth`/inviteCode). Google stores or links an email only when the token has `email_verified === true` and the CUTLY row’s `emailVerified` is already true (SEC-03). An unverified row holding that address loses it in the same transaction. Signup and profile edits leave `emailVerified` false. A unique-email clash on the first Google create is looked up once more. App refreshes `/auth/me` on launch. A 401 drops the saved login and returns to phone sign-in so the next OTP loads that number’s profile. |
| Partner | `/partner/signup` **403** (admin-only onboard). `/login` (rate-limited), `/shop` POST (setup) + **`PATCH /partner/shop`** (profile, no menu wipe), `PATCH /partner/shop/phone`, `/floor`, `/barbers` PATCH, `/amenities`, `GET|PUT /partner/hours`, `PATCH /partner/accepting`, `PUT /partner/services`, `/photos`, `/dashboard`, `/requests`, `/history`, booking respond/start/status, walk-ins, push, account DELETE |
| Admin (ops) | Header `x-admin-secret: $ADMIN_SECRET` (≥24 chars, rejects weak defaults). **`/api/admin/*` loopback-only** (`req.ip` 127.0.0.1 / ::1) + rate limit; escape hatch `ADMIN_ALLOW_REMOTE=1` only if needed. UI: `admin/` → `http://127.0.0.1:4000`. Keep-alive: `scripts/cutly-api.sh` / LaunchAgent. |
| Customer shops | `/shops?lat&lng&radiusKm&query&serviceName&openNow&kinds&serviceHints`, `/shops/:id`, `/services`, `/hours` (weekly), `/barbers`, `/reviews`, `/availability`. Shop cards include `kind`/`kinds`, open chips, ratings. |
| Partner setup | `POST /partner/shop` accepts `kinds[]` (multi) + optional `kind` primary + `productBrands[]` |
| Public leads | `POST /api/public/partner-leads` → `PartnerLead` + Resend (`PARTNER_LEAD_TO`). Marketing: **Cloudflare Pages** `cutly-www` → **`www.cutly.buzz`** + **`cutly.buzz`** (`npm run site:deploy`; Mac-independent). Tunnel = `api.cutly.buzz` only (Mac-on). `/partner-with-us` → `PARTNER_SITE_URL` |
| Bookings | `POST /bookings/hold`, `POST /bookings` (`serviceIds[]` + `payMode` shop\|app + `holdId` → awaiting or Razorpay), `POST /bookings/:id/confirm-payment`, `POST /bookings/:id/abandon-payment`, `GET /bookings`, `GET /bookings/:id` (details + `verifyPin` + shop lat/lng), `POST /bookings/:id/cancel`, `POST /bookings/:id/reschedule`, `POST /bookings/:id/review`. Availability accepts `serviceIds` comma list — duration = sum, buffer = max once at end. |
| Payments | Gate: `PAYMENT_PROVIDER` (`none` = skip checkout → `AWAITING_SHOP`; `razorpay` + keys = test WebView). Client copy: `EXPO_PUBLIC_PAYMENTS_ENABLED` |
| Push | `POST /push/register` (customer), `POST /partner/push/register` (shop) |
| Inbox | `GET /notifications`, `POST /notifications/:id/read`, `POST /notifications/read-all` — rows from `Notification` (persisted on every `notifyUser`, even without push token); optional JSON `data` for deep links / future coupons |
| Favourites | `GET /favourites`, `GET|POST|DELETE /favourites/:shopId` |
| Auth harden | CORS allowlist (`CORS_ORIGINS`); rate limit login / Google / OTP / partner-login / signup / hold / book / pay / admin. Buckets: Redis `INCR` + jittered `PEXPIRE` when `REDIS_URL` is set (window + 0–10%, max +60s); in-memory with the same jitter if Redis is unset or down for 30s. `clientKey` uses `req.ip` only (no spoofable XFF). Customer JWT requires `aud===customer`; partner verify uses `jwtSecret()` + HS256. API `handle()` → `toClientError` (no secret/Prisma leaks). |

## Domain rules

- One partner → one shop (`Shop.ownerPartnerId` unique).
- Open slots / concurrent visits capped at `min(workersPresent, chairsInUse)` for the IST day (`backend/src/staff.ts`). **CJ-22:** capacity 0 (e.g. Floor workers = 0) → no slots / hold / book / walk-in.
- **CJ-11 buffer:** `ShopService.durationMinutes` + `ShopService.bufferMinutes` are shop-level (default from catalogue at setup; editable in Shop settings). Slot search + clash use duration+buffer; stored `Booking.endsAt` stays service duration only. Breaks UI = `PS-05` / buffer polish `PS-12`.
- **Menu audience:** `ShopService.audience` (`MEN|WOMEN|KIDS|UNISEX`, default UNISEX); `PUT /partner/services` + setup accept optional `audience` (inferred from name if absent); returned on `GET /shops/:id/services` and partner shop `services[]`. Client `filterByAudience` prefers it. `/auth/me` + `PATCH /auth/profile` already carry `gender`. Mid-day menu PUT allows **1–120** on-shop lines (was 24).
- **Ops Menu save:** Missing partner Bearer → 401; over-cap → “Max 120…”; other Zod fails → “Check service name, time, and price.”
- **CJ-42:** `pricePaise >= 1` on setup/hold/book; free Consultation catalogue rows removed; migration deletes `ShopService` with `pricePaise <= 0`.
- **CJ-16:** one customer cannot create hold/book/reschedule overlapping another **active** ticket (`customerOverlap.ts`; COMPLETED and chair-free statuses do not block).
- **Home rails:** `GET /shops` also returns `menu: { name, pricePaise }[]` so a rail can show the minimum price of the matching service. `priceFromPaise` stays the shop minimum.
- **CJ-32/33:** `GET /shops?serviceName=` sets `priceFromPaise` + real `nextAvailableAt` (availability look-ahead 7 IST days). No `serviceName` → min price + next slot for shortest service. Each day loads chairs in one batch (`openWindowsForBarbers` + bookings/holds/walk-ins/breaks/leave), then splits slots in memory.
- **CJ-34/40:** `Review` has shop `rating` + `barberRating` + `barberId` (one per booking). `POST /bookings/:id/review` after `COMPLETED`; recompute `Barber.rating`. Shop cards use real avg or **`rating: null` / New** (no fake 4.8).
- **CJ-25:** on new request (`AWAITING_SHOP`), Expo push to shop `Partner.pushToken` via `backend/src/push.ts` with Android `channelId: shop_pings` (system default sound — omit channel `sound` string; `visits` for customer). Works app background/killed once token registered. Payload includes `bookingId` + `screen` for deep link. Customer pushes also **persist** a `Notification` row (`recordUserNotification`) for in-app Alerts.
- **CJ-51 visit PIN:** `Booking.verifyPin` (4 digits) created on book; customer `GET /bookings/:id` + details UI; partner `POST /partner/bookings/:id/start` with pin → ARRIVED (if needed) → `IN_SERVICE`. Direct `PATCH …/status` with `IN_SERVICE` rejected.
- Customer tabs: Home / Discover / Pay Bill / Visits / Profile. Pay Bill opens the how-to sheet, not a charge. Category explore uses `kinds` / `serviceHints`. Visits row → `app/booking/[id].tsx` (`ShopMapPreview` = live OSM Leaflet WebView → Directions via Google Maps `Linking`). Home bell + Profile → Notifications → `/notifications` Alerts inbox (unread badge).
- **Shop detail:** `app/shop/[id]/index.tsx` + menu `app/shop/[id]/menu.tsx`. `GET /shops/:id` returns `phone` (public contact), `amenities`, `productBrands`, `photos[]`, lat/lng. Contact tile dials `tel:` when set. Service browse groups via `constants/serviceCategories.ts` (name-match against `GET /shops/:id/services`).
- Partner History (`/partner/history`): client chips All / Accepted / Rejected / Missed / Cancelled (`utils/historyFilter.ts`).
- **Default place:** Bardhaman `23.2324, 87.8615` (`DEFAULT_PLACE`). Out-of-India GPS (emulator US) remapped on hydrate/select. **CJ-29:** Home/category explore `enabled: areaConfirmed` until Confirm/Change. **CJ-30:** stale saved pin (>2 km vs GPS) Alert once/session. **CJ-31:** sort = haversine km. **CJ-35:** `query` filter = flat substring; sort name → services → address → distance.
- Staff: named `Barber` rows (seeded `Staff 1..N` on setup); customer **Any barber** assigns first free staff at hold. Breaks/leave subtract from that barber’s slots.
- **Categories (CJ-71):** `ServiceCategory` + `Service.categoryId` (Ops). Admin catalogue APIs used from partner workspace **Menu** tab (not a separate nav). **One active `Service` per name** (dedupe + findOrCreate). Customer `GET /shops/:id/services` returns `categoryId`; tiles/sidebar only show categories present on that shop. `BOOKING_FREE_STATUSES` excludes COMPLETED (dashboard revenue/bars); `AVAILABILITY_FREE_STATUSES` includes COMPLETED (chairs).
- Booking requires auth + **customer phone** (soft-gate hold/book if missing). Review booking is hold-free; **Pay now** creates the **8‑minute** `BookingHold` then books → **`AWAITING_SHOP`**. Partner Requests: Accept → `CONFIRMED`; Reject → `REJECTED` + refund and chair frees immediately (`REJECTED`/`NO_SHOW` in EXCLUDE free list). Past start still awaiting → `EXPIRED` + refund. At `startsAt` if still `CONFIRMED` → “Waiting time started” push. No-show / partner reschedule after **`startsAt + 5m`**; Floor Call on accepted visits.
- **Reschedule:** only from `CONFIRMED`; after new slot → back to `AWAITING_SHOP` (shop must Accept again). Customer cancel/reschedule pings partner.
- **Advance (CJ-02):** `advancePaise = round(totalPaise * 0.3)` on server (`backend/src/money.ts`); client `utils/money.ts` matches for display; Razorpay amount always from server booking row.
- **Idempotency (CJ-12/13):** `POST /bookings` requires `idempotencyKey`; bound to user as `book_{userId}_{…}` including **shop + service + barber + start**. Client sends stable intent from review. Retry after drop returns existing `CONFIRMED` / refreshes `PAYMENT_PENDING` order (Razorpay amount = `booking.advancePaise`); `FAILED`/`EXPIRED`/`CANCELLED`/`REJECTED` rows for that key are cleared; **`COMPLETED`/`NO_SHOW` archive** the key (`archived_<bookingId>`) so Any-barber can rebook the same slot. Client invalidates `['bookings']` after confirm (CJ-24).
- **No double-book:** Postgres `EXCLUDE` (`booking_barber_no_overlap`, `hold_barber_no_overlap` via `btree_gist`) + Serializable transactions on hold/confirm (`backend/src/race.ts`). **`COMPLETED` is free** in EXCLUDE (same as cancel/reject/no-show) so early Done frees the chair for rebook.
- **Cancel / reschedule (CJ-15):** confirmed upcoming only. Cancel ≥12h before start → mock advance `REFUNDED`; within 12h shop keeps advance; chair frees immediately. Reschedule uses a new hold, no second payment.
- **Floor status (CJ-17 / CJ-51):** partner advances live visits `CONFIRMED → ARRIVED → IN_SERVICE → COMPLETED` (or `NO_SHOW`). **Start service** requires customer `verifyPin` via `POST /partner/bookings/:id/start` (not bare PATCH to `IN_SERVICE`). Dashboard returns `visits` + allowed actions.
- **Walk-ins (CJ-23):** `WalkIn` rows (`ACTIVE` / `COMPLETED` / `CANCELLED`) occupy a barber + chair like bookings. Floor `POST /partner/walk-ins` starts now (15/30/45/60 min); Done/Cancel frees the chair. Active walk-ins feed availability, capacity, and hold/book clash checks; Postgres `walk_in_barber_no_overlap` EXCLUDE on active rows.
- Nearby listing: `setupDone && isActive`, haversine filter, sorted by distance.
- Success UX: `components/SuccessOverlay.tsx` (Reanimated coral check — not Lottie plugin).
- **Timezone:** all booking calendar days and display times use **Asia/Kolkata**. Server: `backend/src/ist.ts`. Client: `utils/time.ts`. Never build day keys with UTC `toISOString().slice(0,10)`.
- **Booking window:** customer day strip = **7 IST days** from today (`bookingDayOptions(7)`).
- **Shop hours:** `ShopWorkingHours.weekday` is **0=Sunday … 6=Saturday** (IST). Slots = shop hours ∩ barber hours for that day (`backend/src/hours.ts`). Missing weekday row → closed (no slots). New shops get default Mon–Sun **10:00–21:00** via `ensureDefaultShopHours`. **PS-01** setup hours; mid-day edit = Floor/Profile **Shop settings** (`/partner/settings`, contact phone + hours + menu). **Availability (Home toggle):** `acceptingAppointments` false = closed until partner turns on (`temporary`). **`acceptingPausedUntil`** = end of today’s shop hours IST = no new **today** slots/holds until then (`today`); future days still bookable. Customer `loadOpenStatusForShops` treats either as not bookable now; shop stays listed; Floor tickets unchanged.
- Shop list/detail return `isOpen`, `hoursChip`, `hoursDetail` from today’s IST hours; `GET /shops?openNow=true` filters to open shops only.

## Persistence notes

- Filesystem on Render is ephemeral; DB holds truth.
- Do not commit `.env` or secrets. Do not print `DATABASE_URL` / JWT / Twilio in chat.

---

*Update when routes, tables, session rules, or deploy topology change.*
