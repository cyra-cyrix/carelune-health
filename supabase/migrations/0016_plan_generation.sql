-- ============================================================================
-- Carelune — Phase 5: doctor 3-question intake + governed AI plan generation,
-- plus Phase-3 hardening corrections (run AFTER 0015). Idempotent.
--
-- Phase-3 hardening (carried forward):
--   1. patient_documents.uploaded_by is stamped from auth.uid() server-side.
--   2. The patient-docs bucket restricts type (PDF/JPG/PNG) and size (<=10 MB).
--   3. Care-team assignment/removal is limited to admin (HOD) or doctor roles;
--      nurses may VIEW their assignments but not reassign the clinical team.
--   4. The Storage insert/delete policy requires the patient in the object path
--      to be visible within the uploader's institution.
--
-- Plan generation (governed, token-efficient, doctor-led):
--   * patient_plan_intake      — the doctor's three concise answers.
--   * institution_pathway_versions — an institution's clinical approval of a
--       specific pathway version (does NOT mutate the platform template; records
--       institutional sign-off, which is what unlocks plan generation).
--   * patient_document_facts   — Stage-A cache of patient-specific facts extracted
--       from the discharge documents, so the pathway is not resent each time.
--   * patient_plans            — the generated DRAFT plan (jsonb). A draft NEVER
--       activates care by itself; the doctor edits + approves, and transactional
--       activation into the live daily plan is a later phase.
--
-- All new SECURITY DEFINER functions use an EMPTY search_path with schema-
-- qualified references and explicit EXECUTE revocations.
--
-- HOW TO APPLY: Supabase dashboard -> SQL Editor -> paste this file -> Run.
-- ============================================================================

-- ===========================================================================
-- PART 1 — Phase-3 hardening.
-- ===========================================================================

-- 1. Stamp uploaded_by from the authenticated caller (never trust the client),
--    alongside the existing centre_id stamping.
create or replace function public.enforce_document_centre()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_centre uuid;
begin
  select centre_id into v_centre from public.patients where id = new.patient_id;
  if v_centre is null then
    raise exception 'Unknown patient for document';
  end if;
  new.centre_id := v_centre;
  new.uploaded_by := auth.uid();   -- server-side; client value is ignored
  return new;
end $$;
revoke execute on function public.enforce_document_centre() from public, anon, authenticated;

-- 2. Restrict the private bucket to PDF / JPEG / PNG, max 10 MB.
update storage.buckets
  set file_size_limit = 10485760,
      allowed_mime_types = array['application/pdf','image/jpeg','image/png']
  where id = 'patient-docs';

-- 3. Care-team writes: admin (HOD) or doctor only (nurses keep read via care_team_read).
drop policy if exists care_team_write on patient_care_team;
create policy care_team_write on patient_care_team for all
  using (
    ((select is_admin_user()) or (select my_role()) in ('pmr','duty_doctor'))
    and (select can_see_patient(patient_id))
  )
  with check (
    ((select is_admin_user()) or (select my_role()) in ('pmr','duty_doctor'))
    and (select can_see_patient(patient_id))
  );

-- 4. Storage insert/delete: the patient folder must be a patient the uploader can
--    see within their own institution (path = <centre_id>/<patient_id>/...).
drop policy if exists patient_docs_insert on storage.objects;
create policy patient_docs_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'patient-docs'
    and (select public.is_staff())
    and ((storage.foldername(name))[1])::uuid = (select public.my_centre())
    and public.can_see_patient(((storage.foldername(name))[2])::uuid)
  );

drop policy if exists patient_docs_delete on storage.objects;
create policy patient_docs_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'patient-docs'
    and (select public.is_staff())
    and ((storage.foldername(name))[1])::uuid = (select public.my_centre())
    and public.can_see_patient(((storage.foldername(name))[2])::uuid)
  );

-- ===========================================================================
-- PART 2 — Institutional approval of a pathway version.
-- ===========================================================================

create table if not exists institution_pathway_versions (
  id          uuid primary key default gen_random_uuid(),
  centre_id   uuid not null references centres(id) on delete cascade,
  version_id  uuid not null references pathway_versions(id) on delete cascade,
  approved_by uuid references auth.users(id),
  approved_at timestamptz not null default now(),
  unique (centre_id, version_id)
);
create index if not exists inst_pathway_versions_centre_idx on institution_pathway_versions(centre_id);

