# CUTLY — Memory

Hard-won context so agents do not relearn or undo working decisions. **Last reviewed: 2026-10-03.**

## Environment

- Repo: `/Users/prajesh/CUTLY` · remote often `Zeus-pr/Cutly.git` on GitHub.
- Neon project for Postgres (Cutly). Migrations applied including partner shop + `User.pushToken`.
- Metro: LAN `REACT_NATIVE_PACKAGER_HOSTNAME` + `EXPO_PUBLIC_API_BASE_URL` for iPhone hotspot (`172.20.10.2` observed). Emulator needs `10.0.2.2` for API.
- macOS firewall may block Node inbound; user must Allow.
- Free Apple ID + USB + Xcode needed for device install; Expo Go is the current path. Xcode.app may be missing on this Mac.
- Do not `npm audit fix --force`. Do not casually re-approve prisma/esbuild install scripts.

## Product decisions locked in

- Intro/welcome is memory-only; logout returns toward role/welcome.
- Profile hero stays `#141110`.
- Partner setup: no marketing slides between questions; amenities/photos after chairs/workers and skippable.
- Capacity model: chairs (physical) + workers today; open = min(); don’t cancel confirmed when lowering.
- Default GPS fallback: 23.2324, 87.8615 (Bardhaman area).
- Expanding teal capsule tab bar approved (option 3 of samples).
- Taste skills installed under `.agents/skills/` (Leonxlnx/taste-skill).

## Technical pitfalls

- `npx` / `npm run` via agent shell can deadlock — use node binaries.
- `expo-status-bar` no longer takes `backgroundColor` (SDK 57); use RN `StatusBar` for Android color.
- `StyleSheet.absoluteFillObject` → `absoluteFill` on RN 0.86.
- **Never** add `lottie-react-native` to `app.json` `plugins` — Expo config load fails in Expo Go. In-app success uses Reanimated.
- Dark mode: `colors.ink` is near-white — do not use as button background.
- Partner email/name stored in `cutly.partnerEmail` / `cutly.partnerName` so they don’t clobber customer keys.
- Existing partner shops may need a default barber; `ensureFloorBarber` / setup creates `Any chair`.

## Test shops (local DB, 2026-10-03)

Partner test shops around Indrakanan / Burdwan (~23.224, 87.879) with `setupDone: true` were seeded with floor barbers for customer nearby listing.

## User prefs

- Prajesh · Operations. Prefer task workflows; affirmative language; verify on emulator or iPhone Expo Go, not web-as-primary.
- Ask when blocked; otherwise ship with agreed defaults.

---

*Append dated notes when something surprising is learned. Prune only when clearly obsolete.*
