-- StreamCast Pro: RLS hardening from the PR #36 CodeRabbit review
--
-- Four independent fixes, safe to apply in one go (and idempotent - every
-- policy/function is dropped-if-exists and recreated). Amended 2026-09-27
-- after first being applied: karaoke_requests_requester_duet's WITH CHECK
-- now also restricts status (re-applied live on its own, see section 3).
--
-- 1. users_insert: remove 0007's username-based bootstrap branch. It trusted
--    the client-supplied twitch_username, so any new account could insert
--    its own row as {twitch_username: 'Sandschi', status: 'approved'} and
--    skip admin review (lower() matched, and the case-sensitive UNIQUE on
--    twitch_username didn't collide with an existing 'sandschi'). The
--    chicken-and-egg 0007 worked around is now solved server-side instead:
--    /api/set-admin-claim grants is_master_admin from the caller's verified
--    Twitch identity (auth.identities, not the stale hardcoded UUID), and
--    AuthContext.js only writes status='approved' once the JWT carries that
--    claim - which this policy's is_master_admin() branch already allows.
--    (0007's "caught by AuthContext.js's own try/catch" was also wrong -
--    supabase-js returns RLS rejections as { error }, it doesn't throw;
--    AuthContext.js now logs them.)
--
-- 2. permissions: a non-mod could PATCH their own row's role to 'mod' -
--    column grants apply to the whole authenticated role, not per policy, so
--    permissions_self_update's "viewer_id = auth.uid()" let the role column
--    through. Guard trigger below (same shape as enforce_users_update).
--
-- 3. karaoke_requests: the non-mod UPDATE policies had no WITH CHECK, so
--    Postgres reused USING for the new row - which no legitimate non-mod
--    transition could pass (target_responds requires the NEW row to still
--    be 'pending', claim_public requires it to still be 'public'). Singers
--    couldn't accept, claim, or answer duet invites at all; only the
--    mod_all policy (broadcaster/mods) worked, which is why it went unseen.
--
-- 4. get_broadcaster_profile: add twitch_id, so useChatData.js can resolve a
--    host's channel name + emotes through it (users_select only lets a user
--    read their own row - mods/viewers on ?host= got null and chat never
--    connected).

-- ============================================================
-- 1. users
-- ============================================================
drop policy if exists users_insert on public.users;

create policy users_insert on public.users for insert to authenticated
  with check ((auth.uid() = id and (status is null or status = 'waiting')) or is_master_admin());

-- Case-insensitive uniqueness. The client always lowercases, but the column
-- itself never enforced it, so 'Sandschi' and 'sandschi' could coexist.
-- NOTE: fails if case-only duplicates already exist - check first with
--   select lower(twitch_username), count(*) from public.users
--   group by 1 having count(*) > 1;
create unique index if not exists users_twitch_username_lower_key
  on public.users (lower(twitch_username));

-- ============================================================
-- 2. permissions
-- ============================================================
-- Mods (incl. the broadcaster - is_channel_moderator covers auth.uid() =
-- channel) and the master admin bypass entirely. auth.uid() is null for the
-- service role / pg_cron / direct SQL, which never go through a user's JWT.
-- Everyone else may only flip their own participating/sitting_out.
create or replace function public.enforce_permissions_update() returns trigger as $$
begin
  if auth.uid() is null or public.is_master_admin() or public.is_channel_moderator(old.user_id) then
    return new;
  end if;
  if new.role is distinct from old.role
     or new.display_name is distinct from old.display_name
     or new.photo_url is distinct from old.photo_url
     or new.twitch_username is distinct from old.twitch_username
     or new.user_id is distinct from old.user_id
     or new.viewer_id is distinct from old.viewer_id then
    raise exception 'only participating/sitting_out may change outside mod actions';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists permissions_update_guard on public.permissions;
create trigger permissions_update_guard before update on public.permissions
  for each row execute function public.enforce_permissions_update();

drop policy if exists permissions_self_update on public.permissions;
create policy permissions_self_update on public.permissions for update to authenticated
  using (viewer_id = auth.uid())
  with check (viewer_id = auth.uid());

-- ============================================================
-- 3. karaoke_requests
-- ============================================================
-- enforce_karaoke_request_transition (0002) still locks song/requested_by/
-- kind/user_id for non-mods; these only describe which result rows each
-- actor may produce.

-- Targeted singer (song request or duet invitee), while still pending:
-- accept, decline (duet), or pass it on to public (declineAsTarget).
drop policy if exists karaoke_requests_target_responds on public.karaoke_requests;
create policy karaoke_requests_target_responds on public.karaoke_requests for update to authenticated
  using (target_singer_id = auth.uid() and status = 'pending')
  with check (
    (target_singer_id = auth.uid() and status in ('accepted', 'declined'))
    or (status = 'public' and target_singer_id is null)
  );

-- Claiming a public request (acceptRequest on a 'public' row).
drop policy if exists karaoke_requests_claim_public on public.karaoke_requests;
create policy karaoke_requests_claim_public on public.karaoke_requests for update to authenticated
  using (status = 'public' and target_singer_id is null
         and (is_channel_moderator(user_id) or is_participating_singer(user_id)))
  with check (status = 'accepted'
              and (target_singer_id is null or target_singer_id = auth.uid())
              and (is_channel_moderator(user_id) or is_participating_singer(user_id)));

-- Requester's own duet invite. The requester only ever drops it
-- (dropDeclinedDuet / singSoloAfterDecline -> 'dropped') or re-invites
-- (reinviteDuet -> 'pending' with a new target). 'accepted'/'declined' are
-- the invitee's answer (target_responds above) - letting the requester
-- write 'accepted' would let them queue a duet under someone's name without
-- that person ever agreeing (resolveQueueSingerName trusts the status).
drop policy if exists karaoke_requests_requester_duet on public.karaoke_requests;
create policy karaoke_requests_requester_duet on public.karaoke_requests for update to authenticated
  using (requested_by = auth.uid() and kind = 'duet')
  with check (requested_by = auth.uid() and kind = 'duet' and status in ('pending', 'dropped'));

-- ============================================================
-- 4. get_broadcaster_profile (+ twitch_id)
-- ============================================================
-- Return type changes, so it has to be dropped rather than replaced.
drop function if exists public.get_broadcaster_profile(uuid);

create function public.get_broadcaster_profile(target_id uuid)
returns table (id uuid, twitch_username text, display_name text, photo_url text, status text, twitch_id text)
as $$
  select u.id, u.twitch_username, u.display_name, u.photo_url, u.status, u.twitch_id
  from public.users u
  where u.id = target_id;
$$ language sql stable security definer set search_path = public;
revoke all on function public.get_broadcaster_profile(uuid) from public;
grant execute on function public.get_broadcaster_profile(uuid) to authenticated;
