-- ============================================================================
-- Carelune — provider service layer authorization tests (pgTAP).
-- Covers migration 0027 (centre_services, service_packages, confirm_centre_service).
-- Run: supabase test db
--
-- What this proves:
--   * cross-centre reads are impossible;
--   * household accounts (patient/caregiver/family) cannot enumerate services or
--     packages AT ALL — before or after publication;
--   * no browser client can write configuration (Super Admin / service_role only);
--   * Level-2 confirmation belongs to the DESIGNATED approver named on the
--     service — not to an organisation administrator, and not to any staff
--     member who happens to be signed in;
--   * designation itself is constrained to same-centre clinical staff;
--   * a published service is immutable, and the CLINICAL configuration of its
--     packages is frozen while commercial fields stay editable;
--   * a package can neither escape its parent's organisation nor set its own fee.
-- ============================================================================
begin;
select plan(35);

-- become a signed-in user (SET ROLE + JWT claims, like PostgREST)
create or replace function _as(uid text, urole text default 'authenticated') returns void
language plpgsql as $$ begin
  execute format('set local role %I', case when urole='service_role' then 'service_role' else 'authenticated' end);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', urole)::text, true);
end $$;

-- ---- seed (as postgres; service_role claim so the guards treat us as trusted) ----
set local "request.jwt.claims" to '{"role":"service_role"}';

insert into centres (id, name) values
  ('41111111-1111-1111-1111-111111111111','Vivek Spine Practice'),
  ('42222222-2222-2222-2222-222222222222','Other Centre');

insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000','b1000000-0000-0000-0000-000000000001','authenticated','authenticated','admina@t.in'),
  ('00000000-0000-0000-0000-000000000000','b1000000-0000-0000-0000-000000000002','authenticated','authenticated','adminb@t.in'),
  ('00000000-0000-0000-0000-000000000000','b1000000-0000-0000-0000-000000000003','authenticated','authenticated','nursea@t.in'),
  ('00000000-0000-0000-0000-000000000000','b1000000-0000-0000-0000-000000000004','authenticated','authenticated','carera@t.in'),
  ('00000000-0000-0000-0000-000000000000','b1000000-0000-0000-0000-000000000005','authenticated','authenticated','approvera@t.in');

-- Note: the designated approver is NOT an organisation administrator.
update profiles set role='pmr',       is_admin=true,  centre_id='41111111-1111-1111-1111-111111111111', full_name='Admin A'     where id='b1000000-0000-0000-0000-000000000001';
update profiles set role='pmr',       is_admin=true,  centre_id='42222222-2222-2222-2222-222222222222', full_name='Admin B'     where id='b1000000-0000-0000-0000-000000000002';
update profiles set role='nurse',     is_admin=false, centre_id='41111111-1111-1111-1111-111111111111', full_name='Nurse A'     where id='b1000000-0000-0000-0000-000000000003';
update profiles set role='caregiver', is_admin=false, centre_id='41111111-1111-1111-1111-111111111111', full_name='Carer A'     where id='b1000000-0000-0000-0000-000000000004';
update profiles set role='pmr',       is_admin=false, centre_id='41111111-1111-1111-1111-111111111111', full_name='Dr Vivek'    where id='b1000000-0000-0000-0000-000000000005';

-- Centre A · service 1: originates from the Carelune Spine template, Level-1
-- confirmed, awaiting its designated approver (Dr Vivek, not an admin).
insert into centre_services (id, centre_id, name, slug, origin, pathway_id, pathway_version_id,
                             owner_profile_id, provider_approver_profile_id, status,
                             source_provenance, configured_by, confirmed_by_platform_at, confirmed_by_platform_by)
select '51111111-1111-1111-1111-111111111111','41111111-1111-1111-1111-111111111111',
       'Dr Vivek Post-operative Spine Recovery','spine-postop','template',
       v.pathway_id, v.id,
       'b1000000-0000-0000-0000-000000000005','b1000000-0000-0000-0000-000000000005',
       'pending_provider_confirmation','ai_drafted',
       'b1000000-0000-0000-0000-000000000001', now(), 'b1000000-0000-0000-0000-000000000001'
from pathway_versions v
join pathways p on p.id = v.pathway_id
where p.key = 'lumbar_fusion' limit 1;

-- Its package, configured before confirmation (draft: the service is not live).
insert into service_packages (id, centre_service_id, centre_id, name, duration_days, price,
                              monitoring_domains, checkin_frequency, status)
values ('61111111-1111-1111-1111-111111111111','51111111-1111-1111-1111-111111111111',
        '41111111-1111-1111-1111-111111111111','30-Day Essential',30,12000,
        array['pain','wound','mobility'],'daily','draft');

