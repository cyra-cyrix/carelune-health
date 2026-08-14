-- ============================================================================
-- Carelune — core schema for the rehab-discharge continuity pilot (Phase 1).
--
-- Turns the front-end demo into a real, multi-patient, multi-user backend with
-- database-enforced isolation (RLS) and consent capture. Safe to run more than
-- once (guarded with IF NOT EXISTS / CREATE OR REPLACE / drop-then-create).
--
-- HOW TO APPLY: Supabase dashboard -> SQL Editor -> paste this whole file -> Run.
--
-- ORDER MATTERS: all tables are created first, THEN helper functions (which
-- query those tables), THEN RLS policies (which call the functions).
--
-- Roles live in auth.users.user_metadata.role, mirrored into profiles.
--   Login roles:  family | caregiver | nurse | duty_doctor | pmr
--   ('patient' also exists in the enum for forward-compat but is unused —
--    the patient is a record, not a login; family/staff act on their behalf.)
--   Staff (see the whole caseload): nurse, duty_doctor, pmr
--   Household (see one patient):     patient, caregiver, family
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type app_role as enum ('patient','caregiver','family','nurse','duty_doctor','pmr');
exception when duplicate_object then null; end $$;

do $$ begin
  create type member_relation as enum ('self','caregiver','family');
exception when duplicate_object then null; end $$;

do $$ begin
  create type approval_type as enum ('nurse_query','duty_med','patient_query');
exception when duplicate_object then null; end $$;

do $$ begin
  create type approval_status as enum ('pending','approved','declined','suggested');
exception when duplicate_object then null; end $$;

do $$ begin
  create type urgency as enum ('routine','urgent');
exception when duplicate_object then null; end $$;

do $$ begin
  create type update_source as enum ('caregiver','nurse','duty_doctor','pmr');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 1. Centres (the pilot has one rehab centre; the model supports many)
