-- ============================================================================
-- Carelune — institution setup + pathway assignment (run AFTER 0013). Idempotent.
--
-- Phase 2 backend:
--   * centres.institution_type (hospital / rehab_centre / doctor_practice / clinical_group)
--   * set_institution_pathways(): service_role-only RPC used by platform-admin to
--     enable the packs a Super Admin selected + create default commercial config.
--   * config -> centre mirror: institution_pathway_config is the SINGLE source of
--     truth for package name/price/trial/inclusions; centres.package_* is kept as a
--     derived mirror so the existing family storefront keeps working (no second,
--     conflicting source).
--   * Hardening carried forward:
--       - approved pathway versions are fully immutable except a controlled
--         transition to 'retired' (supersede with a new version);
--       - all new/updated SECURITY DEFINER functions use an EMPTY search_path,
--         schema-qualified references, and explicit EXECUTE revocations.
--
-- HOW TO APPLY: Supabase dashboard -> SQL Editor -> paste this file -> Run.
-- ============================================================================

alter table centres add column if not exists institution_type text
  check (institution_type in ('hospital','rehab_centre','doctor_practice','clinical_group'));
alter table centres add column if not exists contact_phone text;   -- institution contact
alter table centres add column if not exists service_hours text;   -- monitoring / service hours

-- ---------------------------------------------------------------------------
-- Harden the 0013 governance functions: empty search_path + schema-qualified.
-- Approved versions may ONLY move to 'retired' (nothing else changes).
-- ---------------------------------------------------------------------------
create or replace function public.enforce_pathway_version_immutable()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'approved' then
    if new.status = 'retired'
       and new.config is not distinct from old.config
       and new.pathway_id = old.pathway_id
       and new.version = old.version then
      return new;  -- controlled retirement / superseding is allowed
    end if;
    raise exception 'An approved pathway version is immutable; create a new version';
  end if;
  return new;
end $$;
revoke execute on function public.enforce_pathway_version_immutable() from public, anon, authenticated;

create or replace function public.enforce_pathway_config()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if public.request_role() <> 'service_role' then
    if tg_op = 'INSERT' then
      new.platform_fee_pct := 30;
    else
      new.platform_fee_pct := old.platform_fee_pct;
    end if;
    if not exists (
      select 1 from public.institution_pathways ip
      where ip.centre_id = new.centre_id and ip.pack_id = new.pack_id and ip.enabled
    ) then
      raise exception 'This pathway is not enabled for your institution';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.enforce_pathway_config() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Mirror the (authoritative) per-pack commercial config down into centres.*
-- so the legacy family storefront reads stay consistent — one write path.
-- ---------------------------------------------------------------------------
create or replace function public.mirror_config_to_centre()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_name text;
begin
  select p.name into v_name from public.pathway_packs p where p.id = new.pack_id;
  update public.centres set
    package_name    = coalesce(v_name, package_name),
    package_price   = new.price,
    package_includes = new.included,
    trial_days      = new.trial_days
  where id = new.centre_id;
  return new;
end $$;
revoke execute on function public.mirror_config_to_centre() from public, anon, authenticated;

drop trigger if exists pathway_config_mirror on institution_pathway_config;
create trigger pathway_config_mirror
  after insert or update on institution_pathway_config
  for each row execute function public.mirror_config_to_centre();

-- ---------------------------------------------------------------------------
-- Super Admin assigns pathway packs to an institution (service_role only).
-- Enables each pack + creates a default, editable commercial config row.
-- ---------------------------------------------------------------------------
create or replace function public.set_institution_pathways(p_centre uuid, p_pack_keys text[])
returns void language plpgsql security definer set search_path = '' as $$
declare k text; v_pack uuid;
begin
  foreach k in array coalesce(p_pack_keys, array[]::text[]) loop
    select id into v_pack from public.pathway_packs where key = k;
    if v_pack is null then continue; end if;
    insert into public.institution_pathways (centre_id, pack_id, enabled)
      values (p_centre, v_pack, true)
      on conflict (centre_id, pack_id) do update set enabled = true;
    insert into public.institution_pathway_config (centre_id, pack_id, trial_days, duration_days, platform_fee_pct)
      values (p_centre, v_pack, 0, 30, 30)
      on conflict (centre_id, pack_id) do nothing;
  end loop;
end $$;
revoke execute on function public.set_institution_pathways(uuid, text[]) from public, anon, authenticated;
grant execute on function public.set_institution_pathways(uuid, text[]) to service_role;

-- ============================================================================
-- Done. Institutions are still assigned packs by service_role only; commercial
-- config remains admin-editable with platform_fee_pct server-held; approved
-- clinical content stays immutable.
-- ============================================================================
