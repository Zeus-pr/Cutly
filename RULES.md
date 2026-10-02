# CUTLY — Working rules

## Agent / ops

- Commit **only** when the user asks. Never commit `.env` or `.cursor`.
- Do not print secrets (`DATABASE_URL`, JWT, Twilio, Google client secrets, passwords).
- Prefer `node ./node_modules/.bin/tsx` and `node ./node_modules/expo/bin/cli` over `npx` / `npm run` in this environment (rtk deadlock).
- Do not native-rebuild unless required. Expo Go SDK 57 is the default device path.
- JAVA_HOME for Gradle: Android Studio JBR **21**, not 25.
- After substantive product changes, update the knowledge docs (see below).

## Product invariants

- Role gate until **signed in**; do not persist audience without a token.
- Partner and customer accounts stay separate tables; JWT `aud` enforced on partner routes.
- Setup order: name → location → kind → services → chairs → workers → features (skip) → photos (skip).
- Amenities/photos are skippable in setup; editable later from partner profile / details.
- Capacity: open slots = min(workers, chairs); never cancel confirmed bookings when lowering capacity.
- Customer shops list = real API nearby (`setupDone`), not mocks.
- Bookings persist via `POST /api/bookings` and show on Bookings tab.
- Booking success → local notification (+ push token register when possible).

## Code conventions

- Routes live under `app/` (Expo Router), kebab-case segments.
- Themed styles via `useThemedStyles`; don’t hardcode light-only ink fills on buttons.
- Partner token never stored in `cutly.accessToken`.
- Money: paise integers. Display with `formatINR`.

## Knowledge docs (keep current)

Canonical set at repo root:

| File | Owns |
| --- | --- |
| `PRD.md` | What we build / for whom |
| `ARCHITECTURE.md` | How it is built |
| `DESIGN.md` | Visual + motion system |
| `TASKS.md` | Open / done work |
| `MEMORY.md` | Decisions, env quirks, “don’t redo” |
| `RULES.md` | This file |

When a change affects product, architecture, design, tasks, or hard-won memory, **edit the matching file(s) in the same session**. Rule: `.cursor/rules/cutly-knowledge-docs.mdc`.

`docs/PROJECT_INDEX.md` is historical and may be stale; prefer these six files.

---

*Update RULES.md when process or invariants change.*
