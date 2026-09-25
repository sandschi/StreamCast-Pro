# StreamCast KaraFun Relay

Persistent single-authority relay: one real `socket.io` connection to KaraFun per actively-used
party, mirroring the live queue/status into Supabase and processing the authenticated command
queue against it. Design rationale, architecture, and the full plan live in
[`../docs/karafun-relay-design.md`](../docs/karafun-relay-design.md) — read that first.

## Status: ported to Supabase

This implements **state mirroring, the per-party lease, the command queue, and the auto-sort
port** (design doc §3.1/§3.2/§4/§5) — the dashboard and overlay hold no direct KaraFun connection
of their own; every read comes from `public.karafun_state` and every mutation goes through
`/api/karafun/[userId]/command` into `public.karafun_commands`, which this relay is the sole
consumer of.

## How it works

- `src/partyManager.js` polls (every 30s) for broadcasters with a recent presence heartbeat
  (`public.online`, the same signal `useKaraokeData.js` already uses, >90s = stale) who also have
  `karafun_enabled` + a saved `karafun_party_id`. For each, it acquires a Postgres advisory lock
  (`src/lease.js`) and opens one `KaraFunConnection`.
- `src/karafunConnection.js` is the actual socket - connects to `https://www.karafun.com`,
  authenticates, listens for `queue`/`status`, and writes a debounced (max ~2/sec) mirror to
  `public.karafun_state`. The connect/transform logic is ported from `src/hooks/useKaraFunData.js`,
  not reinvented.
- `src/commandProcessor.js` is the one consumer of a party's `public.karafun_commands` queue - it
  subscribes to `postgres_changes` INSERTs (plus an explicit catch-up query on start, since
  Realtime has no initial-snapshot replay) and processes pending commands FIFO against the same
  `KaraFunConnection` socket, which is what actually closes issue #29 (the API route authorizes;
  this executes).
- `src/autoSort.js` is the opt-in (`karafunAutoSortEnabled`, off by default, stored in
  `settings.appearance`) round-robin queue reordering, ported into the relay so there's
  structurally one process issuing moves per party - see design doc §5/§9.
- `src/lease.js` holds one long-lived direct Postgres connection per active party and uses
  `pg_try_advisory_lock` for mutual exclusion between relay instances - see the design doc §4 for
  why this matters even with one instance (deploy overlap). Strictly better than the old
  Firestore-transaction/TTL-lease design: the lock releases the instant its connection dies
  (crash, network drop), not after some expiry window.
- `src/supabaseAdmin.js` is a plain service-role client (PostgREST + Realtime), ported from
  `src/lib/supabase-admin.js` - duplicated, not shared, since this is a separate package/runtime.

## Requires

Before this can mirror anything for real:

1. **A Supabase service-role key** (PostgREST/Realtime access) - `NEXT_PUBLIC_SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`, set directly in Dokploy's environment config (or a local
   `relay/.env` for dev).
2. **A direct Postgres connection** (for `lease.js`'s advisory locks) - `SUPABASE_DB_HOST`,
   `SUPABASE_DB_PORT` (Supavisor's **session-mode** pooler, not transaction-mode - advisory locks
   need a stable backend session across queries), `SUPABASE_DB_USER` (Supavisor's
   `postgres.<tenant_id>` tenant-suffixed format), `SUPABASE_DB_PASSWORD`, `SUPABASE_DB_NAME`
   (usually `postgres`).

## Local dev

```bash
cd relay
npm install
cp .env.example .env   # fill in the Supabase values above
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