-- Centre A · service 2: fully custom, still a draft.
insert into centre_services (id, centre_id, name, slug, origin, status, source_provenance)
values ('52222222-2222-2222-2222-222222222222','41111111-1111-1111-1111-111111111111',
        'Lactation & Newborn Support','lactation','custom','draft','ai_drafted');

-- Centre B · a service taken all the way to published, with a live package.
insert into centre_services (id, centre_id, name, slug, origin, provider_approver_profile_id, status)
values ('53333333-3333-3333-3333-333333333333','42222222-2222-2222-2222-222222222222',
        'Other Centre Knee Programme','knee','custom','b1000000-0000-0000-0000-000000000002',
        'pending_provider_confirmation');
insert into service_packages (id, centre_service_id, centre_id, name, duration_days, price, status)
values ('62222222-2222-2222-2222-222222222222','53333333-3333-3333-3333-333333333333',
        '42222222-2222-2222-2222-222222222222','60-Day Guided',60,24000,'draft');
update centre_services set status='published', published_at=now()
  where id='53333333-3333-3333-3333-333333333333';
update service_packages set status='active' where id='62222222-2222-2222-2222-222222222222';

reset role;
set local "request.jwt.claims" to '{}';

-- ============================ reads: centre isolation ============================
reset role; select _as('b1000000-0000-0000-0000-000000000001');   -- admin A (staff)
select is((select count(*)::int from centre_services), 2,
          'staff: sees both of its own organisation services, whatever the status');
select is((select count(*)::int from centre_services where centre_id='42222222-2222-2222-2222-222222222222'), 0,
          'tenant: centre A staff CANNOT see centre B services');
select is((select count(*)::int from service_packages where centre_id='42222222-2222-2222-2222-222222222222'), 0,
          'tenant: centre A staff CANNOT see centre B packages');

reset role; select _as('b1000000-0000-0000-0000-000000000002');   -- admin B
select is((select count(*)::int from centre_services), 1,
          'tenant: centre B admin sees only its own service');
select is((select count(*)::int from service_packages), 1,
          'tenant: centre B admin sees only its own package');

-- ============ household accounts get NO direct table access (amendment 3) ============
reset role; select _as('b1000000-0000-0000-0000-000000000004');   -- caregiver, centre A
select is((select count(*)::int from centre_services), 0,
          'household: CANNOT enumerate its own organisation services');
select is((select count(*)::int from service_packages), 0,
          'household: CANNOT enumerate its own organisation packages');
select is((select count(*)::int from centre_services where status='published'), 0,
          'household: a published service in another centre is invisible too');

-- ==================== writes: no browser client configures a service ====================
reset role; select _as('b1000000-0000-0000-0000-000000000001');   -- admin A
select throws_like(
  $$insert into centre_services (centre_id, name, origin)
    values ('41111111-1111-1111-1111-111111111111','Self-made service','custom')$$,
  '%denied%',
  'provider admin CANNOT create a service (Super Admin / service_role only)');
select throws_like(
  $$update centre_services set status='published' where id='51111111-1111-1111-1111-111111111111'$$,
  '%denied%',
  'provider admin CANNOT publish a service by writing the row directly');
select throws_like(
  $$insert into service_packages (centre_service_id, centre_id, name, duration_days)
    values ('51111111-1111-1111-1111-111111111111','41111111-1111-1111-1111-111111111111','DIY',30)$$,
  '%denied%',
  'provider admin CANNOT create a package directly');
-- TRUNCATE is not filtered by RLS, so the grant itself must be gone.
select throws_like(
  $$truncate centre_services cascade$$,
  '%denied%',
  'staff CANNOT truncate the service table (TRUNCATE bypasses RLS)');
select throws_like(
  $$truncate service_packages$$,
  '%denied%',
  'staff CANNOT truncate the package table (TRUNCATE bypasses RLS)');

-- ==================== Level-2 confirmation: the DESIGNATED approver ====================
reset role; select _as('b1000000-0000-0000-0000-000000000002');   -- admin of the OTHER centre
select throws_like(
  $$select confirm_centre_service('51111111-1111-1111-1111-111111111111')$$,
  '%your own organisation%',
  'tenant: an admin CANNOT confirm another organisation''s service');

reset role; select _as('b1000000-0000-0000-0000-000000000003');   -- nurse, centre A, not designated
select throws_like(
  $$select confirm_centre_service('51111111-1111-1111-1111-111111111111')$$,
  '%designated approver%',
  'same-centre staff who are not the designated approver CANNOT confirm');

reset role; select _as('b1000000-0000-0000-0000-000000000001');   -- ADMIN of centre A, not designated
select throws_like(
  $$select confirm_centre_service('51111111-1111-1111-1111-111111111111')$$,
  '%designated approver%',
  'being an organisation administrator does NOT confer confirmation authority');

reset role; select _as('b1000000-0000-0000-0000-000000000005');   -- designated approver (NOT an admin)
select is((select status from confirm_centre_service('51111111-1111-1111-1111-111111111111','Reviewed with my team')),
          'published',
          'the designated approver confirms its own service without being an admin');
