-- StreamCast Pro: RLS policies + helper functions (migration plan §2)

-- ============================================================
-- Helper functions
-- ============================================================

-- auth.jwt() doesn't exist in this build of supabase/postgres (confirmed:
-- only auth.email()/role()/uid() are present), and `postgres` here isn't a
-- superuser and isn't a member of supabase_auth_admin (the auth schema's
-- owner) either - Supabase's "remove superuser access" self-hosting model,
-- see docker-compose.yml's STUDIO_PG_META_URL comment. Rather than escalate
-- privileges, defined in public (which postgres does own) instead - same
-- underlying session-setting lookup PostgREST already populates.
create function public.requesting_jwt() returns jsonb as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$ language sql stable;

create function public.is_master_admin() returns boolean as $$
  select coalesce((public.requesting_jwt() -> 'app_metadata' ->> 'is_master_admin')::boolean, false);
$$ language sql stable;

create function public.is_channel_moderator(channel_id uuid) returns boolean as $$
  select auth.uid() = channel_id or exists (
    select 1 from public.permissions
    where user_id = channel_id and viewer_id = auth.uid() and role = 'mod'
  );
$$ language sql stable security definer set search_path = public;

create function public.is_participating_singer(channel_id uuid) returns boolean as $$
  select exists (
    select 1 from public.permissions
    where user_id = channel_id and viewer_id = auth.uid()
      and role = 'singer' and participating = true
  );
$$ language sql stable security definer set search_path = public;

-- Faithful replacement for Firestore's "any authenticated user may `get` one
-- broadcaster's profile by ID" (used to resolve a channel name for mods/
-- viewers connecting chat in someone else's dashboard, and the
-- [username] page's account-exists check) without granting blanket
-- table-wide SELECT on `users` the way that would in Postgres (RLS can't
-- distinguish a point lookup from a full scan the way Firestore's get/list
-- split can - see plan notes). Mirrors the original: authenticated only, no
-- anon access.
create function public.get_broadcaster_profile(target_id uuid)
returns table (id uuid, twitch_username text, display_name text, photo_url text, status text)
as $$
  select u.id, u.twitch_username, u.display_name, u.photo_url, u.status
  from public.users u
  where u.id = target_id;
$$ language sql stable security definer set search_path = public;
revoke all on function public.get_broadcaster_profile(uuid) from public;
grant execute on function public.get_broadcaster_profile(uuid) to authenticated;

-- ============================================================
-- Enable RLS everywhere
-- ============================================================

alter table public.users enable row level security;
alter table public.settings enable row level security;
alter table public.private_config enable row level security;
alter table public.private_twitch_tokens enable row level security;
alter table public.history enable row level security;
alter table public.message_queue enable row level security;
alter table public.active_message enable row level security;
alter table public.suggestions enable row level security;
alter table public.online enable row level security;
alter table public.permissions enable row level security;
alter table public.karaoke_requests enable row level security;
alter table public.karafun_relay enable row level security;
alter table public.karafun_commands enable row level security;
alter table public.karafun_state enable row level security;
alter table public.overlay_triggers enable row level security;

-- ============================================================
-- users
-- ============================================================
grant select, insert, update on public.users to authenticated;

create policy users_select on public.users for select to authenticated
  using (auth.uid() = id or is_master_admin());

-- Master admin bypasses the status='waiting' constraint: unlike every other
-- broadcaster, their own row is inserted (or re-inserted, after a data-loss
-- event) with status already 'approved' - and PostgREST's upsert re-checks
-- this INSERT policy's WITH CHECK even when it resolves to an UPDATE via
-- ON CONFLICT, so this isn't just a one-time bootstrap concern.
create policy users_insert on public.users for insert to authenticated
  with check ((auth.uid() = id and (status is null or status = 'waiting')) or is_master_admin());

create policy users_update on public.users for update to authenticated
  using (auth.uid() = id or is_master_admin())
  with check (auth.uid() = id or is_master_admin());

-- Field lock: a non-admin self-update may not change status/twitch_username
-- (Firestore's affectedKeys().hasOnly(...) has no direct RLS equivalent -
-- WITH CHECK only sees the new row, not which columns changed).
create function public.enforce_users_update() returns trigger as $$
begin
  if not public.is_master_admin() then
    if new.status is distinct from old.status or new.twitch_username is distinct from old.twitch_username then
      raise exception 'status/twitch_username are locked after creation';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger users_update_guard before update on public.users
  for each row execute function public.enforce_users_update();

