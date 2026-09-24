# Env vars for the Dokploy Compose resource

Set these in Dokploy's environment variable UI for this stack, not in a
committed file (`.env*` is already globally gitignored in this repo anyway).
Placeholder values shown below - real values are generated at deploy time and
live only in Dokploy.

## Secrets (generate fresh, never reuse the .env.example demo values)

| Var | Purpose |
|---|---|
| `POSTGRES_PASSWORD` | Postgres superuser password |
| `JWT_SECRET` | HS256 signing secret for `ANON_KEY`/`SERVICE_ROLE_KEY` and all service-to-service JWT verification |
| `ANON_KEY` | JWT signed with `JWT_SECRET`, `role: anon` - the public client key |
| `SERVICE_ROLE_KEY` | JWT signed with `JWT_SECRET`, `role: service_role` - bypasses RLS, server-only |
| `DASHBOARD_PASSWORD` (+ `DASHBOARD_USERNAME`) | Basic auth in front of Studio via the gateway |
| `SECRET_KEY_BASE` | Realtime + Supavisor internal encryption (>=64 chars) |
| `VAULT_ENC_KEY` | Supavisor's own encrypted config storage (32 chars) |
| `PG_META_CRYPTO_KEY` | Studio->postgres-meta connection string encryption |
| `REALTIME_DB_ENC_KEY` | Realtime's `_realtime` schema field encryption (16 chars) |
| `POOLER_TENANT_ID` | Supavisor tenant identifier (any unique string) |
| `TWITCH_CLIENT_ID` / `TWITCH_SECRET` | The **existing** Twitch Developer Console app's credentials (same one Firebase Auth already uses) |

## URLs

| Var | Value |
|---|---|
| `SUPABASE_PUBLIC_URL` | `https://base.sandschi.xyz` |
| `API_EXTERNAL_URL` | `https://base.sandschi.xyz/auth/v1` |
| `SITE_URL` | The beta app's URL (Vercel Preview deployment) |
| `ADDITIONAL_REDIRECT_URLS` | Any other URLs GoTrue should allow redirecting to |

## Fixed / non-secret

| Var | Value |
|---|---|
| `POSTGRES_HOST` | `db` |
| `POSTGRES_DB` | `postgres` (keep as default - see pg_cron note in README.md) |
| `POSTGRES_PORT` | `5432` |
| `POOLER_PROXY_PORT_TRANSACTION` | `6543` |
| `POOLER_DEFAULT_POOL_SIZE` | `20` |
| `POOLER_MAX_CLIENT_CONN` | `100` |
| `POOLER_DB_POOL_SIZE` | `5` |
| `JWT_EXPIRY` | `3600` |
| `DISABLE_SIGNUP` | `false` |
| `ENABLE_EMAIL_SIGNUP` | `true` (kept as a fallback path; real users only use Twitch) |
| `ENABLE_EMAIL_AUTOCONFIRM` | `false` |
| `STUDIO_DEFAULT_ORGANIZATION` / `STUDIO_DEFAULT_PROJECT` | `StreamCast Pro` / `Beta` |
| `PGRST_DB_SCHEMAS` | `public` |
| `API_GW_HTTP_PORT` | `8000` (internal container port; Traefik fronts this with TLS) |
| `MAILER_URLPATHS_*` | `/auth/v1/verify` (all four) |
| `SMTP_*` | Left at .env.example placeholders - no real mail sending needed since email signup is just a fallback path |

## Not set (intentionally left empty/unused)

`SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `JWT_KEYS`, `JWT_JWKS`,
`ANON_KEY_ASYMMETRIC`, `SERVICE_ROLE_KEY_ASYMMETRIC` - the newer
opaque-key/asymmetric-JWT scheme. The legacy symmetric `JWT_SECRET` +
`ANON_KEY`/`SERVICE_ROLE_KEY` pair is fully supported and simpler; nothing in
the migration plan calls for the newer scheme.
