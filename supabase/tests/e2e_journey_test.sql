-- ============================================================================
-- Carelune — Stage A end-to-end acceptance journey (pgTAP, synthetic data).
-- Institution -> pathway enabled -> patient registered -> pathway/team assigned
-- -> pathway version institution-approved -> facts (simulated extract) -> intake
-- -> plan draft (simulated generate) -> approve -> ATOMIC activate -> caregiver /
-- family / nurse / doctor visibility -> idempotency -> versioned amendment.
-- (The AI steps are simulated by inserting representative rows, since OpenAI is
--  not callable inside the database test.)
-- Run: supabase test db
-- ============================================================================
begin;
select plan(16);

create or replace function _as(uid text, urole text default 'authenticated') returns void
language plpgsql as $$ begin
  execute format('set local role %I', case when urole='service_role' then 'service_role' else 'authenticated' end);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', urole)::text, true);
end $$;

-- ---- fixtures ----
set local "request.jwt.claims" to '{"role":"service_role"}';
insert into centres (id, name) values ('71111111-1111-1111-1111-111111111111','Inst E2E');
insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000','a7000000-0000-0000-0000-000000000001','authenticated','authenticated','docE2E@t.in'),
  ('00000000-0000-0000-0000-000000000000','a7000000-0000-0000-0000-000000000002','authenticated','authenticated','nurseE2E@t.in'),
  ('00000000-0000-0000-0000-000000000000','a7000000-0000-0000-0000-000000000003','authenticated','authenticated','cgE2E@t.in'),
  ('00000000-0000-0000-0000-000000000000','a7000000-0000-0000-0000-000000000004','authenticated','authenticated','famE2E@t.in');
update profiles set role='pmr', is_admin=true, centre_id='71111111-1111-1111-1111-111111111111', full_name='Doc' where id='a7000000-0000-0000-0000-000000000001';
update profiles set role='nurse', centre_id='71111111-1111-1111-1111-111111111111', full_name='Nurse' where id='a7000000-0000-0000-0000-000000000002';
update profiles set role='caregiver', centre_id='71111111-1111-1111-1111-111111111111', full_name='CG' where id='a7000000-0000-0000-0000-000000000003';
update profiles set role='family', centre_id='71111111-1111-1111-1111-111111111111', full_name='Fam' where id='a7000000-0000-0000-0000-000000000004';
insert into patients (id, centre_id, full_name, status) values ('7a000000-0000-0000-0000-0000000000a1','71111111-1111-1111-1111-111111111111','Patient E2E','pending');
insert into patient_members (patient_id, user_id, relation) values
  ('7a000000-0000-0000-0000-0000000000a1','a7000000-0000-0000-0000-000000000003','caregiver'),
  ('7a000000-0000-0000-0000-0000000000a1','a7000000-0000-0000-0000-000000000004','family');
reset role;
select _as('svc','service_role');
select set_institution_pathways('71111111-1111-1111-1111-111111111111', array['spine']);
reset role;
set local "request.jwt.claims" to '{"role":"service_role"}';
update patients set pathway_pack_id=(select id from pathway_packs where key='spine') where id='7a000000-0000-0000-0000-0000000000a1';
insert into patient_document_facts (patient_id, centre_id, facts) values
  ('7a000000-0000-0000-0000-0000000000a1','71111111-1111-1111-1111-111111111111','{"baseline_function":"seed"}'::jsonb);
insert into patient_plans (patient_id, centre_id, version, content, status) values
  ('7a000000-0000-0000-0000-0000000000a1','71111111-1111-1111-1111-111111111111',1, $j$
  {"clinical_summary":"Post lumbar fusion, day 3",
   "diagnosis":[{"text":"Lumbar spondylolisthesis","provenance":"document"}],
   "medicines":[{"name":"Paracetamol","dose":"1 g","freq":"1-1-1","timing":"After food","provenance":"document"},
                {"name":"Pantoprazole","dose":"40 mg","freq":"1-0-0","timing":"Before food","provenance":"document"}],
   "daily_tasks":[{"time_label":"08:00","discipline":"Nursing","title":"Wound check","provenance":"document"}],
   "therapy_tasks":[{"time_label":"10:00","discipline":"Physiotherapy","title":"Ankle pumps","provenance":"pathway"}],
   "observations":[{"module":"pain","frequency":"daily","recorded_by":"caregiver"},
                   {"module":"wound_care","frequency":"daily","recorded_by":"caregiver"}],
   "diet":[{"text":"High-protein diet","provenance":"document"}],
   "milestones":[{"key":"walk","name":"Walk indoors","by_day":7}],
   "warning_signs":[{"text":"Fever 38C or higher","severity":"urgent"}],
   "escalation":{"routine":"nurse","urgent":"doctor","emergency":"112/108"}}
  $j$::jsonb, 'draft');
reset role; set local "request.jwt.claims" to '{}';

-- doctor approves + governs the pathway version
select _as('a7000000-0000-0000-0000-000000000001');
select approve_pathway_version_for_institution((
  select v.id from pathway_versions v join pathways pw on pw.id=v.pathway_id join pathway_packs pk on pk.id=pw.pack_id
  where pk.key='spine' and pw.key='lumbar_fusion' limit 1));
update patients set pathway_version_id=(
  select v.id from pathway_versions v join pathways pw on pw.id=v.pathway_id join pathway_packs pk on pk.id=pw.pack_id
  where pk.key='spine' and pw.key='lumbar_fusion' limit 1)
  where id='7a000000-0000-0000-0000-0000000000a1';

