# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

StreamCast Pro — a Next.js (App Router) app that gives Twitch broadcasters a moderation dashboard and a browser-source overlay for OBS. It reads live Twitch chat via `tmi.js` directly in the browser (no backend chat relay), lets a broadcaster/moderator push a chat message to the on-stream overlay, and optionally overlays KaraFun "now playing" / queue widgets. Firebase (client SDK + Admin SDK) is the only backend: Firestore holds all state and does double duty as the real-time transport between dashboard and overlay (both sides use `onSnapshot` listeners — there is no websocket server of our own).

## Commands

```bash
npm run dev      # start Next.js dev server (localhost:3000)
npm run build    # production build
npm run start    # run production build
npm run lint     # eslint (flat config, eslint-config-next core-web-vitals)
```

There is no test suite/runner configured in this repo.

Firebase deploys (Firestore rules + Cloud Functions) go through the Firebase CLI, not npm scripts:
```bash
firebase deploy --only firestore:rules
firebase deploy --only functions
```
The `functions/` directory is its own package (separate `package.json`/`node_modules`) — `cd functions && npm install` before deploying if dependencies changed.

CI (`.github/workflows/node.js.yml`) runs `npm ci`, `npm run build` (with Firebase/PostHog public env vars injected from GitHub secrets), then `npm run lint` on every push/PR to `main`. A separate workflow (`.github/workflows/build.yml`) runs a SonarQube scan on push to `main`. `.github/workflows/cleanup-history.yml` ("Daily Firestore Cleanup") runs nightly via cron: `scripts/cleanup-history.js` purges chat history older than 30 days, and `scripts/cleanup-karaoke-requests.js` does the same for `karaoke_requests` docs (both iterate `users/*` and batch-delete by a `createdAt`/`timestamp` cutoff — same pattern, kept as two scripts rather than merged for readability). `scripts/cleanup-chat-pipeline.js` covers the three chat-approval-pipeline collections those two don't touch — `suggestions`, `message_queue`, and a stale `active_message/current` (only the "permanent"/`duration: -1` case, since a finite-duration one already expires client-side) — same 30-day window, same `timestamp` field. The same workflow also runs `scripts/retry-account-cleanup.js`, which finishes whatever `/api/delete-account` couldn't complete at deletion time (cross-channel `permissions`/`online` sweep, `usernames/{twitchUsername}` mapping deletion) — a failed attempt there queues a `pending_cleanup_sweeps/{uid}` doc since there's no user record left to retry against once the account itself is deleted.

## Architecture

### Two client surfaces, one Firestore source of truth
- **Dashboard** (`src/app/dashboard/page.js`): the broadcaster/mod-facing app. Connects to Twitch chat client-side with `tmi.js`, renders it live, and lets a mod click a message to "send to overlay" (writes to `users/{uid}/active_message/current` in Firestore).
- **Overlay** (`src/app/overlay/[userId]/page.js`): the OBS browser source. Has no auth — it's a public, unauthenticated read-only view keyed by `userId` in the URL. It subscribes to Firestore docs (`settings/config`, `active_message/current`, `overlay_triggers/now_playing`) via `onSnapshot` and renders animated message bubbles (Framer Motion) plus KaraFun widgets. There is no polling and no custom WebSocket server for this data path — Firestore's realtime listeners are the entire sync mechanism.
- Because the overlay is unauthenticated by design (OBS can't do OAuth popups), all overlay-readable Firestore paths are deliberately `allow read: if true` in `firestore.rules` — do not "tighten" these without understanding the overlay depends on public read access.

### Firestore data model (per-broadcaster, under `users/{userId}`)
- `settings/config` — public overlay appearance/behavior settings (colors, animation, KaraFun toggles, etc.) — synced live to the overlay.
- `active_message/current` — the single message currently queued to display on the overlay.
- `history/*` — sent-message log for the dashboard's History tab; pruned after 30 days by `scripts/cleanup-history.js`. Each doc carries `twitchMessageId` (from tmi.js's `tags.id` at capture time) and `login`, used by `useChatData.js`'s `messagedeleted`/`timeout`/`ban` listeners to also delete a message here (and from `message_queue`/`active_message`) if it's deleted, or its sender timed out/banned, on Twitch. A bare `/clear` on Twitch does *not* trigger this — only per-message/per-user CLEARMSG/CLEARCHAT signals do.
- `private/config` — secret `apiToken` for the remote-control HTTP API (see below), still readable/writable by the client SDK. `private/twitch` — the user's Twitch OAuth access token, encrypted at rest (AES-256-GCM, `src/lib/tokenCrypto.js`); `firestore.rules` denies the client SDK any access to this document at all (`allow read, write: if false`), so it's only ever read/written through `/api/twitch-token` (Admin SDK). See `AuthContext.js` for the client side of that call.
- `permissions/{uid}` — per-viewer role assignment (`broadcaster` / `mod` / `viewer`) used for "moderator mode" (`/dashboard?host={broadcasterUid}`), so a mod can run the dashboard against someone else's channel.
- `online/{uid}` — presence heartbeat (written every 30s while a user has the dashboard open).
- `suggestions/*` — messages submitted by viewers in "suggestion mode" for mod review.
- `overlay_triggers/now_playing` — a timestamp doc used to manually pulse the KaraFun "Now Playing" popup on the overlay (see remote API below).

