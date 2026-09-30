# CUTLY project index

Customer app for finding a barber shop, seeing today's slots, and booking with a 30% advance. Product name in code and stores: **CUTLY**. Package name: `cutly` `0.1.0`. Native ids: `com.cutly.app`. Deep link scheme: `cutly`. Default city in the UI and seed data: **Burdwan**, timezone `Asia/Kolkata`. Money is stored as integer **paise**.

This file is a map of the repo as it exists. Use it before changing a screen, the API, or the schema.

## How the pieces fit

```
Phone OTP (local) → Home / Explore / Shop / Booking / Review / Confirmed
                         │
                         ▼
              services/api.ts   (in-memory mock, always used by the app)
                         │
                         ▼  intended, not connected
              backend/src/server.ts  :4000
                         │
                         ▼  intended, not connected
              prisma/schema.prisma  →  PostgreSQL
```

The app runs without the API or a database. `services/api.ts` never calls `fetch`. `API_BASE_URL` is stored on the client object and unused. The Express server does not import Prisma. Seed ids (`seed-urban-cuts`, `seed-rahul`, `seed-haircut`) do not match the mock ids (`shop_urban`, `barber_rahul`, `svc_haircut`).

## Runnable surfaces

| Command | What it does |
| --- | --- |
| `npm start` / `npx expo start` | Expo Router app. Entry is `expo-router/entry`. |
| `npm run android` / `npm run ios` | Native run after prebuild. |
| `npm run web` | Expo web. |
| `npm run backend:dev` | `tsx watch backend/src/server.ts` on `PORT` or `4000`. |
| `npm run db:generate` / `db:migrate` / `db:seed` | Prisma client, migrate, seed. |
| `npm test` | Vitest. Two unit tests only. |

To aim the client at the server later, set `EXPO_PUBLIC_API_BASE_URL` (Android emulator: `http://10.0.2.2:4000/api`). `.env.example` only documents `API_BASE_URL`, `DATABASE_URL`, and empty slots for payment, maps, and push. There is no `prisma/migrations` directory yet.

## Screen map (Expo Router)

| Route | File | Behavior today |
| --- | --- | --- |
| `/` | `app/index.tsx` | Redirects to `/(tabs)` if `accessToken` is set, else `/auth`. Token is memory-only, so a reload always returns to auth. |
| `/auth` | `app/auth.tsx` | Phone, then any OTP. Sets token `development-session`. No server call. |
| `/(tabs)` Home | `app/(tabs)/index.tsx` | Search filters `api.shops`. Location is hardcoded. ASAP card opens Explore. Quick picks set the search string. |
| `/(tabs)/explore` | `app/(tabs)/explore.tsx` | Same shop list. Only **Open now** is wired. Earliest, Nearest, and Price are visual. |
| `/(tabs)/bookings` | `app/(tabs)/bookings.tsx` | Static empty state. Does not call `api.bookings()`. |
| `/(tabs)/profile` | `app/(tabs)/profile.tsx` | Shows session phone. Menu rows have no navigation. Log out clears the session. |
| `/shop/[id]` | `app/shop/[id].tsx` | Hero, services, tags. Heart is inert. Booking a service opens `/booking`. Hours string is hardcoded "Closes at 9:00 PM". |
| `/booking` | `app/booking.tsx` | Barber (or "Any") and today's slots. Continue calls `api.createHold`, then `/booking/review`. "Any barber" is rewritten to `barber_rahul` in the next route params. Date picker is today only. |
| `/booking/review` | `app/booking/review.tsx` | 30% advance via `advanceFor`. Pay calls `api.createBooking` (mock, immediately confirmed). |
| `/booking/confirmed` | `app/booking/confirmed.tsx` | Reads query params. "View my bookings" lands on the empty Bookings tab. "Get directions" is text only. |

Root layout: `app/_layout.tsx`. TanStack Query defaults: `staleTime` 30s, `retry` 2, refetch on focus. Header hidden. Stack background `colors.canvas`.