-- ============================================================
-- settings (public overlay-read surface)
-- ============================================================
grant select on public.settings to anon, authenticated;
grant insert, delete on public.settings to authenticated;
grant update (appearance, karafun_enabled, karafun_party_id, karaoke_enabled,
              karaoke_requests_open, display_duration) on public.settings to authenticated;
grant update (karaoke_rotation_order) on public.settings to authenticated;

create policy settings_select on public.settings for select to anon, authenticated using (true);

create policy settings_owner_write on public.settings for insert to authenticated
  with check (auth.uid() = user_id or is_master_admin());

create policy settings_owner_update on public.settings for update to authenticated
  using (auth.uid() = user_id or is_master_admin());

create policy settings_owner_delete on public.settings for delete to authenticated
  using (auth.uid() = user_id or is_master_admin());

-- Mods may update only karaoke_rotation_order (column grant above scopes
-- what they can touch; this policy scopes which rows).
create policy settings_mod_rotation on public.settings for update to authenticated
  using (is_channel_moderator(user_id));

-- ============================================================
-- private_config (owner-only)
-- ============================================================
grant select, insert, update, delete on public.private_config to authenticated;

create policy private_config_all on public.private_config for all to authenticated
  using (auth.uid() = user_id or is_master_admin())
  with check (auth.uid() = user_id or is_master_admin());

-- ============================================================
-- private_twitch_tokens (deny-all to every client role - service_role only,
-- which always bypasses RLS entirely; matches Firestore's
-- `allow read, write: if false`)
-- ============================================================
-- No grants, no policies - RLS with zero policies denies everything to
-- anon/authenticated. Intentionally left empty.

-- ============================================================
-- history (mod-only)
-- ============================================================
grant select, insert, update, delete on public.history to authenticated;

create policy history_mod_all on public.history for all to authenticated
  using (is_channel_moderator(user_id))
  with check (is_channel_moderator(user_id));

-- ============================================================
-- message_queue (mod-only)
-- ============================================================
grant select, insert, update, delete on public.message_queue to authenticated;

create policy message_queue_mod_all on public.message_queue for all to authenticated
  using (is_channel_moderator(user_id))
  with check (is_channel_moderator(user_id));

-- ============================================================
-- active_message (public overlay-read surface)
-- ============================================================
grant select on public.active_message to anon, authenticated;
grant insert, update, delete on public.active_message to authenticated;

create policy active_message_select on public.active_message for select to anon, authenticated using (true);

create policy active_message_mod_write on public.active_message for all to authenticated
  using (is_channel_moderator(user_id))
  with check (is_channel_moderator(user_id));

-- ============================================================
-- suggestions (TIGHTENED per confirmed decision - scoped to the channel's
-- own mods + the submitter, not any authenticated user)
-- ============================================================
grant select, insert, delete on public.suggestions to authenticated;
grant update on public.suggestions to authenticated;

create policy suggestions_select on public.suggestions for select to authenticated
  using (is_channel_moderator(user_id) or submitted_by = auth.uid());

create policy suggestions_insert on public.suggestions for insert to authenticated
  with check (submitted_by = auth.uid());

create policy suggestions_update on public.suggestions for update to authenticated
  using (is_channel_moderator(user_id))
  with check (is_channel_moderator(user_id));

create policy suggestions_delete on public.suggestions for delete to authenticated
  using (is_channel_moderator(user_id) or submitted_by = auth.uid());

-- ============================================================
-- online (public overlay-read surface)
-- ============================================================
grant select on public.online to anon, authenticated;
grant insert, update, delete on public.online to authenticated;

create policy online_select on public.online for select to anon, authenticated using (true);

create policy online_self_write on public.online for all to authenticated
  using (auth.uid() = viewer_id)
  with check (auth.uid() = viewer_id);

-- ============================================================
-- permissions
-- ============================================================
grant select on public.permissions to authenticated;
grant insert, delete on public.permissions to authenticated;
grant update (role, display_name, photo_url, twitch_username) on public.permissions to authenticated;
grant update (participating, sitting_out) on public.permissions to authenticated;

create policy permissions_select on public.permissions for select to authenticated using (true);

create policy permissions_mod_insert on public.permissions for insert to authenticated
  with check (is_channel_moderator(user_id));

create policy permissions_mod_delete on public.permissions for delete to authenticated
  using (is_channel_moderator(user_id));

