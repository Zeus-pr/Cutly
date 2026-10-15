# T3 delete account: test results for PR #45 (branch fix/t3-delete-account @ 9db798f)
Run: 15 Oct 2026, ~15:55–16:00 IST, on the box. Checkout: /workspace/cutly-t3 (fresh clone, PR head fetched as local branch `pr45`). Nothing committed or pushed.
Plan: testplans/T3-delete-account.md, adjusted for "Decisions log, round 2" and the DBA answers in design-T2-T3-T6.md.

## Verdict: FAIL (1 functional bug). Everything else passes.
| | Count |
|---|---|
| Pass | 38 |
| Fail | 1 (case 36) |
| Blocked | 0 |
| Manual (UI) | 3 (40–42) |

## Environment and build checks
- `npm ci`: OK. `npx prisma validate`: OK. `npx tsc --noEmit`: OK (0 errors).
- `npm test` (Vitest, no DB): 34 files passed, 1 skipped (the DB file). 170 tests passed, 4 skipped.
- Local throwaway Postgres: the **17** binaries were already on the box (not 16), with initdb in /tmp/pg-t3 on port 55433. `prisma migrate deploy` applied all T3 migrations cleanly.
- `T3_TEST_DATABASE_URL=… PHONE_HASH_KEY=dummy… npx vitest run tests/accountDeletion.db.test.ts`: **4/4 passed**.
- Ad-hoc DB/HTTP suite `tests/zz_adhoc_t3.db.test.ts` (untracked tester file, not part of the PR): 27 tests, 26 passed, 1 failed (case 36, below).
  - Note: reauth is rate-limited to 5 per IP per 15 min (in-memory). Four edge tests got 429 in one run and passed when re-run in a fresh process. That is a test artifact, not a bug.

