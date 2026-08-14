-- ============================================================================
-- Carelune — Phase 3: commercial-model finalisation + patient intake,
-- pathway/team assignment, and private documents (run AFTER 0014). Idempotent.
--
-- Part 1 — Commercial model (MVP): ONE institution package is the single
--   commercial source of truth (centres.package_*). Pathways are clinical
--   templates, NOT separately-priced products. We drop the Phase-2 config->centre
--   mirror and stop creating per-pack commercial config. See docs/COMMERCIAL_MODEL.md.
--
-- Part 2 — Patient <-> pathway assignment: a patient may be placed on a clinical
--   pathway pack ONLY if that pack is enabled for their institution. A patient's
--   *governing* pathway version may only ever be an APPROVED version — this keeps
--   draft / review content from becoming active patient care.
--
-- Part 3 — Care team: explicit per-patient assignment of a lead doctor / nurse /
--   coordinator, constrained to staff of the SAME institution (tenant isolation).
--
-- Part 4 — Private documents: a per-patient document store (metadata table + a
--   private Supabase Storage bucket) with path-based tenant isolation.
--
-- All new SECURITY DEFINER functions use an EMPTY search_path with schema-
-- qualified references and explicit EXECUTE revocations.
--
-- HOW TO APPLY: Supabase dashboard -> SQL Editor -> paste this file -> Run.
-- ============================================================================

-- ===========================================================================
-- PART 1 — Commercial model: one institution package is authoritative.
-- ===========================================================================

-- Stop mirroring per-pack config into the institution package. centres.package_*
-- is edited directly by the admin and is the single commercial source of truth.
drop trigger if exists pathway_config_mirror on institution_pathway_config;

-- Redefine assignment: enable the Super Admin's selected packs ONLY. No per-pack
-- commercial config is created — pathways carry clinical content, not a price.
create or replace function public.set_institution_pathways(p_centre uuid, p_pack_keys text[])
returns void language plpgsql security definer set search_path = '' as $$
declare k text; v_pack uuid;
begin
  foreach k in array coalesce(p_pack_keys, array[]::text[]) loop
    select id into v_pack from public.pathway_packs where key = k;
    if v_pack is null then continue; end if;
    insert into public.institution_pathways (centre_id, pack_id, enabled)
      values (p_centre, v_pack, true)
      on conflict (centre_id, pack_id) do update set enabled = true;
  end loop;
end $$;
revoke execute on function public.set_institution_pathways(uuid, text[]) from public, anon, authenticated;
grant execute on function public.set_institution_pathways(uuid, text[]) to service_role;

-- ===========================================================================
-- PART 2 — Patient <-> pathway assignment.
-- ===========================================================================

alter table patients add column if not exists pathway_pack_id    uuid references pathway_packs(id);
alter table patients add column if not exists pathway_version_id uuid references pathway_versions(id);
create index if not exists patients_pathway_pack_idx on patients(pathway_pack_id);

-- Enforce, for EVERY writer (incl. service_role for safety):
--   * pathway_pack_id must be a pack ENABLED for the patient's institution;
--   * pathway_version_id (the governing clinical version) must be APPROVED and
--     must belong to the assigned pack — draft/review versions can never govern
--     active patient care.
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
        and v.status = 'approved'
        and pw.pack_id = new.pathway_pack_id
    ) then
      raise exception 'A patient can only be governed by an APPROVED pathway version of the assigned pack';
    end if;
  end if;

  return new;
end $$;
revoke execute on function public.enforce_patient_pathway() from public, anon, authenticated;

drop trigger if exists patient_pathway_guard on patients;
create trigger patient_pathway_guard
  before insert or update of pathway_pack_id, pathway_version_id, centre_id on patients
  for each row execute function public.enforce_patient_pathway();

-- ===========================================================================
-- PART 3 — Care team (per-patient staff assignment, tenant-isolated).
-- ===========================================================================

create table if not exists patient_care_team (
  id          uuid primary key default gen_random_uuid(),
  patient_id  uuid not null references patients(id) on delete cascade,
  staff_id    uuid not null references auth.users(id) on delete cascade,
  team_role   text not null check (team_role in ('lead_doctor','nurse','coordinator')),
  assigned_by uuid references auth.users(id),
  assigned_at timestamptz not null default now(),
  unique (patient_id, team_role)
);
create index if not exists care_team_patient_idx on patient_care_team(patient_id);
create index if not exists care_team_staff_idx   on patient_care_team(staff_id);

alter table patient_care_team enable row level security;
grant select, insert, update, delete on patient_care_team to authenticated, service_role;

