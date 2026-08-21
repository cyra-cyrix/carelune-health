-- ============================================================================
-- Carelune — universal service invitation tests (pgTAP). Covers migration 0031.
-- Run: supabase test db
--
-- What this proves:
--   * only same-centre staff may mint a registration link, and only for a
--     published service and an active package belonging to their own centre;
--   * the token is the sole authority: registration re-resolves the package
--     from it server-side, so a client cannot swap in a different package;
--   * a cross-centre or retired/unpublished invite is refused, and refused
--     BEFORE a patient exists — registration and enrolment are one transaction;
--   * the resulting subscription carries the correct frozen snapshot, price and
--     20% platform fee, all derived by the database;
--   * the legacy 4-argument registration path is completely unchanged: it still
--     creates a patient with no subscription at all.
-- ============================================================================
begin;
select plan(27);

create or replace function _as(uid text, urole text default 'authenticated') returns void
language plpgsql as $$ begin
  execute format('set local role %I', case when urole='service_role' then 'service_role' else 'authenticated' end);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', urole)::text, true);
end $$;

set local "request.jwt.claims" to '{"role":"service_role"}';

-- ---------------------------------------------------------------------------
-- Fixtures: two centres, each with staff; Centre A has a published spine
-- service with one active package and one draft package, plus an unpublished
-- second service. Centre B has its own published package.
-- ---------------------------------------------------------------------------
insert into centres (id, name, display_name, package_name, package_price, trial_days) values
  ('d1111111-1111-1111-1111-111111111111','Centre A','Sanjeevani Spine','Legacy Recovery Continuum', 5999, 7),
  ('d2222222-2222-2222-2222-222222222222','Centre B','Other Clinic', null, null, 0);

insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000','e1000000-0000-0000-0000-000000000001','authenticated','authenticated','inv-doca@t.in'),
  ('00000000-0000-0000-0000-000000000000','e1000000-0000-0000-0000-000000000002','authenticated','authenticated','inv-docb@t.in'),
  ('00000000-0000-0000-0000-000000000000','e1000000-0000-0000-0000-000000000003','authenticated','authenticated','inv-carer@t.in'),
  ('00000000-0000-0000-0000-000000000000','e1000000-0000-0000-0000-000000000004','authenticated','authenticated','inv-fam1@t.in'),
  ('00000000-0000-0000-0000-000000000000','e1000000-0000-0000-0000-000000000005','authenticated','authenticated','inv-fam2@t.in'),
  ('00000000-0000-0000-0000-000000000000','e1000000-0000-0000-0000-000000000006','authenticated','authenticated','inv-fam3@t.in'),
  ('00000000-0000-0000-0000-000000000000','e1000000-0000-0000-0000-000000000007','authenticated','authenticated','inv-fam4@t.in');

update profiles set role='pmr', is_admin=true, centre_id='d1111111-1111-1111-1111-111111111111' where id='e1000000-0000-0000-0000-000000000001';
update profiles set role='pmr', is_admin=true, centre_id='d2222222-2222-2222-2222-222222222222' where id='e1000000-0000-0000-0000-000000000002';
update profiles set role='caregiver', centre_id='d1111111-1111-1111-1111-111111111111' where id='e1000000-0000-0000-0000-000000000003';

-- Centre A: published service.
insert into centre_services (id, centre_id, name, origin, provider_approver_profile_id, status, programme_config, typical_duration_days)
values ('d8111111-1111-1111-1111-111111111111','d1111111-1111-1111-1111-111111111111','Spine Recovery','custom',
        'e1000000-0000-0000-0000-000000000001','pending_provider_confirmation',
        '{"monitoring_domains":["Pain","Walking"],"programme_outline":[{"period_label":"Week 1"}]}'::jsonb, 60);

-- Centre A: an UNPUBLISHED second service.
insert into centre_services (id, centre_id, name, origin, provider_approver_profile_id, status, programme_config)
values ('d8222222-2222-2222-2222-222222222222','d1111111-1111-1111-1111-111111111111','Draft Service','custom',
        'e1000000-0000-0000-0000-000000000001','pending_provider_confirmation','{}'::jsonb);

insert into service_packages (id, centre_service_id, centre_id, name, positioning, duration_days, price, currency,
                              platform_fee_pct, trial_days, monitoring_domains, checkin_frequency, review_frequency,
                              support_level, includes, milestones, status)
