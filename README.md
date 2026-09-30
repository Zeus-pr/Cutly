# CUTLY

Customer-facing barber discovery, live availability and instant booking.

## What is implemented

- Premium Expo/React Native customer app with Home, Explore, Bookings and Profile tabs.
- Phone + OTP session flow (development OTP implementation is explicitly local; production OTP provider is an extension point).
- Nearby discovery, debounced-ready search boundary, ASAP entry point, shop detail and service selection.
- Barber selection, server-shaped availability query, booking hold, review and confirmed booking flow.
- TanStack Query caching/refetch defaults, secure-session store boundary, safe-area layouts, fast inline states and a centralized CUTLY design system.
- PostgreSQL/Prisma schema covering customers, shops, staff schedules, breaks, leave, services, holds, bookings, payments, reviews and notifications.
- Backend availability engine, booking state machine, idempotency-shaped hold/payment endpoints and provider abstraction.
- Development seed data and unit tests for slot calculation and state transitions.

The mobile API service has a clearly labelled development implementation so the app is runnable before credentials and a database are available. It must be replaced/configured through `API_BASE_URL` before production use; payment is currently a mock provider and is not represented as live payment integration.

## Architecture

`app/` uses Expo Router. `components/` contains reusable visual primitives. `services/api.ts` is the mobile data boundary. `backend/src/` contains the REST server, availability calculation, booking transition rules and `PaymentProvider` contract. `prisma/schema.prisma` is the future-barber-app-ready relational model.

## Prerequisites

- Node.js 20+
- Android Studio with an API 35 emulator for Android
- Xcode 16+ for iOS (macOS only)
- PostgreSQL 15+ for backend persistence

## Local setup

```bash
npm install
cp .env.example .env
npx prisma generate
npx prisma migrate dev --name init
npm run db:seed
npm run backend:dev
```

In a second terminal:

```bash
npx expo start
# press a for Android or i for iOS
```

The current mobile development data is available without the API server. To point the client at the REST server, set `EXPO_PUBLIC_API_BASE_URL` in `.env` to the reachable emulator URL (Android emulator usually uses `http://10.0.2.2:4000/api`).

## Android Studio

```bash
npx expo prebuild
npx expo run:android
```

Or open `android/` in Android Studio, start an emulator, sync Gradle and run the `app` configuration. `android/` and `ios/` are generated artifacts and are intentionally not committed in this initial managed Expo foundation; run prebuild before opening them.

## Payments, maps and notifications

Payment is intentionally behind `PaymentProvider`; `MockPaymentProvider` is suitable only for local flow testing. Before enabling a real provider, configure server-side credentials and implement server-created, signature-verified, webhook-confirmed and idempotent operations. Maps and push notifications have environment slots in `.env.example` but are not claimed as configured integrations.

## Testing and builds

```bash
npm test
npx expo export --platform android
npx eas build --platform android --profile preview
npx eas build --platform android --profile production
npx eas build --platform ios --profile production
```

## Required production work

Configure an OTP provider, production PostgreSQL, a real payment provider, image storage/CDN, push credentials, maps provider and server authentication middleware. Complete REST persistence wiring in the mobile API adapter, integration/race-condition/E2E tests, legal copy and production observability before public release. No secrets belong in this repository.
# Cutly
# Cutly
