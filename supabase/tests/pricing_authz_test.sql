-- ============================================================================
-- Carelune — package pricing tests (pgTAP). Covers migration 0029.
-- Run: supabase test db
--
-- What this proves:
--   * only the clinician the service is assigned to may price it, and only
--     within their own organisation and only once the service is confirmed;
--   * the platform fee is not something a caller can move — it stays 20%;
--   * nothing clinical can be reached through the pricing path;
--   * repricing does not move a patient already enrolled, and the next patient
--     enrols at the new price.
-- ============================================================================
begin;
select plan(15);

create or replace function _as(uid text, urole text default 'authenticated') returns void
language plpgsql as $$ begin
  execute format('set local role %I', case when urole='service_role' then 'service_role' else 'authenticated' end);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', urole)::text, true);
end $$;

set local "request.jwt.claims" to '{"role":"service_role"}';

insert into centres (id, name) values
  ('d1111111-1111-1111-1111-111111111111','Priced Centre'),
  ('d2222222-2222-2222-2222-222222222222','Other Centre');

insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000','e1000000-0000-0000-0000-000000000001','authenticated','authenticated','owner@t.in'),
  ('00000000-0000-0000-0000-000000000000','e1000000-0000-0000-0000-000000000002','authenticated','authenticated','colleague@t.in'),
  ('00000000-0000-0000-0000-000000000000','e1000000-0000-0000-0000-000000000003','authenticated','authenticated','otherowner@t.in');

update profiles set role='pmr', is_admin=false, centre_id='d1111111-1111-1111-1111-111111111111', full_name='Owner'      where id='e1000000-0000-0000-0000-000000000001';
update profiles set role='pmr', is_admin=true,  centre_id='d1111111-1111-1111-1111-111111111111', full_name='Colleague'  where id='e1000000-0000-0000-0000-000000000002';
update profiles set role='pmr', is_admin=true,  centre_id='d2222222-2222-2222-2222-222222222222', full_name='Other'      where id='e1000000-0000-0000-0000-000000000003';

insert into patients (id, centre_id, full_name, status) values
  ('da000000-0000-0000-0000-0000000000a1','d1111111-1111-1111-1111-111111111111','First Patient','active'),
  ('da000000-0000-0000-0000-0000000000a2','d1111111-1111-1111-1111-111111111111','Second Patient','active');

-- A confirmed service with three packages, and a second service still unconfirmed.
insert into centre_services (id, centre_id, name, origin, provider_approver_profile_id, status)
values ('f1111111-1111-1111-1111-111111111111','d1111111-1111-1111-1111-111111111111','Recovery','custom',
        'e1000000-0000-0000-0000-000000000001','pending_provider_confirmation'),
       ('f2222222-2222-2222-2222-222222222222','d1111111-1111-1111-1111-111111111111','Unconfirmed','custom',
        'e1000000-0000-0000-0000-000000000001','draft');
insert into service_packages (id, centre_service_id, centre_id, name, duration_days, monitoring_domains, checkin_frequency, review_frequency, status)
values ('a1111111-1111-1111-1111-111111111111','f1111111-1111-1111-1111-111111111111','d1111111-1111-1111-1111-111111111111','Basic',   30, array['Pain'], 'Twice a week',       'Weekly review',   'draft'),
       ('a2222222-2222-2222-2222-222222222222','f1111111-1111-1111-1111-111111111111','d1111111-1111-1111-1111-111111111111','Standard',60, array['Pain'], 'Three times a week','Weekly review',   'draft'),
       ('a3333333-3333-3333-3333-333333333333','f2222222-2222-2222-2222-222222222222','d1111111-1111-1111-1111-111111111111','Too Early',30, array['Pain'], 'Weekly',            'Fortnightly',     'draft');

insert into centre_services (id, centre_id, name, origin, provider_approver_profile_id, status)
values ('f3333333-3333-3333-3333-333333333333','d2222222-2222-2222-2222-222222222222','Their Service','custom',
        'e1000000-0000-0000-0000-000000000003','pending_provider_confirmation');