-- 1. a nurse cannot activate a plan
reset role; select _as('a7000000-0000-0000-0000-000000000002');
select throws_like($$select activate_patient_plan((select id from patient_plans where patient_id='7a000000-0000-0000-0000-0000000000a1' and version=1))$$,
  '%Only a doctor%', 'a nurse cannot activate a care plan');

-- 2. a DRAFT (unapproved) plan cannot be activated even by the doctor
reset role; select _as('a7000000-0000-0000-0000-000000000001');
select throws_like($$select activate_patient_plan((select id from patient_plans where patient_id='7a000000-0000-0000-0000-0000000000a1' and version=1))$$,
  '%APPROVED%', 'only an approved plan can be activated');

-- doctor approves the draft
update patient_plans set status='approved' where patient_id='7a000000-0000-0000-0000-0000000000a1' and version=1;

-- 3. doctor activates the approved plan
select lives_ok($$select activate_patient_plan((select id from patient_plans where patient_id='7a000000-0000-0000-0000-0000000000a1' and version=1))$$,
  'doctor activates the approved plan');

-- 4/5/6. runtime records created (tagged with the plan) + patient becomes active
select is((select count(*)::int from medications where patient_id='7a000000-0000-0000-0000-0000000000a1' and active
           and source_plan_id=(select id from patient_plans where patient_id='7a000000-0000-0000-0000-0000000000a1' and version=1)),
          2, 'two medicines created from the plan');
select is((select count(*)::int from care_tasks where patient_id='7a000000-0000-0000-0000-0000000000a1' and active
           and source_plan_id=(select id from patient_plans where patient_id='7a000000-0000-0000-0000-0000000000a1' and version=1)),
          5, 'daily+therapy+monitoring+diet tasks created from the plan');
select is((select status from patients where id='7a000000-0000-0000-0000-0000000000a1'), 'active', 'patient is now active');

-- 7. idempotent re-activation does not duplicate
select lives_ok($$select activate_patient_plan((select id from patient_plans where patient_id='7a000000-0000-0000-0000-0000000000a1' and version=1))$$,
  're-activation is safe');
select is((select count(*)::int from medications where patient_id='7a000000-0000-0000-0000-0000000000a1' and active), 2,
          're-activation did not duplicate medicines');

-- 8/9. the caregiver sees today's tasks + medicines
reset role; select _as('a7000000-0000-0000-0000-000000000003');
select is((select count(*)::int from care_tasks where patient_id='7a000000-0000-0000-0000-0000000000a1' and active), 5,
          'caregiver sees the active care tasks');
select is((select count(*)::int from medications where patient_id='7a000000-0000-0000-0000-0000000000a1' and active), 2,
          'caregiver sees the active medicines');

-- 10/11. the family sees the APPROVED plan, but never a draft
reset role; select _as('a7000000-0000-0000-0000-000000000004');
select is((select count(*)::int from patient_plans where patient_id='7a000000-0000-0000-0000-0000000000a1' and status='approved'), 1,
          'family can read the approved recovery plan');
reset role; set local "request.jwt.claims" to '{"role":"service_role"}';
insert into patient_plans (patient_id, centre_id, version, content, status) values
  ('7a000000-0000-0000-0000-0000000000a1','71111111-1111-1111-1111-111111111111',2,
   '{"clinical_summary":"amended","medicines":[{"name":"Paracetamol","dose":"1 g","freq":"1-1-1","timing":"","provenance":"document"}],"observations":[],"diet":[],"escalation":{"routine":"nurse","urgent":"doctor","emergency":"112/108"}}'::jsonb,'draft');
reset role; select _as('a7000000-0000-0000-0000-000000000004');
select is((select count(*)::int from patient_plans where patient_id='7a000000-0000-0000-0000-0000000000a1' and status='draft'), 0,
          'family cannot read a draft plan');

-- 12. the nurse sees the active patient
reset role; select _as('a7000000-0000-0000-0000-000000000002');
select is((select count(*)::int from patients where id='7a000000-0000-0000-0000-0000000000a1' and status='active'), 1,
          'nurse sees the active patient');

-- 13/14. the doctor can correct facts; the nurse cannot overwrite them
reset role; select _as('a7000000-0000-0000-0000-000000000001');
update patient_document_facts set facts='{"baseline_function":"docedit"}'::jsonb where patient_id='7a000000-0000-0000-0000-0000000000a1';
reset role; select _as('a7000000-0000-0000-0000-000000000002');
update patient_document_facts set facts='{"baseline_function":"nurseedit"}'::jsonb where patient_id='7a000000-0000-0000-0000-0000000000a1';
select is((select facts->>'baseline_function' from patient_document_facts where patient_id='7a000000-0000-0000-0000-0000000000a1'),
          'docedit', 'a nurse cannot overwrite the doctor-corrected facts');

-- 15/16. amend: activating v2 retires v1 runtime but preserves it as history
reset role; select _as('a7000000-0000-0000-0000-000000000001');
update patient_plans set status='approved' where patient_id='7a000000-0000-0000-0000-0000000000a1' and version=2;
select lives_ok($$select activate_patient_plan((select id from patient_plans where patient_id='7a000000-0000-0000-0000-0000000000a1' and version=2))$$,
  'doctor activates the amended plan (v2)');
select is((select count(*)::int from medications where patient_id='7a000000-0000-0000-0000-0000000000a1'), 3,
          'v1 medicines are preserved (inactive) alongside v2 active — history kept');

select * from finish();
rollback;
