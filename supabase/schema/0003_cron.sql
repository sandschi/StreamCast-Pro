-- StreamCast Pro: pg_cron scheduler consolidation (migration plan §6)
-- Replaces functions/index.js's dormant expireKaraokeRequests (never ran -
-- Cloud Functions v2 need the Blaze plan) and the client-side fallback
-- sweeps in useKaraokeData.js/useChatData.js (only ran while a dashboard
-- happened to be open). These run unconditionally, regardless of whether
-- anyone has the app open at all. Requires POSTGRES_DB to stay the default
-- `postgres` - pg_cron is documented to break otherwise on self-hosted
-- instances (supabase/supabase#42413).

-- Karaoke request expiry - once a minute, unconditionally.
select cron.schedule(
  'expire-karaoke-requests',
  '* * * * *',
  $$
  update public.karaoke_requests
  set status = 'declined', respond_by = null
  where status = 'pending' and kind = 'duet' and respond_by <= now();

  update public.karaoke_requests
  set status = 'public', target_singer_id = null, respond_by = null,
      public_expire_by = now() + interval '10 minutes'
  where status = 'pending' and kind <> 'duet' and respond_by <= now();

  update public.karaoke_requests
  set status = 'expired'
  where status = 'public' and public_expire_by <= now();
  $$
);

-- active_message expiry - a cron + trigger pair, not cron alone (plan §6):
-- the cron job just deletes expired rows; the AFTER DELETE trigger below
-- atomically promotes the oldest queued message into the now-empty slot.
-- Single writer (the trigger) means no "two dashboard tabs race on an
-- empty slot" scenario the client-side transaction-guarded version had to
-- worry about.
--
-- Runs once a minute - pg_cron's native granularity floor (this image
-- doesn't assume any sub-minute extension). A message can sit up to ~60s
-- past its nominal expires_at before this sweep catches it; only affects
-- cosmetic timing, not correctness (expires_at itself is the precise,
-- authoritative timestamp - anything reading active_message directly, like
-- the overlay, would need its own client-side hide-at-expires_at behavior
-- if sub-60s precision ever matters, same as it does today).
select cron.schedule(
  'expire-active-messages',
  '* * * * *',
  $$ delete from public.active_message where expires_at is not null and expires_at <= now(); $$
);

create function public.promote_queued_message() returns trigger as $$
declare
  next_msg record;
  next_expires_at timestamptz;
begin
  select * into next_msg from public.message_queue
  where user_id = old.user_id
  order by queued_at asc
  limit 1;

  if next_msg is null then
    return old;
  end if;

  -- duration lives in payload (seconds; absent or -1 means permanent),
  -- matching the app's existing convention.
  if (next_msg.payload ? 'duration') and (next_msg.payload->>'duration')::numeric > 0 then
    next_expires_at := now() + ((next_msg.payload->>'duration')::numeric * interval '1 second');
  else
    next_expires_at := null;
  end if;

  insert into public.active_message (user_id, payload, expires_at, created_at)
  values (old.user_id, next_msg.payload, next_expires_at, now());

  insert into public.history (user_id, twitch_message_id, login, payload)
  values (old.user_id, next_msg.twitch_message_id, next_msg.login, next_msg.payload);

  delete from public.message_queue where id = next_msg.id;

  return old;
end;
$$ language plpgsql security definer set search_path = public;

create trigger active_message_promote_next after delete on public.active_message
  for each row execute function public.promote_queued_message();

-- Daily cleanup (plan §6) - collapses cleanup-history.js/
-- cleanup-karaoke-requests.js/cleanup-chat-pipeline.js's per-user-loop +
-- 500-row-chunked batch deletes into one statement per table, no chunking
-- needed (Postgres has no such cap). retry-account-cleanup.js and
-- pending_cleanup_sweeps are NOT ported - eliminated outright by the FK
-- cascade from auth.users, see plan §5.
select cron.schedule(
  'cleanup-old-history',
  '0 3 * * *',
  $$ delete from public.history where "timestamp" < now() - interval '30 days'; $$
);

select cron.schedule(
  'cleanup-old-karaoke-requests',
  '5 3 * * *',
  $$ delete from public.karaoke_requests where created_at < now() - interval '30 days'; $$
);

select cron.schedule(
  'cleanup-chat-pipeline',
  '10 3 * * *',
  $$
  delete from public.suggestions where created_at < now() - interval '30 days';
  delete from public.message_queue where queued_at < now() - interval '30 days';
  delete from public.active_message where expires_at is null and created_at < now() - interval '30 days';
  $$
);
