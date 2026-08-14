-- ============================================================================
-- Carelune — minimalist org storefront + patient subscription (run AFTER 0008).
--
-- MVP scope (deliberately small — one package, not a plan catalogue):
--   * A few org details the family should see, set by the admin (HOD):
--       - what to do in an emergency (free text) + an optional ambulance/centre number
--       - ONE care package: name, monthly price (₹), what's included, free-trial days
--       - platform_fee_pct: Carelune's cut (default 30%), admin/super-admin facing only
--   * A per-patient subscription record. The family accepts the package by
--     starting the free trial; billing is settled AT THE CENTRE (pay_at_centre) —
--     no payment gateway is involved here.
--
-- The storefront columns live on `centres`; the admin already has UPDATE on their
-- own centre (centres_admin_update, migration 0004), so no new policy is needed
-- for them. The family reads their own centre via centres_read (migration 0008).
--
-- HOW TO APPLY: Supabase dashboard -> SQL Editor -> paste this file -> Run.
-- Re-runs safely.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Storefront fields on the org.
-- ---------------------------------------------------------------------------
alter table centres add column if not exists emergency_note    text;   -- "what to do in an emergency"
alter table centres add column if not exists emergency_number  text;   -- ambulance / centre number, if any
alter table centres add column if not exists package_name      text;   -- e.g. "Neuro Recovery Continuum"
alter table centres add column if not exists package_price     integer;-- monthly price in whole ₹
alter table centres add column if not exists package_includes  text;   -- what's included (one item per line)
alter table centres add column if not exists trial_days        integer not null default 0;  -- 0 = no free trial
alter table centres add column if not exists platform_fee_pct  integer not null default 30; -- Carelune's cut

-- ---------------------------------------------------------------------------
-- Per-patient subscription. One row per patient (accepting the package).
--   status: 'trial'  -> inside the free-trial window
--           'active' -> package running (settled / to be settled at the centre)
--           'cancelled'
-- Billing is offline (pay_at_centre); we only RECORD it here.
-- ---------------------------------------------------------------------------
create table if not exists subscriptions (
  id           uuid primary key default gen_random_uuid(),
  patient_id   uuid not null unique references patients(id) on delete cascade,
  status       text not null default 'trial' check (status in ('trial','active','cancelled')),
  plan_name    text,
  price        integer,
  trial_days   integer not null default 0,
  trial_ends   date,
  pay_mode     text not null default 'pay_at_centre',
  started_at   timestamptz not null default now(),
  recorded_by  uuid references auth.users(id)
);

create index if not exists subscriptions_patient_idx on subscriptions(patient_id);

alter table subscriptions enable row level security;
grant select, insert, update on subscriptions to authenticated, service_role;

-- Read: anyone who can see the patient (household + their centre's staff).
drop policy if exists subscriptions_read on subscriptions;
create policy subscriptions_read on subscriptions for select
  using ((select can_see_patient(patient_id)));

-- Insert: the family/caregiver accepts the package (starts the trial) for their
-- own patient. Staff in the same centre can also record it.
drop policy if exists subscriptions_insert on subscriptions;
create policy subscriptions_insert on subscriptions for insert
  with check ((select can_see_patient(patient_id)));

-- Update: only centre staff change the state afterwards (e.g. mark paid/active,
-- cancel). The household cannot silently flip their own billing status.
drop policy if exists subscriptions_update on subscriptions;
create policy subscriptions_update on subscriptions for update
  using ((select is_staff()) and (select can_see_patient(patient_id)))
  with check ((select is_staff()) and (select can_see_patient(patient_id)));

-- ============================================================================
-- Done. No Edge Function changes required — the family portal reads/writes these
-- under RLS with the caller's own JWT.
-- ============================================================================
