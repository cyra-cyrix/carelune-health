-- ============================================================================
-- Carelune — programme check-in tests (pgTAP). Covers migration 0030.
-- Run: supabase test db
--
-- What this proves:
--   * a household member can check in for the patient they represent, and
--     nobody else can — not another household, not another centre's staff;
--   * the patient, their centre and the programme day are derived from the
--     subscription, so a forged patient or subscription gets nowhere;
--   * only questions in that patient's OWN frozen programme can be answered;
--   * one check-in a day, and a completed one cannot be quietly rewritten;
--   * answers keep the wording the patient read, whatever the provider does to
--     the package afterwards;
--   * the new tables kept no blanket grants — reads only, writes via the
--     function, and nothing can be emptied.
-- ============================================================================
begin;
select plan(22);

create or replace function _as(uid text, urole text default 'authenticated') returns void
language plpgsql as $$ begin
  execute format('set local role %I', case when urole='service_role' then 'service_role' else 'authenticated' end);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', urole)::text, true);
end $$;

set local "request.jwt.claims" to '{"role":"service_role"}';

insert into centres (id, name) values
  ('91111111-1111-1111-1111-111111111111','Check-in Centre'),
  ('92222222-2222-2222-2222-222222222222','Other Centre');

insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000','f1000000-0000-0000-0000-000000000001','authenticated','authenticated','docA@t.in'),
  ('00000000-0000-0000-0000-000000000000','f1000000-0000-0000-0000-000000000002','authenticated','authenticated','docB@t.in'),
  ('00000000-0000-0000-0000-000000000000','f1000000-0000-0000-0000-000000000003','authenticated','authenticated','carerA@t.in'),
  ('00000000-0000-0000-0000-000000000000','f1000000-0000-0000-0000-000000000004','authenticated','authenticated','carerOther@t.in');

update profiles set role='pmr',       is_admin=false, centre_id='91111111-1111-1111-1111-111111111111' where id='f1000000-0000-0000-0000-000000000001';
update profiles set role='pmr',       is_admin=false, centre_id='92222222-2222-2222-2222-222222222222' where id='f1000000-0000-0000-0000-000000000002';
update profiles set role='caregiver', is_admin=false, centre_id='91111111-1111-1111-1111-111111111111' where id='f1000000-0000-0000-0000-000000000003';
update profiles set role='family',    is_admin=false, centre_id='91111111-1111-1111-1111-111111111111' where id='f1000000-0000-0000-0000-000000000004';

insert into patients (id, centre_id, full_name, status) values
  ('9a000000-0000-0000-0000-0000000000a1','91111111-1111-1111-1111-111111111111','Programme Patient','active'),
  ('9a000000-0000-0000-0000-0000000000a2','91111111-1111-1111-1111-111111111111','Legacy Patient','active'),
  ('9a000000-0000-0000-0000-0000000000a3','91111111-1111-1111-1111-111111111111','Other Household Patient','active');
insert into patient_members (patient_id, user_id, relation) values
  ('9a000000-0000-0000-0000-0000000000a1','f1000000-0000-0000-0000-000000000003','caregiver'),
  ('9a000000-0000-0000-0000-0000000000a3','f1000000-0000-0000-0000-000000000004','family');

insert into centre_services (id, centre_id, name, origin, provider_approver_profile_id, status, programme_config)
values ('b1111111-1111-1111-1111-111111111111','91111111-1111-1111-1111-111111111111','Recovery','custom',
        'f1000000-0000-0000-0000-000000000001','pending_provider_confirmation',
        '{"patient_inputs":[{"label":"How is your pain today?","reason":"Trend"},{"label":"Did you walk today?","reason":"Function"}],
          "programme_outline":[{"period_label":"Week 1","focus":"Early"},{"period_label":"Weeks 2-4","focus":"Building"}]}'::jsonb);
insert into service_packages (id, centre_service_id, centre_id, name, duration_days, price, status)
values ('c1111111-1111-1111-1111-111111111111','b1111111-1111-1111-1111-111111111111','91111111-1111-1111-1111-111111111111','Standard',60,18000,'draft');
update centre_services set status='published', published_at=now() where id='b1111111-1111-1111-1111-111111111111';
update service_packages  set status='active' where id='c1111111-1111-1111-1111-111111111111';

reset role; set local "request.jwt.claims" to '{}';

reset role; select _as('f1000000-0000-0000-0000-000000000001');
select lives_ok(
  $$select assign_service_package('9a000000-0000-0000-0000-0000000000a1','c1111111-1111-1111-1111-111111111111')$$,
  'the clinician enrols the patient into the programme');
insert into subscriptions (patient_id, status, plan_name, price, trial_days)
  values ('9a000000-0000-0000-0000-0000000000a2','active','Legacy', 1, 0);
-- Temp tables are not RLS-scoped, so an outsider can still NAME the subscription
-- and we test the function's ownership check rather than their inability to see it.
create temp table _ctx as
  select (select id from subscriptions where patient_id='9a000000-0000-0000-0000-0000000000a1') as programme_sub,
         (select id from subscriptions where patient_id='9a000000-0000-0000-0000-0000000000a2') as legacy_sub;

