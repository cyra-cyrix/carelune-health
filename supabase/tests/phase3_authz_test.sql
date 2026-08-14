-- ============================================================================
-- Carelune — Phase 3 intake/assignment authorization tests (pgTAP).
-- Covers: only institution-enabled pathways are assignable; draft/review pathway
-- versions can never govern a patient; care-team tenant isolation + role rules;
-- document tenant isolation; storage policies present.
-- Run: supabase test db
-- ============================================================================
begin;
select plan(10);

create or replace function _as(uid text, urole text default 'authenticated') returns void
language plpgsql as $$ begin
  execute format('set local role %I', case when urole='service_role' then 'service_role' else 'authenticated' end);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', urole)::text, true);
end $$;

-- ---- fixtures (RLS-bypassing setup) ----
set local "request.jwt.claims" to '{"role":"service_role"}';
insert into centres (id, name) values
  ('51111111-1111-1111-1111-111111111111','Inst A'),
  ('52222222-2222-2222-2222-222222222222','Inst B');
insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000','a5000000-0000-0000-0000-000000000001','authenticated','authenticated','docA@t.in'),
  ('00000000-0000-0000-0000-000000000000','a5000000-0000-0000-0000-000000000002','authenticated','authenticated','nurseA@t.in'),
  ('00000000-0000-0000-0000-000000000000','a5000000-0000-0000-0000-000000000003','authenticated','authenticated','nurseB@t.in');
update profiles set role='pmr',   is_admin=true, centre_id='51111111-1111-1111-1111-111111111111', full_name='Doc A'    where id='a5000000-0000-0000-0000-000000000001';
update profiles set role='nurse', centre_id='51111111-1111-1111-1111-111111111111', full_name='Nurse A' where id='a5000000-0000-0000-0000-000000000002';
update profiles set role='nurse', centre_id='52222222-2222-2222-2222-222222222222', full_name='Nurse B' where id='a5000000-0000-0000-0000-000000000003';
insert into patients (id, centre_id, full_name) values
  ('5a000000-0000-0000-0000-0000000000a1','51111111-1111-1111-1111-111111111111','Patient A'),
  ('5a000000-0000-0000-0000-0000000000b1','52222222-2222-2222-2222-222222222222','Patient B');
reset role;

-- enable ONLY 'spine' for Inst A (service_role RPC)
select _as('svc','service_role');
select set_institution_pathways('51111111-1111-1111-1111-111111111111', array['spine']);
reset role; set local "request.jwt.claims" to '{}';

-- ---- 1. staff assigns an ENABLED pathway to their patient ----
select _as('a5000000-0000-0000-0000-000000000001');
select lives_ok(
  $$update patients set pathway_pack_id=(select id from pathway_packs where key='spine')
    where id='5a000000-0000-0000-0000-0000000000a1'$$,
  'lead doctor can assign an institution-enabled pathway');

-- ---- 2. a NON-enabled pathway cannot be assigned ----
select throws_like(
  $$update patients set pathway_pack_id=(select id from pathway_packs where key='neuro')
    where id='5a000000-0000-0000-0000-0000000000a1'$$,
  '%not enabled for this institution%',
  'a pathway NOT enabled for the institution cannot be assigned');

-- ---- 3. a draft/review (non-approved) version can never govern the patient ----
select throws_like(
  $$update patients set pathway_version_id=(
      select v.id from pathway_versions v
      join pathways pw on pw.id=v.pathway_id
      join pathway_packs pk on pk.id=pw.pack_id
      where pk.key='spine' and pw.key='lumbar_fusion' limit 1)
    where id='5a000000-0000-0000-0000-0000000000a1'$$,
  '%APPROVED pathway version%',
  'only an APPROVED pathway version may govern a patient (draft/review blocked)');

-- ---- 4. care team: assign a same-institution nurse ----
select lives_ok(
  $$insert into patient_care_team (patient_id, staff_id, team_role)
    values ('5a000000-0000-0000-0000-0000000000a1','a5000000-0000-0000-0000-000000000002','nurse')$$,
  'a same-institution nurse can be assigned to the care team');

-- ---- 5. care team: a different-institution staff member is rejected ----
select throws_like(
  $$insert into patient_care_team (patient_id, staff_id, team_role)
    values ('5a000000-0000-0000-0000-0000000000a1','a5000000-0000-0000-0000-000000000003','coordinator')$$,
  '%same institution%',
  'a care-team member from another institution is rejected (tenant isolation)');

-- ---- 6. care team: role compatibility is enforced ----
select throws_like(
  $$insert into patient_care_team (patient_id, staff_id, team_role)
    values ('5a000000-0000-0000-0000-0000000000a1','a5000000-0000-0000-0000-000000000002','lead_doctor')$$,
  '%lead doctor must be a doctor%',
  'a nurse cannot be assigned as the lead doctor');

-- ---- 7/8. documents: staff upload metadata, centre_id stamped from the patient ----
select lives_ok(
  $$insert into patient_documents (patient_id, storage_path, file_name, doc_type)
    values ('5a000000-0000-0000-0000-0000000000a1',
            '51111111-1111-1111-1111-111111111111/5a000000-0000-0000-0000-0000000000a1/d1.pdf',
            'd1.pdf','discharge_summary')$$,
  'staff can add a document for their own patient');
select is(
  (select centre_id from patient_documents
   where storage_path='51111111-1111-1111-1111-111111111111/5a000000-0000-0000-0000-0000000000a1/d1.pdf'),
  '51111111-1111-1111-1111-111111111111'::uuid,
  'document centre_id is stamped from the patient (never client-chosen)');

-- ---- 9. documents: cross-tenant insert is blocked by RLS ----
reset role; select _as('a5000000-0000-0000-0000-000000000003');   -- Nurse B (other institution)
select throws_like(
  $$insert into patient_documents (patient_id, storage_path, file_name)
    values ('5a000000-0000-0000-0000-0000000000a1','x/y/z.pdf','z.pdf')$$,
  '%row-level security%',
  'a staff member from another institution cannot add a document to this patient');

-- ---- 10. private-storage policies are present ----
reset role; set local "request.jwt.claims" to '{}';
select is(
  (select count(*)::int from pg_policies
   where schemaname='storage' and tablename='objects' and policyname like 'patient_docs%'),
  3, 'the three tenant-isolated storage policies exist (read/insert/delete)');

select * from finish();
rollback;
