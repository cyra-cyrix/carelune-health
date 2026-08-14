-- ============================================================================
-- Carelune — activation idempotency regression (pgTAP, 0018).
-- activate -> caregiver creates a task log -> retry the SAME activation:
-- the care_task and its task_log both survive, with no duplicate runtime records.
-- Run: supabase test db
-- ============================================================================
begin;
select plan(6);

create or replace function _as(uid text, urole text default 'authenticated') returns void
language plpgsql as $$ begin
  execute format('set local role %I', case when urole='service_role' then 'service_role' else 'authenticated' end);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', urole)::text, true);
end $$;

-- ---- fixtures: centre + doctor + caregiver + patient + an APPROVED plan ----
set local "request.jwt.claims" to '{"role":"service_role"}';
insert into centres (id, name) values ('81111111-1111-1111-1111-111111111111','Inst Idem');
insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000','a8000000-0000-0000-0000-000000000001','authenticated','authenticated','docI@t.in'),
  ('00000000-0000-0000-0000-000000000000','a8000000-0000-0000-0000-000000000003','authenticated','authenticated','cgI@t.in');
update profiles set role='pmr', is_admin=true, centre_id='81111111-1111-1111-1111-111111111111' where id='a8000000-0000-0000-0000-000000000001';
update profiles set role='caregiver', centre_id='81111111-1111-1111-1111-111111111111' where id='a8000000-0000-0000-0000-000000000003';
insert into patients (id, centre_id, full_name, status) values ('8a000000-0000-0000-0000-0000000000a1','81111111-1111-1111-1111-111111111111','Patient Idem','pending');
insert into patient_members (patient_id, user_id, relation) values
  ('8a000000-0000-0000-0000-0000000000a1','a8000000-0000-0000-0000-000000000003','caregiver');
insert into patient_plans (patient_id, centre_id, version, content, status) values
  ('8a000000-0000-0000-0000-0000000000a1','81111111-1111-1111-1111-111111111111',1, $j$
  {"clinical_summary":"seed",
   "diagnosis":[{"text":"Dx","provenance":"document"}],
   "medicines":[{"name":"Paracetamol","dose":"1 g","freq":"1-1-1","timing":"","provenance":"document"}],
   "daily_tasks":[{"time_label":"08:00","discipline":"Nursing","title":"Wound check","provenance":"document"}],
   "therapy_tasks":[],"observations":[{"module":"pain","frequency":"daily","recorded_by":"caregiver"}],
   "diet":[],"milestones":[],"warning_signs":[{"text":"Fever","severity":"urgent"}],
   "escalation":{"routine":"nurse","urgent":"doctor","emergency":"112/108"}}
  $j$::jsonb, 'approved');
reset role; set local "request.jwt.claims" to '{}';

-- ---- 1/2. doctor activates: runtime records created (1 daily task + 1 monitoring) ----
select _as('a8000000-0000-0000-0000-000000000001');
select lives_ok(
  $$select activate_patient_plan((select id from patient_plans where patient_id='8a000000-0000-0000-0000-0000000000a1' and version=1))$$,
  'first activation succeeds');
select is((select count(*)::int from care_tasks where patient_id='8a000000-0000-0000-0000-0000000000a1' and active),
          2, 'two care tasks are active after activation');

-- ---- 3. caregiver ticks off the wound-check task (creates a task_log) ----
reset role; select _as('a8000000-0000-0000-0000-000000000003');
select lives_ok(
  $$insert into task_logs (patient_id, task_id, done)
    values ('8a000000-0000-0000-0000-0000000000a1',
            (select id from care_tasks where patient_id='8a000000-0000-0000-0000-0000000000a1' and title='Wound check' and active limit 1),
            true)$$,
  'caregiver records a task log for the active task');

-- ---- 4. doctor retries the SAME activation ----
reset role; select _as('a8000000-0000-0000-0000-000000000001');
select lives_ok(
  $$select activate_patient_plan((select id from patient_plans where patient_id='8a000000-0000-0000-0000-0000000000a1' and version=1))$$,
  're-activating the same plan is a safe no-op');

-- ---- 5. no duplicate runtime records ----
select is((select count(*)::int from care_tasks where patient_id='8a000000-0000-0000-0000-0000000000a1'),
          2, 'no duplicate care tasks were created on retry');

-- ---- 6. the task log survived (task not deleted/recreated) ----
select is((select count(*)::int from task_logs where patient_id='8a000000-0000-0000-0000-0000000000a1'),
          1, 'the task log is preserved across re-activation');

select * from finish();
rollback;
