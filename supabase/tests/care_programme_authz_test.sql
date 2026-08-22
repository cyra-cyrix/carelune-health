-- ============================================================================
-- Carelune — clinical domain, knowledge and care-programme runtime tests
-- (pgTAP). Covers migrations 0032 and 0033.
-- Run: supabase test db
--
-- What this proves:
--   * knowledge is professional-only: no household account can read a clinical
--     domain, a knowledge pack or a source, at any status;
--   * a service cannot be configured against another domain's knowledge pack;
--   * the activity snapshot is frozen at enrolment and immutable afterwards,
--     exactly like the package snapshot beside it;
--   * a compiled programme is inert: a household cannot even READ a draft, no
--     occurrence materialises from it, and no event can be recorded against it;
--   * only the treating doctor approves, and only their own patient;
--   * an activity key that is not in the patient's own approved programme is
--     refused — a forged activity has nowhere to come from;
--   * materialisation is idempotent, honours the day window, produces nothing
--     for an on-demand activity, and places each occurrence in the right
--     patient-local display group;
--   * an unscheduled event resolves no expectation and can never be missed;
--   * a legacy recovery subscription is unaffected throughout.
-- ============================================================================
begin;
select plan(45);

create or replace function _as(uid text, urole text default 'authenticated') returns void
language plpgsql as $$ begin
  execute format('set local role %I', case when urole='service_role' then 'service_role' else 'authenticated' end);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', urole)::text, true);
end $$;

set local "request.jwt.claims" to '{"role":"service_role"}';

-- ---------------------------------------------------------------- fixtures --
insert into centres (id, name, package_name, package_price, trial_days) values
  ('d1111111-1111-1111-1111-111111111111','Domain Centre A','Legacy Recovery Continuum', 5999, 7),
  ('d2222222-2222-2222-2222-222222222222','Domain Centre B', null, null, 0);

insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000','e1000000-0000-0000-0000-000000000001','authenticated','authenticated','pmra@t.in'),
  ('00000000-0000-0000-0000-000000000000','e1000000-0000-0000-0000-000000000002','authenticated','authenticated','nursea@t.in'),
  ('00000000-0000-0000-0000-000000000000','e1000000-0000-0000-0000-000000000003','authenticated','authenticated','familya@t.in'),
  ('00000000-0000-0000-0000-000000000000','e1000000-0000-0000-0000-000000000004','authenticated','authenticated','pmrb@t.in');

update profiles set role='pmr',    centre_id='d1111111-1111-1111-1111-111111111111', full_name='Doctor A' where id='e1000000-0000-0000-0000-000000000001';
update profiles set role='nurse',  centre_id='d1111111-1111-1111-1111-111111111111', full_name='Nurse A'  where id='e1000000-0000-0000-0000-000000000002';
update profiles set role='family', centre_id='d1111111-1111-1111-1111-111111111111', full_name='Family A' where id='e1000000-0000-0000-0000-000000000003';
update profiles set role='pmr',    centre_id='d2222222-2222-2222-2222-222222222222', full_name='Doctor B' where id='e1000000-0000-0000-0000-000000000004';

insert into patients (id, centre_id, full_name, status, time_zone) values
  ('da000000-0000-0000-0000-0000000000a1','d1111111-1111-1111-1111-111111111111','Programme Patient','active','Asia/Kolkata'),
  ('da000000-0000-0000-0000-0000000000a2','d1111111-1111-1111-1111-111111111111','Legacy Patient','active','Asia/Kolkata');
insert into patient_members (patient_id, user_id, relation)
  values ('da000000-0000-0000-0000-0000000000a1','e1000000-0000-0000-0000-000000000003','family');

-- Two domains, each with its own published knowledge pack.
insert into knowledge_packs (id, clinical_domain_id, version, title, status, knowledge)
select 'cb111111-1111-1111-1111-111111111111', id, 1, 'Neuro Reference v1', 'published',
       '{"candidate_activities":[],"education":[],"protocol_guidance":[]}'::jsonb
  from clinical_domains where key = 'neuro_rehab_stroke';