## Case table
| # | Case | Result | Evidence / notes |
|---|---|---|---|
| 1 | Password re-auth → 200, token, expiresIn 300 | Pass | DB test + reauth.test.ts |
| 2 | Wrong password → 401 | Pass | DB test |
| 3 | OTP re-auth | Pass (mocked) | reauth.test.ts with a mocked Twilio check. Live Twilio not exercised |
| 4 | Google re-auth (sub match, iat ≤ 5 min) | Pass (mocked) | reauth.test.ts with a mocked verifier |
| 5 | Method unavailable (no passwordHash) → 4xx | Pass | Got 401 REAUTH_FAILED, not 500 |
| 6 | Token expiry 6 min → 401 | Pass | reauth.test.ts |
| 7 | One-time use | Pass | Reused token → 401, including after restore |
| 8 | Partner re-auth | Pass | /api/partner/reauth password flow live. Shares verifyReauthProof |
| 9 | Missing X-Reauth-Token → 401 REAUTH_REQUIRED, no DB change | Pass | Exact body matched. tokenVersion and deletionRequestedAt unchanged |
| 10 | Blocked while visit in progress | Pass (note) | IN_SERVICE and ARRIVED both blocked, session still valid. Returns **409 VISIT_IN_PROGRESS** "Finish your current visit first." (the plan said 400) |
| 11 | Happy path C1 | Pass | 200, cancelledBookings:3 (CONFIRMED, AWAITING_SHOP, HELD). Refund for the +48h CONFIRMED booking marked REFUNDED per cancelPolicy. Hold released. Shop notify is push only (attempt logged) |
| 12 | History kept | Pass | COMPLETED/CANCELLED bookings, CAPTURED payment and review intact, all linked to C1 |
| 13 | Personal data during grace | Pass | deletionRequestedAt set, tv+1, pushToken null, PII kept. Favourites, notifications and saved locations kept. PhoneOtp deleted |
| 14 | Sessions revoked | Pass | Original, second-device and legacy no-`tv` JWTs → 401 on /me and /api/bookings |
| 15 | Push stops | Pass | pushToken nulled. push.ts skips users with no token |
| 16 | Rating unchanged | Pass | Shop rating and count the same before and after |
| 17 | Partner views / public reviews show "Former customer" | Pass | /api/partner/history and /api/shops/:id/reviews show "Former customer" with no name or phone. Other partner views use the same helper |
| 18 | Atomic rollback | Pass | Injected a DB trigger failure on the User update → 500. Booking still CONFIRMED, payment still CAPTURED, tv still 0. Reauth grant not burned (retry succeeded). No Razorpay call, as decided |
| 19 | Repeat delete → 401, never 500 | Pass | |
| 20 | Sign-in in grace restores | Pass | Day 13 password login → 200, deletionRequestedAt cleared, new JWT tv=1 works. OTP/Google restore paths code-reviewed only |
| 21 | What restore brings back | Pass | Cancellations and refunds stay. Favourites back. Real name back on reviews |
| 22 | Boundary | Pass | 14d−5s restores. 14d+1s → 400 generic "Email or password is incorrect." with no restore |
| 23 | Hidden during grace | Pass (partial N/A) | Admin partner list exposes deletionRequestedAt/deletedAt. There is no admin *user* list and no phone-lookup flow in the code, so those parts are N/A |
| 24 | Re-signup during grace | Pass | Same email or same phone → 409 ACCOUNT_PENDING_DELETION |
| 25 | Purge fields | Pass | name, phone, email, gender, dob, inviteCode, passwordHash, googleSub, pushToken null. emailVerified false. id, bookings, payments and reviews kept |
| 26 | No early purge (day 13) | Pass | |
| 27 | Restored account skipped | Pass | |
| 28 | DeletedIdentity HMAC | Pass | phoneHmac = HMAC-SHA256(PHONE_HASH_KEY, E.164) verified |
| 29 | Single runner | Pass | Two concurrent runs: one did the work, the other returned skipped:true. No errors |
| 30 | Idempotent | Pass | Second run: users 0, partners 0 |
| 31 | Retention | Pass | 400-day-old DeletedIdentity removed. Finance rows untouched |
| 32 | Re-signup after purge | Pass | New id, matching phoneHmac row exists (existing DB test) |
| 33 | Partner blocked by upcoming | Pass | 409 UPCOMING_BOOKINGS with the booking list. Shop ACTIVE, tv 0, booking untouched, no notify |
| 34 | Partner happy path | Pass (note) | Shop CLOSED, isActive false, deletedAt null in grace. Partner tv+1. Bookings and reviews kept. ownerPartnerId is **kept** (needed for restore, per round 2), not nulled as the plan said |
| 35 | Shop hidden | Pass | Not in /api/shops. GET /api/shops/:id and /reviews → 410 SHOP_CLOSED. Dropped from the favourites list |
| 36 | Customer history at closed shop; rebook/review disabled | **FAIL** | History shows the shop name, but **review is still allowed** (details below) |
| 37 | Partner sessions revoked | Pass | Old token → 401. No staff logins (moot) |
| 38 | Partner restore | Pass | Login within grace → 200, shop CLOSED → **PAUSED** (documented default), partner routes work |
| 39 | Race with new booking | Pass (note) | After close, hold → "Shop not found". createBooking filters status ACTIVE. In a concurrent delete+hold race the hold succeeded and an **orphan BookingHold** stayed at the CLOSED shop (expires in ~10 min). It can't become a booking. Minor |
| 40 | Customer app delete flow | Manual | Not run |
| 41 | Partner app delete flow | Manual | Not run |
| 42 | Admin portal | Manual | Not run |

## Failure details
### Case 36: a customer can still review a completed visit at a CLOSED (deleted-partner) shop
Steps (local backend, throwaway DB):
1. Create partner P with shop S (ACTIVE) and customer C with a COMPLETED, unreviewed booking at S.
2. P: POST /api/partner/reauth {password} → DELETE /api/partner/account with X-Reauth-Token → 200. S is now CLOSED.
3. C: GET /api/bookings → the booking row has `canReview: true`.
4. C: POST /api/bookings/:id/review {shopRating:5, barberRating:5, text:"x"} → **200**, review created.

