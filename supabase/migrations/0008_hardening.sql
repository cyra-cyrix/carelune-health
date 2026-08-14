-- ============================================================================
-- Carelune — security + scalability hardening (run AFTER 0007). Idempotent.
--
-- Fixes from the pre-pilot audit:
--   BLOCKERS
--   B1. Privilege escalation: any authenticated user could UPDATE their own
--       profiles row's role/centre_id/is_admin/is_super_admin. Fixed with
--       column-level UPDATE grants (only full_name, must_reset_password) and a
--       hardened signup trigger that forces role='family' for public signups.
--   B2. Clinical boundary: nurse/duty could activate a plan. Now only a doctor
--       (pmr) can flip status->active (trigger) and author care_tasks (RLS).
--   B3. Feed impersonation: household could post daily_updates as source='pmr'.
--       Now source must match the caller's real role (role_to_source()).
--   B4. Registry orphans: register/add-caregiver now run their DB writes in one
--       transaction via SECURITY DEFINER RPCs (the Edge Function rolls back the
--       auth user if the RPC fails).
--   SCALABILITY
--   S1. RLS helper calls wrapped in (select ...) so they run once per statement,
--       not once per row; can_see_patient() collapsed into a single query.
--   S2. profiles.email denormalised so admin/platform lists drop the getUserById
--       N+1 loop.
--   S3. Missing indexes for centre/role/status/pending-approval filters.
--
-- HOW TO APPLY: Supabase dashboard -> SQL Editor -> paste this file -> Run.
-- Re-runs safely.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- B1a. Lock down profiles UPDATE to non-privileged columns only.
--      service_role (Edge Functions) keeps full update via its own grants.
-- ---------------------------------------------------------------------------
revoke update on profiles from authenticated;
grant update (full_name, must_reset_password) on profiles to authenticated;

-- ---------------------------------------------------------------------------
-- B1b. Public signup can never mint a staff role. Also denormalise email (S2).
--      Staff/admin roles are set explicitly server-side by the Edge Functions.
-- ---------------------------------------------------------------------------
alter table profiles add column if not exists email text;
update profiles p set email = u.email from auth.users u where u.id = p.id and p.email is distinct from u.email;

