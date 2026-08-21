-- ============================================================================
-- Carelune — service package enrolment tests (pgTAP). Covers migration 0028.
-- Run: supabase test db
--
-- What this proves:
--   * only a same-centre clinician may enrol a patient, and only into a
--     published service and an active package belonging to their own centre;
--   * nothing a client sends about price, fee or programme survives — every
--     stored value is read out of the package by the database;
--   * the enrolment snapshot is frozen: editing the package afterwards does not
--     move a patient who is already on it;
--   * a legacy recovery subscription is still a valid row with every new column
--     NULL, and behaves exactly as it did before;
--   * a household account can read its own enrolment and nothing else, and
--     still cannot browse the configuration tables.
-- ============================================================================
begin;
select plan(28);

create or replace function _as(uid text, urole text default 'authenticated') returns void
language plpgsql as $$ begin
  execute format('set local role %I', case when urole='service_role' then 'service_role' else 'authenticated' end);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', urole)::text, true);
end $$;

set local "request.jwt.claims" to '{"role":"service_role"}';

insert into centres (id, name, package_name, package_price, trial_days) values
  ('71111111-1111-1111-1111-111111111111','Centre A','Legacy Recovery Continuum', 5999, 7),
  ('72222222-2222-2222-2222-222222222222','Centre B', null, null, 0);

insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000','c1000000-0000-0000-0000-000000000001','authenticated','authenticated','doca@t.in'),
  ('00000000-0000-0000-0000-000000000000','c1000000-0000-0000-0000-000000000002','authenticated','authenticated','docb@t.in'),
  ('00000000-0000-0000-0000-000000000000','c1000000-0000-0000-0000-000000000003','authenticated','authenticated','carera@t.in');

update profiles set role='pmr', is_admin=true, centre_id='71111111-1111-1111-1111-111111111111', full_name='Doc A' where id='c1000000-0000-0000-0000-000000000001';
update profiles set role='pmr', is_admin=true, centre_id='72222222-2222-2222-2222-222222222222', full_name='Doc B' where id='c1000000-0000-0000-0000-000000000002';
update profiles set role='caregiver', centre_id='71111111-1111-1111-1111-111111111111', full_name='Carer A' where id='c1000000-0000-0000-0000-000000000003';

insert into patients (id, centre_id, full_name, status) values
  ('7a000000-0000-0000-0000-0000000000a1','71111111-1111-1111-1111-111111111111','Patient One','active'),
  ('7a000000-0000-0000-0000-0000000000a2','71111111-1111-1111-1111-111111111111','Patient Two','active'),
  ('7b000000-0000-0000-0000-0000000000b1','72222222-2222-2222-2222-222222222222','Other Centre Patient','active');
insert into patient_members (patient_id, user_id, relation)
  values ('7a000000-0000-0000-0000-0000000000a1','c1000000-0000-0000-0000-000000000003','caregiver');

-- Centre A: a service taken through the real lifecycle to published.
insert into centre_services (id, centre_id, name, origin, provider_approver_profile_id, status, programme_config)
values ('81111111-1111-1111-1111-111111111111','71111111-1111-1111-1111-111111111111','Spine Recovery','custom',
        'c1000000-0000-0000-0000-000000000001','pending_provider_confirmation',
        '{"monitoring_domains":["Pain","Walking"],"programme_outline":[{"period_label":"Week 1"}]}'::jsonb);
insert into service_packages (id, centre_service_id, centre_id, name, duration_days, price, currency,
                              monitoring_domains, checkin_frequency, review_frequency, support_level, includes, milestones, status)
values ('91111111-1111-1111-1111-111111111111','81111111-1111-1111-1111-111111111111','71111111-1111-1111-1111-111111111111',
        'Standard Recovery', 60, 18000, 'INR', array['Pain','Walking'], 'Three times a week', 'Weekly review',
        'Moderate support', array['Check-ins'], '["Walking without support"]'::jsonb, 'draft'),
       ('92222222-2222-2222-2222-222222222222','81111111-1111-1111-1111-111111111111','71111111-1111-1111-1111-111111111111',
        'Withdrawn Recovery', 30, 9000, 'INR', array['Pain'], 'Weekly', 'Fortnightly review', 'Basic', array['Check-ins'], '[]'::jsonb, 'draft');
update centre_services set status='published', published_at=now() where id='81111111-1111-1111-1111-111111111111';
update service_packages set status='active'  where id='91111111-1111-1111-1111-111111111111';
update service_packages set status='retired' where id='92222222-2222-2222-2222-222222222222';

