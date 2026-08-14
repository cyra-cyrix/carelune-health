-- ============================================================================
-- Carelune — Phase 2 institution-setup authorization tests (pgTAP).
-- Run: supabase test db
-- ============================================================================
begin;
select plan(8);

create or replace function _as(uid text, urole text default 'authenticated') returns void
language plpgsql as $$ begin
  execute format('set local role %I', case when urole='service_role' then 'service_role' else 'authenticated' end);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', urole)::text, true);
end $$;

set local "request.jwt.claims" to '{"role":"service_role"}';
insert into centres (id, name) values ('41111111-1111-1111-1111-111111111111','Inst P2');
insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000','a4000000-0000-0000-0000-000000000001','authenticated','authenticated','p2admin@t.in');
update profiles set role='pmr', is_admin=true, centre_id='41111111-1111-1111-1111-111111111111', full_name='P2 Admin'
  where id='a4000000-0000-0000-0000-000000000001';
reset role;
set local "request.jwt.claims" to '{}';

-- ---- 1. authenticated cannot assign packs (service_role-only RPC) ----
select _as('a4000000-0000-0000-0000-000000000001');
select throws_like(
  $$select set_institution_pathways('41111111-1111-1111-1111-111111111111', array['spine'])$$,
  '%permission denied%', 'HOD/admin CANNOT assign pathway packs (service_role-only RPC)');

-- ---- 2/3. service_role assigns Spine + Joint -> enabled + config created ----
reset role; select _as('svc','service_role');
select lives_ok(
  $$select set_institution_pathways('41111111-1111-1111-1111-111111111111', array['spine','joint'])$$,
  'service_role (Super Admin) can assign packs');
select is((select count(*)::int from institution_pathways where centre_id='41111111-1111-1111-1111-111111111111' and enabled),
          2, 'two packs enabled for the institution');
select is((select count(*)::int from institution_pathway_config where centre_id='41111111-1111-1111-1111-111111111111'),
          2, 'default commercial config created per enabled pack');

-- ---- 4/5. mirror: admin edits per-pack config -> centres.package_* reflects ----
reset role; select _as('a4000000-0000-0000-0000-000000000001');
update institution_pathway_config set price = 7999
  where centre_id='41111111-1111-1111-1111-111111111111'
    and pack_id = (select id from pathway_packs where key='spine');
select is((select package_price from centres where id='41111111-1111-1111-1111-111111111111'),
          7999, 'mirror: centres.package_price reflects the per-pack config (single source)');
select is((select package_name from centres where id='41111111-1111-1111-1111-111111111111'),
          'Spine Recovery', 'mirror: centres.package_name reflects the edited pack');

-- ---- 6/7. approved version: cannot un-approve; can retire ----
reset role; select _as('svc','service_role');
update pathway_versions set status='approved'
  where pathway_id = (select pw.id from pathways pw join pathway_packs pk on pk.id=pw.pack_id where pk.key='joint' and pw.key='thr');
select throws_ok(
  $$update pathway_versions set status='draft'
    where pathway_id = (select pw.id from pathways pw join pathway_packs pk on pk.id=pw.pack_id where pk.key='joint' and pw.key='thr')$$,
  'An approved pathway version is immutable; create a new version',
  'an approved version cannot be silently un-approved');
select lives_ok(
  $$update pathway_versions set status='retired'
    where pathway_id = (select pw.id from pathways pw join pathway_packs pk on pk.id=pw.pack_id where pk.key='joint' and pw.key='thr')$$,
  'an approved version can be retired (controlled superseding)');

select * from finish();
rollback;