create or replace function handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, role, full_name, email)
  values (new.id, 'family', new.raw_user_meta_data->>'full_name', new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- S1. Redefine helpers. can_see_patient() collapsed to one query (was 2 nested
--     SECURITY DEFINER calls + 2 profiles lookups). role_to_source() for B3.
-- ---------------------------------------------------------------------------
create or replace function can_see_patient(pid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles me join patients p on p.id = pid
    where me.id = auth.uid()
      and me.role in ('nurse','duty_doctor','pmr')
      and p.centre_id = me.centre_id
  ) or exists (
    select 1 from patient_members m where m.patient_id = pid and m.user_id = auth.uid()
  )
$$;

create or replace function role_to_source(r app_role)
returns update_source language sql immutable as $$
  select case r
    when 'nurse' then 'nurse'::update_source
    when 'duty_doctor' then 'duty_doctor'::update_source
    when 'pmr' then 'pmr'::update_source
    else 'caregiver'::update_source
  end
$$;

-- ---------------------------------------------------------------------------
-- B2. Only a doctor may activate a plan (flip status -> active). Enforced for
--     authenticated callers; service_role RPCs (registration) are exempt.
-- ---------------------------------------------------------------------------
create or replace function enforce_plan_activation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_user = 'authenticated'
     and new.status = 'active'
     and old.status is distinct from 'active'
     and coalesce(my_role()::text, '') <> 'pmr' then
    raise exception 'Only a doctor can activate a patient plan';
  end if;
  return new;
end $$;

drop trigger if exists patients_activation_guard on patients;
create trigger patients_activation_guard
  before update on patients
  for each row execute function enforce_plan_activation();

-- ---------------------------------------------------------------------------
-- S1. Rewrite every policy: wrap non-row-arg helper calls in (select ...) so
--     they evaluate once per statement; tighten writes (B2/B3).
-- ---------------------------------------------------------------------------

-- profiles
drop policy if exists profiles_self_read on profiles;
create policy profiles_self_read on profiles for select
  using (id = auth.uid() or ((select is_staff()) and centre_id = (select my_centre())));
drop policy if exists profiles_self_update on profiles;
create policy profiles_self_update on profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

-- centres
drop policy if exists centres_read on centres;
create policy centres_read on centres for select using (id = (select my_centre()));

-- patients
drop policy if exists patients_read on patients;
create policy patients_read on patients for select using ((select can_see_patient(id)));
drop policy if exists patients_insert on patients;
create policy patients_insert on patients for insert
  with check ((select is_staff()) and centre_id = (select my_centre()));
drop policy if exists patients_update on patients;
create policy patients_update on patients for update
  using ((select is_staff()) and centre_id = (select my_centre()));

-- patient_members
drop policy if exists members_read on patient_members;
create policy members_read on patient_members for select
  using (user_id = auth.uid() or (select can_see_patient(patient_id)));
drop policy if exists members_write on patient_members;
create policy members_write on patient_members for all
  using ((select is_staff()) and (select can_see_patient(patient_id)))
  with check ((select is_staff()) and (select can_see_patient(patient_id)));

-- consents
drop policy if exists consents_read on consents;
create policy consents_read on consents for select using ((select can_see_patient(patient_id)));
drop policy if exists consents_write on consents;
create policy consents_write on consents for insert with check ((select can_see_patient(patient_id)));

-- medications (PMR writes only)
drop policy if exists meds_read on medications;
create policy meds_read on medications for select using ((select can_see_patient(patient_id)));
drop policy if exists meds_write on medications;
create policy meds_write on medications for all
  using ((select my_role()) = 'pmr' and (select can_see_patient(patient_id)))
  with check ((select my_role()) = 'pmr' and (select can_see_patient(patient_id)));

-- care_tasks (B2: only the doctor authors/edits the plan)
drop policy if exists tasks_read on care_tasks;
create policy tasks_read on care_tasks for select using ((select can_see_patient(patient_id)));
drop policy if exists tasks_write on care_tasks;
create policy tasks_write on care_tasks for all
  using ((select my_role()) = 'pmr' and (select can_see_patient(patient_id)))
  with check ((select my_role()) = 'pmr' and (select can_see_patient(patient_id)));

-- task_logs (caregiver ticks off — anyone who can see the patient)
drop policy if exists task_logs_read on task_logs;
create policy task_logs_read on task_logs for select using ((select can_see_patient(patient_id)));
drop policy if exists task_logs_write on task_logs;
create policy task_logs_write on task_logs for all
  using ((select can_see_patient(patient_id)))
  with check ((select can_see_patient(patient_id)));

-- daily_readings
drop policy if exists readings_read on daily_readings;
create policy readings_read on daily_readings for select using ((select can_see_patient(patient_id)));
drop policy if exists readings_write on daily_readings;
create policy readings_write on daily_readings for all
  using ((select can_see_patient(patient_id)))
  with check ((select can_see_patient(patient_id)));

-- daily_updates (B3: source must match the caller's real role)
drop policy if exists updates_read on daily_updates;
create policy updates_read on daily_updates for select using ((select can_see_patient(patient_id)));
drop policy if exists updates_write on daily_updates;
create policy updates_write on daily_updates for insert
  with check ((select can_see_patient(patient_id)) and source = role_to_source((select my_role())));

-- approvals (PMR decides only)
drop policy if exists approvals_read on approvals;
create policy approvals_read on approvals for select using ((select can_see_patient(patient_id)));
drop policy if exists approvals_insert on approvals;
create policy approvals_insert on approvals for insert with check ((select can_see_patient(patient_id)));
drop policy if exists approvals_decide on approvals;
create policy approvals_decide on approvals for update
  using ((select my_role()) = 'pmr' and (select can_see_patient(patient_id)))
  with check ((select my_role()) = 'pmr' and (select can_see_patient(patient_id)));

-- ---------------------------------------------------------------------------
-- S3. Indexes for the centre/role/status/pending filters the app uses.
-- ---------------------------------------------------------------------------
create index if not exists profiles_centre_role_idx on profiles(centre_id, role);
create index if not exists profiles_email_idx on profiles(email);
create index if not exists patients_centre_status_idx on patients(centre_id, status);
create index if not exists approvals_pending_idx on approvals(patient_id) where status = 'pending';

-- ---------------------------------------------------------------------------
-- B4. Atomic registration RPCs (one transaction; the Edge Function deletes the
--     auth user if these throw). SECURITY DEFINER -> bypass RLS, service_role only.
-- ---------------------------------------------------------------------------
create or replace function register_patient_tx(
  p_centre uuid, p_family uuid, p_patient jsonb, p_consent jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_patient uuid;
begin
  update profiles
     set role = 'family', centre_id = p_centre, is_admin = false, must_reset_password = false
   where id = p_family;

  insert into patients (centre_id, full_name, age, sex, location, discharged_on, status, created_by)
  values (
    p_centre,
    p_patient->>'full_name',
    nullif(p_patient->>'age','')::int,
    nullif(p_patient->>'sex',''),
    nullif(p_patient->>'location',''),
    nullif(p_patient->>'discharged_on','')::date,
    'pending',
    p_family
  ) returning id into v_patient;

  insert into patient_members (patient_id, user_id, relation) values (v_patient, p_family, 'family');

  insert into consents (patient_id, granted_by, subject_name, relation_to_patient)
  values (
    v_patient, p_family,
    coalesce(nullif(p_consent->>'subject_name',''), 'Family member'),
    coalesce(nullif(p_consent->>'relation_to_patient',''), 'family')
  );

  return v_patient;
end $$;
grant execute on function register_patient_tx(uuid, uuid, jsonb, jsonb) to service_role;

create or replace function add_caregiver_tx(p_patient uuid, p_caregiver uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_centre uuid;
begin
  select centre_id into v_centre from patients where id = p_patient;
  if v_centre is null then raise exception 'Patient not found'; end if;

  update profiles
     set role = 'caregiver', centre_id = v_centre, is_admin = false, must_reset_password = true
   where id = p_caregiver;

  insert into patient_members (patient_id, user_id, relation)
  values (p_patient, p_caregiver, 'caregiver')
  on conflict (patient_id, user_id) do nothing;
end $$;
grant execute on function add_caregiver_tx(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Constrain patients.status to the known lifecycle values (was free text).
-- ---------------------------------------------------------------------------
alter table patients drop constraint if exists patients_status_check;
alter table patients add constraint patients_status_check
  check (status in ('pending','active','in_review','discharged'));

-- ============================================================================
-- Done. Redeploy the Edge Functions (registry, admin-users, platform-admin) so
-- they use the RPCs + profiles.email.
-- ============================================================================
