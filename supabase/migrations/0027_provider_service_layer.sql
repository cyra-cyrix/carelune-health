-- ============================================================================
-- Carelune — 0027 · provider service layer.
--
--   *** DRAFT — verified on LOCAL Supabase only. Not applied to hosted. ***
--
-- WHY
-- ---
-- The Carelune pathway engine (0013) is the reusable *template library*:
-- `pathways` / `pathway_versions` are versioned, immutable once approved, joined
-- to `patients.pathway_version_id` and read server-side by the `generate-plan`
-- Edge Function. None of that changes here.
--
-- What is missing is the layer ABOVE it: the actual service a specific customer
-- sells, and the packages a patient can be enrolled into.
--
--     centres (workspace)
--       -> centre_services      (this migration)   "Dr Vivek Post-op Spine Recovery"
--          -> service_packages  (this migration)   "30-Day Essential" / "60-Day Guided"
--             -> subscriptions  (0009, unchanged)  the patient's enrollment
--                -> patient_plans (0016, unchanged) the doctor-approved plan
--
-- A centre_service MAY originate from a Carelune pathway/pathway_version, or it
-- may be entirely custom. Two providers can build completely different services
-- and packages on the same Spine template.
--
-- GOVERNANCE (docs/DECISIONS.md D-003)
-- ------------------------------------
--   * D-001 stands: institutions do NOT approve generic Carelune pathway
--     templates. `institution_pathways` is NOT used as an approval gate here.
--   * Super Admin is the only service configurator in MVP; all writes to these
--     tables go through the existing `platform-admin` service_role path.
--   * Level 1 = Super Admin confirms the structured configuration
--     (status -> 'pending_provider_confirmation').
--   * Level 2 = the DESIGNATED provider approver named on the service confirms
--     it, via `confirm_centre_service()` only (status -> 'published').
--   * Per-patient plan approval/activation (0025 / 0026) is untouched.
--
-- SCOPE OF THIS MIGRATION — deliberately additive only:
--   * nothing is renamed, dropped or migrated;
--   * no professional-role / capability refactor;
--   * no dynamic check-in tables;
--   * `subscriptions` is NOT altered here (see D-003 "later" note and 0028);
--   * the 30% -> 20% platform-fee change for the LEGACY surfaces is a separate
--     migration (0029); new packages here default to 20 from day one.
--
-- READINESS NOTE — NOT satisfied by this migration (D-003 open point 4)
-- --------------------------------------------------------------------
-- A custom (non-template) service can be CONFIGURED once this migration lands,
-- but it is NOT production-ready end to end. `generate-plan` tolerates a patient
-- with no pathway version, yet its prompt is rehab/recovery-oriented. Before the
-- first non-recovery custom service (e.g. lactation) goes live, generate-plan
-- must resolve subscription -> service_package -> centre_service ->
-- programme_config and use a service-aware/generic prompt, while retaining the
-- existing strict server-side validation and provenance rules.
--
-- SECURITY NOTE (0003 / 0005 trap)
-- --------------------------------
-- `alter default privileges in schema public` already grants
-- select/insert/update/delete on every NEW table to `authenticated` and
-- `service_role`. A new table is therefore fully granted the moment it is
-- created, and RLS is the only thing standing between a signed-in user of one
-- organisation and another organisation's rows. Both tables below enable RLS in
-- the same statement block that creates them, and the write privileges that the
-- default grant handed to `authenticated` are explicitly revoked.
--
-- HOW TO APPLY (once approved): Supabase dashboard -> SQL Editor -> paste -> Run.
-- Re-runs safely (idempotent).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. centre_services — the service a specific provider actually runs.
-- ---------------------------------------------------------------------------
create table if not exists centre_services (
  id            uuid primary key default gen_random_uuid(),
  centre_id     uuid not null references centres(id) on delete cascade,

  -- Identity (provider-facing, white-label: this is the customer's own name).
  name          text not null,                    -- "Dr Vivek Post-operative Spine Recovery"
  slug          text,                             -- stable key within the centre
  summary       text,

  -- Optional origin in the Carelune template library. NULL = fully custom.
  origin              text not null default 'custom'
                      check (origin in ('template','custom')),
  pathway_id          uuid references pathways(id) on delete set null,
  pathway_version_id  uuid references pathway_versions(id) on delete set null,

  -- Stage-2 service definition (freeze-pack "service" fields).
  patient_type           text,
  entry_point            text,
  typical_duration_days  integer check (typical_duration_days is null or typical_duration_days > 0),
  objective              text,
  end_condition          text,
  -- The professional who owns the service clinically (descriptive).
  owner_profile_id       uuid references profiles(id) on delete set null,
  supporting_disciplines text[] not null default '{}',

  -- The ONE person who may perform Level-2 confirmation for this service:
  -- the Service Owner / Provider Clinical Approver. Authority comes from being
  -- designated here, NOT from being an organisation administrator. Must be a
  -- clinical staff profile in the same centre (enforced by trigger), and must be
  -- set before the service can move to 'pending_provider_confirmation'.
  provider_approver_profile_id uuid references profiles(id) on delete restrict,

  -- Stage-4 programme configuration. Data-driven: sections, monitoring
  -- questions, milestones, education, routing, escalation references,
  -- patient-facing copy. Shape is validated in the Edge Function before it is
  -- written here (mirroring the generate-plan / pathwayValidation pattern);
  -- Postgres only guarantees it is an object.
  programme_config  jsonb not null default '{}'::jsonb
                    check (jsonb_typeof(programme_config) = 'object'),

  -- Revision without a second table: a published service is frozen, and a
  -- revision is a NEW draft row that supersedes it and is confirmed again at
  -- both levels.
  revision              integer not null default 1 check (revision > 0),
  supersedes_service_id uuid references centre_services(id) on delete set null,

  -- Two-level lifecycle.
  status text not null default 'draft'
         check (status in ('draft','pending_provider_confirmation','published','retired')),

  -- Level 1 · Super Admin confirmation.
  configured_by            uuid references auth.users(id),
  confirmed_by_platform_at timestamptz,
  confirmed_by_platform_by uuid references auth.users(id),

  -- Level 2 · designated provider approver (RPC only).
  confirmed_by_provider_at   timestamptz,
  confirmed_by_provider_by   uuid references auth.users(id),
  provider_confirmation_note text,

  published_at timestamptz,
  retired_at   timestamptz,

  -- Provenance / audit. Every configured service records where its content came
  -- from; AI-drafted configuration is never indistinguishable from human work.
  source_provenance text not null default 'super_admin'
                    check (source_provenance in ('super_admin','ai_drafted','provider_supplied')),
  ai_model      text,
  ai_drafted_at timestamptz,
  source_note   text,   -- free-text implementation note from the Carelune team

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (centre_id, slug)
);

create index if not exists centre_services_centre_status_idx on centre_services(centre_id, status);
create index if not exists centre_services_pathway_idx       on centre_services(pathway_id);
create index if not exists centre_services_version_idx       on centre_services(pathway_version_id);
create index if not exists centre_services_supersedes_idx    on centre_services(supersedes_service_id);
create index if not exists centre_services_approver_idx      on centre_services(provider_approver_profile_id);

alter table centre_services enable row level security;

-- ---------------------------------------------------------------------------
-- 2. service_packages — the patient-selectable variants of one service.
--
--    A package is not merely a price card: duration, monitoring domains,
--    check-in and review frequency, support level, milestones and the programme
--    inclusions are clinically meaningful configuration. They are frozen once
--    the parent service is published (section 5b).
-- ---------------------------------------------------------------------------
create table if not exists service_packages (
  id                uuid primary key default gen_random_uuid(),
  centre_service_id uuid not null references centre_services(id) on delete cascade,
  -- Denormalised for RLS: every policy is a plain centre comparison with no
  -- join. Server-derived from the parent by trigger — never trusted from a client.
  centre_id         uuid not null references centres(id) on delete cascade,

  name        text not null,                       -- "30-Day Essential"
  positioning text,                                -- one line of patient-facing framing
  sort_order  integer not null default 0,

  -- ---- clinically meaningful configuration (frozen after publication) ----
  duration_days      integer not null check (duration_days > 0),
  monitoring_domains text[] not null default '{}',
  checkin_frequency  text,
  review_frequency   text,
  support_level      text,
  milestones         jsonb not null default '[]'::jsonb
                     check (jsonb_typeof(milestones) = 'array'),
  includes           text[] not null default '{}',

  -- ---- commercial (the provider may revise these after publication) ----
  price            integer check (price is null or price >= 0),
  currency         text not null default 'INR',
  platform_fee_pct integer not null default 20 check (platform_fee_pct between 0 and 100),
  trial_days       integer not null default 0 check (trial_days >= 0),

  status text not null default 'draft'
         check (status in ('draft','active','retired')),

  source_provenance text not null default 'super_admin'
                    check (source_provenance in ('super_admin','ai_drafted','provider_supplied')),
  ai_model      text,
  ai_drafted_at timestamptz,

  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (centre_service_id, name)
);

create index if not exists service_packages_service_idx       on service_packages(centre_service_id, sort_order);
create index if not exists service_packages_centre_status_idx on service_packages(centre_id, status);

alter table service_packages enable row level security;

-- ---------------------------------------------------------------------------
-- 3. Grants. RLS is the real gate; these make the intent explicit and undo the
--    blanket write grant that default privileges (0003/0005) hand to
--    `authenticated` for every new table.
-- ---------------------------------------------------------------------------
-- REVOKE ALL, not just the DML verbs: Supabase's base setup grants ALL on new
-- public tables to `authenticated`, which includes TRUNCATE — and TRUNCATE is
-- NOT filtered by RLS. Revoking only insert/update/delete would leave every
-- signed-in user able to wipe the whole configuration table.
revoke all on centre_services  from anon, authenticated;
revoke all on service_packages from anon, authenticated;
grant select on centre_services, service_packages to authenticated;
grant select, insert, update, delete on centre_services, service_packages to service_role;

-- ---------------------------------------------------------------------------
-- 4. RLS policies.
--
--    READ  : same-centre STAFF only (nurse / duty_doctor / pmr). Household
--            accounts — patient, caregiver, family — get NO direct access to
--            these tables at all, at any status. A family member must never be
--            able to enumerate an organisation's service catalogue or price
--            list. In 0028 a patient reads only the service/package information
--            frozen into their OWN subscription. If public storefront
--            visibility is needed later it must be a deliberately scoped
--            RPC/token endpoint, never broad table RLS.
--    WRITE : no policy for `authenticated` at all -> every INSERT/UPDATE/DELETE
--            from a browser is denied. Configuration is written by the Super
--            Admin through the `platform-admin` Edge Function on service_role
--            (BYPASSRLS). The single provider-side write is the Level-2
--            confirmation RPC in section 6.
--
--    A Carelune Super Admin has no centre_id, so my_centre() is NULL and these
--    policies deny them in the browser — intentional, they act via the function.
-- ---------------------------------------------------------------------------
drop policy if exists centre_services_read on centre_services;
create policy centre_services_read on centre_services for select
  using (centre_id = (select my_centre()) and (select is_staff()));

drop policy if exists service_packages_read on service_packages;
create policy service_packages_read on service_packages for select
  using (centre_id = (select my_centre()) and (select is_staff()));

-- ---------------------------------------------------------------------------
-- 5. Integrity + immutability guards.
-- ---------------------------------------------------------------------------

-- 5a. centre_services: template consistency, a valid designated approver,
--     status transitions, and the freeze that makes a published service safe to
--     enroll patients against.
create or replace function public.enforce_centre_service()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_approver_centre uuid; v_approver_role app_role;
begin
  new.updated_at := now();

  -- A template-origin service must name its template; a custom one must not.
  if new.origin = 'template' and new.pathway_id is null then
    raise exception 'A template-origin service must reference a Carelune pathway';
  end if;
  if new.origin = 'custom' and (new.pathway_id is not null or new.pathway_version_id is not null) then
    raise exception 'A custom service must not reference a Carelune pathway version';
  end if;

  -- A named version must belong to the named pathway. NOTE: unlike
  -- enforce_patient_pathway (0015), this does NOT require the pack to be
  -- enabled for the institution — that gate is D-001 and is not restored here.
  if new.pathway_version_id is not null then
    if not exists (
      select 1 from pathway_versions v
      where v.id = new.pathway_version_id and v.pathway_id = new.pathway_id
    ) then
      raise exception 'That pathway version does not belong to the referenced pathway';
    end if;
  end if;

  -- The designated Level-2 approver must be clinical staff of THIS centre.
  -- Designation is the authority, so designation itself must be constrained:
  -- a household account could otherwise be handed clinical sign-off.
  if new.provider_approver_profile_id is not null then
    select p.centre_id, p.role into v_approver_centre, v_approver_role
      from profiles p where p.id = new.provider_approver_profile_id;
    if v_approver_centre is distinct from new.centre_id then
      raise exception 'The designated approver must belong to this organisation';
    end if;
    if v_approver_role not in ('nurse','duty_doctor','pmr') then
      raise exception 'The designated approver must be a clinical staff member';
    end if;
  end if;

  -- Level 1 cannot hand a service to the provider with nobody named to confirm it.
  if new.status = 'pending_provider_confirmation' and new.provider_approver_profile_id is null then
    raise exception 'A service awaiting provider confirmation must name its approver';
  end if;

  if tg_op = 'UPDATE' then
    -- A service never moves between organisations.
    if new.centre_id is distinct from old.centre_id then
      raise exception 'A service cannot be moved to another organisation';
    end if;

    -- Status transitions: forward only. A revision is a new draft row.
    if new.status is distinct from old.status then
      if not (
        (old.status = 'draft'                          and new.status in ('pending_provider_confirmation','retired'))
        or (old.status = 'pending_provider_confirmation' and new.status in ('draft','published','retired'))
        or (old.status = 'published'                    and new.status = 'retired')
      ) then
        raise exception 'Invalid service status transition: % -> %', old.status, new.status;
      end if;
    end if;

    -- Once published, the clinical/programme substance is frozen. Patients are
    -- enrolled against it; changing it under them is exactly what versioning
    -- exists to prevent (same rule as enforce_pathway_version_immutable, 0013).
    -- The approver is frozen too: re-pointing it would let a published service
    -- be re-confirmed by somebody else.
    if old.status = 'published' and new.status <> 'retired' then
      if new.programme_config is distinct from old.programme_config
         or new.pathway_version_id is distinct from old.pathway_version_id
         or new.origin is distinct from old.origin
         or new.provider_approver_profile_id is distinct from old.provider_approver_profile_id then
        raise exception 'A published service is immutable — create a new revision instead';
      end if;
    end if;

    if new.status = 'retired' and new.retired_at is null then
      new.retired_at := now();
    end if;
  end if;

  return new;
end $$;

drop trigger if exists centre_service_guard on centre_services;
create trigger centre_service_guard
  before insert or update on centre_services
  for each row execute function public.enforce_centre_service();

-- 5b. service_packages: centre_id is derived from the parent service, the
--     platform fee is server-held, a package cannot go live ahead of its
--     service, and its CLINICAL configuration is frozen once the parent service
--     has been confirmed and published.
--
--     Commercial fields (price, currency, trial_days, positioning, sort_order,
--     name, status) remain editable after publication. Everything that changes
--     what is clinically delivered does not: a change there requires a new
--     service revision, confirmed again at both levels. Patients already
--     enrolled get a second layer of protection from the 0028 subscription
--     snapshots.
create or replace function public.enforce_service_package()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_centre uuid; v_status text;
begin
  new.updated_at := now();

  select cs.centre_id, cs.status into v_centre, v_status
    from centre_services cs where cs.id = new.centre_service_id;
  if v_centre is null then
    raise exception 'That service does not exist';
  end if;

  -- Server-derived, always. A client-supplied centre_id can never widen access.
  new.centre_id := v_centre;

  -- Platform fee is never client-set (mirrors enforce_pathway_config, 0013).
  if request_role() <> 'service_role' then
    if tg_op = 'INSERT' then
      new.platform_fee_pct := 20;
    else
      new.platform_fee_pct := old.platform_fee_pct;
    end if;
  end if;

  if tg_op = 'INSERT' then
    -- Adding a package to a published service would introduce unconfirmed
    -- clinical configuration into a live service.
    if v_status = 'published' then
      raise exception 'A published service cannot gain a new package — create a new service revision';
    end if;
  else
    if new.centre_service_id is distinct from old.centre_service_id then
      raise exception 'A package cannot be moved to another service';
    end if;
    if v_status = 'published' then
      if new.duration_days      is distinct from old.duration_days
         or new.monitoring_domains is distinct from old.monitoring_domains
         or new.checkin_frequency  is distinct from old.checkin_frequency
         or new.review_frequency   is distinct from old.review_frequency
         or new.support_level      is distinct from old.support_level
         or new.milestones         is distinct from old.milestones
         or new.includes           is distinct from old.includes then
        raise exception 'The clinical configuration of a package in a published service is immutable — create a new service revision';
      end if;
    end if;
  end if;

  if new.status = 'active' and v_status <> 'published' then
    raise exception 'A package cannot be active before its service is published';
  end if;

  return new;
end $$;

drop trigger if exists service_package_guard on service_packages;
create trigger service_package_guard
  before insert or update on service_packages
  for each row execute function public.enforce_service_package();

-- ---------------------------------------------------------------------------
-- 6. Level-2 provider confirmation (the ONLY provider-side write).
--
--    Service-specific by construction: it takes one service id, checks it
--    belongs to the caller's own organisation, and publishes only that service.
--    It does not read or write `institution_pathways` — the D-001 gate is not
--    restored.
--
--    Who may confirm: the person DESIGNATED on the service as its Service Owner
--    / Provider Clinical Approver. Not the organisation administrator by virtue
--    of being an administrator, and not any staff member who happens to be
--    logged in. Designation is constrained at write time (section 5a) to a
--    clinical staff profile of the same centre.
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

  return v_row;
end $$;

-- 0011 lesson B1: Postgres grants EXECUTE to PUBLIC by default on new functions.
revoke execute on function public.confirm_centre_service(uuid, text) from public, anon;
grant  execute on function public.confirm_centre_service(uuid, text) to authenticated, service_role;

-- ============================================================================
-- Deliberately NOT in this migration:
--   * subscriptions.service_package_id + frozen commercial/programme snapshot,
--     and the patient's read path into their own enrollment                -> 0028
--   * centres/institution_pathway_config platform fee 30% -> 20%           -> 0029
--   * generate-plan resolving programme_config for custom services + a
--     service-aware prompt (required before the first non-recovery service) -> 0028+
--   * checkin_submissions / checkin_responses / care_dependents            -> later
--   * professional_roles + capability-based authorization                  -> last
--   * an immutable audit_events table (still outstanding since 0011); until it
--     exists, auditability rests on the stamped columns above.
-- ============================================================================