insert into service_packages (id, centre_service_id, centre_id, name, duration_days, status)
values ('a4444444-4444-4444-4444-444444444444','f3333333-3333-3333-3333-333333333333','d2222222-2222-2222-2222-222222222222','Theirs',30,'draft');

update centre_services set status='published', published_at=now()
  where id in ('f1111111-1111-1111-1111-111111111111','f3333333-3333-3333-3333-333333333333');
update service_packages set status='active'
  where centre_service_id in ('f1111111-1111-1111-1111-111111111111','f3333333-3333-3333-3333-333333333333');

reset role; set local "request.jwt.claims" to '{}';

-- ==================== who may price ====================
reset role; select _as('e1000000-0000-0000-0000-000000000001');   -- the service owner
select is((set_service_package_price('a1111111-1111-1111-1111-111111111111', 12000)).price,
          12000, 'the clinician the service is assigned to sets the price');
select is((set_service_package_price('a2222222-2222-2222-2222-222222222222', 18000)).price,
          18000, 'and prices each package independently');
select is((select currency from service_packages where id='a1111111-1111-1111-1111-111111111111'),
          'INR', 'the currency defaults to INR');

reset role; select _as('e1000000-0000-0000-0000-000000000002');   -- same centre, an ADMIN, not the owner
select throws_like(
  $$select set_service_package_price('a1111111-1111-1111-1111-111111111111', 1)$$,
  '%assigned to%',
  'an administrator who does not own the service cannot reprice it');

reset role; select _as('e1000000-0000-0000-0000-000000000003');   -- another organisation
select throws_like(
  $$select set_service_package_price('a1111111-1111-1111-1111-111111111111', 1)$$,
  '%another organisation%',
  'tenant: another organisation cannot touch this price');

reset role; select _as('e1000000-0000-0000-0000-000000000001');
select throws_like(
  $$select set_service_package_price('a3333333-3333-3333-3333-333333333333', 5000)$$,
  '%Confirm this service%',
  'an unconfirmed service cannot be priced');
select throws_like(
  $$select set_service_package_price('a1111111-1111-1111-1111-111111111111', -1)$$,
  '%cannot be negative%',
  'a negative price is refused');
select throws_like(
  $$select set_service_package_price('a1111111-1111-1111-1111-111111111111', 12000, 'rupees')$$,
  '%currency%',
  'a currency Carelune does not recognise is refused');

-- ==================== the fee and the clinical fields are out of reach ====================
select is((select platform_fee_pct from service_packages where id='a1111111-1111-1111-1111-111111111111'),
          20, 'the platform fee is untouched by pricing and stays 20% (D-004)');
select throws_like(
  $$update service_packages set checkin_frequency='Hourly' where id='a1111111-1111-1111-1111-111111111111'$$,
  '%denied%',
  'the pricing path grants no table access: clinical fields remain unreachable');
select is((select checkin_frequency from service_packages where id='a2222222-2222-2222-2222-222222222222'),
          'Three times a week', 'repricing left the clinical configuration exactly as it was');

-- ==================== an enrolled patient does not move ====================
select is((assign_service_package('da000000-0000-0000-0000-0000000000a1','a2222222-2222-2222-2222-222222222222')).price_snapshot,
          18000, 'a patient enrols at the price on the package today');

select is((set_service_package_price('a2222222-2222-2222-2222-222222222222', 20000)).price,
          20000, 'the provider reprices the package afterwards');
select is((select price_snapshot from subscriptions where patient_id='da000000-0000-0000-0000-0000000000a1'),
          18000, 'the enrolled patient stays on the price they enrolled at');
select is((assign_service_package('da000000-0000-0000-0000-0000000000a2','a2222222-2222-2222-2222-222222222222')).price_snapshot,
          20000, 'the next patient enrols at the new price');

select * from finish();
rollback;