insert into knowledge_packs (id, clinical_domain_id, version, title, status, knowledge)
select 'cb222222-2222-2222-2222-222222222222', id, 1, 'Mother & Baby Reference v1', 'published',
       '{"candidate_activities":[],"education":[],"protocol_guidance":[]}'::jsonb
  from clinical_domains where key = 'mother_baby';

insert into knowledge_sources (knowledge_pack_id, title, kind, url)
values ('cb111111-1111-1111-1111-111111111111','Example stroke rehabilitation guidance','guideline','https://example.org/guidance');

-- A published neuro service with two default activities + an active package.
insert into centre_services (id, centre_id, name, origin, provider_approver_profile_id, status,
                             programme_config, clinical_domain_id, care_intent, programme_activities)
select 'd8111111-1111-1111-1111-111111111111','d1111111-1111-1111-1111-111111111111',
       'Neuro Continuum','custom','e1000000-0000-0000-0000-000000000001','pending_provider_confirmation',
       '{"monitoring_domains":["Mobility"],"programme_outline":[{"period_label":"Week 1"}]}'::jsonb,
       id, 'rehabilitation',
       '[{"key":"morning_meds","activity_type":"dose","title":"Morning medicines",
          "schedule":{"kind":"clock","times":["09:00"],"days":"all","from_day":1,"grace_minutes":120}},
         {"key":"pain","activity_type":"symptom","title":"Pain","schedule":null}]'::jsonb
  from clinical_domains where key = 'neuro_rehab_stroke';

insert into service_packages (id, centre_service_id, centre_id, name, duration_days, price, currency, status)
values ('d9111111-1111-1111-1111-111111111111','d8111111-1111-1111-1111-111111111111',
        'd1111111-1111-1111-1111-111111111111','Neuro Standard', 60, 18000, 'INR', 'draft');
update centre_services set status='published', published_at=now() where id='d8111111-1111-1111-1111-111111111111';
update service_packages  set status='active' where id='d9111111-1111-1111-1111-111111111111';

-- ==========================================================================
-- 1. A service may not be configured against another domain's knowledge pack.
-- ==========================================================================
select throws_ok(
  $$update centre_services set knowledge_pack_id = 'cb222222-2222-2222-2222-222222222222'
     where id = 'd8111111-1111-1111-1111-111111111111'$$,
  'That knowledge pack belongs to a different clinical domain',
  'a knowledge pack from another clinical domain is refused');

select lives_ok(
  $$update centre_services set knowledge_pack_id = 'cb111111-1111-1111-1111-111111111111'
     where id = 'd8111111-1111-1111-1111-111111111111'$$,
  'the domain''s own knowledge pack is accepted');

select throws_ok(
  $$insert into centre_services (centre_id, name, origin, knowledge_pack_id)
    values ('d1111111-1111-1111-1111-111111111111','No Domain','custom','cb111111-1111-1111-1111-111111111111')$$,
  'A knowledge pack cannot be selected without a clinical domain',
  'a knowledge pack without a domain is refused');

select throws_ok(
  $$insert into centre_services (centre_id, name, origin, care_intent)
    values ('d1111111-1111-1111-1111-111111111111','Bad Intent','custom','faith_healing')$$,
  '23514', NULL,
  'an unknown care intent is refused by the check constraint');

-- ==========================================================================
-- 2. Enrolment freezes the activity snapshot.
-- ==========================================================================
select _as('e1000000-0000-0000-0000-000000000001');
select lives_ok(
  $$select assign_service_package('da000000-0000-0000-0000-0000000000a1','d9111111-1111-1111-1111-111111111111')$$,
  'the treating doctor enrols the patient into the published package');