alter table institution_pathway_versions enable row level security;
grant select on institution_pathway_versions to authenticated;
grant select, insert, update, delete on institution_pathway_versions to service_role;

-- Staff read their own institution's approvals; NO authenticated write policy, so
-- approvals happen only through the RPC below (which enforces admin/doctor).
drop policy if exists inst_pathway_versions_read on institution_pathway_versions;
create policy inst_pathway_versions_read on institution_pathway_versions for select to authenticated
  using (centre_id = (select my_centre()));

-- An institution's admin or doctor approves a specific pathway VERSION for clinical
-- use in their institution (the platform template itself is unchanged).
create or replace function public.approve_pathway_version_for_institution(p_version uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_centre uuid; v_role text; v_admin boolean; v_pack uuid;
begin
  v_centre := public.my_centre();
  v_role   := coalesce(public.my_role()::text, '');
  v_admin  := public.is_admin_user();
  if v_centre is null then
    raise exception 'No institution for this account';
  end if;
  if not (v_admin or v_role in ('pmr','duty_doctor')) then
    raise exception 'Only an institution admin or doctor can approve a pathway version';
  end if;
  select pw.pack_id into v_pack
    from public.pathway_versions v
    join public.pathways pw on pw.id = v.pathway_id
    where v.id = p_version;
  if v_pack is null then
    raise exception 'Unknown pathway version';
  end if;
  if not exists (
    select 1 from public.institution_pathways ip
    where ip.centre_id = v_centre and ip.pack_id = v_pack and ip.enabled
  ) then
    raise exception 'That pathway is not enabled for your institution';
  end if;
  insert into public.institution_pathway_versions (centre_id, version_id, approved_by)
    values (v_centre, p_version, auth.uid())
    on conflict (centre_id, version_id) do nothing;
end $$;
revoke execute on function public.approve_pathway_version_for_institution(uuid) from public, anon;
grant execute on function public.approve_pathway_version_for_institution(uuid) to authenticated, service_role;

-- Relax the patient-pathway guard: a governing version may be a PLATFORM-approved
-- version OR one the patient's own institution has approved. Draft/review with no
-- approval still cannot govern care.
create or replace function public.enforce_patient_pathway()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.pathway_pack_id is not null then
    if not exists (
      select 1 from public.institution_pathways ip
      where ip.centre_id = new.centre_id and ip.pack_id = new.pathway_pack_id and ip.enabled
    ) then
      raise exception 'That pathway is not enabled for this institution';
    end if;
  end if;

  if new.pathway_version_id is not null then
    if new.pathway_pack_id is null then
      raise exception 'A pathway version requires its pathway pack to be assigned';
    end if;
    if not exists (
      select 1
      from public.pathway_versions v
      join public.pathways pw on pw.id = v.pathway_id
      where v.id = new.pathway_version_id
        and pw.pack_id = new.pathway_pack_id
        and (
          v.status = 'approved'
          or exists (
            select 1 from public.institution_pathway_versions ipv
            where ipv.version_id = v.id and ipv.centre_id = new.centre_id
          )
        )
    ) then
      raise exception 'A patient can only be governed by an APPROVED pathway version (institutional or platform) of the assigned pack';
    end if;
  end if;

  return new;
end $$;
revoke execute on function public.enforce_patient_pathway() from public, anon, authenticated;

-- ===========================================================================
-- PART 3 — Doctor 3-question intake.
-- ===========================================================================

create table if not exists patient_plan_intake (
  patient_id      uuid primary key references patients(id) on delete cascade,
  milestone_goal  text,   -- expected recovery milestone
  milestone_by    text,   -- by when (free text / date-ish)
  monitor_focus   text,   -- what to monitor more closely than usual
  non_negotiables text,   -- instructions / safety boundaries that are non-negotiable
  answered_by     uuid references auth.users(id),
  answered_at     timestamptz not null default now()
);

alter table patient_plan_intake enable row level security;
grant select, insert, update on patient_plan_intake to authenticated, service_role;

drop policy if exists plan_intake_read on patient_plan_intake;
create policy plan_intake_read on patient_plan_intake for select
  using ((select is_staff()) and (select can_see_patient(patient_id)));
drop policy if exists plan_intake_write on patient_plan_intake;
create policy plan_intake_write on patient_plan_intake for all
  using (((select is_admin_user()) or (select my_role()) in ('pmr','duty_doctor')) and (select can_see_patient(patient_id)))
  with check (((select is_admin_user()) or (select my_role()) in ('pmr','duty_doctor')) and (select can_see_patient(patient_id)));

create or replace function public.enforce_plan_intake_author()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.answered_by := auth.uid();
  new.answered_at := now();
  return new;
end $$;
revoke execute on function public.enforce_plan_intake_author() from public, anon, authenticated;
drop trigger if exists plan_intake_author_guard on patient_plan_intake;
create trigger plan_intake_author_guard
  before insert or update on patient_plan_intake
  for each row execute function public.enforce_plan_intake_author();

-- ===========================================================================
-- PART 4 — Stage-A document facts (extracted once, reused per generation).
-- ===========================================================================

create table if not exists patient_document_facts (
  patient_id  uuid primary key references patients(id) on delete cascade,
  centre_id   uuid not null references centres(id),
  facts       jsonb not null,
  model       text,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now()
);

alter table patient_document_facts enable row level security;
-- Written only by the Edge Function (service_role); staff of the centre may read.
grant select on patient_document_facts to authenticated;
grant select, insert, update, delete on patient_document_facts to service_role;

drop policy if exists doc_facts_read on patient_document_facts;
create policy doc_facts_read on patient_document_facts for select to authenticated
  using ((select is_staff()) and (select can_see_patient(patient_id)));

-- ===========================================================================
-- PART 5 — Generated patient plan DRAFTS.
-- ===========================================================================

create table if not exists patient_plans (
  id                 uuid primary key default gen_random_uuid(),
  patient_id         uuid not null references patients(id) on delete cascade,
  centre_id          uuid not null references centres(id),
  version            integer not null default 1,
  pathway_version_id uuid references pathway_versions(id),
  content            jsonb not null,
  status             text not null default 'draft' check (status in ('draft','approved')),
  generated_by       uuid references auth.users(id),
  approved_by        uuid references auth.users(id),
  approved_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (patient_id, version)
);
create index if not exists patient_plans_patient_idx on patient_plans(patient_id, version desc);

alter table patient_plans enable row level security;
-- Created by the Edge Function (service_role). Staff read; admin/doctor edit+approve.
grant select, update on patient_plans to authenticated;
grant select, insert, update, delete on patient_plans to service_role;

drop policy if exists patient_plans_read on patient_plans;
create policy patient_plans_read on patient_plans for select to authenticated
  using ((select is_staff()) and (select can_see_patient(patient_id)));
drop policy if exists patient_plans_update on patient_plans;
create policy patient_plans_update on patient_plans for update to authenticated
  using (((select is_admin_user()) or (select my_role()) in ('pmr','duty_doctor')) and (select can_see_patient(patient_id)))
  with check (((select is_admin_user()) or (select my_role()) in ('pmr','duty_doctor')) and (select can_see_patient(patient_id)));

-- Stamp updated_at, and approved_by/at when a draft is approved by a doctor.
create or replace function public.enforce_patient_plan()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.updated_at := now();
  if new.status = 'approved' and (tg_op = 'INSERT' or old.status <> 'approved') then
    new.approved_by := auth.uid();
    new.approved_at := now();
  end if;
  return new;
end $$;
revoke execute on function public.enforce_patient_plan() from public, anon, authenticated;
drop trigger if exists patient_plan_guard on patient_plans;
create trigger patient_plan_guard
  before insert or update on patient_plans
  for each row execute function public.enforce_patient_plan();

-- ============================================================================
-- Done. Doctor intake + institution-approved pathway versions gate a governed,
-- token-efficient AI draft (facts cached separately from the stored pathway).
-- A draft never activates care — the doctor edits and approves it, and live
-- activation remains a later, transactional phase.
-- ============================================================================
