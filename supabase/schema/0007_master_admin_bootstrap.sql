-- StreamCast Pro: fix the master-admin first-login RLS gap
--
-- Real bug hit during a Phase 9 db-wipe recovery (2026-09-26): users_insert
-- only allowed an insert when (auth.uid()=id and status in (null,'waiting'))
-- or is_master_admin(). AuthContext.js's client-side upsert writes
-- status='approved' directly for the known master-admin Twitch username on
-- the very FIRST login too (see isSandschi in AuthContext.js) - but
-- is_master_admin() reads the JWT's app_metadata claim, which can't be set
-- yet on a truly first-ever login (the claim is set by /api/set-admin-claim
-- AFTER this insert, via a separate service-role call). Chicken-and-egg:
-- every time auth.users gets wiped and the master admin logs in fresh, this
-- insert was silently rejected by RLS (caught by AuthContext.js's own
-- try/catch, no user-facing error), leaving them stuck on the
-- approval-pending screen until someone manually inserted the row with the
-- service-role key.
--
-- Fixed by adding a third bootstrap branch, mirroring the client's own
-- hardcoded username check exactly (not a new mechanism, just the same
-- check moved into SQL) - safe because it only ever grants what the
-- existing is_master_admin() JWT-claim branch already grants everyone else,
-- just without requiring the claim to exist yet.
drop policy users_insert on public.users;

create policy users_insert on public.users for insert to authenticated
  with check (
    (auth.uid() = id and (status is null or status = 'waiting'))
    or is_master_admin()
    or (auth.uid() = id and status = 'approved' and lower(twitch_username) = 'sandschi')
  );
