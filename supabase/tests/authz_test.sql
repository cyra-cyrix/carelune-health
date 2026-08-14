-- ============================================================================
-- Carelune — backend authorization tests (pgTAP).
-- Verifies the 0011/0012 access-control guards against every role by simulating
-- the request the way PostgREST does: SET ROLE + a request.jwt.claims GUC (which
-- is what the fixed guards read, instead of the broken `current_user`).
--
-- Run:  supabase test db
-- ============================================================================
begin;
select plan(24);

-- Fixed ids ------------------------------------------------------------------
-- centres:  C1 = 111…  C2 = 222…
-- users:    fam1 a…01  cg1 a…02  nurse1 a…03  duty1 a…04  pmr1 a…05  nurse2 a…06
-- patients: A c…01 (C1)   B c…02 (C2)
-- approvals: fam query D…01 (patient_query)   nurse query D…02 (nurse_query)
-- tasks:    E…01 (A)   E…02 (B)

-- ---- Seed as postgres. Set a service_role claim so the provenance guards treat
--      the seed as a trusted server write (otherwise they derive from a caller
--      that doesn't exist yet). ----
set local "request.jwt.claims" to '{"role":"service_role"}';

insert into centres (id, name, package_name, package_price, trial_days) values
  ('11111111-1111-1111-1111-111111111111', 'Centre One', 'Continuum', 5999, 10),
  ('22222222-2222-2222-2222-222222222222', 'Centre Two', null, null, 0);

insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000','a0000000-0000-0000-0000-000000000001','authenticated','authenticated','fam1@t.in'),
  ('00000000-0000-0000-0000-000000000000','a0000000-0000-0000-0000-000000000002','authenticated','authenticated','cg1@t.in'),
  ('00000000-0000-0000-0000-000000000000','a0000000-0000-0000-0000-000000000003','authenticated','authenticated','nurse1@t.in'),
  ('00000000-0000-0000-0000-000000000000','a0000000-0000-0000-0000-000000000004','authenticated','authenticated','duty1@t.in'),
  ('00000000-0000-0000-0000-000000000000','a0000000-0000-0000-0000-000000000005','authenticated','authenticated','pmr1@t.in'),
  ('00000000-0000-0000-0000-000000000000','a0000000-0000-0000-0000-000000000006','authenticated','authenticated','nurse2@t.in');

update profiles set role='family',      centre_id='11111111-1111-1111-1111-111111111111', full_name='Fam One'   where id='a0000000-0000-0000-0000-000000000001';
update profiles set role='caregiver',   centre_id='11111111-1111-1111-1111-111111111111', full_name='CG One'    where id='a0000000-0000-0000-0000-000000000002';
update profiles set role='nurse',       centre_id='11111111-1111-1111-1111-111111111111', full_name='Nurse One' where id='a0000000-0000-0000-0000-000000000003';
update profiles set role='duty_doctor', centre_id='11111111-1111-1111-1111-111111111111', full_name='Duty One'  where id='a0000000-0000-0000-0000-000000000004';
update profiles set role='pmr',         centre_id='11111111-1111-1111-1111-111111111111', full_name='Dr One'    where id='a0000000-0000-0000-0000-000000000005';
update profiles set role='nurse',       centre_id='22222222-2222-2222-2222-222222222222', full_name='Nurse Two' where id='a0000000-0000-0000-0000-000000000006';

insert into patients (id, centre_id, full_name, status) values
  ('c0000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','Patient A','pending'),
  ('c0000000-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222','Patient B','pending');

insert into patient_members (patient_id, user_id, relation) values
  ('c0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','family'),
  ('c0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000002','caregiver');

insert into approvals (id, patient_id, type, from_name, message, raised_by) values
  ('d0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001','patient_query','Fam One','Is the swelling normal?','a0000000-0000-0000-0000-000000000001'),
  ('d0000000-0000-0000-0000-000000000002','c0000000-0000-0000-0000-000000000001','nurse_query','Nurse One','Dose check','a0000000-0000-0000-0000-000000000003');

insert into care_tasks (id, patient_id, time_label, sort_order, discipline, title) values
  ('e0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001','08:00',0,'Nursing','Check BP'),
  ('e0000000-0000-0000-0000-000000000002','c0000000-0000-0000-0000-000000000002','08:00',0,'Nursing','Check BP');

-- helper: become a signed-in user (SET ROLE + JWT claims, like PostgREST)
create or replace function _as(uid text, urole text default 'authenticated') returns void
language plpgsql as $$ begin
  execute format('set local role %I', case when urole='service_role' then 'service_role' else 'authenticated' end);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', urole)::text, true);
end $$;

reset role;
set local "request.jwt.claims" to '{}';

-- ============================ B2 — read scoping ============================
select _as('a0000000-0000-0000-0000-000000000001');       -- family
select is((select count(*)::int from approvals where type='nurse_query' and patient_id='c0000000-0000-0000-0000-000000000001'),
          0, 'B2: family CANNOT read internal nurse_query');
select is((select count(*)::int from approvals where type='patient_query' and patient_id='c0000000-0000-0000-0000-000000000001'),
          1, 'B2: family CAN read their own patient_query');

-- ==================== B3/1/6 — approval provenance =========================
reset role;
select _as('a0000000-0000-0000-0000-000000000001');       -- family
select throws_ok(
  $$insert into approvals (patient_id, type, message) values ('c0000000-0000-0000-0000-000000000001','duty_med','forge')$$,
  'This role may only raise a family query',
  'B3: family cannot forge a duty_med approval');

reset role;
select _as('a0000000-0000-0000-0000-000000000001');       -- family
insert into approvals (id, patient_id, type, from_name, message, raised_by)
  values ('d0000000-0000-0000-0000-0000000000aa','c0000000-0000-0000-0000-000000000001','patient_query','HACKER','q','a0000000-0000-0000-0000-000000000003');
select is((select raised_by::text from approvals where id='d0000000-0000-0000-0000-0000000000aa'),
          'a0000000-0000-0000-0000-000000000001', '1/6: raised_by is derived from the caller, not client-supplied');
select is((select from_name from approvals where id='d0000000-0000-0000-0000-0000000000aa'),
          'Fam One', '1/6: from_name is derived from the caller profile, not client-supplied');

-- ==================== 4 — doctor-only plan activation ======================
reset role; set local "request.jwt.claims" to '{}';
update patients set status='pending' where id='c0000000-0000-0000-0000-000000000001';
select _as('a0000000-0000-0000-0000-000000000003');       -- nurse
select throws_ok(
  $$update patients set status='active' where id='c0000000-0000-0000-0000-000000000001'$$,
  'Only a doctor can activate a patient plan', '4: nurse CANNOT activate a plan');

reset role; select _as('a0000000-0000-0000-0000-000000000004');   -- duty
select throws_ok(
  $$update patients set status='active' where id='c0000000-0000-0000-0000-000000000001'$$,
  'Only a doctor can activate a patient plan', '4: duty doctor CANNOT activate a plan');

reset role; select _as('a0000000-0000-0000-0000-000000000005');   -- pmr
select lives_ok(
  $$update patients set status='active' where id='c0000000-0000-0000-0000-000000000001'$$,
  '4: doctor (pmr) CAN activate a plan');

reset role; set local "request.jwt.claims" to '{}';
update patients set status='pending' where id='c0000000-0000-0000-0000-000000000001';
select _as('svc','service_role');                                  -- service_role
select lives_ok(
  $$update patients set status='active' where id='c0000000-0000-0000-0000-000000000001'$$,
  '7: service_role (registry) is exempt and CAN activate');

-- ==================== 5/6 — query reply integrity ==========================
reset role; select _as('a0000000-0000-0000-0000-000000000003');   -- nurse
select throws_ok(
  $$insert into query_messages (query_id, patient_id, body) values ('d0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000002','x')$$,
  'The reply''s query does not belong to that patient', '5: reply cannot cross-associate to another patient');

reset role; select _as('a0000000-0000-0000-0000-000000000003');   -- nurse
select throws_ok(
  $$insert into query_messages (query_id, patient_id, body) values ('d0000000-0000-0000-0000-000000000002','c0000000-0000-0000-0000-000000000001','x')$$,
  'Replies are only allowed on family queries', '5: reply only allowed on a patient_query');

reset role; select _as('a0000000-0000-0000-0000-000000000003');   -- nurse
insert into query_messages (id, query_id, patient_id, author_id, author_role, author_name, body)
  values ('f0000000-0000-0000-0000-0000000000a1','d0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001',
          'a0000000-0000-0000-0000-000000000001','pmr','FAKE','real reply');
select lives_ok($$select 1$$, '5: valid nurse reply to a family query is accepted');
select is((select author_role::text from query_messages where id='f0000000-0000-0000-0000-0000000000a1'),
          'nurse', '6: reply author_role derived server-side (client said pmr)');
select is((select author_id::text from query_messages where id='f0000000-0000-0000-0000-0000000000a1'),
          'a0000000-0000-0000-0000-000000000003', '6: reply author_id derived server-side (client forged another id)');

-- ==================== B4/6 — task log integrity ============================
reset role; select _as('a0000000-0000-0000-0000-000000000002');   -- caregiver
select throws_ok(
  $$insert into task_logs (task_id, patient_id, log_date, done) values ('e0000000-0000-0000-0000-000000000002','c0000000-0000-0000-0000-000000000001', current_date, true)$$,
  'The task does not belong to that patient', 'B4: task log cannot reference another patient''s task');

reset role; select _as('a0000000-0000-0000-0000-000000000002');   -- caregiver
select lives_ok(
  $$insert into task_logs (task_id, patient_id, log_date, done) values ('e0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001', current_date, true)$$,
  'B4: caregiver CAN log their own patient''s task');

-- ==================== 3 — subscription snapshot ============================
reset role; select _as('a0000000-0000-0000-0000-000000000001');   -- family
insert into subscriptions (patient_id, status, plan_name, price, trial_days)
  values ('c0000000-0000-0000-0000-000000000001','active','FREE',0,0);
select is((select price from subscriptions where patient_id='c0000000-0000-0000-0000-000000000001'),
          5999, '3: subscription price snapshotted from the centre package, not client');
select is((select status from subscriptions where patient_id='c0000000-0000-0000-0000-000000000001'),
          'trial', '3: subscription status derived from trial config, not client');

-- ==================== B1/8 — privileged RPCs locked down ===================
reset role; select _as('a0000000-0000-0000-0000-000000000001');   -- family
select throws_like(
  $$select add_caregiver_tx('c0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000002')$$,
  '%permission denied%', 'B1/8: authenticated CANNOT execute add_caregiver_tx');
reset role; select _as('a0000000-0000-0000-0000-000000000003');   -- nurse
select throws_like(
  $$select register_patient_tx('11111111-1111-1111-1111-111111111111','a0000000-0000-0000-0000-000000000002','{}'::jsonb,'{}'::jsonb)$$,
  '%permission denied%', 'B1/8: authenticated CANNOT execute register_patient_tx');

-- ==================== tenant isolation =====================================
reset role; select _as('a0000000-0000-0000-0000-000000000006');   -- nurse in Centre Two
select is((select count(*)::int from patients where id='c0000000-0000-0000-0000-000000000001'),
          0, 'tenant: nurse in another centre CANNOT read Patient A');
reset role; select _as('a0000000-0000-0000-0000-000000000003');   -- nurse in Centre One
select is((select count(*)::int from patients where id='c0000000-0000-0000-0000-000000000001'),
          1, 'tenant: nurse in the same centre CAN read Patient A');

-- ==================== 2 — consent grantor provenance =======================
reset role; select _as('a0000000-0000-0000-0000-000000000001');   -- family
insert into consents (id, patient_id, granted_by, subject_name, relation_to_patient)
  values ('b0000000-0000-0000-0000-0000000000c1','c0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000003','Signer','self');
select is((select granted_by::text from consents where id='b0000000-0000-0000-0000-0000000000c1'),
          'a0000000-0000-0000-0000-000000000001', '2: consent grantor derived from caller, not client-supplied');

reset role; select _as('svc','service_role');                      -- registry path
insert into consents (id, patient_id, granted_by, subject_name, relation_to_patient)
  values ('b0000000-0000-0000-0000-0000000000c2','c0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000005','Signer','self');
select is((select granted_by::text from consents where id='b0000000-0000-0000-0000-0000000000c2'),
          'a0000000-0000-0000-0000-000000000005', '7: service_role (registry) keeps the grantor it sets');

select * from finish();
rollback;