Tab bar: `app/(tabs)/_layout.tsx`. Home, Explore, Bookings, Profile.

## Shared app code

| Path | Role |
| --- | --- |
| `services/api.ts` | Only data boundary the screens use. Mock shops, services, barbers, 30-minute slots from 10:00 local, 5-minute hold, confirmed booking `CU-4H7K2`. `bookings()` always returns `[]`. |
| `types/domain.ts` | Client types: `Shop`, `Service`, `Barber`, `AvailabilitySlot`, `Booking`, `BookingStatus`. Client status omits server `FAILED`. Client has no payment type. |
| `store/useSessionStore.ts` | Zustand: `accessToken`, `phone`, `setSession`, `clear`. Not persisted. `expo-secure-store` is installed and listed in `app.json` plugins, and is unused. |
| `constants/theme.ts` | `colors`, `spacing`, `radii`, `typography`. Ink `#101112`, lime `#C9F35A`, orange `#F47B4A`, canvas `#F7F7F4`. |
| `utils/money.ts` | `formatINR(paise)`, `advanceFor` = `ceil(total * 0.3)`. |
| `utils/time.ts` | `formatTime`, `formatDate` with `en-IN`. |
| `components/ShopCard.tsx` | Shop row. Next slot label uses `formatTime` on an ISO timestamp (clock time, not "in 12 min"). |
| `components/PrimaryButton.tsx` | Ink button, lime label. |
| `components/SectionTitle.tsx` | Heading plus optional orange action text. Action is not a button. |
| `tsconfig.json` | `strict`, path `@/*` → repo root. Extends `expo/tsconfig.base`. |

Mock catalog in `services/api.ts`: Urban Cuts, Blend Studio, Classic Gents. Services: Haircut 30m ₹350, Haircut + Beard 45m ₹500, Beard trim 20m ₹220. Barbers: Rahul, Aman.

## Backend

Express 5 in `backend/src/server.ts`. CORS open, JSON body. Listens unless `NODE_ENV=test`.

| Method | Path | Contract |
| --- | --- | --- |
| `GET` | `/health` | `{ status: 'ok', service: 'cutly-api' }` |
| `GET` | `/api/shops` | `{ data: [] }` — stub, ignores query. |
| `GET` | `/api/shops/:id/availability` | Query: `date` (`YYYY-MM-DD`, default today UTC slice), `durationMinutes` (default 30). Builds a 10:00–21:00 window in `+05:30` and runs `calculateSlots`. Ignores shop id, barber, service, and the database. |
| `POST` | `/api/bookings/hold` | Zod: `shopId`, `serviceId`, `startsAt` datetime, optional `barberId`, `idempotencyKey` min 8. Returns a 5-minute `HELD` hold. Nothing is stored. |
| `POST` | `/api/payments/create` | Zod: positive `amountPaise`, `bookingId`, `idempotencyKey` min 8. `MockPaymentProvider` returns `CAPTURED` immediately. |
| `POST` | `/api/payments/webhook` | Header `x-payment-signature`. Mock always reports captured. |

### Availability (`backend/src/availability.ts`)

`calculateSlots({ shop, barber, breaks, leave, bookings, holds, durationMinutes, bufferMinutes, intervalMinutes })`.

- Step defaults to 30 minutes. Duration is service plus buffer.
- Cursor walks **barber** open window.
- A slot is kept only if it overlaps the **shop** window and does not overlap a break, leave, booking, or hold.
- Overlap is half-open: `a.start < b.end && b.start < a.end`.
- Test: `tests/availability.test.ts` — 10:00–18:00, 30-minute service, blocks 12:00 booking and 13:30 break, last slot ends at 18:00.

The shop window is an allowed range, not a block. A slot can be returned if it only partially overlaps shop hours, as long as it fits inside barber hours.

### Booking states (`backend/src/bookingState.ts`)

