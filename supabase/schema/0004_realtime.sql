-- StreamCast Pro: Realtime publication membership (migration plan §4/§9)
-- postgres_changes only streams for tables explicitly added to this
-- publication - RLS on the table still applies per-connection on top of
-- this, so adding a table here doesn't bypass anon/authenticated scoping,
-- it just makes changes to any row a role can already SELECT streamable.
-- Only the 4 tables the public overlay page needs are added here; later
-- phases add whatever their own hooks need (online, permissions,
-- karafun_commands, etc.) as those get ported.

alter publication supabase_realtime add table public.settings;
alter publication supabase_realtime add table public.active_message;
alter publication supabase_realtime add table public.overlay_triggers;
alter publication supabase_realtime add table public.karafun_state;
