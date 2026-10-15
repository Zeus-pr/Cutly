# Account deletion and data retention

This note describes what happens when a CutLy customer or partner deletes their account.
It backs the privacy policy text and the in-app delete flow (issue #8, "T3").

## 1. Confirming it is you

Deleting an account needs a fresh confirmation, not just being signed in. The app asks
for one of: your password, a 6-digit SMS code sent to the phone on the account, or a new
Google sign-in. That confirmation is valid once, for 5 minutes.

## 2. The 14-day grace period

When you delete your account:

- You are signed out everywhere straight away, and push notifications stop.
- Your profile is hidden. Shops and the public review list show you as **"Former customer"**.
- Upcoming bookings are cancelled. Any advance refund follows the normal cancellation policy.
- You cannot delete while a visit is in progress (arrived or in the chair).

For **14 days** you can change your mind: sign in again (password, SMS code or Google) and
your account comes back exactly as it was, including favourites and saved places. Push
notifications resume once the app registers again. Trying to *sign up* again with the same
phone or email during this time tells you to sign in instead.

After the 14 days, sign-in no longer restores the account, even if the clean-up below has
not run yet.

## 3. What is removed after 14 days

A clean-up job then permanently removes your personal details:

- **Customers:** name, phone, email, gender, date of birth, invite code, password, Google link
  and push token. Favourite shops, saved locations and in-app notifications are deleted.
- **Partners:** name, phone, email, password, Google link and push token. The shop stays
  closed and its public contact number is removed. The shop name and address are kept
  because they appear in customers' booking history.

This cannot be undone. After that the same phone or email can be used to create a new,
separate account.

## 4. What we keep, and why

- **Booking and payment records: 8 years.** Bookings, payments, refunds, amounts, payment
  provider IDs and invoice fields are kept for tax and accounting (GST and income-tax record
  keeping), linked only to an anonymous account ID with no name, phone or email.
  *The exact period is to be confirmed with our chartered accountant; deletion of these
  records after the period is a separate follow-up.*
- **Reviews** stay on the shop page (the shop's public content and rating history), shown as
  "Former customer".
- **A one-way phone fingerprint: 12 months.** We keep a keyed hash (HMAC-SHA256) of the phone
  number, not the number itself, for 12 months. It is used only to spot abuse, such as
  repeated no-shows or deleting and re-joining to reuse first-time offers. It is deleted
  after 12 months.

## 5. Partners

A partner can delete their account only when the shop has no upcoming or in-progress
bookings; otherwise the app lists those bookings so they can be finished or cancelled first.
The shop is closed (hidden from search; old links show "This shop is no longer taking
bookings."). If the partner signs in again within 14 days, the account is restored and the
shop comes back **paused**, so the owner turns bookings back on from Partner Home.

## Configuration (ops)

| Env var | Default | Meaning |
|---|---|---|
| `ACCOUNT_DELETION_GRACE_DAYS` | `14` | Restore window |
| `PHONE_HASH_KEY` | (required) | HMAC key for the phone fingerprint; purge refuses to run rows without it |
| `DELETED_IDENTITY_RETENTION_DAYS` | `365` | Phone fingerprint retention |
| `DELETION_FORMER_CUSTOMER_DURING_GRACE` | `1` | Show "Former customer" during grace (product call pending) |
| `PARTNER_SELF_DELETE_ENABLED` | `1` | `0` = partner delete is ops-only (product call pending) |
| `PARTNER_RESTORE_SHOP_STATUS` | `PAUSED` | Shop status after partner restore; never `ACTIVE` (product call pending) |
