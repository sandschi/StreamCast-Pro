-- StreamCast Pro: limit what mods can change on a broadcaster's settings row
--
-- settings_mod_rotation (0002) only scopes WHICH rows a mod may update -
-- column grants apply to the whole authenticated role, so a mod could
-- change every settings column, including the overlay's appearance and
-- display duration (PR #36 CodeRabbit review). Decided rule (2026-09-26):
-- mods help run KaraFun and nothing else - whatever the mod-visible
-- KaraFun page (src/components/dashboard-shell/KaraFunPane.js) writes is
-- theirs; everything on the broadcaster's own Settings page is not.
--
-- Mod-writable, matching KaraFunPane.js's non-broadcaster-gated controls:
--   columns:          karafun_party_id, karaoke_rotation_order
--   appearance keys:  karafunOverlayQueueEnabled, karafunOverlayNowPlayingEnabled,
--                     karafunOverlayTheme, karafunQueuePosX/Y,
--                     karafunNowPlayingPosX/Y
-- Broadcaster-only (even though some sit on the KaraFun page, they're
-- already gated to the broadcaster there): karaoke_enabled,
-- karaoke_requests_open, karafun_enabled, display_duration, and every
-- other appearance key (karafunAutoSortEnabled included).
--
-- If a new control is added to KaraFunPane.js for mods, add its key here.
--
-- Forbidden columns raise; forbidden appearance keys are silently kept at
-- their old values instead. Mods always send the whole appearance blob
-- (PostgREST can't partially merge jsonb - see settingsMapping.js), built
-- from their local copy of the broadcaster's settings, so a slightly stale
-- copy would otherwise make every KaraFun toggle fail outright.

create or replace function public.enforce_settings_update() returns trigger as $$
declare
  mod_appearance_keys constant text[] := array[
    'karafunOverlayQueueEnabled', 'karafunOverlayNowPlayingEnabled', 'karafunOverlayTheme',
    'karafunQueuePosX', 'karafunQueuePosY', 'karafunNowPlayingPosX', 'karafunNowPlayingPosY'
  ];
begin
  -- Owner, master admin, and the service role / pg_cron / direct SQL
  -- (auth.uid() is null - e.g. /api/overlay's remote-control toggles).
  if auth.uid() is null or auth.uid() = old.user_id or public.is_master_admin() then
    return new;
  end if;

  -- Past this point the caller is a mod (settings_mod_rotation's USING is
  -- the only non-owner UPDATE policy).
  if new.user_id is distinct from old.user_id
     or new.karafun_enabled is distinct from old.karafun_enabled
     or new.karaoke_enabled is distinct from old.karaoke_enabled
     or new.karaoke_requests_open is distinct from old.karaoke_requests_open
     or new.display_duration is distinct from old.display_duration then
    raise exception 'mods may only change KaraFun settings (party ID, rotation, KaraFun overlay widgets)';
  end if;

  new.appearance := (coalesce(old.appearance, '{}'::jsonb) - mod_appearance_keys)
    || coalesce((select jsonb_object_agg(key, value)
                 from jsonb_each(coalesce(new.appearance, '{}'::jsonb))
                 where key = any(mod_appearance_keys)), '{}'::jsonb);
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists settings_update_guard on public.settings;
create trigger settings_update_guard before update on public.settings
  for each row execute function public.enforce_settings_update();

-- Same row scope as before; explicit WITH CHECK, and a name that no longer
-- claims it's rotation-only.
drop policy if exists settings_mod_rotation on public.settings;
drop policy if exists settings_mod_karafun on public.settings;
create policy settings_mod_karafun on public.settings for update to authenticated
  using (is_channel_moderator(user_id))
  with check (is_channel_moderator(user_id));