-- ---------------------------------------------------------------------------
create table if not exists centres (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. Profiles — one row per auth user, mirroring role + centre for RLS.
-- ---------------------------------------------------------------------------
create table if not exists profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  role       app_role not null default 'family',
  full_name  text,
  centre_id  uuid references centres(id),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 3. Patients — the clinical record created at onboarding.
-- ---------------------------------------------------------------------------
create table if not exists patients (
  id                 uuid primary key default gen_random_uuid(),
  centre_id          uuid not null references centres(id),
  full_name          text not null,
  age                int,
  sex                text check (sex in ('M','F','O')),
  location           text,
  discharged_on      date,
  journey_start      date not null default current_date,
  journey_total_days int not null default 90,
  diagnosis          text[] not null default '{}',
  status             text not null default 'active',  -- active | in_review | discharged
  created_by         uuid references auth.users(id),
  created_at         timestamptz not null default now()
);
create index if not exists patients_centre_idx on patients(centre_id);

-- ---------------------------------------------------------------------------
-- 4. Patient members — links household users (caregiver/family) to a patient.
-- ---------------------------------------------------------------------------
create table if not exists patient_members (
  patient_id uuid not null references patients(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  relation   member_relation not null,
  created_at timestamptz not null default now(),
  primary key (patient_id, user_id)
);
create index if not exists patient_members_user_idx on patient_members(user_id);

-- ---------------------------------------------------------------------------
-- 5. Consent — required before real data is used. One row per grant.
-- ---------------------------------------------------------------------------
create table if not exists consents (
  id                  uuid primary key default gen_random_uuid(),
  patient_id          uuid not null references patients(id) on delete cascade,
  granted_by          uuid references auth.users(id),
  subject_name        text not null,       -- who signed (patient or next of kin)
  relation_to_patient text not null,       -- 'self' | 'son' | 'spouse' | ...
  consent_version     text not null default 'v1',
  granted_at          timestamptz not null default now(),
  revoked_at          timestamptz
);
create index if not exists consents_patient_idx on consents(patient_id);

-- ---------------------------------------------------------------------------
-- 6. Medications — PMR-owned. Duty doctor suggests changes via approvals.
-- ---------------------------------------------------------------------------
create table if not exists medications (
  id         uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  name       text not null,
  dose       text,
  freq       text,          -- "1-0-1"
  timing     text,          -- "After food"
  note       text,
  active     boolean not null default true,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
create index if not exists medications_patient_idx on medications(patient_id);

-- ---------------------------------------------------------------------------
-- 7. Care tasks — the approved daily plan (template rows) + per-day completion.
-- ---------------------------------------------------------------------------
create table if not exists care_tasks (
  id         uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  time_label text not null,      -- "07:00"
  sort_order int not null default 0,
  discipline text not null,      -- "Physiotherapy"
  title      text not null,
  detail     text,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists care_tasks_patient_idx on care_tasks(patient_id);

create table if not exists task_logs (
  id         uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  task_id    uuid not null references care_tasks(id) on delete cascade,
  log_date   date not null default current_date,
  done       boolean not null default true,
  done_by    uuid references auth.users(id),
  done_at    timestamptz not null default now(),
  unique (task_id, log_date)
);
create index if not exists task_logs_patient_date_idx on task_logs(patient_id, log_date);

-- ---------------------------------------------------------------------------
-- 8. Daily readings — the caregiver's home vitals loop (the pilot's heartbeat).
-- ---------------------------------------------------------------------------
create table if not exists daily_readings (
  id           uuid primary key default gen_random_uuid(),
  patient_id   uuid not null references patients(id) on delete cascade,
  reading_date date not null default current_date,
  bp           text,
  grbs         text,
  urine_ml     text,
  food_intake  text,
  mood         text,
  activity     text,
  recorded_by  uuid references auth.users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (patient_id, reading_date)
);
create index if not exists daily_readings_patient_date_idx on daily_readings(patient_id, reading_date desc);

-- ---------------------------------------------------------------------------
-- 9. Daily updates — the shared care feed (caregiver -> nurse -> duty).
-- ---------------------------------------------------------------------------
create table if not exists daily_updates (
  id          uuid primary key default gen_random_uuid(),
  patient_id  uuid not null references patients(id) on delete cascade,
  source      update_source not null,
  author_name text,
  body        text not null,
  flag        text,   -- 'info' | 'watch'
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now()
);
create index if not exists daily_updates_patient_idx on daily_updates(patient_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 10. Approvals / queries — items awaiting the PMR's decision.
-- ---------------------------------------------------------------------------
create table if not exists approvals (
  id          uuid primary key default gen_random_uuid(),
  patient_id  uuid not null references patients(id) on delete cascade,
  type        approval_type not null,
  from_name   text,
  message     text not null,
  suggestion  text,                     -- present for duty-doctor medicine suggestions
  urgency     urgency not null default 'routine',
  status      approval_status not null default 'pending',
  raised_by   uuid references auth.users(id),
  decided_by  uuid references auth.users(id),
  decided_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists approvals_patient_idx on approvals(patient_id, created_at desc);

-- ============================================================================
-- FUNCTIONS (defined after the tables they read).
-- ============================================================================

-- New-signup trigger: create a profile row with the role from user_metadata.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, role, full_name)
  values (
    new.id,
    coalesce((new.raw_user_meta_data->>'role')::app_role, 'family'),
    new.raw_user_meta_data->>'full_name'
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Security-definer helpers (read profiles/patients here to avoid recursive RLS).
create or replace function my_role()
returns app_role language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid()
$$;

create or replace function my_centre()
returns uuid language sql stable security definer set search_path = public as $$
  select centre_id from profiles where id = auth.uid()
$$;

create or replace function is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(my_role() in ('nurse','duty_doctor','pmr'), false)
$$;

-- Can the current user see this patient?
--   staff  -> any patient in their centre
--   others -> only patients they are a member of
create or replace function can_see_patient(pid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select
    exists (select 1 from patients p
            where p.id = pid and is_staff() and p.centre_id = my_centre())
    or exists (select 1 from patient_members m
               where m.patient_id = pid and m.user_id = auth.uid())
$$;

-- ============================================================================
-- RLS — enable and define policies. Nothing is readable/writable without a
-- policy match. Reads everywhere gate on can_see_patient(); writes add role
-- checks where the clinical boundary requires it (meds = PMR; decisions = PMR).
-- ============================================================================
alter table centres         enable row level security;
alter table profiles        enable row level security;
alter table patients        enable row level security;
alter table patient_members enable row level security;
alter table consents        enable row level security;
alter table medications     enable row level security;
alter table care_tasks      enable row level security;
alter table task_logs       enable row level security;
alter table daily_readings  enable row level security;
alter table daily_updates   enable row level security;
alter table approvals       enable row level security;

-- profiles: a user reads/updates own row; staff read profiles in their centre.
drop policy if exists profiles_self_read on profiles;
create policy profiles_self_read on profiles for select
  using (id = auth.uid() or (is_staff() and centre_id = my_centre()));
drop policy if exists profiles_self_update on profiles;
create policy profiles_self_update on profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

-- centres: any authenticated user reads their own centre.
drop policy if exists centres_read on centres;
create policy centres_read on centres for select
  using (id = my_centre());

-- patients: see per can_see_patient; staff in the centre may insert/update.
drop policy if exists patients_read on patients;
create policy patients_read on patients for select using (can_see_patient(id));
drop policy if exists patients_insert on patients;
create policy patients_insert on patients for insert
  with check (is_staff() and centre_id = my_centre());
drop policy if exists patients_update on patients;
create policy patients_update on patients for update
  using (is_staff() and centre_id = my_centre());

-- patient_members: readable by anyone who can see the patient; staff manage.
drop policy if exists members_read on patient_members;
create policy members_read on patient_members for select
  using (user_id = auth.uid() or can_see_patient(patient_id));
drop policy if exists members_write on patient_members;
create policy members_write on patient_members for all
  using (is_staff() and can_see_patient(patient_id))
  with check (is_staff() and can_see_patient(patient_id));

-- consents: readable/writable by anyone who can see the patient.
drop policy if exists consents_read on consents;
create policy consents_read on consents for select using (can_see_patient(patient_id));
drop policy if exists consents_write on consents;
create policy consents_write on consents for insert with check (can_see_patient(patient_id));

-- medications: everyone who can see the patient reads; ONLY PMR writes.
drop policy if exists meds_read on medications;
create policy meds_read on medications for select using (can_see_patient(patient_id));
drop policy if exists meds_write on medications;
create policy meds_write on medications for all
  using (my_role() = 'pmr' and can_see_patient(patient_id))
  with check (my_role() = 'pmr' and can_see_patient(patient_id));

-- care_tasks: read if can see; staff manage the plan.
drop policy if exists tasks_read on care_tasks;
create policy tasks_read on care_tasks for select using (can_see_patient(patient_id));
drop policy if exists tasks_write on care_tasks;
create policy tasks_write on care_tasks for all
  using (is_staff() and can_see_patient(patient_id))
  with check (is_staff() and can_see_patient(patient_id));

-- task_logs: read + write by anyone who can see the patient (caregiver ticks off).
drop policy if exists task_logs_read on task_logs;
create policy task_logs_read on task_logs for select using (can_see_patient(patient_id));
drop policy if exists task_logs_write on task_logs;
create policy task_logs_write on task_logs for all
  using (can_see_patient(patient_id))
  with check (can_see_patient(patient_id));

-- daily_readings: read + write by anyone who can see the patient.
drop policy if exists readings_read on daily_readings;
create policy readings_read on daily_readings for select using (can_see_patient(patient_id));
drop policy if exists readings_write on daily_readings;
create policy readings_write on daily_readings for all
  using (can_see_patient(patient_id))
  with check (can_see_patient(patient_id));

-- daily_updates: read if can see; write by anyone who can see (append-only feed).
drop policy if exists updates_read on daily_updates;
create policy updates_read on daily_updates for select using (can_see_patient(patient_id));
drop policy if exists updates_write on daily_updates;
create policy updates_write on daily_updates for insert with check (can_see_patient(patient_id));

-- approvals: read if can see; raise by anyone who can see; ONLY PMR decides.
drop policy if exists approvals_read on approvals;
create policy approvals_read on approvals for select using (can_see_patient(patient_id));
drop policy if exists approvals_insert on approvals;
create policy approvals_insert on approvals for insert with check (can_see_patient(patient_id));
drop policy if exists approvals_decide on approvals;
create policy approvals_decide on approvals for update
  using (my_role() = 'pmr' and can_see_patient(patient_id))
  with check (my_role() = 'pmr' and can_see_patient(patient_id));

-- ============================================================================
-- Done. Next: run 0002_seed_pilot.sql to create the pilot centre + a test
-- patient so the app has data before real patients are enrolled.
-- ============================================================================
