# CUTLY — Tasks

Status: `[ ]` missing · `[~]` **needed now** · `[/]` partial · `[x]` done · `[P]` parked (gateway)

Say **“do CJ-xx”** or **“do PS-xx”**. One item at a time.

---

## Conflicts (resolve before coding the wrong thing)

| # | Conflict | Reality today | Decision to follow |
|---|----------|---------------|--------------------|
| C1 | **Payments on vs off** | `PAYMENT_PROVIDER=none` + `EXPO_PUBLIC_PAYMENTS_ENABLED=0` → Pay now → hold → **direct `AWAITING_SHOP`** (no Razorpay). | Keep **off** for daily testing. Re-enable Razorpay test only when you ask. **CJ-01 / 39 / 47** stay parked. |
| C2 | **PRD “pay 30% Razorpay”** vs payments-off path | Code supports both. | Payments-off is the active path; Razorpay test is optional toggle. |
| C3 | **Named staff depth** | Rename shipped; add/remove + per-barber hours still open (**PS-04**). | Deep roster = PS-04. |
| C4 | **Hold timing** | Review is hold-free; **Pay now** starts 8m `BookingHold`. | Do not recreate hold on Continue / review mount. |
| C5 | **Customer vs partner reschedule** | Customer reschedule → `AWAITING_SHOP` again. Partner same-day reschedule (after +5m) stays **`CONFIRMED`**. | Intentional — don’t unify without asking. |
| C6 | **Buffer vs EXCLUDE** | `bufferMinutes` in slot/clash math; **not** inside Postgres EXCLUDE gist. `COMPLETED` **is** free in EXCLUDE (CJ-69). | App-layer buffer OK unless buffer-edge double-book appears. |
| C7 | **CJ-25 notify target** | Push fires on **new request** (`AWAITING_SHOP`). | Partner Requests is source of truth. |

---

## Needed now `[~]`

| # | ID | Status | Issue | Why now | Code today |
|---|-----|--------|-------|---------|------------|
| 1 | **PS-01** | [x] | Setup: weekly **open hours** | — | Skippable → 10:00–21:00 |
| 2 | **PS-02** | [x] | Mid-day **Shop settings** | — | Floor + Profile → hours + menu |

---

## Security backlog (SEC) — 2026-10-07 audit

Trackable IDs from holistic review. Canvas: open beside chat. Say **“do SEC-xx”**.

| ID | Sev | Status | Issue |
|----|-----|--------|-------|
| **SEC-01** | Critical | [x] | Admin loopback-only + strong secret (rotated; rejects weak default) |
| **SEC-02** | High | [x] | `clientKey` / lead IP use `req.ip` only (no spoofable XFF) |
| **SEC-03** | High | [x] | Google links an email only when Google verified it and the CUTLY profile’s `emailVerified` is already true. A typed address is not linked; a different `googleSub` is not replaced |
| **SEC-04** | High | [x] | Public `/partner/signup` → 403; partner login rate-limited |
| **SEC-05** | High | [x] | Admin: rate limit + `timingSafeEqual` + 401 |
| **SEC-06** | High | [x] | `handle()` → `toClientError`; client +not-found / ErrorBoundary Lottie cat |
| **SEC-07** | High | [ ] | Photos as `data:` URLs + 8MB JSON |
| **SEC-08** | Medium | [x] | Signup IP rate limit + uniform “could not create” message |
| **SEC-09** | Medium | [x] | Hold / book / confirm-payment / abandon rate-limited |
| **SEC-10** | Medium | [x] | Customer `aud===customer`; partner uses `jwtSecret()` + HS256 |
| **SEC-11** | Medium | [ ] | Payments-off can mark CAPTURED; `/health` exposes flags |
| **SEC-12** | Medium | [ ] | No Helmet; `CORS_ORIGINS=*` allowed |
| **SEC-13** | Medium | [ ] | WebView `originWhitelist=['*']` |
| **SEC-14** | Medium | [ ] | Git hygiene: bundles / google-services / debug.keystore |
| **SEC-15** | Medium | [ ] | Personal email in `.env.example` |
| **SEC-20** | Low | [x] | Redis rate-limit buckets with jittered TTL (`REDIS_URL`); memory fallback if unset |
| **SEC-16**–**19**, **21** | Low/Info | [ ] | OTP/PIN/HMAC/JWT TTL/MockPayment |
| **SEC-22**–**26** | OK | [x] | SQLi OK · IDOR scoped · bcrypt · SecureStore · `.env` ignored |