values
  -- active, on the published service
  ('d9111111-1111-1111-1111-111111111111','d8111111-1111-1111-1111-111111111111','d1111111-1111-1111-1111-111111111111',
   '60-Day Guided','Structured spine recovery', 60, 18000, 'INR', 20, 0,
   '{Pain,Walking}','Daily','Fortnightly','Coordinator + physiotherapist','{"Home exercise plan"}','[]'::jsonb,'draft'),
  -- retired, on the published service
  ('d9222222-2222-2222-2222-222222222222','d8111111-1111-1111-1111-111111111111','d1111111-1111-1111-1111-111111111111',
   'Retired Plan', null, 30, 9000, 'INR', 20, 0, '{}', null, null, null, '{}','[]'::jsonb,'draft'),
  -- active, but on the UNPUBLISHED service
  ('d9333333-3333-3333-3333-333333333333','d8222222-2222-2222-2222-222222222222','d1111111-1111-1111-1111-111111111111',
   'Unpublished Plan', null, 30, 7000, 'INR', 20, 0, '{}', null, null, null, '{}','[]'::jsonb,'draft');

-- Publish Centre A's first service only AFTER its packages exist (a published
-- service may not gain new packages), then set the package statuses.
update centre_services set status='published', published_at=now() where id='d8111111-1111-1111-1111-111111111111';
update service_packages set status='active'  where id='d9111111-1111-1111-1111-111111111111';
update service_packages set status='retired' where id='d9222222-2222-2222-2222-222222222222';
-- 'd9333333' deliberately stays draft: the schema already refuses to make a
-- package active while its service is unpublished, so that is the only state
-- this case can actually be in.

-- Centre B: its own published service + active package.
insert into centre_services (id, centre_id, name, origin, provider_approver_profile_id, status, programme_config)
values ('d8333333-3333-3333-3333-333333333333','d2222222-2222-2222-2222-222222222222','Derm Care','custom',
        'e1000000-0000-0000-0000-000000000002','pending_provider_confirmation','{}'::jsonb);
insert into service_packages (id, centre_service_id, centre_id, name, duration_days, price, currency, platform_fee_pct, status)
values ('d9444444-4444-4444-4444-444444444444','d8333333-3333-3333-3333-333333333333','d2222222-2222-2222-2222-222222222222',
        'Centre B Plan', 30, 5000, 'INR', 20, 'draft');
update centre_services set status='published' where id='d8333333-3333-3333-3333-333333333333';
update service_packages set status='active'   where id='d9444444-4444-4444-4444-444444444444';
insert into service_invites (centre_id, centre_service_id, service_package_id, token)
values ('d2222222-2222-2222-2222-222222222222','d8333333-3333-3333-3333-333333333333',
        'd9444444-4444-4444-4444-444444444444','tok-centre-b');

-- ---------------------------------------------------------------------------
-- 1. Minting a link
-- ---------------------------------------------------------------------------
select _as('e1000000-0000-0000-0000-000000000001');

select isnt(create_service_invite('d9111111-1111-1111-1111-111111111111'), null,
  'a same-centre clinician can mint a link for their published, active package');

select is(
  create_service_invite('d9111111-1111-1111-1111-111111111111'),
  (select token from service_invites where service_package_id='d9111111-1111-1111-1111-111111111111' and revoked_at is null),
  'minting twice returns the SAME live link rather than orphaning the shared one');

select throws_ok(
  $$ select create_service_invite('d9222222-2222-2222-2222-222222222222') $$,
  null, null, 'a retired package cannot be turned into a registration link');

select throws_ok(
  $$ select create_service_invite('d9333333-3333-3333-3333-333333333333') $$,
  null, null, 'a package on an unpublished service cannot be turned into a link');

select throws_ok(
  $$ select create_service_invite('d9444444-4444-4444-4444-444444444444') $$,
  null, null, 'a clinician cannot mint a link for ANOTHER centre''s package');

select _as('e1000000-0000-0000-0000-000000000003');
select throws_ok(
  $$ select create_service_invite('d9111111-1111-1111-1111-111111111111') $$,
  null, null, 'a caregiver is not care-team staff and cannot mint a link');

-- ---------------------------------------------------------------------------
-- 2. Resolving a link is server-side only
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ select service_invite_for_token('anything') $$,
  null, null, 'a signed-in browser cannot execute the invite resolver at all');

select _as('e1000000-0000-0000-0000-000000000001');
select throws_ok(
  $$ select service_invite_for_token('anything') $$,
  null, null, 'not even a clinician may execute the invite resolver directly');

set local role postgres;
set local "request.jwt.claims" to '{"role":"service_role"}';

select is(
  (service_invite_for_token((select token from service_invites where service_package_id='d9111111-1111-1111-1111-111111111111'))->>'package_name'),
  '60-Day Guided', 'the resolver answers with the exact package the link was minted for');

select is(
  (service_invite_for_token((select token from service_invites where service_package_id='d9111111-1111-1111-1111-111111111111'))->>'institution_name'),
  'Sanjeevani Spine', 'the resolver answers with the provider''s own display name');

