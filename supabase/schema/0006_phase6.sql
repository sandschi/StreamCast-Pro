-- StreamCast Pro: Phase 6 schema additions (relay service)
--
-- karafun_commands needs realtime so relay/src/commandProcessor.js can
-- subscribe to postgres_changes INSERTs instead of polling - the relay
-- connects with the service-role key, which bypasses RLS for both the
-- subscription and the row reads/writes it does, same as every other
-- service-role Realtime subscription in this migration (see
-- supabase/schema/0005_phase4.sql's users-table precedent).

alter publication supabase_realtime add table public.karafun_commands;