**Wave 1:** [x] SEC-01 / 02 / 04 / 05. **Wave 2:** [x] SEC-03 / 06 / 08–10. Next **Wave 3** hygiene.

---

## Shipped — booking truth + confirm + explore honesty

| ID | Status | Issue | Code today |
|----|--------|-------|------------|
| **CJ-05** | [x] | Calendar date picker | IST 14-day strip; slots refetch by day |
| **CJ-06** | [x] | Hide + reject past starts | Server + client |
| **CJ-07** / **CJ-08** | [x] | Asia/Kolkata build + display | `ist.ts` + formatters |
| **CJ-09** / **CJ-10** | [x] | Real hours + closed honesty | `ShopWorkingHours`; Open now filter |
| **CJ-03** | [x] | 8-min hold on barber | Hold on **Pay now** (not review) |
| **CJ-04** | [x] | Double-book race | EXCLUDE + Serializable; REJECTED/NO_SHOW free |
| **CJ-14** | [x] | Cancelled/rejected don’t block rebook | Free statuses include REJECTED/NO_SHOW/**COMPLETED** (EXCLUDE + intent archive) |
| **CJ-69** | [x] | Any barber after Done / same intent | Archive COMPLETED/NO_SHOW keys; EXCLUDE frees COMPLETED (was false “payments off”) |
| **CJ-70** | [x] | Visit details header + no per-SKU minutes | Title “Visit details”; menu/cart/details show name + price only |
| **CJ-71** | [x] | Ops global category → SKU tree | Partner **Menu** tab = category→SKU + on-shop toggle; `Service.categoryId`; shop tiles only offered cats; auto-migrate. On-shop save cap **120** (was 24 — caused “Check service name…” when enabling many standards) |
| **CJ-72** | [P] | Grey “Booked” on unavailable slots | Parked — show taken future starts with overlay (not hide) |
| **CJ-73** | [x] | Home service tiles + shop rails | Same title size; full-width My Visits button above search; rails from live menu. A card opens the shop menu on that section, nothing ticked. |
| **CJ-74** | [x] | Home photos + Pay Bill sheet | Explore + promo use `assets/home-photos/`. Today’s phase card only when a visit exists. Pay Bill slides up the how-to; payment stays on the visit. |
| **CJ-16** | [x] | No overlapping tickets per customer | Hold/book/reschedule block overlapping active tickets |
| **CJ-18** | [x] | No-show after grace frees chair | `startsAt+5m`; `NO_SHOW` frees |
| **CJ-19** | [x] | Real barber rows | Staff 1..N; Any assigns free staff |
| **CJ-20** | [x] | Breaks + leave in slots | Engine loaded (UI = PS-05) |
| **CJ-21** / **CJ-22** | [x] | Capacity + zero workers | min(workers,chairs) |
| **CJ-15** | [x] | Cancel + reschedule on ticket | APIs + 12h refund policy |
| **CJ-17** | [x] | Floor status buttons | Arrived → In service → Done / No-show |
| **CJ-23** | [x] | Walk-in blocks timeline | `WalkIn` + Floor seat |
| **CJ-01T** | [x] | Razorpay **test** path + labels | Built; toggled off (C1) |
| **CJ-02** | [x] | Server advance amount | Retired 2026-10-11 — new bookings are pay-at-shop (`advancePaise` 0). Column kept for old rows. |
| **CJ-12** / **CJ-13** | [x] | Idempotency + retry | Intent key |
| **CJ-24** | [x] | Bookings tab after pay/request | Query invalidate |
| **CJ-25** | [x] | Notify shop on new **request** | Partner push on `AWAITING_SHOP` |
| **CJ-11** | [x] | Buffer / turnover | `bufferMinutes` (see C6) |
| **CJ-32** | [x] | Price sort = chosen service | `GET /shops?serviceName=` → that price; All = min |
| **CJ-33** | [x] | Earliest = real next free slot | Next slot via availability (7 IST days); each day is one batched query round |
| **CJ-34** / **CJ-40** | [x] | Reviews shop + barber | Rate after COMPLETED; averages; **New** if none |
| **CJ-42** | [x] | Ban ₹0 services | Catalogue + API reject ≤0; deleted free links |
| **CJ-48** | [x] | Booking state machine | AWAITING_SHOP → Accept/Reject/Expired |
| **CJ-51** | [x] | Booking details + 4-digit visit PIN | `/booking/[id]`; map → Maps; Floor start w/ PIN |
| **CJ-52** | [x] | Timings sheet + aligned Directions | `GET /shops/:id/hours` + `ShopHoursSheet`; equal quick-row cells |
| **CJ-53** | [x] | Slide nav: tiles / Visits / tabs | Stack `/category/[id]`, `/visits`; `TabSceneEnter`; stack `slide_from_right` |
| **CJ-54** | [x] | Phone-first auth → OTP → profile | Splash → customer auth → OTP / email / Google → complete-profile (name, gender, native date of birth 13+, optional referral) until saved → location → home |
| **CJ-58** | [x] | Remove role gate; partner via website / sign-in | Get Started → `/auth`; Become partner → www; Already a partner → partner sign-in only (no app signup) |
| **CJ-59** | [x] | Shop Contact dials partner phone | Shop page Contact → `tel:` `Shop.phone` (beside Get Directions) |
| **CJ-60** | [x] | Booking + shop CTA polish | Add service via menu (dismissTo booking); slot thin font + View all >12; shop footer Book only; profile theme toggle |
| **CJ-61** | [x] | Floating View cart pill | Persist SecureStore; pill × clears; tap → booking; clear on book |
| **CJ-62** | [x] | Explore sort + wellness tile | Salons/Studios/Spas sort chips (Nearest / Earliest / Price / Rating) → `HomeSortSheet`; `rating_desc` (unrated last); wellness tile art nudged right |
| **CJ-63** | [x] | Menu audience (Men / Women / Kids) | `ShopService.audience`; Kids category claims first (Kids cut ≠ Men); Kids pill; `filterByAudience` prefers `service.audience` |
| **CJ-64** | [x] | Profile gender + visit-code help card | Edit modal gender (session store `gender`); booking details Offer / Cancellation / Bill rows (`appAlert`) |
| **CJ-65** | [x] | Shop detail single scroll + bare back arrows | Sticky tabs scroll-to-section (all sections rendered); `ScreenBack` / `BackButton` chevron only, same position |
| **CJ-66** | [x] | Visits tab survives booking detail | `useVisitTabStore` + `fromTab` param; detail back = `router.back()` from list else `replace /visits?tab=` |
| **CJ-67** | [x] | Home today’s visit tile + booking success | Teal / gold / navy phases; poll 4s; completed → shop review + dismiss → coral; `/booking/success` then details |
| **CJ-68** | [x] | Home visit phases live | Gold IN_SERVICE; navy COMPLETED review prompt; dismiss persisted |
| **CJ-55** | [x] | Splash original logo + less blank coral | Clear `CutlyLogo` (+25%); Get Started font-safe |
| **CJ-56** | [x] | Launch Lottie (replaces PatternWaves splash) | `assets/animations/launch-splash.json` once, then Get Started. Signed-in skips it. Home promo PatternWaves stays. Rebuild APK for the white native cover. |
| **CJ-57** | [x] | Luzo-style shop detail + menu | `/shop/[id]` tabs + category tiles; `/shop/[id]/menu` sidebar + accordions; tile photos placeholder |

Partner shipped: **PS-03, PS-14, PS-15, PS-17, PS-20–PS-23, PS-25**.

---

## Then — explore / place trust (P1)

| ID | Status | Issue | Code today |
|----|--------|-------|------------|
| **CJ-29** | [x] | Confirm area before listing | Gate until Confirm / Change; `cutly.placeMeta`. **2026-10-08:** “Use current location” refresh/permission fix (`forceFresh`, expo-location) |
| **CJ-30** | [x] | Stale saved pin prompt | Alert if saved pin >2 km from GPS (once/session) |
| **CJ-37** | [x] | Photo + landmark + map on ticket | Details map box + address; landmark still PS-08 |
| **CJ-31** | [x] | Travel time sort | Explore + Home: haversine **km** only (no ETA) |
| **CJ-35** | [x] | Search name-first + menu-aware | `/search` shops via `query=` + service tiles; name-first rank |

---

## Later — product depth (P2)

| ID | Status | Issue | Code today |
|----|--------|-------|------------|
| **CJ-27** | [x] | Multi-service one visit | Shop multi-select → Cart → Book → pay sheet (shop/app); sum duration + one buffer at end |
| **CJ-28** | [ ] | Custom cut note + photo | Deferred — when built: CUTLY cream/navy/coral + PressScale (see DESIGN) |
| **CJ-36** | [x] | Favourites | Heart always on shop; `/favourites` from Profile |
| **CJ-38** | [ ] | Who sits (parent/child) | Deferred — persons field; same taste lock as CJ-28 |
| **CJ-41** | [x] | Revenue = advances + remaining | Partner Home Advance + Remaining from payments |
| **CJ-43** | [x] | OTP / Google / merge hygiene | OTP attaches phone to signed-in email/Google; stub merge |
| **CJ-44** | [/] | Role + one-tap switch sessions | Polish left |
| **CJ-45** | [x] | CORS + rate limit login/OTP | Allowlist + login/OTP rate limits |
| **CJ-46** | [/] | JWT short access + aud=customer | 30d |
| **CJ-49** | [/] | Concurrency / IST / retry tests | Unit tests only |
| **CJ-50** | [/] | Photo storage off DB base64 | Base64 in `ShopImage.url` |
| **CJ-26** | [/] | Soft-delete partner + notify futures | Hard delete today |

---

## Parked — needs real payment gateway

| ID | Status | Issue | Why parked |
|----|--------|-------|------------|
| **CJ-01** | [P] | Real advance capture | Needs live Razorpay/UPI |
| **CJ-39** | [/] | Balance collect both sides | **Shop side:** Floor **Done** settles remaining + completes. Customer in-app balance still after gateway |
| **CJ-47** | [P] | Payment webhook verify + replay | After gateway |

---

## Audit summary

| Status | Count (approx) |
|--------|---------------:|
| Needed now `[~]` | 0 |
| Done `[x]` (CJ) | 39 |
| Partial `[/]` | 4 |
| Missing `[ ]` | 2 |
| Parked `[P]` | 3 |

**Suggested next:** **PS-05** (breaks/leave UI) or **CJ-28** / **CJ-38** (deferred taste-locked).

---

## Partner mirror — backlog (PS)

**Rule:** every CJ change that touches booking / hours / slots / tickets / shop truth → add or update a **PS-*** row in the same session.

### Needed with customer board

| ID | Status | From | Add or modify | Notes |
|----|--------|------|---------------|--------|
| **PS-01** | [x] | CJ-09 | Setup step: weekly open hours | Skippable → defaults; weekday **0=Sun…6=Sat IST** |
| **PS-02** | [x] | CJ-09/10 | Mid-day Shop settings (hours + menu) | Floor button + Profile; `/partner/settings` |
| **PS-33** | [x] | — | Home **Open for appointments** toggle | **Close for today** (`acceptingPausedUntil` = today close IST) vs **Close temporary** (`acceptingAppointments` false); sheet X + backdrop dismiss |
| **PS-34** | [/] | Category tabs | Accurate `Shop.kinds` + spa/nails signalling so Salons / Studios / Spas lists stay honest | Multi-select kinds + brands shipped in setup; partners must pick right types |
| **PS-35** | [x] | CJ-52 | Public shop hours feed Timings sheet | Same `ShopWorkingHours` as partner settings; `GET /shops/:id/hours` |
| **PS-36** | [ ] | CJ-54 | Invite / referral code redemption | Customer stores `User.inviteCode` from complete-profile. No check or discount yet. Partner promo tooling later |
| **PS-37** | [ ] | CJ-57 | Category tile photos + About blurb + gallery polish | Customer shop UI ready; partner upload/assign category covers + shop story later |
| **PS-38** | [x] | — | Public **Partner With Us** lead page | Pages `cutly-www` → **https://www.cutly.buzz** + **https://cutly.buzz**; `npm run site:deploy`; api tunnel only for form |
| **PS-39** | [x] | CJ-58 | No in-app partner signup | App = partner **sign-in** only; new shops via website lead → ops creates Partner account |
| **PS-40** | [x] | CJ-59 | Shop public phone in settings | `Shop.phone` via Shop settings (+91); `PATCH /partner/shop/phone`; customer Contact dials it |
| **PS-41** | [x] | CJ-60 | Menu remains source for Add service | Customer Add service lists live `ShopService` menu; partners keep menu honest in Shop settings |
| **PS-42** | [x] | CJ-61 | Draft cart survives relaunch | No partner action; customer cart SecureStore; live menu SKUs until book |
| **PS-43** | [x] | PS-39 | Admin onboard portal (localhost) | `admin/` Vite + `/api/admin/*`; Cutly Ops **Open Admin portal** → `cutly-admin.sh ensure` + browser; secret `ADMIN_SECRET` |
| **PS-44** | [x] | CJ-63 | Per-service **audience** (Men / Women / Kids / Unisex) | Shop settings (mobile) + admin MenuForm `PUT /partner/services { audience }`; omitted → inferred from name (`backend/src/serviceAudience.ts`). Setup flow still name-infers — add picker later |
| **PS-45** | [ ] | CJ-62 | Partners benefit from Rating sort | Nothing to build; encourage reviews (PS-24 Home/Profile ratings still open) |
| **PS-46** | [ ] | CJ-64 | Offer copy for “How to avail” / bill calculator | Customer help card is placeholder; real offers need partner-defined promo + discount fields |
| **PS-47** | [ ] | CJ-63 | Setup step: audience per catalogue service | Setup `POST /partner/shop` accepts `audience` but UI doesn’t send it yet |
| **PS-48** | [x] | CJ-67/68 | Floor PIN start → gold “Service started”; Done → navy review tile | Customer polls bookings; partner Floor actions drive status |
| **PS-50** | [x] | — | Cancelled visit is not “paid” | Customer details say cancelled. Partner Floor already uses `balanceSettled`, so a refund does not show Balance settled. |
| **PS-49** | [x] | CJ-69 | Floor **Done** frees chair for Any-barber rebook | Same EXCLUDE free list as customer; no partner UI change |
| **PS-50** | [x] | CJ-71 | Ops catalogue UI: global categories + assign SKUs | Partner edits names/price/audience; Ops moves SKUs between tiles |
| **PS-51** | [x] | CJ-70 | Floor walk-in Staff/duration pills fill row | Match coral primary button language (equal flex pills) |

### Open (not blocking)

| ID | Status | From | Add or modify | Notes |
|----|--------|------|---------------|--------|
| **PS-04** | [x] | CJ-19 | Add/remove staff (Floor) | Per-barber hours still later (PS-05) |
| **PS-05** | [ ] | CJ-20 | Breaks / leave UI | Slots honour breaks |
| **PS-06** | [ ] | CJ-50 | Photos → object storage URLs | Base64 today |
| **PS-07** | [ ] | CJ-26 | Soft-delete + cancel futures | Hard delete |
| **PS-08** | [ ] | CJ-37 | Landmark on Location step | Optional string |
| **PS-09** | [ ] | CJ-05/07 | Partner times IST-only audit | Polish left |
| **PS-10** | [ ] | CJ-03 | Floor shows **held** chairs | Customer hold shipped |
| **PS-11** | [ ] | CJ-04 | Floor conflict / refresh UX | EXCLUDE shipped |
| **PS-12** | [/] | CJ-11 | Edit buffer / turnover minutes | **Shipped in Shop settings** (per-service buffer); catalogue defaults remain |
| **PS-13** | [x] | CJ-15 | Partner notify + policy UI cancel/reschedule | Push already; Requests/History policy copy |
| **PS-16** | [x] | CJ-25 | Push settings / deep-link polish | EAS projectId + `google-services.json` + FCM V1 on EAS; partner `pushToken` saves on Home |
| **PS-18** | [x] | CJ-02 | Partner Home / Requests / History / Floor no longer show a 30% advance | Collected + Remaining stay (cash at the shop) |
| **PS-20** | [x] | CJ-73 | Home rails follow the partner menu | A shop appears on a rail only when that service is on the shop menu. No new partner screen. |
| **PS-52** | [x] | CJ-74 | Pay still happens on the visit | Customer Pay Bill is a how-to sheet. Partner Floor collect is unchanged. |
| **PS-19** | [/] | CJ-35 | Service names in customer search haystack | Live `ShopService` names; custom renames flow into `query=` |
| **PS-24** | [ ] | CJ-34/40 | Partner Home/Profile recent ratings | Customer reviews shipped |
| **PS-25** | [x] | CJ-51 | Floor enter customer visit PIN to start | `POST …/start` + CodeSlots sheet (mock-aligned) |
| **PS-49** | [x] | — | Floor cards match marketing mock | Start with code + Call; sand status pill |
| **PS-50** | [x] | — | History row → visit detail | `/partner/history/[id]` + phone/money on history API |
| **PS-26** | [ ] | CJ-29/31 | Setup shop pin accuracy | Customer distance/sort uses `Shop.lat/lng` from setup |
| **PS-27** | [x] | — | History filter chips | All / Accepted / Rejected / Missed / Cancelled |
| **PS-28** | [ ] | CJ-28 | Partner sees custom cut note/photo on ticket | Customer CJ-28 deferred |
| **PS-29** | [ ] | CJ-38 | Floor / Requests show who sits | Customer CJ-38 deferred |
| **PS-30** | [x] | CJ-27 | Requests/Floor show multi-service package names | Joined service labels |
| **PS-31** | [x] | CJ-39/41 | Floor **Done** settles remaining + completes → Collected revenue | COMPLETED auto-settles; `collect-balance` kept for API |

### Shipped

| ID | Status | Notes |
|----|--------|--------|
| **PS-03** | [x] | Customer cards use `hoursChip` / `hoursDetail` |
| **PS-14** | [x] | Floor status + no-show |
| **PS-15** | [x] | Walk-in blocks timeline |
| **PS-17** | [x] | Capacity honesty copy |
| **PS-20** | [x] | Requests Accept/Reject |
| **PS-21** | [x] | Missed awaiting → History + EXPIRED |
| **PS-22** | [x] | `/partner/requests` slides + Floor Call/grace |
| **PS-23** | [x] | Reject / NO_SHOW frees slot; Review hold-free until Pay now |

Do **not** block customer work on PS-* unless Prajesh asks to build partner UI in the same pass.

---

## Earlier shipped (pre-board)

- [x] Partner setup + floor + tabs
- [x] Nearby shops API + Bookings list
- [x] Local booking confirmation notification
- [x] Knowledge docs + auto-update rule
- [x] Fix home empty list: `openNow=false` query coerced to true (CJ-10) — 2026-10-03
- [x] Partner History filter chips (PS-27) — 2026-10-05
- [x] Customer Alerts inbox (`/notifications` + persist-on-push) — 2026-10-05

---

*Flip status when an item ships. Keep gateway rows parked until provider chosen. Keep Conflicts table honest.*