select is((select confirmed_by_provider_by from centre_services where id='51111111-1111-1111-1111-111111111111'),
          'b1000000-0000-0000-0000-000000000005'::uuid,
          'the confirming approver is stamped on the service');
select is((select status from service_packages where id='61111111-1111-1111-1111-111111111111'),
          'active',
          'confirming the service brings its packages to life (0028)');
select throws_like(
  $$select confirm_centre_service('51111111-1111-1111-1111-111111111111')$$,
  '%awaiting provider confirmation%',
  'a service cannot be confirmed twice');

-- household visibility does NOT begin at publication
reset role; select _as('00000000-0000-0000-0000-000000000000','service_role');
update service_packages set status='active' where id='61111111-1111-1111-1111-111111111111';
reset role; select _as('b1000000-0000-0000-0000-000000000004');   -- caregiver, centre A
select is((select count(*)::int from centre_services), 0,
          'household: STILL cannot see the service after Level-2 publication');
select is((select count(*)::int from service_packages), 0,
          'household: STILL cannot see an active package after publication');

-- ==================== designation is itself constrained ====================
reset role; select _as('00000000-0000-0000-0000-000000000000','service_role');
select throws_like(
  $$update centre_services set provider_approver_profile_id='b1000000-0000-0000-0000-000000000004'
     where id='52222222-2222-2222-2222-222222222222'$$,
  '%clinical staff%',
  'a household account CANNOT be designated as the provider approver');
select throws_like(
  $$update centre_services set provider_approver_profile_id='b1000000-0000-0000-0000-000000000002'
     where id='52222222-2222-2222-2222-222222222222'$$,
  '%belong to this organisation%',
  'a clinician from another organisation CANNOT be designated as approver');
select throws_like(
  $$update centre_services set status='pending_provider_confirmation'
     where id='52222222-2222-2222-2222-222222222222'$$,
  '%must name its approver%',
  'a service cannot await provider confirmation with nobody named to confirm it');

-- ==================== immutability after publication ====================
select throws_like(
  $$update centre_services set programme_config='{"modules":[]}'::jsonb
     where id='51111111-1111-1111-1111-111111111111'$$,
  '%immutable%',
  'a published service is immutable — a change must be a new revision');
select throws_like(
  $$update centre_services set provider_approver_profile_id='b1000000-0000-0000-0000-000000000001'
     where id='51111111-1111-1111-1111-111111111111'$$,
  '%immutable%',
  'the approver of a published service cannot be re-pointed');
select throws_like(
  $$update service_packages set duration_days=45 where id='61111111-1111-1111-1111-111111111111'$$,
  '%clinical configuration%',
  'package duration is frozen once the parent service is published');
select throws_like(
  $$update service_packages set monitoring_domains=array['pain'] where id='61111111-1111-1111-1111-111111111111'$$,
  '%clinical configuration%',
  'package monitoring domains are frozen once the parent service is published');
select throws_like(
  $$insert into service_packages (centre_service_id, centre_id, name, duration_days)
    values ('51111111-1111-1111-1111-111111111111','41111111-1111-1111-1111-111111111111','Late addition',90)$$,
  '%new service revision%',
  'a published service cannot gain a new package');
select lives_ok(
  $$update service_packages set price=13500 where id='61111111-1111-1111-1111-111111111111'$$,
  'the provider may still revise the commercial price after publication');

-- ==================== remaining guards ====================
select throws_like(
  $$insert into centre_services (centre_id, name, origin, pathway_version_id)
    select '41111111-1111-1111-1111-111111111111','Bad custom','custom', v.id
      from pathway_versions v limit 1$$,
  '%must not reference%',
  'a custom service cannot claim a Carelune pathway version');
select throws_like(
  $$insert into service_packages (centre_service_id, centre_id, name, duration_days, status)
    values ('52222222-2222-2222-2222-222222222222','41111111-1111-1111-1111-111111111111','Too early',30,'active')$$,
  '%before its service is published%',
  'a package cannot go live ahead of its service');

-- centre_id is derived from the parent service, never from the caller's payload
insert into service_packages (id, centre_service_id, centre_id, name, duration_days)
values ('63333333-3333-3333-3333-333333333333','52222222-2222-2222-2222-222222222222',
        '42222222-2222-2222-2222-222222222222','Mislabelled',30);
select is((select centre_id from service_packages where id='63333333-3333-3333-3333-333333333333'),
          '41111111-1111-1111-1111-111111111111'::uuid,
          'a package inherits its centre from the parent service, not from the client');
select is((select platform_fee_pct from service_packages where id='63333333-3333-3333-3333-333333333333'),
          20,
          'the platform fee defaults to 20% (D-004)');

select * from finish();
rollback;
