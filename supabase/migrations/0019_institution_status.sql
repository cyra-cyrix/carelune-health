-- ============================================================================
-- Carelune — institution pause (run AFTER 0018).
--
-- A super-admin can SUSPEND an institution's access without deleting any data.
-- Adds centres.status ('active' | 'paused'). When paused, the app gate blocks
-- that institution's non-super-admin users (see App.tsx); the super admin toggles
-- it through the platform-admin Edge Function (service_role). No data is removed
-- and no RLS is changed — pausing is fully reversible.
--
-- HOW TO APPLY: supabase db push  (or Dashboard → SQL Editor → paste → Run).
-- ============================================================================

alter table public.centres
  add column if not exists status text not null default 'active';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'centres_status_check') then
    alter table public.centres
      add constraint centres_status_check check (status in ('active', 'paused'));
  end if;
end $$;

-- ============================================================================
-- Done. centres.status defaults to 'active'; existing rows are unaffected.
-- ============================================================================
