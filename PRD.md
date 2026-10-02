# CUTLY — Product requirements (PRD)

**Product:** CUTLY  
**Package:** `com.cutly.app` · Expo SDK 57 · deep link `cutly`  
**Owner context:** Local barber / beauty booking for Burdwan (Bardhaman) and nearby India. Money in **paise**. Timezone **Asia/Kolkata**.

## Problem

Customers need a fast way to find a nearby chair and book with a small advance. Shop owners need a simple floor and bookings view without a desktop CMS.

## Audiences

| Audience | Account | App entry |
| --- | --- | --- |
| **Customer** | `User` table | Role → welcome → auth → tabs |
| **Partner** | `Partner` table (separate from User) | Role → partner auth → setup → partner tabs |

Same email may exist in both tables. JWT `aud` is `customer` | `partner` so tokens cannot cross.

## Customer outcomes

1. Choose role each visit until signed in.
2. Sign in (email/password, phone OTP, Google where native build allows).
3. Set location (GPS, search, saved places). Default area if GPS missing: **23.2324, 87.8615**.
4. See **nearby shops** that finished partner setup (`setupDone`).
5. Open shop → pick service → barber/chair → today’s slot → pay **30% advance** (mock capture today) → confirmed.
6. See bookings on Bookings tab.
7. Get a **device notification** after successful booking.
8. Profile: name, dark mode, logout.

## Partner outcomes

1. Sign up / sign in separately from customer.
2. One-question-per-step setup (no marketing slides between questions):
   - Shop name → location → **shop kind** → **services** (catalogue for that kind) → chairs → workers today → features (skippable) → photos max 5 (skippable).
3. Partner home: metrics, hourly bookings chart, next customer, revenue / peak / open chairs / floor load.
4. Bottom tabs: **Home · Floor · Profile** (same expanding capsule as customer).
5. Floor: change today’s workers and chairs in use (open slots = min of the two; lowering does not cancel confirmed bookings).
6. Profile: dark/light, shop features/photos, logout, **delete partner account** (shop + related data).

## Shop kinds & catalogues

`BARBER` | `SALON` | `PARLOUR` | `TATTOO` | `PIERCING` — lists in `constants/catalogue.ts`.

## Non-goals (for now)

- Live payment provider (Razorpay etc.) beyond mock capture.
- Named staff roster (counts only; named barbers later).
- Customer ↔ partner chat.
- Web marketing site as primary product surface.

## Success metrics (product)

- Partner can go role → setup → home in one session.
- Customer near a setup shop sees it within ~25–30 km.
- Booking appears in Bookings and triggers a notification.

---

*Update this file when product scope, audiences, or must-have flows change. See `.cursor/rules/cutly-knowledge-docs.mdc`.*
