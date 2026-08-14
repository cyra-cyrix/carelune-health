-- ============================================================================
-- Carelune — table grants (run AFTER 0001). Fixes "42501: permission denied
-- for table …".
--
-- Enabling RLS does NOT grant access — it restricts it. The `authenticated`
-- role still needs table-level privileges, and RLS then decides which rows.
-- Supabase usually wires this up via default privileges, but tables created
-- directly in the SQL editor can miss it — hence the permission-denied errors.
--
-- We grant to `authenticated` only. `anon` (logged-out) stays with no access,
-- which is what we want: nothing is readable without signing in.
--
-- HOW TO APPLY: Supabase dashboard -> SQL Editor -> paste this file -> Run.
-- Then reload the app — the DB-backed screens should load.
-- ============================================================================

grant usage on schema public to authenticated;

-- All current tables: RLS still governs which rows each user sees/writes.
grant select, insert, update, delete on all tables in schema public to authenticated;

-- The RLS helper functions (my_role, is_staff, can_see_patient, …).
grant execute on all functions in schema public to authenticated;

-- Any tables/functions created later inherit the same access.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant execute on functions to authenticated;

-- ============================================================================
-- Done. Verify (as a signed-in user the app screens should now load):
--   select tablename from pg_tables where schemaname = 'public';
-- ============================================================================
