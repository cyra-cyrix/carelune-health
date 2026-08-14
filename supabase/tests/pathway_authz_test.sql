-- ============================================================================
-- Carelune — Pathway Engine authorization tests (pgTAP). Run: supabase test db
-- ============================================================================
begin;
select plan(10);

-- become a signed-in user (SET ROLE + JWT claims, like PostgREST)
create or replace function _as(uid text, urole text default 'authenticated') returns void
language plpgsql as $$ begin
  execute format('set local role %I', case when urole='service_role' then 'service_role' else 'authenticated' end);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', urole)::text, true);
end $$;

-- ---- seed (as postgres; service_role claim so provenance guards trust it) ----
set local "request.jwt.claims" to '{"role":"service_role"}';

insert into centres (id, name) values
  ('31111111-1111-1111-1111-111111111111','Inst One'),
  ('32222222-2222-2222-2222-222222222222','Inst Two');

insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000','a1000000-0000-0000-0000-000000000001','authenticated','authenticated','admin1@t.in'),
  ('00000000-0000-0000-0000-000000000000','a1000000-0000-0000-0000-000000000002','authenticated','authenticated','admin2@t.in'),
  ('00000000-0000-0000-0000-000000000000','a1000000-0000-0000-0000-000000000003','authenticated','authenticated','nurse1@t.in');

update profiles set role='pmr', is_admin=true, centre_id='31111111-1111-1111-1111-111111111111', full_name='Admin One' where id='a1000000-0000-0000-0000-000000000001';
update profiles set role='pmr', is_admin=true, centre_id='32222222-2222-2222-2222-222222222222', full_name='Admin Two' where id='a1000000-0000-0000-0000-000000000002';
update profiles set role='nurse', centre_id='31111111-1111-1111-1111-111111111111', full_name='Nurse One' where id='a1000000-0000-0000-0000-000000000003';

-- Super Admin (service_role) enables the Spine pack for Inst One.
insert into institution_pathways (centre_id, pack_id, enabled)
  select '31111111-1111-1111-1111-111111111111', id, true from pathway_packs where key='spine';

reset role;
set local "request.jwt.claims" to '{}';

-- ============================ catalogue ============================
select _as('a1000000-0000-0000-0000-000000000001');
select is((select count(*)::int from pathway_packs), 3, 'catalogue: 3 governed packs are readable');
select is((select count(*)::int from pathways), 7, 'catalogue: 7 seeded pathways are readable');

-- ==================== HOD cannot self-enable a pack ====================
reset role; select _as('a1000000-0000-0000-0000-000000000001');   -- HOD/admin
select throws_like(
  $$insert into institution_pathways (centre_id, pack_id, enabled)
    select '31111111-1111-1111-1111-111111111111', id, true from pathway_packs where key='joint'$$,
  '%row-level security%',
  'HOD/admin CANNOT self-enable a pathway pack (service_role only)');

-- ==================== institution assignment scoping ====================
reset role; select _as('a1000000-0000-0000-0000-000000000001');   -- Inst One admin
select is((select count(*)::int from institution_pathways where centre_id='31111111-1111-1111-1111-111111111111'),
          1, 'Inst One admin sees its own enabled pack');
reset role; select _as('a1000000-0000-0000-0000-000000000002');   -- Inst Two admin
select is((select count(*)::int from institution_pathways where centre_id='31111111-1111-1111-1111-111111111111'),
          0, 'tenant: Inst Two admin CANNOT see Inst One assignments');

-- ==================== commercial config (enabled pack) ====================
reset role; select _as('a1000000-0000-0000-0000-000000000001');   -- Inst One admin
insert into institution_pathway_config (centre_id, pack_id, price, platform_fee_pct)
  select '31111111-1111-1111-1111-111111111111', id, 4999, 5 from pathway_packs where key='spine';
select is((select price from institution_pathway_config where centre_id='31111111-1111-1111-1111-111111111111'),
          4999, 'HOD can set the commercial price for an enabled pack');
select is((select platform_fee_pct from institution_pathway_config where centre_id='31111111-1111-1111-1111-111111111111'),
          30, 'platform_fee_pct is server-held (client value ignored)');

-- ==================== config for a NON-enabled pack ====================
reset role; select _as('a1000000-0000-0000-0000-000000000001');   -- joint not enabled for Inst One
select throws_ok(
  $$insert into institution_pathway_config (centre_id, pack_id, price)
    select '31111111-1111-1111-1111-111111111111', id, 1000 from pathway_packs where key='joint'$$,
  'This pathway is not enabled for your institution',
  'config rejected for a pack not enabled for the institution');

-- ==================== config cross-tenant read ====================
reset role; select _as('a1000000-0000-0000-0000-000000000002');   -- Inst Two admin
select is((select count(*)::int from institution_pathway_config where centre_id='31111111-1111-1111-1111-111111111111'),
          0, 'tenant: Inst Two admin CANNOT read Inst One commercial config');

-- ==================== approved pathway version is immutable ====================
reset role; select _as('svc','service_role');
update pathway_versions set status='approved'
  where pathway_id = (select pw.id from pathways pw join pathway_packs pk on pk.id=pw.pack_id where pk.key='joint' and pw.key='thr');
select throws_ok(
  $$update pathway_versions set config = '{"content_status":"approved","phases":[],"modules":[],"milestones":[],"warning_signs":[],"escalation":{"routine":"n","urgent":"d","emergency":"e"},"education":[]}'::jsonb
    where pathway_id = (select pw.id from pathways pw join pathway_packs pk on pk.id=pw.pack_id where pk.key='joint' and pw.key='thr')$$,
  'An approved pathway version is immutable; create a new version',
  'an approved pathway version cannot be silently edited');

select * from finish();
rollback;
