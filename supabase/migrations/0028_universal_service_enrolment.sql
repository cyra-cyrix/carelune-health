-- ============================================================================
-- Carelune — 0028 · patient enrolment into a published service package.
--
--   *** DRAFT — verified on LOCAL Supabase only. Not applied to hosted. ***
--
-- WHY
-- ---
-- 0027 gave a provider a configured service and packages, and the Level-2
-- confirmation publishes it. This is the step that puts a PATIENT on one.
--
-- `subscriptions` (0009) is already the enrolment record — one row per patient,
-- enforced by subscriptions_patient_id_key — so it is EXTENDED here rather than
-- duplicated. There is no patient_enrolments table.
--
-- THE SNAPSHOT IS THE POINT
-- -------------------------
-- What a patient enrolled into must not change under them when the provider
-- edits a price or a later revision of the service appears. So the enrolment
-- freezes the package and the programme configuration onto the subscription row
-- at the moment of enrolment, and a guard makes those columns immutable
-- afterwards. The FKs are provenance; the snapshot is the source of truth.
--
-- NOTHING IS TRUSTED FROM THE BROWSER
-- -----------------------------------
-- The caller supplies a patient and a package id. Everything else — the
-- service, the name, duration, monitoring, cadences, milestones, includes,
-- price, platform fee, currency, programme outline — is read out of the
-- published package by enforce_subscription_snapshot(), which already existed
-- for the legacy path and now branches. A client that sends a price is ignored;
-- a client that sends an ineligible package is refused.
--
-- LEGACY RECOVERY IS UNTOUCHED
-- ----------------------------
-- Every new column is nullable and the legacy branch of the trigger is byte-for
-- byte what it was. A recovery subscription created by a family accepting the
-- centre package behaves exactly as before, with all new columns NULL. Nothing
-- here touches patients, patient_plans, pathway_versions or daily_readings, and
-- no existing recovery patient is migrated.
--
-- RLS IS NOT WIDENED
-- ------------------
-- No policy changes at all. The patient reads their own frozen snapshot through
-- the subscriptions_read policy they already have (can_see_patient); the
-- configuration tables stay staff-only exactly as 0027 left them.
--
-- ROLLBACK
-- --------
-- Additive. To reverse: drop trigger subscription_enrolment_immutable, drop
-- function enforce_subscription_immutable(), drop function
-- assign_service_package(uuid, uuid), restore enforce_subscription_snapshot()
-- to its 0012 body (the legacy branch below is that body verbatim), then drop
-- the seven columns. No data is rewritten by this migration, so nothing needs
-- restoring from backup.
--
-- HOW TO APPLY (once approved): Supabase dashboard -> SQL Editor -> paste -> Run.
-- Re-runs safely (idempotent).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The enrolment columns. All nullable: a legacy recovery subscription is a
--    valid row with every one of them NULL.
--
--    The FKs are ON DELETE SET NULL on purpose. If a service or package is ever
--    deleted, the patient's frozen snapshot must survive — they are still on
--    that programme. Losing the provenance link is acceptable; losing what the
--    patient enrolled into is not. (RESTRICT would also make deleting a centre
--    fail halfway through its cascade.)
-- ---------------------------------------------------------------------------
alter table subscriptions
  add column if not exists centre_service_id         uuid references centre_services(id) on delete set null,
  add column if not exists service_package_id        uuid references service_packages(id) on delete set null,
  add column if not exists package_snapshot          jsonb,
  add column if not exists programme_config_snapshot jsonb,
  add column if not exists price_snapshot            integer,
  add column if not exists platform_fee_pct_snapshot integer,
  add column if not exists currency_snapshot         text;

create index if not exists subscriptions_service_idx on subscriptions(centre_service_id);
create index if not exists subscriptions_package_idx on subscriptions(service_package_id);

comment on column subscriptions.package_snapshot is
  'What the patient enrolled into, frozen at enrolment. Never re-derived.';
comment on column subscriptions.programme_config_snapshot is
  'The service programme configuration as it stood at enrolment. Never re-derived.';

-- ---------------------------------------------------------------------------
-- 2. The snapshot trigger gains a branch.
--
--    Legacy branch: byte-for-byte the 0012 behaviour — the family accepts the
--    centre's package and the price/trial come from `centres`.
--
--    Enrolment branch: fires only when a service_package_id is present. It
--    verifies eligibility and then overwrites every derived field from the
--    database, so nothing a client sends can survive.
-- ---------------------------------------------------------------------------
create or replace function enforce_subscription_snapshot()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_centre uuid; v_name text; v_price integer; v_trial integer;
  v_pkg record;
