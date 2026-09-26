-- StreamCast Pro: Phase 4 schema additions (dashboard hooks client rewrite)
--
-- Three real constraint bugs found while porting the dashboard hooks -
-- caught because this app actually writes these exact values, not caught
-- by Phase 1's schema review since nothing had exercised these paths live
-- yet:
--   1. users.status only allowed 'waiting'/'approved' - BroadcastersPane
--      can also set 'denied' (see useBroadcastersData.js/dashboard/page.js's
--      gate screens), which would have been rejected outright.
--   2. karaoke_requests.kind only allowed 'request'/'duet' - the app has
--      always written 'song' (see useKaraokeData.js's submitRequest), never
--      literally 'request'.
--   3. karaoke_requests.status was missing 'dropped' - written by
--      singSoloAfterDecline/dropDeclinedDuet.

alter table public.users drop constraint users_status_check;
alter table public.users add constraint users_status_check
  check (status in ('waiting', 'approved', 'denied'));

alter table public.karaoke_requests drop constraint karaoke_requests_kind_check;
alter table public.karaoke_requests add constraint karaoke_requests_kind_check
  check (kind in ('song', 'duet'));
alter table public.karaoke_requests alter column kind set default 'song';

alter table public.karaoke_requests drop constraint karaoke_requests_status_check;
alter table public.karaoke_requests add constraint karaoke_requests_status_check
  check (status in ('pending', 'public', 'accepted', 'declined', 'expired', 'dropped'));

-- Realtime publication membership for the tables the Phase 4 hooks
-- subscribe to (see plan §4/§9 and the 0004_realtime.sql comment - later
-- phases add their own tables the same way as they get ported).
alter publication supabase_realtime add table public.users;
alter publication supabase_realtime add table public.permissions;
alter publication supabase_realtime add table public.online;
alter publication supabase_realtime add table public.karaoke_requests;
alter publication supabase_realtime add table public.suggestions;
alter publication supabase_realtime add table public.message_queue;
alter publication supabase_realtime add table public.history;

-- Faithful replacement for Firestore's public usernames/{username} lookup
-- collection (deleted per plan §1, folded into users.twitch_username
-- UNIQUE) - src/app/[username]/page.js is hit by logged-out visitors
-- resolving a friendly URL to a broadcaster's uid, so this needs to be
-- anon-readable, but as a narrow point lookup (like
-- get_broadcaster_profile above), not a blanket anon SELECT on `users`.
create function public.resolve_broadcaster_by_username(p_username text)
returns uuid as $$
  select id from public.users where lower(twitch_username) = lower(p_username) limit 1;
$$ language sql stable security definer set search_path = public;
revoke all on function public.resolve_broadcaster_by_username(text) from public;
grant execute on function public.resolve_broadcaster_by_username(text) to anon, authenticated;