select is(
  (select jsonb_array_length(activity_snapshot) from subscriptions where patient_id='da000000-0000-0000-0000-0000000000a1'),
  2, 'both service activities are frozen onto the enrolment');

select is(
  (select package_snapshot->>'care_intent' from subscriptions where patient_id='da000000-0000-0000-0000-0000000000a1'),
  'rehabilitation', 'the care intent is carried into the package snapshot');

select isnt(
  (select package_snapshot->>'clinical_domain_id' from subscriptions where patient_id='da000000-0000-0000-0000-0000000000a1'),
  null, 'the clinical domain is carried into the package snapshot');

-- Revising the service afterwards does not move the enrolled patient.
reset role;
set local "request.jwt.claims" to '{"role":"service_role"}';
update centre_services set programme_activities = '[]'::jsonb
 where id = 'd8111111-1111-1111-1111-111111111111';
select is(
  (select jsonb_array_length(activity_snapshot) from subscriptions where patient_id='da000000-0000-0000-0000-0000000000a1'),
  2, 'emptying the service''s activities does not move an already-enrolled patient');

select _as('e1000000-0000-0000-0000-000000000001');
select throws_ok(
  $$update subscriptions set activity_snapshot = '[]'::jsonb
     where patient_id = 'da000000-0000-0000-0000-0000000000a1'$$,
  'An enrolled programme is frozen — the patient continues on the configuration they enrolled into',
  'the activity snapshot is immutable after enrolment');

-- ==========================================================================
-- 3. Knowledge is professional-only.
-- ==========================================================================
select _as('e1000000-0000-0000-0000-000000000001');
select isnt((select count(*) from clinical_domains), 0::bigint, 'a clinician can read the clinical domains');
select isnt((select count(*) from knowledge_packs), 0::bigint, 'a clinician can read knowledge packs');
select isnt((select count(*) from knowledge_sources), 0::bigint, 'a clinician can read knowledge sources');

select _as('e1000000-0000-0000-0000-000000000003');   -- family
select is((select count(*) from clinical_domains), 0::bigint, 'a family account reads no clinical domain');
select is((select count(*) from knowledge_packs), 0::bigint, 'a family account reads no knowledge pack');
select is((select count(*) from knowledge_sources), 0::bigint, 'a family account reads no knowledge source');

-- ==========================================================================
-- 4. A draft programme is inert.
-- ==========================================================================
reset role;
set local "request.jwt.claims" to '{"role":"service_role"}';
insert into patient_programmes (id, patient_id, subscription_id, centre_id, version, activities, quick_records, status, compiled_from)
select 'df111111-1111-1111-1111-111111111111','da000000-0000-0000-0000-0000000000a1', s.id,
       'd1111111-1111-1111-1111-111111111111', 1,
       '[{"key":"morning_meds","activity_type":"dose","title":"Morning medicines",
          "schedule":{"kind":"clock","times":["09:00"],"days":"all","from_day":1,"grace_minutes":120}},
         {"key":"physio","activity_type":"exercise","title":"Physiotherapy",
          "schedule":{"kind":"clock","times":["18:00"],"days":[1,3,5],"from_day":1,"grace_minutes":180}},
         {"key":"pain","activity_type":"symptom","title":"Pain","schedule":null}]'::jsonb,
       '["pain"]'::jsonb, 'draft',
       '{"knowledge_pack_id":"cb111111-1111-1111-1111-111111111111"}'::jsonb
  from subscriptions s where s.patient_id = 'da000000-0000-0000-0000-0000000000a1';

select _as('e1000000-0000-0000-0000-000000000003');   -- family
select is((select count(*) from patient_programmes), 0::bigint,
  'a family account cannot read a DRAFT programme for their own patient');

select throws_ok(
  $$select record_care_event(
      (select id from subscriptions where patient_id='da000000-0000-0000-0000-0000000000a1'),
      'morning_meds')$$,
  'This patient has no approved care programme',
  'nothing can be recorded against a draft programme');

