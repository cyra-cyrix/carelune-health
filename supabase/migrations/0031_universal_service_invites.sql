-- ============================================================================
-- Carelune — the Universal service invitation path (run AFTER 0030).
--
-- WHY
-- ---
-- Until now there was exactly ONE way to invite a patient: `centres.invite_token`
-- (0007), a single reusable per-ORGANISATION token that carries no package. The
-- registration screen therefore had nothing to render from and fell back to the
-- hardcoded legacy constant ("30-Day Recovery Continuum", medicine tracking,
-- physiotherapy). A provider who selected a Universal package and generated a
-- link got the legacy recovery flow, because the package was never captured —
-- not lost in transit, never recorded at any point.
--
-- This migration adds the missing path and nothing else. The legacy invitation
-- keeps working byte-for-byte: `centres.invite_token`, `centre_id_for_token()`
-- and the 4-argument registration behaviour are untouched in every respect.
--
-- The invitation is the authority. The browser never names a package: it holds
-- an opaque token, and the server resolves what that token means.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The invitation itself.
--
--    One row per generated link. Bound to a single package, and denormalised to
--    its centre and service so every check is a plain comparison with no join —
--    the same reasoning as service_packages.centre_id in 0027.
-- ---------------------------------------------------------------------------
create table if not exists service_invites (
  id                 uuid primary key default gen_random_uuid(),
  centre_id          uuid not null references centres(id)         on delete cascade,
  centre_service_id  uuid not null references centre_services(id) on delete cascade,
  service_package_id uuid not null references service_packages(id) on delete cascade,

  -- Opaque, unguessable, and the ONLY thing the browser ever holds.
  token      text not null unique,

  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists service_invites_package_idx on service_invites(service_package_id) where revoked_at is null;
create index if not exists service_invites_centre_idx  on service_invites(centre_id);

alter table service_invites enable row level security;

-- REVOKE ALL, not just the DML verbs: Supabase's base setup grants ALL on new
-- public tables to `authenticated`, and that includes TRUNCATE — which RLS does
-- NOT filter. (0027 lesson.)
revoke all on service_invites from anon, authenticated;
grant select on service_invites to authenticated;
grant select, insert, update, delete on service_invites to service_role;

-- READ : same-centre staff only. A household account must never enumerate an
--        organisation's live invitation links.
-- WRITE: no policy for `authenticated` at all — invites are minted only through
--        create_service_invite() below.
drop policy if exists service_invites_read on service_invites;
create policy service_invites_read on service_invites
  for select to authenticated
  using (is_staff() and centre_id = (select centre_id from profiles where id = auth.uid()));

-- ---------------------------------------------------------------------------
-- 2. Minting a link. Staff-only, own centre, published service, active package.
--
--    Idempotent per package: asking twice returns the SAME live link rather
--    than quietly orphaning the one already shared with a family.
-- ---------------------------------------------------------------------------
create or replace function public.create_service_invite(p_package uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare v_centre uuid; v_pkg record; v_token text;
begin
  if not is_staff() then
    raise exception 'Only the care team can create a registration link';
  end if;

  select centre_id into v_centre from profiles where id = auth.uid();

  select p.id as pkg_id, p.status as pkg_status,
         s.id as svc_id, s.centre_id as svc_centre, s.status as svc_status
    into v_pkg
    from service_packages p
    join centre_services s on s.id = p.centre_service_id
   where p.id = p_package;

  if not found then
    raise exception 'That programme does not exist';
  end if;
  if v_pkg.svc_centre is distinct from v_centre then
    raise exception 'That programme belongs to another organisation';
  end if;
  if v_pkg.svc_status <> 'published' then
    raise exception 'That service has not been confirmed by the provider yet';
  end if;
  if v_pkg.pkg_status <> 'active' then
    raise exception 'That programme is not available';
  end if;

  select token into v_token
    from service_invites
   where service_package_id = p_package and revoked_at is null
   limit 1;
  if v_token is not null then
    return v_token;
  end if;

  -- gen_random_uuid() is core (pg_catalog), so this needs no extension on the
  -- function's search_path. Two of them = 64 hex chars of unguessable token.
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into service_invites (centre_id, centre_service_id, service_package_id, token, created_by)
  values (v_pkg.svc_centre, v_pkg.svc_id, p_package, v_token, auth.uid());

  return v_token;
end $$;

revoke execute on function public.create_service_invite(uuid) from public, anon;
grant  execute on function public.create_service_invite(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Resolving a link, server-side.
--
--    Mirrors centre_id_for_token()'s discipline: it can only ever answer for an
--    exact token match. service_role ONLY — the `registry` Edge Function calls
--    it and then allow-lists the handful of fields the public screen may see.
--    Re-checks publication/active status at READ time, so a retired package
--    stops rendering the moment it is retired.
-- ---------------------------------------------------------------------------
create or replace function public.service_invite_for_token(t text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'centre_id',          i.centre_id,
    'centre_service_id',  i.centre_service_id,
    'service_package_id', i.service_package_id,
    'institution_name',   coalesce(c.display_name, c.name),
    'service_name',       s.name,
    'package_name',       p.name,
    'positioning',        p.positioning,
    'duration_days',      p.duration_days,
    'monitoring_domains', to_jsonb(coalesce(p.monitoring_domains, '{}')),
    'checkin_frequency',  p.checkin_frequency,
    'review_frequency',   p.review_frequency,
    'support_level',      p.support_level,
    'includes',           to_jsonb(coalesce(p.includes, '{}')),
    'price',              p.price,
    'currency',           coalesce(p.currency, 'INR'),
    'trial_days',         coalesce(p.trial_days, 0)
  )
  from service_invites i
  join centres          c on c.id = i.centre_id
  join centre_services  s on s.id = i.centre_service_id
  join service_packages p on p.id = i.service_package_id
  where i.token = t
    and t is not null
    and i.revoked_at is null
    and s.status = 'published'
    and p.status = 'active'
  limit 1
$$;

revoke execute on function public.service_invite_for_token(text) from public, anon, authenticated;
grant  execute on function public.service_invite_for_token(text) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Close the service_role hole in the snapshot trigger.
--
--    0028 short-circuited the WHOLE trigger for service_role ("service_role
--    paths trusted"). That was safe while every enrolment came from a signed-in
--    provider, but registration runs as service_role — so a subscription written
--    there would have skipped both the eligibility checks AND the snapshot
--    derivation, producing an enrolment with no frozen configuration at all.
--
--    Now service_role skips only the AUTHORISATION check (there is no signed-in
--    care-team member during self-registration). Derivation always runs, so the
--    frozen snapshot cannot be supplied or bypassed by any caller whatsoever.
--
--    The legacy branch is untouched: a service_role insert with no package still
--    returns immediately, exactly as before.
-- ---------------------------------------------------------------------------
create or replace function enforce_subscription_snapshot()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_centre uuid; v_name text; v_price integer; v_trial integer;
  v_pkg record;
  v_service_role boolean;
begin
  v_service_role := (request_role() = 'service_role');

  -- Legacy recovery path under service_role: byte-for-byte the 0028 behaviour.
  if v_service_role and new.service_package_id is null then
    return new;
  end if;

  select centre_id into v_centre from patients where id = new.patient_id;

  -- ---------------- universal service enrolment (0027 packages) -------------
  if new.service_package_id is not null then
    -- During self-registration there is no signed-in clinician to be staff.
    -- The invitation already established authority; everything below is still
    -- re-derived from the database regardless of who is calling.
    if not v_service_role and not is_staff() then
      raise exception 'Only the care team can enrol a patient into a programme';
    end if;

    select p.name, p.positioning, p.duration_days, p.monitoring_domains,
           p.checkin_frequency, p.review_frequency, p.support_level,
           p.includes, p.milestones, p.price, p.platform_fee_pct, p.currency,
           p.trial_days, p.status as pkg_status,
           s.id as svc_id, s.centre_id as svc_centre, s.status as svc_status,
           s.name as svc_name, s.programme_config, s.typical_duration_days
      into v_pkg
      from service_packages p
      join centre_services s on s.id = p.centre_service_id
     where p.id = new.service_package_id;

    if not found then
      raise exception 'That programme does not exist';
    end if;
    if v_pkg.svc_centre is distinct from v_centre then
      raise exception 'That programme belongs to another organisation';
    end if;
    if v_pkg.svc_status <> 'published' then
      raise exception 'That service has not been confirmed by the provider yet';
    end if;
    if v_pkg.pkg_status <> 'active' then
      raise exception 'That programme is not available';
    end if;

    -- Everything below is server-derived. Client values are discarded.
    new.centre_service_id := v_pkg.svc_id;
    new.recorded_by       := auth.uid();
    new.pay_mode          := 'pay_at_centre';
    new.plan_name         := v_pkg.name;
    new.price             := v_pkg.price;
    new.trial_days        := coalesce(v_pkg.trial_days, 0);
    if coalesce(v_pkg.trial_days, 0) > 0 then
      new.status     := 'trial';
      new.trial_ends := current_date + v_pkg.trial_days;
    else
      new.status     := 'active';
      new.trial_ends := null;
    end if;

    new.price_snapshot            := v_pkg.price;
    new.platform_fee_pct_snapshot := v_pkg.platform_fee_pct;   -- 20% (D-004)
    new.currency_snapshot         := coalesce(v_pkg.currency, 'INR');
    new.package_snapshot := jsonb_build_object(
      'service_name',          v_pkg.svc_name,
      'name',                  v_pkg.name,
      'positioning',           v_pkg.positioning,
      'duration_days',         v_pkg.duration_days,
      'monitoring_domains',    to_jsonb(coalesce(v_pkg.monitoring_domains, '{}')),
      'checkin_frequency',     v_pkg.checkin_frequency,
      'review_frequency',      v_pkg.review_frequency,
      'support_level',         v_pkg.support_level,
      'includes',              to_jsonb(coalesce(v_pkg.includes, '{}')),
      'milestones',            coalesce(v_pkg.milestones, '[]'::jsonb),
      'typical_duration_days', v_pkg.typical_duration_days
    );
    new.programme_config_snapshot := coalesce(v_pkg.programme_config, '{}'::jsonb);
    return new;
  end if;

  -- ---------------- legacy recovery package (unchanged from 0012) -----------
  select package_name, package_price, coalesce(trial_days, 0)
    into v_name, v_price, v_trial
    from centres where id = v_centre;

  new.recorded_by := auth.uid();
  new.pay_mode    := 'pay_at_centre';
  new.plan_name   := v_name;
  new.price       := v_price;
  new.trial_days  := v_trial;
  if v_trial > 0 then
    new.status     := 'trial';
    new.trial_ends := current_date + v_trial;
  else
    new.status     := 'active';
    new.trial_ends := null;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Registration and enrolment in ONE transaction.
--
--    The 4-argument function is replaced by a 5-argument one whose last
--    argument defaults to NULL, so every existing legacy call site and test
--    continues to work unchanged and takes exactly the old code path.
--
--    When an invite token IS supplied, the package is re-resolved HERE from the
--    token — the caller never names it — and the subscription is inserted in the
--    same transaction as the patient, membership and consent. If enrolment
--    fails for any reason the patient is never created, so there is no way to
--    end up with a registered family and no programme.
-- ---------------------------------------------------------------------------
drop function if exists register_patient_tx(uuid, uuid, jsonb, jsonb);

create or replace function register_patient_tx(
  p_centre uuid, p_family uuid, p_patient jsonb, p_consent jsonb,
  p_invite_token text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_patient uuid; v_invite record;
begin
  -- Resolve the invitation BEFORE creating anything, so an invalid or
  -- cross-centre invite fails before a patient exists.
  if p_invite_token is not null then
    select i.centre_id, i.service_package_id
      into v_invite
      from service_invites i
      join centre_services  s on s.id = i.centre_service_id
      join service_packages p on p.id = i.service_package_id
     where i.token = p_invite_token
       and i.revoked_at is null
       and s.status = 'published'
       and p.status = 'active';

    if not found then
      raise exception 'That registration link is no longer valid';
    end if;
    if v_invite.centre_id is distinct from p_centre then
      raise exception 'That registration link belongs to another organisation';
    end if;
  end if;

  update profiles
     set role = 'family', centre_id = p_centre, is_admin = false, must_reset_password = false
   where id = p_family;

  insert into patients (centre_id, full_name, age, sex, location, discharged_on, status, created_by)
  values (
    p_centre,
    p_patient->>'full_name',
    nullif(p_patient->>'age','')::int,
    nullif(p_patient->>'sex',''),
    nullif(p_patient->>'location',''),
    nullif(p_patient->>'discharged_on','')::date,
    'pending',
    p_family
  ) returning id into v_patient;

  insert into patient_members (patient_id, user_id, relation) values (v_patient, p_family, 'family');

  insert into consents (patient_id, granted_by, subject_name, relation_to_patient)
  values (
    v_patient, p_family,
    coalesce(nullif(p_consent->>'subject_name',''), 'Family member'),
    coalesce(nullif(p_consent->>'relation_to_patient',''), 'family')
  );

  -- Enrolment. Only the package id is written; the trigger above derives the
  -- frozen snapshot, price and 20% platform fee from the database.
  if p_invite_token is not null then
    insert into subscriptions (patient_id, service_package_id)
    values (v_patient, v_invite.service_package_id);
  end if;

  return v_patient;
end $$;

revoke execute on function register_patient_tx(uuid, uuid, jsonb, jsonb, text) from public, anon, authenticated;
grant  execute on function register_patient_tx(uuid, uuid, jsonb, jsonb, text) to service_role;
