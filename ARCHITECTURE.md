# CUTLY — Architecture

## Stack

| Layer | Choice |
| --- | --- |
| App | Expo Router ~57, React Native 0.86, React 19, Reanimated 4, TanStack Query |
| API | Express on `0.0.0.0:$PORT` (default **4000**), `tsx watch` |
| DB | Neon Postgres · Prisma 6 · migrations under `prisma/migrations/` |
| Auth | JWT (`JWT_SECRET`), bcrypt passwords, Twilio OTP hooks, Google ID token |
| Push | `expo-notifications` (local + Expo push token on `User.pushToken`) |

## Repo layout

```
app/                    Expo Router screens (customer + partner)
components/             UI (ExpandingTabBar, SuccessOverlay, ShopCard, …)
constants/              theme.ts, catalogue.ts
services/               api.ts, auth.ts, partner.ts, notifications.ts, device-location.ts
store/                  useSessionStore, usePlaceStore, useThemeStore
backend/src/            server.ts, auth.ts, partner.ts, customer.ts, availability.ts, …
prisma/                 schema + migrations
```

## Session & routing

- SecureStore keys: `cutly.accessToken`, `cutly.partnerToken`, `cutly.audience` (only after sign-in), theme, place, partner setup flag.
- **Audience is session-only until sign-in.** Cold start without a token → `/role`.
- Gate: `app/_layout.tsx` `SessionGate`.
- Customer tabs: `app/(tabs)/` Home / Explore / Bookings / Profile.
- Partner tabs: `app/partner/(tabs)/` Home / Floor / Profile.
- Partner setup: `app/partner/setup.tsx` (step state + slide motion).

## Data flow (current)

```
Customer screens → services/api.ts → EXPO_PUBLIC_API_BASE_URL
Partner screens  → services/partner.ts → same base
                      ↓
              backend/src/server.ts
                      ↓
              Prisma → Neon
```

Dev hosts:

- Android emulator API: `http://10.0.2.2:4000/api`
- iPhone Expo Go (same LAN/hotspot): `http://172.20.10.2:4000/api` + Metro `exp://172.20.10.2:8081`
- Prefer `node ./node_modules/expo/bin/cli` and `node ./node_modules/.bin/tsx` (avoid `npx` deadlock in this agent shell).

## Key API groups

| Area | Routes (prefix `/api`) |
| --- | --- |
| Auth | `/auth/signup`, `/login`, `/google`, `/otp/*`, `/me`, `/profile` |
| Partner | `/partner/signup`, `/login`, `/shop`, `/floor`, `/amenities`, `/photos`, `/dashboard`, `/account` DELETE |
| Customer shops | `/shops?lat&lng&radiusKm&query`, `/shops/:id`, `/services`, `/barbers`, `/availability` |
| Bookings | `POST /bookings`, `GET /bookings`, hold stub |
| Push | `POST /push/register` |

## Domain rules

- One partner → one shop (`Shop.ownerPartnerId` unique).
- Open slots today ≈ `min(workersPresent, chairsInUse)`.
- Booking requires auth; creates `Booking` + `BookingService` + mock `BookingPayment` CAPTURED; ensures a floor barber (`Any chair`) if none.
- Nearby listing: `setupDone && isActive`, haversine filter, sorted by distance.
- Success UX: `components/SuccessOverlay.tsx` (Reanimated teal check — not Lottie plugin).

## Persistence notes

- Filesystem on Render is ephemeral; DB holds truth.
- Do not commit `.env` or secrets. Do not print `DATABASE_URL` / JWT / Twilio in chat.

---

*Update when routes, tables, session rules, or deploy topology change.*