Expected (round 2 Q9): history shows the shop name, and rebook and review are disabled for a closed shop. That means `canReview:false`, and the review endpoint rejects the request (4xx, e.g. 410 SHOP_CLOSED).
Actual: `canReview:true` and the review is accepted. Cause: `customer.ts:1495` (`canReview`) and `createBookingReview` (`customer.ts:412+`) don't check `shop.status`/`deletedAt`. Rebook goes through hold/booking, which is correctly blocked.

## Edge cases
| Edge case | Result |
|---|---|
| Only past/cancelled bookings → cancelledBookings 0 | Pass |
| PAYMENT_PENDING booking cancelled on delete | Pass. Late webhook capture not exercised (no webhook path in this build; payments are off by default) |
| Booking inside the no-refund window | Pass: cancelled, not refunded, payment stays CAPTURED |
| Customer who is also a partner (same phone) | Pass: the partner side is untouched |
| Review text redaction | N/A (deferred by decision Q7) |
| null name → "Customer" before, "Former customer" after | Pass (unit tests) |
| Old app without header → 401 REAUTH_REQUIRED | Pass |
| Old JWT without tv | Pass: works before deletion, 401 after |
| Timezone / UTC deadline | Pass (unit tests: UTC instants) |

## Regression checklist (booking history and partners)
| Item | Result |
|---|---|
| Customer history (historyFilter) unchanged | Pass (unit + /api/bookings live) |
| Partner history includes deleted customers' bookings | Pass |
| Floor/today views | Pass (unit tests todayVisit, partnerFloorStatus) |
| cancelPolicy for normal cancels | Pass (unit) |
| awaitingExpiry skips cancelled rows | Not exercised live. It selects by AWAITING_SHOP, so cancelled rows are excluded by construction |
| Availability/holds | Pass: the deleted user's holds released, others untouched |
| Ratings/review counts | Pass |
| Shop list for ACTIVE shops | Pass (filters now on status='ACTIVE'; isActive mirrored) |
| Payments/settlement rows unchanged | Pass (payment rows never modified by delete or purge, except the policy refund mark) |
| Walk-ins/staff | Pass (unit) |
| Signup/OTP/Google for new users | Pass for password signup (fresh signup after purge). OTP/Google new-user paths unit-level only |
| Admin lists with null names | Manual (admin UI) |
| Existing tests/ suite green | Pass |

## Reproduce locally
```
cd /workspace/cutly-t3 && export PATH=/usr/lib/postgresql/17/bin:$PATH
pg_ctl -D /tmp/pg-t3 -o "-p 55433 -k /tmp" -l /tmp/pg-t3.log start
export T3_TEST_DATABASE_URL=postgresql://postgres@localhost:55433/cutly_t3 DATABASE_URL=$T3_TEST_DATABASE_URL PHONE_HASH_KEY=dummy-key-0123456789
npx vitest run tests/accountDeletion.db.test.ts tests/zz_adhoc_t3.db.test.ts
```

## Follow-up (DEV, commit after 11eb9d1)
- Case 36 fixed: `canReview` is false unless the shop is ACTIVE (and not purged), and `createBookingReview` returns 410 `SHOP_CLOSED`. Covered in `tests/accountDeletion.db.test.ts`.
- Case 39 fixed: partner delete already released that shop's holds inside the delete transaction. `createHold` now also locks the shop row (`FOR SHARE`) and re-checks `status='ACTIVE'` in its own transaction, so a concurrent hold either waits for the delete (and then fails with 410) or commits first and is released by it. No orphan hold can be left.
- Reauth per-IP limit raised to 20 per 15 min (per session stays 5). This fixes the 429s seen in the ad-hoc test run.
