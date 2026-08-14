-- ============================================================================
-- Carelune — grant the public tables to `service_role` (run AFTER 0001-0004).
--
-- Edge Functions act as `service_role`. It bypasses RLS, but still needs table
-- GRANTs — which 0003 gave only to `authenticated`. Without this, the
-- admin-users function fails its profile write with "permission denied for
-- table profiles" (the auth user gets created, but never stamped with an org).
-- ============================================================================

grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant execute on all functions in schema public to service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public
  grant execute on functions to service_role;

-- Repair accounts created before this fix: the auth user + a profile exist, but
-- the profile has no org. Single-org pilot -> put every org-less profile into
-- the pilot org (Dr Vivek's). (Remove/scope this once there are multiple orgs.)
update profiles
set centre_id = '00000000-0000-0000-0000-0000000000c1'
where centre_id is null;

-- ============================================================================
-- After this: reload the Team tab — previously-created accounts appear, and new
-- "Create account" works end to end. Verify:
--   select full_name, role, centre_id from profiles order by created_at desc;
-- ============================================================================
