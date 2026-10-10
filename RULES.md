# CUTLY — Working rules

## HARDST RULE — Runtime isolation (above everything)

**iOS Expo Go (cellular) and Mac emulator/simulator are completely separate stacks.** Never cross-break them. As long as the Mac is up, both must stay independently usable.

- Emulator/simulator API is forced in `services/apiBase.ts` (Android emu → `10.0.2.2:4000`, iOS sim → `127.0.0.1:4000`). Do not “fix” emulator by changing `.env.local` to LAN or killing cellular Metro.
- Cellular Expo Go uses `.env.local` → `https://api.cutly.buzz/api` plus Ops LaunchAgent `com.prajesh.cutly-expo-cellular` (`exps://…trycloudflare.com`). Do not “fix” cellular by pointing env at LAN or restarting ad-hoc Expo over the LaunchAgent.
- Shared forever while Mac is up: local API `:4000` + named tunnel `cutly-api` → `api.cutly.buzz`. Never park/kill that tunnel to help Metro.
- Agent must **not** `pkill` Metro / Expo / cloudflared / API, flip `.env.local` modes, or set `REACT_NATIVE_PACKAGER_HOSTNAME=localhost`. Prefer Ops panel. Cursor rule: `.cursor/rules/cutly-runtime-isolation.mdc`.

## Agent / ops

- Commit **only** when the user asks. Never commit `.env` or `.cursor`.
- Do not print secrets (`DATABASE_URL`, JWT, Twilio, Google client secrets, passwords).
- Prefer `node ./node_modules/.bin/tsx` and `node ./node_modules/expo/bin/cli` over `npx` / `npm run` in this environment (rtk deadlock).
- Do not native-rebuild unless required. Expo Go SDK 57 is the default device path — **except** Android remote push needs a **dev/custom APK** (Expo Go SDK 53+ drops Android push).
- JAVA_HOME for Gradle: **JBR 21** at `~/Library/Java/JavaVirtualMachines/jbr-21.0.11/Contents/Home` — Android Studio’s bundled JBR is now **25** and breaks `com.facebook.react.settings`.
- After substantive product changes, update the knowledge docs (see below).
- **Partner mirror:** every customer-side (CJ) change that affects booking, hours, slots, tickets, or shop truth must also add/update a **PS-*** row in `TASKS.md` (partner setup / Floor / Profile). Ship the customer fix first unless the user asks to build the partner UI in the same pass.
- **Toolbox:** When changing app/backend code, use Cursor skills, MCP plugins (Mobbin, Figma, Expo, Render, etc.), and subagents when they help — don’t guess UI/infra when a tool can check.
- **Conflicts first:** Read `TASKS.md` → Conflicts and `MEMORY.md` / `PRD.md` before coding. Surface contradictions briefly.
- **Don’t reinvent the wheel:** Prefer safe, free, well-known libraries and Expo modules already in the repo (or widely documented) — e.g. `expo-notifications`, Google Maps `Linking`, SecureStore, React Query, OSM static map tiles.

## Product invariants

- Launch → **customer auth** (no role gate). Audience is session-only until sign-in; do not persist audience without a token. Partner signup is website + ops only — app has partner **sign-in** only.
- Partner and customer accounts stay separate tables; JWT `aud` enforced on partner routes.
- Setup order: name → location → kind → services → chairs → workers → features (skip) → photos (skip).
- Amenities/photos are skippable in setup; editable later from partner profile / details.
- Capacity: open slots = min(workers, chairs); never cancel confirmed bookings when lowering capacity.
- Customer shops list = real API nearby (`setupDone`), not mocks.
- Bookings persist via `POST /api/bookings` and show on Bookings tab.
- Booking success → local notification (+ push token register when possible).
- **Service price must be > ₹0** (`pricePaise >= 1`); no free catalogue services.
- One review per completed booking (shop + visit barber ratings); never invent fake shop ratings.

## Code conventions

- Routes live under `app/` (Expo Router), kebab-case segments.
- Themed styles via `useThemedStyles`; don’t hardcode light-only ink fills on buttons.
- New interactive chips/buttons: use `PressScale` (press scale + spring). Sheets: Reanimated enter/exit; respect reduce-motion (see DESIGN.md Motion).
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
