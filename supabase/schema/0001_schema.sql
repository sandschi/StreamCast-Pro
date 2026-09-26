-- StreamCast Pro: Postgres schema (migration plan §1)
-- Every table that belongs to a broadcaster/person FKs to users.id (which FKs
-- to auth.users.id) with ON DELETE CASCADE, so deleting one auth.users row
-- fully replaces Firestore's recursiveDelete - see plan §5.

create extension if not exists pg_cron;

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  twitch_id text,
  twitch_username text unique,
  display_name text,
  photo_url text,
  status text not null default 'waiting' check (status in ('waiting', 'approved')),
  last_login timestamptz,
  created_at timestamptz not null default now()
);

create table public.settings (
  user_id uuid primary key references public.users(id) on delete cascade,
  appearance jsonb not null default '{}'::jsonb,
  karafun_enabled boolean not null default false,
  karafun_party_id text,
  karaoke_enabled boolean not null default false,
  karaoke_requests_open boolean not null default true,
  karaoke_rotation_order text[] not null default '{}',
  display_duration integer not null default 10
);

create table public.private_config (
  user_id uuid primary key references public.users(id) on delete cascade,
  api_token text
);

create table public.private_twitch_tokens (
  user_id uuid primary key references public.users(id) on delete cascade,
  access_token_encrypted text not null,
  updated_at timestamptz not null default now()
);

create table public.history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  twitch_message_id text,
  login text,
  payload jsonb not null default '{}'::jsonb,
  "timestamp" timestamptz not null default now()
);
create index history_user_ts_idx on public.history (user_id, "timestamp" desc);
create index history_user_msgid_idx on public.history (user_id, twitch_message_id);
create index history_user_login_idx on public.history (user_id, login);

create table public.message_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  queued_at timestamptz not null default now(),
  twitch_message_id text,
  login text,
  payload jsonb not null default '{}'::jsonb
);
create index message_queue_user_queued_idx on public.message_queue (user_id, queued_at asc);
create index message_queue_user_msgid_idx on public.message_queue (user_id, twitch_message_id);
create index message_queue_user_login_idx on public.message_queue (user_id, login);

-- Single row per broadcaster (matches Firestore's active_message/current
-- singleton doc). expires_at is what makes the pg_cron+trigger scheduler
-- replacement in 0003_cron.sql work - NULL means "permanent" (never
-- auto-expires client-side either, today).
create table public.active_message (
  user_id uuid primary key references public.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  expires_at timestamptz,
  created_at timestamptz not null default now() -- needed to age out stale
  -- permanent (expires_at IS NULL) messages in the daily cleanup job, see 0003_cron.sql
);

create table public.suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  submitted_by uuid not null references public.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index suggestions_user_idx on public.suggestions (user_id);

create table public.online (
  user_id uuid not null references public.users(id) on delete cascade,
  viewer_id uuid not null references public.users(id) on delete cascade,
  last_seen timestamptz not null default now(),
  display_name text,
  photo_url text,
  twitch_username text,
  primary key (user_id, viewer_id)
);
create index online_viewer_idx on public.online (viewer_id);
create index online_last_seen_idx on public.online (last_seen);

create table public.permissions (
  user_id uuid not null references public.users(id) on delete cascade,
  viewer_id uuid not null references public.users(id) on delete cascade,
  role text not null check (role in ('mod', 'singer', 'viewer', 'denied')),
  participating boolean not null default false,
  sitting_out boolean not null default false,
  display_name text,
  photo_url text,
  twitch_username text,
  primary key (user_id, viewer_id)
);
create index permissions_viewer_idx on public.permissions (viewer_id);

create table public.karaoke_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  kind text not null default 'request' check (kind in ('request', 'duet')),
  requested_by uuid not null references public.users(id) on delete cascade,
  requested_by_name text,
  target_singer_id uuid references public.users(id) on delete set null,
  song jsonb not null default '{}'::jsonb,
  status text not null check (status in ('pending', 'public', 'accepted', 'declined', 'expired')),
  respond_by timestamptz,
  public_expire_by timestamptz,
  created_at timestamptz not null default now()
);
create index karaoke_requests_user_created_idx on public.karaoke_requests (user_id, created_at asc);
create index karaoke_requests_user_status_idx on public.karaoke_requests (user_id, status);

-- Observability-only once advisory locks own the actual mutual exclusion
-- (plan §5) - not itself the locking mechanism.
create table public.karafun_relay (
  user_id uuid primary key references public.users(id) on delete cascade,
  instance_id text,
  party_id text,
  acquired_at timestamptz
);

create table public.karafun_commands (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  action text not null,
  params jsonb not null default '{}'::jsonb,
  requested_by uuid references public.users(id) on delete set null,
  requested_by_role text,
  status text not null default 'pending' check (status in ('pending', 'done', 'failed')),
  error text,
  created_at timestamptz not null default now()
);
create index karafun_commands_user_status_idx on public.karafun_commands (user_id, status, created_at);

create table public.karafun_state (
  user_id uuid primary key references public.users(id) on delete cascade,
  current_song jsonb,
  upcoming jsonb,
  active_singer_id uuid references public.users(id) on delete set null,
  play_state text,
  connected boolean not null default false
);

create table public.overlay_triggers (
  user_id uuid primary key references public.users(id) on delete cascade,
  now_playing_triggered_at timestamptz
);