```
AVAILABLE → HELD → PAYMENT_PENDING → CONFIRMED → ARRIVED → IN_SERVICE → COMPLETED
                       │                  │
                       ├─ FAILED          ├─ CANCELLED → REFUNDED
                       └─ EXPIRED          └─ NO_SHOW
HELD → EXPIRED
```

`canTransition` / `assertTransition`. Terminal: `COMPLETED`, `EXPIRED`, `FAILED`, `NO_SHOW`, `REFUNDED`. Prisma `BookingStatus` has the same names except `AVAILABLE` and `REFUNDED` (those live only in this state machine). Client `BookingStatus` also drops `FAILED`. Test: `tests/bookingState.test.ts`.

### Payments (`backend/src/payment.ts`)

`PaymentProvider`: `createPayment`, `verifyPayment`, `handleWebhook`, `refundPayment`. `MockPaymentProvider` captures immediately, verifies true, refund is a no-op. Status enum matches Prisma `PaymentStatus`.

## Data model (`prisma/schema.prisma`)

PostgreSQL. Ids are `cuid()` except seed rows that pass explicit ids.

- **User** — unique `phone`, optional email/name. Bookings, favourites, reviews, saved locations.
- **SavedLocation** — label, address, lat/lng decimals.
- **Shop** — address, city, lat/lng, `timezone` default `Asia/Kolkata`, `isActive`. Images, hours, barbers, services, bookings, favourites, reviews.
- **ShopWorkingHours** — weekday 0–6, `opensAt` / `closesAt` strings, unique per shop+weekday.
- **Barber** — shop, name, rating. Hours, breaks, leave, bookings.
- **BarberWorkingHours**, **BarberBreak**, **BarberLeave** — breaks and leave are datetimes, indexed by barber + start.
- **Service** — name, `durationMinutes`, `bufferMinutes`, `active`.
- **ShopService** — price in paise, composite id shop+service.
- **Booking** — user, shop, barber, start/end, status, `totalPaise`, `advancePaise`, unique `bookingCode`, unique `idempotencyKey`. Indexes: barber time range, user createdAt.
- **BookingService** — snapshot of price and duration.
- **BookingPayment** — one per booking, provider id, amount, status.
- **BookingHold** — user/shop/barber window, `expiresAt`, unique idempotency key. Not tied to a Booking row.
- **FavouriteShop**, **Review** (one per booking), **Notification** (no relation back to User).

`prisma/seed.ts` upserts one haircut, Urban Cuts (DEV) at 23.2324, 87.8615, price 35000 paise, barber Rahul. No hours, breaks, images, or user.

## What is intentionally unfinished

Called out in `README.md` and visible in code:

- OTP provider and server auth middleware.
- Point `services/api.ts` at the REST API and persist shops, holds, bookings, payments through Prisma.
- Real `PaymentProvider` (server-created, signature-checked, webhook, idempotent). Do not ship `MockPaymentProvider`.
- Persist the session (`expo-secure-store` is already a dependency).
- Bookings list, favourites, saved locations, notifications.
- Maps and push (env keys exist, no client code).
- Explore sort chips, shop hours from data, date selection, directions.
- Align mock ids with seed ids before switching the client off mocks.
- Integration tests for hold races, payment webhooks, and the booking flow.
- Image storage. Shop photos are Unsplash URLs in the mock only.

`android/` and `ios/` are Expo prebuild output (`npx expo prebuild`). README says they are not part of the managed source of truth. They are present in the working tree. `.gitignore` does not ignore them. App config that should be edited lives in `app.json` and `eas.json` (development, preview, production profiles; no env or credentials in `eas.json`).

## Not part of the Expo app

`src/App.tsx`, `src/main.tsx`, `src/index.css`, `src/vite-env.d.ts`, `src/assets/cutly-logo.png`, `src/imports/9.png` are a separate web splash/login prototype. `package.json` has no Vite script and does not point `main` at `src/`. Leave it out of mobile changes unless a web prototype is explicitly in scope.

`opencode.jsonc` only sets the OpenCode schema. It does not configure the app.