-- Centre A: a second service that has NOT been confirmed by the provider.
insert into centre_services (id, centre_id, name, origin, status)
values ('82222222-2222-2222-2222-222222222222','71111111-1111-1111-1111-111111111111','Unconfirmed Service','custom','draft');
insert into service_packages (id, centre_service_id, centre_id, name, duration_days, price, status)
values ('93333333-3333-3333-3333-333333333333','82222222-2222-2222-2222-222222222222','71111111-1111-1111-1111-111111111111','Too Early', 30, 5000, 'draft');

-- Centre B: its own published service and package.
insert into centre_services (id, centre_id, name, origin, provider_approver_profile_id, status)
values ('83333333-3333-3333-3333-333333333333','72222222-2222-2222-2222-222222222222','Other Centre Service','custom',
        'c1000000-0000-0000-0000-000000000002','pending_provider_confirmation');
insert into service_packages (id, centre_service_id, centre_id, name, duration_days, price, status)
values ('94444444-4444-4444-4444-444444444444','83333333-3333-3333-3333-333333333333','72222222-2222-2222-2222-222222222222','Their Package', 30, 7000, 'draft');
update centre_services set status='published' where id='83333333-3333-3333-3333-333333333333';
update service_packages set status='active'   where id='94444444-4444-4444-4444-444444444444';

reset role;
set local "request.jwt.claims" to '{}';

-- ==================== the happy path ====================
reset role; select _as('c1000000-0000-0000-0000-000000000001');   -- Doc A
select is((assign_service_package('7a000000-0000-0000-0000-0000000000a1','91111111-1111-1111-1111-111111111111')).status,
          'active',
          'a same-centre clinician enrols a patient into a published package');

select is((select price_snapshot from subscriptions where patient_id='7a000000-0000-0000-0000-0000000000a1'),
          18000, 'the price is snapshotted from the package');
select is((select platform_fee_pct_snapshot from subscriptions where patient_id='7a000000-0000-0000-0000-0000000000a1'),
          20, 'the platform fee snapshot is 20% (D-004), taken from the package');
select is((select currency_snapshot from subscriptions where patient_id='7a000000-0000-0000-0000-0000000000a1'),
          'INR', 'the currency is snapshotted from the package');
select is((select centre_service_id from subscriptions where patient_id='7a000000-0000-0000-0000-0000000000a1'),
          '81111111-1111-1111-1111-111111111111'::uuid,
          'the service is derived from the package, never supplied by the client');
select is((select package_snapshot->>'name' from subscriptions where patient_id='7a000000-0000-0000-0000-0000000000a1'),
          'Standard Recovery', 'the package snapshot carries what the patient enrolled into');
select is((select package_snapshot->>'checkin_frequency' from subscriptions where patient_id='7a000000-0000-0000-0000-0000000000a1'),
          'Three times a week', 'the snapshot matches the database package at assignment time');
select is((select programme_config_snapshot->'monitoring_domains'->>0 from subscriptions where patient_id='7a000000-0000-0000-0000-0000000000a1'),
          'Pain', 'the programme configuration is frozen onto the enrolment');

-- ==================== one active programme ====================
select throws_like(
  $$select assign_service_package('7a000000-0000-0000-0000-0000000000a1','91111111-1111-1111-1111-111111111111')$$,
  '%already enrolled%',
  'a patient cannot be enrolled into a second programme');

-- ==================== eligibility ====================
select throws_like(
  $$select assign_service_package('7a000000-0000-0000-0000-0000000000a2','92222222-2222-2222-2222-222222222222')$$,
  '%not available%',
  'a retired package cannot be assigned');
select throws_like(
  $$select assign_service_package('7a000000-0000-0000-0000-0000000000a2','93333333-3333-3333-3333-333333333333')$$,
  '%not been confirmed%',
  'a package whose service is not yet confirmed cannot be assigned');
select throws_like(
  $$select assign_service_package('7a000000-0000-0000-0000-0000000000a2','94444444-4444-4444-4444-444444444444')$$,
  '%another organisation%',
  'a package from another organisation cannot be assigned');
select throws_like(
  $$select assign_service_package('7b000000-0000-0000-0000-0000000000b1','91111111-1111-1111-1111-111111111111')$$,
  '%not yours%',
  'a clinician cannot enrol a patient from another organisation');

reset role; select _as('c1000000-0000-0000-0000-000000000002');   -- Doc B
select throws_like(
  $$select assign_service_package('7a000000-0000-0000-0000-0000000000a2','91111111-1111-1111-1111-111111111111')$$,
  '%not yours%',
  'tenant: another organisation''s clinician cannot enrol centre A''s patient');