select _as('e1000000-0000-0000-0000-000000000001');   -- treating doctor
select is((select materialise_care_occurrences('da000000-0000-0000-0000-0000000000a1', current_date, current_date)),
  0, 'no scheduled care materialises from a draft programme');

-- ==========================================================================
-- 5. Only the treating doctor approves, and only their own patient.
-- ==========================================================================
select _as('e1000000-0000-0000-0000-000000000002');   -- nurse, same centre
select throws_ok(
  $$select approve_patient_programme('df111111-1111-1111-1111-111111111111')$$,
  'Only the treating doctor can approve a care programme',
  'a nurse cannot approve a care programme');

select _as('e1000000-0000-0000-0000-000000000004');   -- doctor, WRONG centre
select throws_ok(
  $$select approve_patient_programme('df111111-1111-1111-1111-111111111111')$$,
  'That patient is not yours',
  'a doctor from another organisation cannot approve this programme');

select _as('e1000000-0000-0000-0000-000000000001');
select lives_ok(
  $$select approve_patient_programme('df111111-1111-1111-1111-111111111111','Reviewed against the discharge summary.')$$,
  'the treating doctor approves the programme');
select is(
  (select status from patient_programmes where id='df111111-1111-1111-1111-111111111111'),
  'approved', 'the programme is approved');

select _as('e1000000-0000-0000-0000-000000000003');   -- family
select is((select count(*) from patient_programmes), 1::bigint,
  'a family account CAN read the approved programme for their own patient');

-- ==========================================================================
-- 6. Materialisation.
-- ==========================================================================
select _as('e1000000-0000-0000-0000-000000000001');
select isnt(
  (select materialise_care_occurrences('da000000-0000-0000-0000-0000000000a1', current_date, current_date + 6)),
  0, 'scheduled care materialises for an approved programme');

select is(
  (select count(*) from care_occurrences
    where patient_id='da000000-0000-0000-0000-0000000000a1' and activity_key='morning_meds'
      and local_date between current_date and current_date + 6),
  7::bigint, 'a daily activity produces exactly one occurrence per day');

select is(
  (select count(*) from care_occurrences
    where patient_id='da000000-0000-0000-0000-0000000000a1' and activity_key='physio'
      and local_date between current_date and current_date + 6),
  3::bigint, 'a Mon/Wed/Fri activity produces exactly three occurrences in a week');

select is(
  (select count(*) from care_occurrences
    where patient_id='da000000-0000-0000-0000-0000000000a1' and activity_key='pain'),
  0::bigint, 'an on-demand activity produces no scheduled occurrence and can never be missed');

select is(
  (select distinct display_group from care_occurrences
    where patient_id='da000000-0000-0000-0000-0000000000a1' and activity_key='morning_meds'),
  'morning', 'a 09:00 activity is placed in the morning display group');

select is(
  (select distinct display_group from care_occurrences
    where patient_id='da000000-0000-0000-0000-0000000000a1' and activity_key='physio'),
  'evening', 'an 18:00 activity is placed in the evening display group');

select is(
  (select materialise_care_occurrences('da000000-0000-0000-0000-0000000000a1', current_date, current_date + 6)),
  0, 're-materialising the same window creates nothing new');

select throws_ok(
  $$select materialise_care_occurrences('da000000-0000-0000-0000-0000000000a1', current_date, current_date + 40)$$,
  'Materialise a window of at most 14 days',
  'an unbounded materialisation window is refused');

-- ==========================================================================
-- 7. Recording. A forged activity key has nowhere to come from.
-- ==========================================================================
select _as('e1000000-0000-0000-0000-000000000003');   -- family records at home
select throws_ok(
  $$select record_care_event(
      (select id from subscriptions where patient_id='da000000-0000-0000-0000-0000000000a1'),
      'morphine_10mg', '{}'::jsonb, null, 'done')$$,
  'That is not an activity in this patient''s programme',
  'an activity key outside the patient''s own programme is refused');

