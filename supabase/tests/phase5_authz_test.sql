-- ============================================================================
-- Carelune — Phase 5 plan-generation authorization tests (pgTAP).
-- DB-level only (no OpenAI): the 3-question intake, institution pathway-version
-- approval, plan-draft RLS, and the Phase-3 hardening corrections carried into 0016.
-- Run: supabase test db
-- ============================================================================
begin;
select plan(11);

create or replace function _as(uid text, urole text default 'authenticated') returns void
language plpgsql as $$ begin
  execute format('set local role %I', case when urole='service_role' then 'service_role' else 'authenticated' end);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', urole)::text, true);
end $$;

-- ---- fixtures ----
set local "request.jwt.claims" to '{"role":"service_role"}';
insert into centres (id, name) values ('61111111-1111-1111-1111-111111111111','Inst P5');
insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000','a6000000-0000-0000-0000-000000000001','authenticated','authenticated','docP5@t.in'),
  ('00000000-0000-0000-0000-000000000000','a6000000-0000-0000-0000-000000000002','authenticated','authenticated','nurseP5@t.in');
update profiles set role='pmr',   is_admin=true, centre_id='61111111-1111-1111-1111-111111111111', full_name='Doc P5'   where id='a6000000-0000-0000-0000-000000000001';
update profiles set role='nurse', centre_id='61111111-1111-1111-1111-111111111111', full_name='Nurse P5' where id='a6000000-0000-0000-0000-000000000002';
insert into patients (id, centre_id, full_name) values
  ('6a000000-0000-0000-0000-0000000000a1','61111111-1111-1111-1111-111111111111','Patient P5');
reset role;
select _as('svc','service_role');
select set_institution_pathways('61111111-1111-1111-1111-111111111111', array['spine']);
reset role;
set local "request.jwt.claims" to '{"role":"service_role"}';
update patients set pathway_pack_id=(select id from pathway_packs where key='spine')
  where id='6a000000-0000-0000-0000-0000000000a1';
reset role; set local "request.jwt.claims" to '{}';

-- ---- 1. doctor's intake answers stamp answered_by server-side ----
select _as('a6000000-0000-0000-0000-000000000001');
insert into patient_plan_intake (patient_id, milestone_goal) values ('6a000000-0000-0000-0000-0000000000a1','Indoor walking');
select is((select answered_by from patient_plan_intake where patient_id='6a000000-0000-0000-0000-0000000000a1'),
          'a6000000-0000-0000-0000-000000000001'::uuid, 'intake.answered_by is stamped from the authenticated doctor');

-- ---- 2. a nurse cannot write the intake ----
reset role; select _as('a6000000-0000-0000-0000-000000000002');
select throws_like(
  $$insert into patient_plan_intake (patient_id, milestone_goal) values ('6a000000-0000-0000-0000-0000000000a1','x')$$,
  '%row-level security%', 'a nurse cannot author the doctor intake');

-- ---- 3. a nurse cannot assign the care team (hardening #3) ----
select throws_like(
  $$insert into patient_care_team (patient_id, staff_id, team_role)
    values ('6a000000-0000-0000-0000-0000000000a1','a6000000-0000-0000-0000-000000000002','nurse')$$,
  '%row-level security%', 'a nurse cannot assign/remove the care team');

-- ---- 4. a doctor CAN assign the care team ----
reset role; select _as('a6000000-0000-0000-0000-000000000001');
select lives_ok(
  $$insert into patient_care_team (patient_id, staff_id, team_role)
    values ('6a000000-0000-0000-0000-0000000000a1','a6000000-0000-0000-0000-000000000002','nurse')$$,
  'a doctor can assign the care team');

-- ---- 5. a nurse cannot approve a pathway version for the institution ----
reset role; select _as('a6000000-0000-0000-0000-000000000002');
select throws_like(
  $$select approve_pathway_version_for_institution((
      select v.id from pathway_versions v join pathways pw on pw.id=v.pathway_id
      join pathway_packs pk on pk.id=pw.pack_id where pk.key='spine' and pw.key='lumbar_fusion' limit 1))$$,
  '%admin or doctor%', 'a nurse cannot approve a pathway version');

-- ---- 6/7. a doctor approves the pathway version for the institution ----
reset role; select _as('a6000000-0000-0000-0000-000000000001');
select lives_ok(
  $$select approve_pathway_version_for_institution((
      select v.id from pathway_versions v join pathways pw on pw.id=v.pathway_id
      join pathway_packs pk on pk.id=pw.pack_id where pk.key='spine' and pw.key='lumbar_fusion' limit 1))$$,
  'a doctor can approve a pathway version for their institution');
select is((select count(*)::int from institution_pathway_versions where centre_id='61111111-1111-1111-1111-111111111111'),
          1, 'the institutional approval is recorded');

-- ---- 8. after approval, the version may govern the patient (0016 relaxation) ----
select lives_ok(
  $$update patients set pathway_version_id=(
      select v.id from pathway_versions v join pathways pw on pw.id=v.pathway_id
      join pathway_packs pk on pk.id=pw.pack_id where pk.key='spine' and pw.key='lumbar_fusion' limit 1)
    where id='6a000000-0000-0000-0000-0000000000a1'$$,
  'an institution-approved version may be set as the patient governing version');

-- ---- 9. plan draft: created by service_role; doctor approval stamps approved_by ----
reset role; select _as('svc','service_role');
insert into patient_plans (patient_id, centre_id, version, content, status)
  values ('6a000000-0000-0000-0000-0000000000a1','61111111-1111-1111-1111-111111111111',1,'{"clinical_summary":"x"}'::jsonb,'draft');
reset role; select _as('a6000000-0000-0000-0000-000000000001');
update patient_plans set status='approved' where patient_id='6a000000-0000-0000-0000-0000000000a1';
select is((select approved_by from patient_plans where patient_id='6a000000-0000-0000-0000-0000000000a1'),
          'a6000000-0000-0000-0000-000000000001'::uuid, 'approving a draft stamps approved_by from the doctor');

-- ---- 10. a nurse cannot change a plan draft (RLS update no-op) ----
reset role; select _as('a6000000-0000-0000-0000-000000000002');
update patient_plans set status='draft' where patient_id='6a000000-0000-0000-0000-0000000000a1';
select is((select status from patient_plans where patient_id='6a000000-0000-0000-0000-0000000000a1'),
          'approved', 'a nurse cannot revert/edit the plan (RLS blocks the update)');

-- ---- 11. the private bucket enforces a 10 MB size limit (hardening #2) ----
reset role; set local "request.jwt.claims" to '{}';
select is((select file_size_limit from storage.buckets where id='patient-docs'),
          10485760::bigint, 'the patient-docs bucket enforces a 10 MB size limit');

select * from finish();
rollback;