create policy permissions_mod_update on public.permissions for update to authenticated
  using (is_channel_moderator(user_id));

-- Self-update limited to participating/sitting_out by the column grant above.
create policy permissions_self_update on public.permissions for update to authenticated
  using (viewer_id = auth.uid());

-- ============================================================
-- karaoke_requests
-- ============================================================
grant select, insert, delete on public.karaoke_requests to authenticated;
grant update on public.karaoke_requests to authenticated;

create policy karaoke_requests_select on public.karaoke_requests for select to authenticated using (true);

-- Plain request from any signed-in viewer (only while requests are open),
-- or a duet invite from a mod/participating singer.
create policy karaoke_requests_insert on public.karaoke_requests for insert to authenticated
  with check (
    requested_by = auth.uid() and (
      (kind = 'duet' and (is_channel_moderator(user_id) or is_participating_singer(user_id)))
      or (kind <> 'duet' and coalesce((select karaoke_requests_open from public.settings where user_id = karaoke_requests.user_id), true))
    )
  );

-- Mod: full control
create policy karaoke_requests_mod_all on public.karaoke_requests for update to authenticated
  using (is_channel_moderator(user_id)) with check (is_channel_moderator(user_id));

-- Target responds (accept/decline) while still pending
create policy karaoke_requests_target_responds on public.karaoke_requests for update to authenticated
  using (target_singer_id = auth.uid() and status = 'pending');

-- Claim a public request (any eligible singer or mod)
create policy karaoke_requests_claim_public on public.karaoke_requests for update to authenticated
  using (status = 'public' and target_singer_id is null
         and (is_channel_moderator(user_id) or is_participating_singer(user_id)));

-- Requester manages their own duet invite (drop / reinvite after decline)
create policy karaoke_requests_requester_duet on public.karaoke_requests for update to authenticated
  using (requested_by = auth.uid() and kind = 'duet');

create policy karaoke_requests_delete on public.karaoke_requests for delete to authenticated
  using (requested_by = auth.uid() or target_singer_id = auth.uid() or is_channel_moderator(user_id));

-- Field-diffing guard (Firestore's affectedKeys().hasOnly([...]) equivalent)
-- - mods bypass entirely; everyone else may only move status/respond_by/
-- public_expire_by/target_singer_id, never rewrite song/requested_by/kind.
create function public.enforce_karaoke_request_transition() returns trigger as $$
begin
  if public.is_channel_moderator(new.user_id) then
    return new;
  end if;
  if new.song is distinct from old.song
     or new.requested_by is distinct from old.requested_by
     or new.requested_by_name is distinct from old.requested_by_name
     or new.kind is distinct from old.kind
     or new.user_id is distinct from old.user_id then
    raise exception 'only status/respond_by/public_expire_by/target_singer_id may change outside mod actions';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger karaoke_requests_update_guard before update on public.karaoke_requests
  for each row execute function public.enforce_karaoke_request_transition();

-- ============================================================
-- karafun_relay (observability-only row, see plan §5)
-- ============================================================
grant select on public.karafun_relay to authenticated;

create policy karafun_relay_select on public.karafun_relay for select to authenticated
  using (is_channel_moderator(user_id));
-- No write policies for anon/authenticated - service_role only.

-- ============================================================
-- karafun_commands (mod-read only; writes are service_role only, since the
-- API route/relay insert after their own authorization check rather than
-- relying on RLS for the write itself - see plan §5)
-- ============================================================
grant select on public.karafun_commands to authenticated;

create policy karafun_commands_select on public.karafun_commands for select to authenticated
  using (is_channel_moderator(user_id));

-- ============================================================
-- karafun_state (public overlay-read surface; service_role-only writes)
-- ============================================================
grant select on public.karafun_state to anon, authenticated;

create policy karafun_state_select on public.karafun_state for select to anon, authenticated using (true);

-- ============================================================
-- overlay_triggers (public overlay-read surface)
-- ============================================================
grant select on public.overlay_triggers to anon, authenticated;
grant insert, update, delete on public.overlay_triggers to authenticated;

create policy overlay_triggers_select on public.overlay_triggers for select to anon, authenticated using (true);

create policy overlay_triggers_owner_write on public.overlay_triggers for all to authenticated
  using (auth.uid() = user_id or is_master_admin())
  with check (auth.uid() = user_id or is_master_admin());