select is(service_invite_for_token('no-such-token'), null,
  'an unknown token resolves to nothing');

-- the resolver re-checks status at READ time
insert into service_invites (id, centre_id, centre_service_id, service_package_id, token)
values ('da111111-1111-1111-1111-111111111111','d1111111-1111-1111-1111-111111111111',
        'd8111111-1111-1111-1111-111111111111','d9222222-2222-2222-2222-222222222222','tok-retired');
select is(service_invite_for_token('tok-retired'), null,
  'a link whose package has since been retired stops resolving');

-- ---------------------------------------------------------------------------
-- 3. Registration + enrolment in one transaction
-- ---------------------------------------------------------------------------
select register_patient_tx(
  'd1111111-1111-1111-1111-111111111111',
  'e1000000-0000-0000-0000-000000000004',
  '{"full_name":"Invited Patient","age":"41","sex":"F"}'::jsonb,
  '{"subject_name":"Family One","relation_to_patient":"spouse"}'::jsonb,
  (select token from service_invites where service_package_id='d9111111-1111-1111-1111-111111111111' and revoked_at is null)
) as universal_patient \gset

select is(
  (select service_package_id from subscriptions where patient_id = :'universal_patient'),
  'd9111111-1111-1111-1111-111111111111'::uuid,
  'the registered patient is enrolled into the exact package the link named');

select is(
  (select centre_service_id from subscriptions where patient_id = :'universal_patient'),
  'd8111111-1111-1111-1111-111111111111'::uuid,
  'the parent service is derived server-side, never supplied');

select is(
  (select package_snapshot->>'name' from subscriptions where patient_id = :'universal_patient'),
  '60-Day Guided', 'the frozen package snapshot records what they enrolled into');

select is(
  (select package_snapshot->>'duration_days' from subscriptions where patient_id = :'universal_patient'),
  '60', 'the frozen snapshot carries the configured duration');

select isnt(
  (select programme_config_snapshot from subscriptions where patient_id = :'universal_patient'),
  '{}'::jsonb, 'the programme configuration is frozen onto the subscription');

select is(
  (select price_snapshot from subscriptions where patient_id = :'universal_patient'),
  18000, 'the price is read out of the package, not sent by the client');

select is(
  (select platform_fee_pct_snapshot from subscriptions where patient_id = :'universal_patient'),
  20, 'the 20% platform fee is server-derived (D-004)');

select is(
  (select currency_snapshot from subscriptions where patient_id = :'universal_patient'),
  'INR', 'the currency is server-derived');

select is(
  (select centre_id from patients where id = :'universal_patient'),
  'd1111111-1111-1111-1111-111111111111'::uuid,
  'the patient lands in the centre that owns the invitation');

-- ---------------------------------------------------------------------------
-- 4. Refusals — and each one BEFORE a patient exists
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ select register_patient_tx(
      'd1111111-1111-1111-1111-111111111111','e1000000-0000-0000-0000-000000000005',
      '{"full_name":"Should Not Exist"}'::jsonb,'{}'::jsonb,'tok-centre-b') $$,
  null, null, 'an invitation from another centre is refused — the link''s own centre must match');

select throws_ok(
  $$ select register_patient_tx(
      'd1111111-1111-1111-1111-111111111111','e1000000-0000-0000-0000-000000000005',
      '{"full_name":"Should Not Exist"}'::jsonb,'{}'::jsonb,'not-a-real-token') $$,
  null, null, 'an unknown invitation is refused');

select throws_ok(
  $$ select register_patient_tx(
      'd1111111-1111-1111-1111-111111111111','e1000000-0000-0000-0000-000000000005',
      '{"full_name":"Should Not Exist"}'::jsonb,'{}'::jsonb,'tok-retired') $$,
  null, null, 'an invitation whose package was retired is refused');

select is(
  (select count(*)::int from patients where full_name = 'Should Not Exist'),
  0, 'a refused invitation never leaves a registered patient behind');

-- ---------------------------------------------------------------------------
-- 5. The legacy path is untouched
-- ---------------------------------------------------------------------------
select register_patient_tx(
  'd1111111-1111-1111-1111-111111111111',
  'e1000000-0000-0000-0000-000000000006',
  '{"full_name":"Legacy Patient","age":"70"}'::jsonb,
  '{"subject_name":"Family Three","relation_to_patient":"son"}'::jsonb
) as legacy_patient \gset

select is(
  (select count(*)::int from subscriptions where patient_id = :'legacy_patient'),
  0, 'the legacy 4-argument registration still creates NO subscription');

select is(
  (select status from patients where id = :'legacy_patient'),
  'pending', 'the legacy patient still lands as pending for the doctor to activate');

select * from finish();
rollback;