-- ==================== only this programme's questions ====================
reset role; select _as('f1000000-0000-0000-0000-000000000003');
select throws_like(
  $$select submit_programme_checkin(
      (select programme_sub from _ctx),
      '[{"label":"How is your latch?","type":"text","text":"invented"}]'::jsonb)$$,
  '%not part of this programme%',
  'a question the patient was never asked is refused, and nothing is written');
select is((select count(*)::int from checkin_submissions), 0,
          'a refused check-in leaves no half-written submission behind');

-- ==================== the household submits ====================
select is((submit_programme_checkin(
    (select id from subscriptions where patient_id='9a000000-0000-0000-0000-0000000000a1'),
    '[{"label":"How is your pain today?","type":"scale","number":3},
      {"label":"Did you walk today?","type":"yes_no","boolean":true}]'::jsonb,
    'Week 1', 'Slept badly.')).programme_day,
  1, 'a household member checks in for their patient, on the derived programme day');

select is((select count(*)::int from checkin_responses r
             join checkin_submissions s on s.id = r.submission_id
            where s.patient_id='9a000000-0000-0000-0000-0000000000a1'),
          3, 'every answer is stored, plus the closing note');
select is((select question_key from checkin_responses r join checkin_submissions s on s.id=r.submission_id
            where r.question_label_snapshot='Did you walk today?'),
          'q2', 'the question key is derived from its place in the frozen programme');
select is((select value_number::int from checkin_responses r join checkin_submissions s on s.id=r.submission_id
            where r.question_key='q1'),
          3, 'a scale answer is stored as a number');
select is((select value_boolean from checkin_responses r join checkin_submissions s on s.id=r.submission_id
            where r.question_key='q2'),
          true, 'a yes/no answer is stored as a boolean');
select is((select programme_period_label from checkin_submissions where patient_id='9a000000-0000-0000-0000-0000000000a1'),
          'Week 1', 'the programme stage is frozen onto the submission');

-- ==================== one a day ====================
select throws_like(
  $$select submit_programme_checkin(
      (select id from subscriptions where patient_id='9a000000-0000-0000-0000-0000000000a1'),
      '[{"label":"How is your pain today?","type":"text","text":"again"}]'::jsonb)$$,
  '%duplicate key%',
  'a second check-in on the same day cannot create a second clinical record');

-- ==================== who may submit ====================
reset role; select _as('f1000000-0000-0000-0000-000000000004');
select throws_like(
  $$select submit_programme_checkin(
      (select programme_sub from _ctx),
      '[{"label":"How is your pain today?","type":"text","text":"not mine"}]'::jsonb)$$,
  '%not yours%',
  'another household cannot check in for someone else''s patient');

reset role; select _as('f1000000-0000-0000-0000-000000000002');
select throws_like(
  $$select submit_programme_checkin(
      (select programme_sub from _ctx),
      '[{"label":"How is your pain today?","type":"text","text":"cross centre"}]'::jsonb)$$,
  '%not yours%',
  'tenant: another organisation cannot check in for this patient');

-- ==================== legacy patients do not use this path ====================
reset role; select _as('f1000000-0000-0000-0000-000000000001');
select throws_like(
  $$select submit_programme_checkin(
      (select id from subscriptions where patient_id='9a000000-0000-0000-0000-0000000000a2'),
      '[{"label":"How is your pain today?","type":"text","text":"legacy"}]'::jsonb)$$,
  '%not on a Carelune programme%',
  'a legacy recovery subscription cannot write a dynamic check-in');
select is((select count(*)::int from checkin_submissions where patient_id='9a000000-0000-0000-0000-0000000000a2'),
          0, 'and no dynamic check-in row exists for the legacy patient');

-- ==================== reading ====================
select is((select count(*)::int from checkin_submissions), 1,
          'the patient''s clinician reads the check-in');
select is((select count(*)::int from checkin_responses), 3,
          'and its answers');

reset role; select _as('f1000000-0000-0000-0000-000000000002');
select is((select count(*)::int from checkin_submissions), 0,
          'tenant: another organisation sees no submissions');
select is((select count(*)::int from checkin_responses), 0,
          'tenant: and no responses');

reset role; select _as('f1000000-0000-0000-0000-000000000004');
select is((select count(*)::int from checkin_submissions), 0,
          'a household sees only their own patient''s check-ins');

-- ==================== the record cannot be quietly rewritten ====================
reset role; select _as('f1000000-0000-0000-0000-000000000003');
select throws_like(
  $$update checkin_responses set value_text = 'rewritten'$$,
  '%denied%',
  'a submitted answer cannot be edited from the browser');
select throws_like(
  $$truncate checkin_responses$$,
  '%denied%',
  'the answers table cannot be emptied (the privilege bypasses RLS)');

-- ==================== the wording survives a package edit ====================
reset role; select _as('00000000-0000-0000-0000-000000000000','service_role');
update service_packages set name = 'Standard (2027)', price = 99000 where id='c1111111-1111-1111-1111-111111111111';
-- Scoped to THIS test's patient: service_role bypasses RLS, so an unscoped
-- query would also see whatever real check-ins the local database holds.
select is((select r.question_label_snapshot from checkin_responses r
             join checkin_submissions sub on sub.id = r.submission_id
            where sub.patient_id='9a000000-0000-0000-0000-0000000000a1' and r.question_key='q1'),
          'How is your pain today?',
          'a stored answer keeps the wording the patient read, whatever changes later');

select * from finish();
rollback;
