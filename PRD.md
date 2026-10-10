# CUTLY — Product requirements (PRD)

**Product:** CUTLY  
**Package:** `com.cutly.app` · Expo SDK 57 · deep link `cutly`  
**Owner context:** Local barber / beauty booking for Burdwan (Bardhaman) and nearby India. Money in **paise**. Timezone **Asia/Kolkata**.

## Problem

Customers need a fast way to find a nearby chair and book with a small advance. Shop owners need a simple floor and bookings view without a desktop CMS.

## Audiences

| Audience | Account | App entry |
| --- | --- | --- |
| **Customer** | `User` table | Launch → customer auth → tabs |
| **Partner** | `Partner` table (separate from User) | Customer auth → **Already a partner** → partner sign-in → setup → partner tabs |

Same email may exist in both tables. JWT `aud` is `customer` | `partner` so tokens cannot cross. **No in-app partner signup** — new shops apply on the public Partner With Us site; ops creates the account.

## Customer outcomes

1. After Get Started, land on customer sign-in (phone / email / Google). Footer: **Become a partner** (opens website) and **Already a partner** (partner sign-in).
2. Sign in (email/password, phone OTP, Google where native build allows). OTP can attach phone to an already signed-in email/Google account.
3. Set location (GPS, search, saved places). Default area if GPS missing: **23.2324, 87.8615** — user must **confirm** (or change pin) before Home/Explore list loads. If a **saved** pin is far from current GPS, prompt keep vs switch.
4. See **nearby shops** that finished partner setup (`setupDone`). Sort by **distance (km)** / earliest slot / price — not drive-time ETA.
5. Open shop (Luzo-style detail) → **Services** category tiles → **menu** screen (side category rail + accordion groups) → **multi-select services** → **Go to cart** → staff → slot → **Book appointment** → bottom sheet **Pay at shop** or **Pay from app** (30% Razorpay when enabled; currently off) → 8‑minute hold starts on pay choice → awaiting shop → partner Accept. Package = one continuous time block (sum durations, one buffer at end). One customer cannot hold overlapping active tickets. Category tile photos + richer About/Gallery copy = placeholders until partner assets.
6. After booking (pay-at-shop or after in-app pay), land on **Booking details** (`/booking/[id]`) with status + **4-digit visit code**. Also via **My Visits** list. Map preview → Google Maps directions, cancel / reschedule / rate. After **Completed**, rate **shop + that visit’s staff member**. Book up to **7 IST days** ahead.
7. Device notification on payment / shop decision / missed slot / cancel / service start — works with app **background or killed** once Expo push token is registered (dev/custom APK on Android; not Expo Go Android). Same events land in in-app **Alerts** (`/notifications`) even without a push token.
8. Profile: name, phone, dark mode, **favourite shops**, Alerts, logout.
9. Home / search: service chip or search service drives **Price** and **Earliest** (real next slot + that service’s price). Search is **shop-name first**, then live menu services (flat substring). No fake shop ratings — show **New** until reviews exist. **No ₹0 services.**

## Partner outcomes

1. Sign in separately from customer (no create-account in the app). New shops use the Partner With Us website; **ops onboards via local Admin portal** (`admin/` → create account + full shop/menu/hours/staff/photos + **Global catalogue**) then hands email/password. Partner app is day-ops (Floor / Requests); in-app setup remains as fallback if `setupDone` is false. Ops owns the **global** category→SKU tree (same tiles as customer); shops only surface categories they offer; partners edit names/prices/audience, not which tile a SKU sits under.
2. Partner self-setup (fallback / legacy) is still one-question-per-step:
   - Shop name → location → **shop kind** → **services** → chairs → workers → features → photos.
   - Weekly **open hours** in setup (skippable → defaults). Mid-day: Floor **Shop settings** (phone, hours, menu). Home **Open for appointments** toggle. **Later (`PS-*`):** breaks/leave, landmark, object-storage photos.
3. Partner home: **Open for appointments** switch; badge button → **Requests** (all days, slide Accept/Reject; auto-poll + push so no manual refresh), metrics (**Collected** / **Remaining** / **Advance**); **History** for past (incl. missed) with All / Accepted / Rejected / Missed / Cancelled filters. Floor: **Shop settings**; Call customer; enter customer **4-digit visit code** to start service; **Done** completes the visit and collects remaining into Collected; No-show/Reschedule after start+5m.
4. Bottom tabs: **Home · Floor · Profile** (same expanding capsule as customer).
5. Floor: seat walk-ins (blocks that staff’s timeline + shop capacity), advance booking status, and change today’s workers/chairs in use (open slots = min of the two; **0 workers closes new bookings**; lowering does not cancel confirmed bookings). Push ping on new booking request when partner registered for notifications (phone banner with app closed). Unanswered requests past slot start → missed (no Accept/Reject).
6. Service turnover: default **10 min** buffer between customers (0 for consultations); editable in Shop settings (shop-level duration/buffer/price).
7. Profile: dark/light, **Shop settings**, shop features/photos, logout, **delete partner account**. Floor: add/remove/rename staff + Shop settings. Home metrics: **Advance** + **Remaining**.
8. Shops that want to be listed can submit a phone on the public **Partner With Us** page. Lead lands in Postgres + email to ops; convert in Admin portal — does not auto-create a Partner account.

## Shop kinds & catalogues

`BARBER` | `SALON` | `PARLOUR` | `TATTOO` | `PIERCING` — lists in `constants/catalogue.ts`.

## Non-goals (for now)

- Live payment provider (real capture / settle) — Razorpay **test** exists but is often toggled **off** for direct awaiting-shop.
- Deep staff roster (add/remove count, per-barber hours) — named Staff 1..N + Floor rename already ship; see TASKS PS-04.
- Partner review moderation UI (customer reviews ship; partner surface = PS-24).
- Customer ↔ partner chat.
- Full multi-page marketing site (only Partner With Us lead page for now).
- Free / ₹0 catalogue services.

## Success metrics (product)

- Existing partner can sign in → setup (if needed) → home in one session.
- Customer near a setup shop sees it within ~25–30 km.
- Booking appears in Visits and triggers a notification (partner ping with sound even if app closed, once push registered).

---

*Update this file when product scope, audiences, or must-have flows change. See `.cursor/rules/cutly-knowledge-docs.mdc`.*
