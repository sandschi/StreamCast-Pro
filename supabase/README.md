# Self-hosted Supabase (Firebase migration)

Self-hosted Supabase stack (Postgres + Auth/GoTrue + PostgREST + Realtime + Studio,
fronted by Envoy) replacing Firebase per the migration plan. Deployed via Dokploy
as a Compose resource in the same "overlay" project as the KaraFun relay, on the
same box. Domain: `base.sandschi.xyz`, Traefik/Dokploy handles TLS the same way
it does for the relay - this compose file only exposes plain HTTP internally.

Trimmed from the official `supabase/supabase` reference compose (`docker/`):
**not included** - `storage`, `imgproxy`, `functions` (edge runtime), and the
`docker-compose.logs.yml` layer (Logflare + Vector). Nothing in this app needs
file uploads or edge functions, and Logs/Analytics were never part of the
default config to begin with. See the migration plan's "Optional Supabase
services" decision for the full reasoning.

## Structure

- `docker-compose.yml` - the trimmed stack.
- `volumes/api/envoy/` - Envoy gateway config (the current default API gateway,
  replacing Kong in older Supabase versions; exposes a `kong` network alias for
  compatibility).
- `volumes/db/*.sql` - Postgres init scripts run once on first boot (realtime,
  webhooks, roles, JWT settings, `_supabase` schema, logs, pooler support).
- `volumes/db/data/` - Postgres's actual data directory. Gitignored, created at
  runtime, never committed.
- `volumes/pooler/pooler.exs` - Supavisor (connection pooler) config.
- `volumes/snippets/`, `volumes/functions/` - empty, kept only so Studio's
  snippet-management UI has somewhere to mount; no edge functions actually run.

## Env vars

All secrets/config are supplied by Dokploy's environment variable UI for this
Compose resource, never committed here. See `ENV_VARS.md` for the full list and
what each one is for.

## Post-deploy steps (not automated by the compose file itself)

1. `CREATE EXTENSION IF NOT EXISTS pg_cron;` once the `db` service is healthy -
   bundled in the `supabase/postgres` image, just needs enabling. Keep
   `POSTGRES_DB=postgres` (the default) - pg_cron is documented to break on
   self-hosted instances when it's renamed (supabase/supabase#42413).
2. Configure the Twitch provider's redirect URI
   (`https://base.sandschi.xyz/auth/v1/callback`) as a second redirect URI on
   the existing Twitch Developer Console app (same Client ID Firebase already
   uses) - do not create a new Twitch app.
