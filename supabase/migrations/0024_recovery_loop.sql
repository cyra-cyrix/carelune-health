-- ============================================================================
-- Carelune — recovery-loop data layer (run AFTER 0023). STRICTLY ADDITIVE.
--
-- Supports the redesigned Caregiver (record) + Family (view) experiences without
-- touching any existing table, RLS policy, permission, or the AI/plan schema:
--
--   * daily_readings : extra NULLABLE observation values (pulse, spo2, temp, pain,
--     fluid_ml, bowel, skin, feeding, cognition). Existing rows keep NULLs. The
--     table already has table-level grants (0003), so new columns need none.
--   * task_logs.outcome : richer per-task result (done|unable|refused|na). The
--     legacy `done` boolean is kept and stays authoritative for existing readers;
--     new code writes both.
--   * med_admin (NEW) : per-slot medicine given/missed/skipped log. RLS mirrors
--     task_logs — household + staff for the patient (can_see_patient).
--   * reading_thresholds (NEW) : doctor-approved normal ranges per parameter, so
--     the family view can show an attention status ONLY when a doctor set one.
--     Doctor (pmr) writes; household + staff read.
--
-- New tables inherit `authenticated` grants via 0003's default privileges; we
-- also grant explicitly to be safe. No existing policy is dropped or altered.
-- HOW TO APPLY: supabase db push  (or Dashboard → SQL Editor → paste → Run).
-- ============================================================================

-- 1) Extra caregiver-recorded observation values (all nullable, back-compatible).
alter table public.daily_readings
  add column if not exists pulse       text,
  add column if not exists spo2        text,
  add column if not exists temperature text,
  add column if not exists pain        text,
  add column if not exists fluid_ml    text,
  add column if not exists bowel       text,
  add column if not exists skin        text,
  add column if not exists feeding     text,
  add column if not exists cognition   text;

-- 2) Task outcome beyond done/undone. `done` stays for back-compat.
alter table public.task_logs
  add column if not exists outcome text check (outcome in ('done', 'unable', 'refused', 'na'));

-- 3) Medicine administration log — given / missed / skipped, one row per slot/day.
create table if not exists public.med_admin (
  id            uuid primary key default gen_random_uuid(),
  patient_id    uuid not null references public.patients(id) on delete cascade,
  medication_id uuid not null references public.medications(id) on delete cascade,
  log_date      date not null default current_date,
  slot          text not null,
  status        text not null check (status in ('given', 'missed', 'skipped')),
  note          text,
  recorded_by   uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  unique (medication_id, log_date, slot)
);
create index if not exists med_admin_patient_date_idx on public.med_admin(patient_id, log_date);
alter table public.med_admin enable row level security;
drop policy if exists med_admin_read on public.med_admin;
create policy med_admin_read on public.med_admin for select
  using (public.can_see_patient(patient_id));
drop policy if exists med_admin_write on public.med_admin;
create policy med_admin_write on public.med_admin for all
  using (public.can_see_patient(patient_id))
  with check (public.can_see_patient(patient_id));
grant select, insert, update, delete on public.med_admin to authenticated;

-- 4) Doctor-approved thresholds — the ONLY source of family attention status.
create table if not exists public.reading_thresholds (
  id         uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  param      text not null,
  min_val    numeric,
  max_val    numeric,
  unit       text,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  unique (patient_id, param)
);
create index if not exists reading_thresholds_patient_idx on public.reading_thresholds(patient_id);
alter table public.reading_thresholds enable row level security;
drop policy if exists thresholds_read on public.reading_thresholds;
create policy thresholds_read on public.reading_thresholds for select
  using (public.can_see_patient(patient_id));
drop policy if exists thresholds_write on public.reading_thresholds;
create policy thresholds_write on public.reading_thresholds for all
  using (public.my_role() = 'pmr' and public.can_see_patient(patient_id))
  with check (public.my_role() = 'pmr' and public.can_see_patient(patient_id));
grant select, insert, update, delete on public.reading_thresholds to authenticated;

-- Let PostgREST see the new columns/tables immediately.
notify pgrst, 'reload schema';

-- ============================================================================
-- Done. All additive; existing tables, policies, grants and the plan schema
-- are unchanged. Caregiver records richer data; family gets doctor-gated status.
-- ============================================================================