begin
  if request_role() = 'service_role' then
    return new;  -- service_role paths trusted
  end if;

  select centre_id into v_centre from patients where id = new.patient_id;

  -- ---------------- universal service enrolment (0027 packages) -------------
  if new.service_package_id is not null then
    if not is_staff() then
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
-- 3. The enrolment is frozen once made.
--
--    A provider may still work the subscription — settling it at the centre
--    flips trial -> active, and that must keep working. What they may not do is
--    change what the patient enrolled into. A later edit to the package, or a
--    new revision of the service, leaves this patient exactly where they were;
--    future patients get the newer one.
--
--    This also blocks converting a legacy recovery subscription into a service
--    enrolment, which is a migration, not an enrolment (deliberately deferred).
-- ---------------------------------------------------------------------------
create or replace function enforce_subscription_immutable()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if request_role() = 'service_role' then
    return new;
  end if;

  if old.service_package_id is null and new.service_package_id is not null then
    raise exception 'This patient already has a subscription — moving them onto a service programme is a migration, not an enrolment';
  end if;

  if old.service_package_id is not null then
    if new.service_package_id        is distinct from old.service_package_id
       or new.centre_service_id         is distinct from old.centre_service_id
       or new.package_snapshot          is distinct from old.package_snapshot
       or new.programme_config_snapshot is distinct from old.programme_config_snapshot
       or new.price_snapshot            is distinct from old.price_snapshot
       or new.platform_fee_pct_snapshot is distinct from old.platform_fee_pct_snapshot
       or new.currency_snapshot         is distinct from old.currency_snapshot
       or new.plan_name                 is distinct from old.plan_name
       or new.price                     is distinct from old.price then
      raise exception 'An enrolled programme is frozen — the patient continues on the configuration they enrolled into';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists subscription_enrolment_immutable on subscriptions;
create trigger subscription_enrolment_immutable
  before update on subscriptions
  for each row execute function enforce_subscription_immutable();

-- ---------------------------------------------------------------------------
-- 4. The one call a provider makes.
--
--    The browser sends a patient and a package. Nothing else is read from the
--    request. Eligibility is checked here AND again in the trigger, so a direct
--    table insert cannot get round it.
--
--    One active programme per patient is already the schema's rule
--    (subscriptions_patient_id_key is UNIQUE on patient_id); this refuses
--    explicitly rather than surfacing a constraint violation.
-- ---------------------------------------------------------------------------
create or replace function public.assign_service_package(p_patient uuid, p_package uuid)
returns subscriptions
language plpgsql security definer set search_path = public as $$
declare v_row subscriptions; v_existing subscriptions;
begin
  if not is_staff() then
    raise exception 'Only the care team can enrol a patient into a programme';
  end if;
  if not can_see_patient(p_patient) then
    raise exception 'That patient is not yours to enrol';
  end if;

  select * into v_existing from subscriptions where patient_id = p_patient;
  if found then
    if v_existing.service_package_id is not null then
      raise exception 'This patient is already enrolled in a programme';
    end if;
    raise exception 'This patient is already on the centre package';
  end if;

  insert into subscriptions (patient_id, service_package_id)
  values (p_patient, p_package)
  returning * into v_row;

  return v_row;
end $$;

-- 0011 lesson B1: Postgres grants EXECUTE to PUBLIC by default on new functions.
revoke execute on function public.assign_service_package(uuid, uuid) from public, anon;
grant  execute on function public.assign_service_package(uuid, uuid) to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 5. Confirming a service brings its packages to life.
--
--    0027 created packages as `draft` and refused to let one go active ahead of
--    its service. The provider's Level-2 confirmation is exactly the moment
--    they become real, so it now activates them — otherwise a confirmed service
--    has nothing a patient can be enrolled into, which is what enrolment found.
--
--    The body is 0027's, with the package activation added after publication so
--    the parent is already published when the package guard checks it.
-- ---------------------------------------------------------------------------
create or replace function public.confirm_centre_service(p_service uuid, p_note text default null)
returns centre_services
language plpgsql security definer set search_path = public as $$
declare v_row centre_services;
begin
  select * into v_row from centre_services where id = p_service;
  if v_row.id is null then
    raise exception 'Service not found';
  end if;
  if v_row.centre_id is distinct from my_centre() then
    raise exception 'You can only confirm a service configured for your own organisation';
  end if;
  if v_row.provider_approver_profile_id is distinct from auth.uid() then
    raise exception 'Only the designated approver for this service may confirm it';
  end if;
  if v_row.status <> 'pending_provider_confirmation' then
    raise exception 'This service is not awaiting provider confirmation (status: %)', v_row.status;
  end if;

  update centre_services set
    status                     = 'published',
    confirmed_by_provider_at   = now(),
    confirmed_by_provider_by   = auth.uid(),
    provider_confirmation_note = p_note,
    published_at               = coalesce(published_at, now())
  where id = p_service
  returning * into v_row;

  -- The packages the operator configured become selectable for patients.
  update service_packages set status = 'active'
   where centre_service_id = p_service and status = 'draft';

  return v_row;
end $$;

revoke execute on function public.confirm_centre_service(uuid, text) from public, anon;
grant  execute on function public.confirm_centre_service(uuid, text) to authenticated, service_role;

-- ============================================================================
-- Deliberately NOT in this migration:
--   * the legacy 30% -> 20% platform fee change for `centres` /
--     institution_pathway_config (D-004) — new enrolments already snapshot 20%
--     from the package, so this flow does not need it     -> separate migration
--   * moving existing recovery patients onto the service engine  -> later phase
--   * checkin_submissions / checkin_responses / care_dependents  -> later phases
--   * any change to patients, patient_plans, pathway_versions, daily_readings
-- ============================================================================