`firestore.rules` encodes a "master admin" bypass keyed to one hardcoded Firebase Auth UID (the project owner) that grants full read/write everywhere — check that block before reasoning about permissions.

### Auth & roles
- Sign-in is Twitch via Firebase Auth OIDC (`AuthContext.js`, provider `oidc.twitch`), requesting `chat:read chat:edit channel:read:redemptions moderator:read:chatters` scopes. This must be configured as an OIDC provider in the Firebase Console — it isn't inferable from code alone.
- Every new broadcaster signup starts in `status: 'waiting'` and must be approved from the Broadcasters admin tab before their dashboard unlocks (see `Broadcasters.js` and the `broadcasterStatus` gating in `dashboard/page.js`). The account with Twitch username/display name `sandschi` is auto-approved and treated as master admin everywhere (client rules, Firestore rules, and the dashboard's `isMasterAdmin` checks) — this is intentional, not a bug.
- Roles: `broadcaster` (full access to own dashboard), `mod` (invited via `?host={broadcasterUid}`, needs an approved `permissions/{modUid}` doc), `viewer` (read-only chat + "suggestion mode" instead of direct send).

### Self-service account deletion (`src/app/api/delete-account/route.js`)
Triggered from `DeleteAccountModal.js` (Settings → Dashboard, hidden in Host Mode and for the master admin). The route: revokes the caller's Twitch OAuth grant via Twitch's `oauth2/revoke` endpoint (best-effort — never blocks deletion if it fails), sweeps every *other* broadcaster's `permissions/{uid}` and `online/{uid}` docs via a `collectionGroup` scan (these carry a copy of displayName/photoURL/twitchUsername, not just a role string, so leaving them isn't safe), then `recursiveDelete`s the caller's own `users/{uid}` subtree, removes their `usernames/{twitchUsername}` lookup doc, and finally deletes the Firebase Auth user itself. The master-admin UID is hardcoded-blocked from self-deletion (would strand the app). A returning user after deletion gets a brand-new Firebase UID — Firebase never reissues a deleted one — so they re-enter the approval queue from scratch and lose any moderator/viewer invites on other channels.

### Remote control HTTP API (`src/app/api/overlay/[userId]/route.js`)
A GET endpoint intended for OBS/Stream Deck integration, e.g. `/api/overlay/{userId}?action=toggle-karafun-queue&token=...`. Auth is a per-user `apiToken` (stored at `users/{userId}/private/config`) compared with `crypto.timingSafeEqual`, not Firebase Auth — this endpoint is meant to be called from outside the browser session. Supported `action` values toggle KaraFun overlay widgets, hide the active message, or manually show/hide the "Now Playing" popup. When adding new remote actions, follow the existing pattern: validate `userId`/`token`/`action`, mutate Firestore, emit a PostHog event via `captureEvent`, return `{ success, action, state? }`.

### Firebase Admin initialization quirk
`src/lib/firebase-admin.js` does defensive PEM reconstruction on `FIREBASE_PRIVATE_KEY` (handles double-encoded JSON, literal `\n` vs real newlines, re-wrapping base64 to 64-char lines) because the key has repeatedly been mangled by different hosting envs' secret handling. If you touch this file, preserve that reconstruction logic rather than simplifying it away — it's there to survive Vercel/GitHub Actions env var quirks. It also has a `IS_BUILD_TIME`/`NEXT_PHASE` escape hatch so `next build` can succeed without real credentials.

### Emotes (`src/lib/emote-engine.js`)
Client-side fetch + merge of Twitch native emotes (from `tmi.js` tags) plus 7TV/BTTV/FFZ global and per-channel emotes, called directly against those providers' public APIs from the browser (no backend proxy). Results are cached module-level (`globalEmotesCache`, `failedIds`) for the life of the page.

### Cloud Functions (`functions/index.js`)
A single Firestore-triggered function (`notifyNewSignup`, `onDocumentCreated` on `users/{userId}`) that posts a Discord webhook embed when a new broadcaster signs up, skipping already-approved users. This is separate from the Next.js API route `src/app/api/notify-signup/route.js`, which also posts to Discord — check both when changing signup notification behavior; they currently do overlapping jobs from client-triggered vs. Firestore-triggered paths.

### KaraFun integration
Both the dashboard (`components/dashboard/KaraFun.js`) and the overlay connect **directly** to KaraFun's public party socket.io endpoint (`https://www.karafun.com`, `socket.io-client` v2) using the broadcaster's `karafunPartyId` — there's no backend intermediary. Overlay theme variants (cyberpunk, comic, retro, glass, neon, etc.) are defined inline in `overlay/[userId]/page.js` via `getKaraFunThemeStyles()`/`bubbleStyles` and must stay in sync if adding a new theme option in Settings.

### Images
`next.config.mjs` allowlists remote image hosts via `images.remotePatterns` (Twitch CDN, DiceBear default avatars, 7TV/BTTV/FFZ emote CDNs). Adding a new external image/emote source requires adding its hostname here or `next/image` will refuse to load it.