select lives_ok(
  $$select record_care_event(
      (select id from subscriptions where patient_id='da000000-0000-0000-0000-0000000000a1'),
      'morning_meds', '{"status":"given"}'::jsonb, null, 'done', null,
      (select id from care_occurrences
        where patient_id='da000000-0000-0000-0000-0000000000a1'
          and activity_key='morning_meds' and local_date=current_date), 'scheduled')$$,
  'a scheduled dose is recorded against its occurrence');

select is(
  (select status from care_occurrences
    where patient_id='da000000-0000-0000-0000-0000000000a1'
      and activity_key='morning_meds' and local_date=current_date),
  'done', 'recording the event closes the expectation it answers');

select lives_ok(
  $$select record_care_event(
      (select id from subscriptions where patient_id='da000000-0000-0000-0000-0000000000a1'),
      'pain', '{"scale":4}'::jsonb, 'Worse after sitting up', 'recorded', null, null, 'quick')$$,
  'an unscheduled event is recorded from the centre +');

select is(
  (select count(*) from care_events
    where patient_id='da000000-0000-0000-0000-0000000000a1' and occurrence_id is null),
  1::bigint, 'the unscheduled event resolves no expectation');

select throws_ok(
  $$select record_care_event(
      (select id from subscriptions where patient_id='da000000-0000-0000-0000-0000000000a1'),
      'pain', '{}'::jsonb, null, 'recorded', now() + interval '2 days')$$,
  'An event cannot be recorded in the future',
  'an event cannot be dated into the future');

-- ==========================================================================
-- 7b. Capture mode is enforced, not merely observed by the UI.
-- ==========================================================================
select is(
  effective_capture_mode('{"activity_type":"dose","schedule":{"kind":"clock","times":["08:00"]}}'::jsonb),
  'scheduled', 'a medicine round with a clock defaults to its scheduled times only');
select is(
  effective_capture_mode('{"activity_type":"measurement","schedule":{"kind":"clock","times":["08:00"]}}'::jsonb),
  'both', 'a scheduled measurement may also be recorded off-schedule');
select is(
  effective_capture_mode('{"activity_type":"symptom","schedule":null}'::jsonb),
  'unscheduled', 'something with no clock is recorded whenever it happens');
select is(
  effective_capture_mode('{"activity_type":"task","capture_mode":"scheduled","schedule":null}'::jsonb),
  'unscheduled', 'a scheduled-only activity with no clock would be unrecordable, so it is read as ad hoc');
select is(
  effective_capture_mode('{"activity_type":"dose","capture_mode":"both","schedule":{"kind":"clock","times":["08:00"]}}'::jsonb),
  'both', 'a declared mode wins over the default');

-- The client never offers a medicine round in the centre "+", but the RPC is
-- reachable without it. Refusing here is what stops a dose being recorded twice.
select throws_ok(
  $$select record_care_event(
      (select id from subscriptions where patient_id='da000000-0000-0000-0000-0000000000a1'),
      'morning_meds', '{}'::jsonb, null, 'done', null, null, 'quick')$$,
  'Morning medicines is recorded against its scheduled time, not on its own',
  'a scheduled-only activity cannot be recorded without an expectation');

-- ==========================================================================
-- 8. The legacy recovery patient is untouched throughout.
-- ==========================================================================
reset role;
set local "request.jwt.claims" to '{"role":"service_role"}';
insert into subscriptions (patient_id) values ('da000000-0000-0000-0000-0000000000a2');
select _as('e1000000-0000-0000-0000-000000000001');
select is(
  (select count(*) from subscriptions
    where patient_id='da000000-0000-0000-0000-0000000000a2'
      and service_package_id is null and activity_snapshot is null),
  1::bigint, 'a legacy recovery subscription still has no package and no activity snapshot');

select * from finish();
rollback;