-- Read: anyone who can see the patient (household + their centre's staff).
drop policy if exists care_team_read on patient_care_team;
create policy care_team_read on patient_care_team for select
  using ((select can_see_patient(patient_id)));

-- Write: only staff of the patient's centre may manage the care team.
drop policy if exists care_team_write on patient_care_team;
create policy care_team_write on patient_care_team for all
  using ((select is_staff()) and (select can_see_patient(patient_id)))
  with check ((select is_staff()) and (select can_see_patient(patient_id)));

-- Integrity: the assigned staff member must belong to the patient's institution,
-- and their profile role must be compatible with the team role. Applies to all.
create or replace function public.enforce_care_team()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_staff_centre uuid; v_staff_role text; v_patient_centre uuid;
begin
  select centre_id, role::text into v_staff_centre, v_staff_role
    from public.profiles where id = new.staff_id;
  select centre_id into v_patient_centre from public.patients where id = new.patient_id;

  if v_staff_centre is null or v_staff_centre is distinct from v_patient_centre then
    raise exception 'A care-team member must belong to the same institution as the patient';
  end if;

  if new.team_role = 'lead_doctor' and v_staff_role not in ('pmr','duty_doctor') then
    raise exception 'The lead doctor must be a doctor account';
  elsif new.team_role = 'nurse' and v_staff_role <> 'nurse' then
    raise exception 'The assigned nurse must be a nurse account';
  elsif new.team_role = 'coordinator' and v_staff_role not in ('pmr','nurse','duty_doctor') then
    raise exception 'The coordinator must be a staff account';
  end if;

  new.assigned_at := now();
  return new;
end $$;
revoke execute on function public.enforce_care_team() from public, anon, authenticated;

drop trigger if exists care_team_guard on patient_care_team;
create trigger care_team_guard
  before insert or update on patient_care_team
  for each row execute function public.enforce_care_team();

-- ===========================================================================
-- PART 4 — Private documents (metadata + Storage bucket, tenant-isolated).
-- ===========================================================================

create table if not exists patient_documents (
  id           uuid primary key default gen_random_uuid(),
  patient_id   uuid not null references patients(id) on delete cascade,
  centre_id    uuid not null references centres(id),
  uploaded_by  uuid references auth.users(id),
  storage_path text not null unique,
  file_name    text not null,
  mime         text,
  size_bytes   bigint,
  doc_type     text not null default 'other'
                 check (doc_type in ('discharge_summary','imaging','prescription','lab','other')),
  created_at   timestamptz not null default now()
);
create index if not exists patient_documents_patient_idx on patient_documents(patient_id, created_at desc);

alter table patient_documents enable row level security;
grant select, insert, delete on patient_documents to authenticated, service_role;

-- Read: anyone who can see the patient. Write/delete: staff of the centre only.
drop policy if exists patient_documents_read on patient_documents;
create policy patient_documents_read on patient_documents for select
  using ((select can_see_patient(patient_id)));
drop policy if exists patient_documents_insert on patient_documents;
create policy patient_documents_insert on patient_documents for insert
  with check ((select is_staff()) and (select can_see_patient(patient_id)));
drop policy if exists patient_documents_delete on patient_documents;
create policy patient_documents_delete on patient_documents for delete
  using ((select is_staff()) and (select can_see_patient(patient_id)));

-- Integrity: stamp centre_id from the patient (client never chooses it), so the
-- metadata row can never be cross-tenant relative to the patient it references.
create or replace function public.enforce_document_centre()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_centre uuid;
begin
  select centre_id into v_centre from public.patients where id = new.patient_id;
  if v_centre is null then
    raise exception 'Unknown patient for document';
  end if;
  new.centre_id := v_centre;
  return new;
end $$;
revoke execute on function public.enforce_document_centre() from public, anon, authenticated;

drop trigger if exists patient_document_centre_guard on patient_documents;
create trigger patient_document_centre_guard
  before insert on patient_documents
  for each row execute function public.enforce_document_centre();

-- ---- Storage bucket (private) + path-based tenant isolation ----------------
-- Object path convention:  <centre_id>/<patient_id>/<uuid>-<filename>
--   foldername[1] = centre_id, foldername[2] = patient_id.
insert into storage.buckets (id, name, public)
  values ('patient-docs', 'patient-docs', false)
  on conflict (id) do nothing;

-- Read: anyone who can see the patient the object belongs to.
drop policy if exists patient_docs_read on storage.objects;
create policy patient_docs_read on storage.objects for select to authenticated
  using (
    bucket_id = 'patient-docs'
    and public.can_see_patient(((storage.foldername(name))[2])::uuid)
  );

-- Insert / delete: staff uploading only under THEIR OWN institution's folder.
drop policy if exists patient_docs_insert on storage.objects;
create policy patient_docs_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'patient-docs'
    and (select public.is_staff())
    and ((storage.foldername(name))[1])::uuid = (select public.my_centre())
  );

drop policy if exists patient_docs_delete on storage.objects;
create policy patient_docs_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'patient-docs'
    and (select public.is_staff())
    and ((storage.foldername(name))[1])::uuid = (select public.my_centre())
  );

-- ============================================================================
-- Done. One institution package (commercial); pathways stay clinical-only and
-- must be institution-enabled to assign; only APPROVED versions can govern care;
-- care team + documents are tenant-isolated at the database and storage layers.
-- ============================================================================