reset role; select _as('c1000000-0000-0000-0000-000000000003');   -- caregiver
select throws_like(
  $$select assign_service_package('7a000000-0000-0000-0000-0000000000a2','91111111-1111-1111-1111-111111111111')$$,
  '%care team%',
  'a household account cannot enrol a patient into a programme');

-- ==================== a client cannot spoof the commercials ====================
reset role; select _as('c1000000-0000-0000-0000-000000000001');   -- Doc A
insert into subscriptions (patient_id, service_package_id, price, price_snapshot, platform_fee_pct_snapshot,
                           plan_name, programme_config_snapshot, status, trial_days)
values ('7a000000-0000-0000-0000-0000000000a2','91111111-1111-1111-1111-111111111111', 1, 1, 0,
        'Free Forever', '{"monitoring_domains":["Nothing"]}'::jsonb, 'cancelled', 999);
select is((select price_snapshot from subscriptions where patient_id='7a000000-0000-0000-0000-0000000000a2'),
          18000, 'a client-supplied price is discarded and re-derived from the package');
select is((select platform_fee_pct_snapshot from subscriptions where patient_id='7a000000-0000-0000-0000-0000000000a2'),
          20, 'a client-supplied platform fee is discarded');
select is((select programme_config_snapshot->'monitoring_domains'->>0 from subscriptions where patient_id='7a000000-0000-0000-0000-0000000000a2'),
          'Pain', 'a client-supplied programme configuration is discarded');

-- ==================== the enrolment is frozen ====================
reset role; select _as('00000000-0000-0000-0000-000000000000','service_role');
-- The clinical fields of a package in a published service are already frozen by
-- 0027, so what a provider can still revise is commercial: the price and the
-- name families see. Neither may reach a patient who has already enrolled.
update service_packages set price = 99000, name = 'Standard Recovery (2027 pricing)'
  where id='91111111-1111-1111-1111-111111111111';
select is((select price_snapshot from subscriptions where patient_id='7a000000-0000-0000-0000-0000000000a1'),
          18000, 'repricing the package does NOT move a patient already enrolled');
select is((select package_snapshot->>'name' from subscriptions where patient_id='7a000000-0000-0000-0000-0000000000a1'),
          'Standard Recovery', 'the enrolment holds its own copy of the package, not a pointer to it');

reset role; select _as('c1000000-0000-0000-0000-000000000001');
select throws_like(
  $$update subscriptions set price_snapshot = 1 where patient_id='7a000000-0000-0000-0000-0000000000a1'$$,
  '%frozen%',
  'a clinician cannot rewrite an enrolment snapshot');
select lives_ok(
  $$update subscriptions set status='active' where patient_id='7a000000-0000-0000-0000-0000000000a1'$$,
  'settling the subscription at the centre still works');

-- ==================== legacy recovery is untouched ====================
reset role; select _as('c1000000-0000-0000-0000-000000000001');
select throws_like(
  $$insert into subscriptions (patient_id, status, plan_name, price, trial_days)
    values ('7b000000-0000-0000-0000-0000000000b1','active','Client Says', 1, 0)$$,
  '%row-level security%',
  'tenant: a clinician cannot create a subscription for another organisation''s patient');
select is((select count(*)::int from subscriptions where service_package_id is null and patient_id='7a000000-0000-0000-0000-0000000000a1'),
          0, 'the enrolled patient is not a legacy row');

reset role; set local "request.jwt.claims" to '{"role":"service_role"}'; set local role service_role;
insert into patients (id, centre_id, full_name, status)
  values ('7a000000-0000-0000-0000-0000000000a3','71111111-1111-1111-1111-111111111111','Legacy Patient','active');
reset role; select _as('c1000000-0000-0000-0000-000000000001');
insert into subscriptions (patient_id, status, plan_name, price, trial_days)
  values ('7a000000-0000-0000-0000-0000000000a3','cancelled','Client Says', 1, 0);
select is((select price from subscriptions where patient_id='7a000000-0000-0000-0000-0000000000a3'),
          5999, 'legacy: the centre package still snapshots exactly as before');
select is((select service_package_id is null and package_snapshot is null and price_snapshot is null
             from subscriptions where patient_id='7a000000-0000-0000-0000-0000000000a3'),
          true, 'legacy: a recovery subscription is valid with every new column NULL');

-- ==================== household reads ====================
reset role; select _as('c1000000-0000-0000-0000-000000000003');   -- caregiver of Patient One
select is((select count(*)::int from subscriptions), 1,
          'household: reads its own enrolment snapshot and no one else''s');
select is((select count(*)::int from centre_services) + (select count(*)::int from service_packages), 0,
          'household: still cannot browse the configuration tables');

select * from finish();
rollback;
