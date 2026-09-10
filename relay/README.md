# StreamCast KaraFun Relay

Persistent single-authority relay: one real `socket.io` connection to KaraFun per actively-used
party, mirroring the live queue/status into Firestore and processing the authenticated command
queue against it. Design rationale, architecture, and the full plan live in
[`../docs/karafun-relay-design.md`](../docs/karafun-relay-design.md) — read that first.

## Status: shipped

This implements **state mirroring, the per-party lease, the command queue, and the auto-sort
port** (design doc §3.1/§3.2/§4/§5) — the dashboard and overlay no longer hold any direct KaraFun
connection of their own; every read comes from `users/{userId}/karafun_state/live` and every
mutation goes through `/api/karafun/[userId]/command` into `users/{userId}/karafun_commands`,
which this relay is the sole consumer of.

**Verified against a real KaraFun party and production Firestore**, including live two-account
testing (broadcaster + a second singer-role account) of the command queue's authorization and the
turn-tracking logic — see PR #30.

## How it works

- `src/partyManager.js` polls (every 30s) for broadcasters with a recent presence heartbeat
  (`users/{userId}/online`, the same signal `useKaraokeData.js` already uses, >90s = stale) who
  also have `karafunEnabled` + a saved `karafunPartyId`. For each, it takes a Firestore-transaction
  lease (`karafun_relay/{userId}`) and opens one `KaraFunConnection`.
- `src/karafunConnection.js` is the actual socket - connects to `https://www.karafun.com`,
  authenticates, listens for `queue`/`status`, and writes a debounced (max ~2/sec) mirror to
  `users/{userId}/karafun_state/live`. The connect/transform logic is ported from
  `src/hooks/useKaraFunData.js`, not reinvented.
- `src/commandProcessor.js` is the one consumer of a party's `users/{userId}/karafun_commands`
  queue - it processes pending commands FIFO against the same `KaraFunConnection` socket, which is
  what actually closes issue #29 (the API route authorizes; this executes).
- `src/autoSort.js` is the opt-in (`karafunAutoSortEnabled`, off by default) round-robin queue
  reordering, ported into the relay so there's structurally one process issuing moves per party -
  see design doc §5/§9.
- `src/lease.js` is the per-party lock - see the design doc §4 for why it matters even with one
  instance (deploy overlap).
- `src/firebaseAdmin.js` ports the same defensive `FIREBASE_PRIVATE_KEY` PEM-reconstruction
  `src/lib/firebase-admin.js` has in the main app, since this runs as its own process outside
  Next.js's build.

## Requires

Before this can mirror anything for real:

1. **The `firestore.indexes.json` change in this same change set deployed** — the presence query
   is a `collectionGroup('online')` range query on `lastSeen`, which needs the field override
   added there (`firebase deploy --only firestore:indexes`). Without it, the discovery query will
   fail outright the first time it runs.
2. **A Firebase service account** with Firestore access - same three env vars as the main app
   (`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`), set directly in
   Dokploy's environment config, or in a local `relay/.env` (copy `.env.example`) for dev.

## Local dev

```bash
cd relay
npm install
cp .env.example .env   # fill in the three Firebase Admin values
npm start
```

With no real broadcaster online (no fresh `online` heartbeat), the discovery loop will find
nothing and just idle, logging nothing new every 30s - that's expected, not a bug. To sanity-check
the actual KaraFun connection logic without needing a real presence heartbeat, temporarily
instantiate a `KaraFunConnection` directly against a known party ID rather than going through
`PartyManager`'s discovery.

## Deployment

See design doc §8: deployed via Dokploy as its own service from this `relay/` subdirectory (own
`Dockerfile`, own build), always-on (not scale-to-zero — see §8 for why that's the right call on
already-owned infrastructure).
