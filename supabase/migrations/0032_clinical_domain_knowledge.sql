-- ============================================================================
-- Carelune — 0032 · Clinical Domain, Knowledge Pack, Care Intent, and the
--                   universal care-activity definition.
--
--   *** Verified on LOCAL Supabase only. Not applied to production. ***
--
-- WHY
-- ---
-- 0027 gave a provider a configured SERVICE and packages; 0028 enrols a patient
-- into one and freezes it. What is still missing is everything ABOVE the service
-- (which body of care does this service belong to, and what does Carelune know
-- about it) and everything BELOW the package (what does the patient actually do
-- on a given morning).
--
-- This migration adds both, additively:
--
--   clinical_domains   the reusable Carelune-level grouping — "Neuro
--                      Rehabilitation & Stroke", "Mother & Baby". NOT five
--                      applications: one row, referenced by services.
--   knowledge_packs    a VERSIONED body of evidence for one domain. Structured
--                      metadata + knowledge objects live here; source documents
--                      live in Storage and are referenced by knowledge_sources.
--   knowledge_sources  one row per citation/document backing a pack.
--   centre_services    gains clinical_domain_id, knowledge_pack_id, care_intent
--                      and programme_activities.
--   subscriptions      gains activity_snapshot, frozen at enrolment like the
--                      package snapshot beside it.
--
-- WHAT THIS IS NOT
-- ----------------
-- This is NOT the retired pathway engine returning. `pathway_packs` is keyed to
-- three specialties (spine/joint/neuro), is tied to the D-001 institution
-- approval gate, and gates the legacy per-patient plan. Nothing here touches it,
-- reads it, or restores any approval it removed. A clinical domain carries no
-- authority: it selects knowledge and groups services. Publishing a service is
-- still the two-level D-003 confirmation, unchanged.
--
-- KNOWLEDGE IS NEVER PATIENT-FACING
-- ---------------------------------
-- No household account can read clinical_domains, knowledge_packs or
-- knowledge_sources at any status. Raw knowledge reaches a patient only after it
-- has been compiled into a candidate programme AND approved by a clinician
-- (0033). RLS here is staff-read / service_role-write, exactly as 0027 left the
-- configuration tables.
--
-- LEGACY IS UNTOUCHED
-- -------------------
-- Every column added is nullable or defaulted. A legacy recovery centre, a
-- service with no domain, and an enrolment made before this migration are all
-- valid rows afterwards. No existing trigger changes behaviour for them.
--
-- HOW TO APPLY (once approved): Supabase dashboard -> SQL Editor -> paste -> Run.
-- Re-runs safely (idempotent).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Clinical domains. Platform reference data — Carelune owns this list; a
--    provider selects from it and never creates one (explicitly out of scope).
-- ---------------------------------------------------------------------------
create table if not exists clinical_domains (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,          -- stable machine key, e.g. 'neuro_rehab_stroke'
  name        text not null,                 -- operator-facing, e.g. 'Neuro Rehabilitation & Stroke'
  summary     text,
  sort_order  integer not null default 0,
  status      text not null default 'active' check (status in ('active','retired')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists clinical_domains_status_idx on clinical_domains(status, sort_order);

alter table clinical_domains enable row level security;

-- ---------------------------------------------------------------------------
-- 2. Knowledge packs. One domain may have many; only one is 'published' at a
--    time in practice, but history is kept so a service can stay pinned to the
--    version it was configured against.
--
--    `knowledge` holds STRUCTURED objects — candidate care activities, patient
--    education references, provider protocol guidance — not prose. It is
--    deliberately one jsonb object rather than a wide table: the shape is
--    validated in the Edge Function before it is written (the serviceDraft
--    pattern), and Postgres guarantees only that it is an object.
-- ---------------------------------------------------------------------------
create table if not exists knowledge_packs (
  id                 uuid primary key default gen_random_uuid(),
  clinical_domain_id uuid not null references clinical_domains(id) on delete cascade,

  version    integer not null check (version > 0),
  title      text not null,
  summary    text,

  -- Structured knowledge. See src/domain/knowledgePack.ts for the shape:
  --   { candidate_activities: [...], education: [...], protocol_guidance: [...] }
  knowledge  jsonb not null default '{}'::jsonb
             check (jsonb_typeof(knowledge) = 'object'),

  -- Evidence metadata about the pack as a whole (who compiled it, from what
  -- bodies of guidance, when it was last reviewed).
  evidence   jsonb not null default '{}'::jsonb
             check (jsonb_typeof(evidence) = 'object'),

  status text not null default 'draft'
         check (status in ('draft','in_review','published','retired')),

  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  review_note text,

  source_provenance text not null default 'carelune_curated'
                    check (source_provenance in ('carelune_curated','ai_drafted','provider_supplied')),
  ai_model      text,
  ai_drafted_at timestamptz,

  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (clinical_domain_id, version)
);

create index if not exists knowledge_packs_domain_status_idx
  on knowledge_packs(clinical_domain_id, status, version desc);

alter table knowledge_packs enable row level security;

-- ---------------------------------------------------------------------------
-- 3. Knowledge sources. One row per citation. `storage_path` points into the
--    private `knowledge-docs` bucket when the source is a document Carelune
--    holds; `url` is used when it is a public reference.
-- ---------------------------------------------------------------------------
create table if not exists knowledge_sources (
  id                uuid primary key default gen_random_uuid(),
  knowledge_pack_id uuid not null references knowledge_packs(id) on delete cascade,

  title        text not null,
  publisher    text,
  kind         text not null default 'guideline'
               check (kind in ('guideline','review','trial','textbook','provider_document','other')),
  url          text,
  storage_path text,
  citation     text,
  published_on date,
  sort_order   integer not null default 0,

  created_at timestamptz not null default now()
);

create index if not exists knowledge_sources_pack_idx on knowledge_sources(knowledge_pack_id, sort_order);

alter table knowledge_sources enable row level security;

-- ---------------------------------------------------------------------------
-- 4. Grants.
--
--    The 0027 lesson, restated because it keeps mattering: Supabase's base
--    setup grants ALL on every new public table to `authenticated`, and ALL
--    includes TRUNCATE — which RLS does NOT filter. Revoking only the DML verbs
--    would leave every signed-in user able to empty these tables. So: revoke
--    everything, then hand back reads only.
-- ---------------------------------------------------------------------------
revoke all on clinical_domains  from anon, authenticated;
revoke all on knowledge_packs   from anon, authenticated;
revoke all on knowledge_sources from anon, authenticated;

grant select on clinical_domains, knowledge_packs, knowledge_sources to authenticated;
grant select, insert, update, delete
  on clinical_domains, knowledge_packs, knowledge_sources to service_role;

-- ---------------------------------------------------------------------------
-- 5. RLS.
--
--    READ : clinical STAFF only (nurse / duty_doctor / pmr). A household
--           account — patient, caregiver, family — gets NO access to any of
--           these tables at any status. Knowledge is professional reference
--           material; it reaches a patient only as an approved programme.
--    WRITE: no policy for `authenticated` at all. Every write is service_role
--           through the platform-admin Edge Function.
--
--    A Super Admin has no centre_id and is denied by these policies in the
--    browser — intentional and consistent with 0027: they act via the function.
-- ---------------------------------------------------------------------------
drop policy if exists clinical_domains_read on clinical_domains;
create policy clinical_domains_read on clinical_domains for select
  using ((select is_staff()));

drop policy if exists knowledge_packs_read on knowledge_packs;
create policy knowledge_packs_read on knowledge_packs for select
  using ((select is_staff()));

drop policy if exists knowledge_sources_read on knowledge_sources;
create policy knowledge_sources_read on knowledge_sources for select
  using ((select is_staff()));

-- ---------------------------------------------------------------------------
-- 6. Private storage for source documents.
--
--    No policies are created for this bucket, so no browser client of any role
--    can read or write it. Documents are put there and signed for by
--    service_role. This is deliberate: a knowledge document is not patient data
--    and must not travel through the patient document path.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('knowledge-docs', 'knowledge-docs', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 7. centre_services gains its place in the hierarchy:
--       Institution -> Clinical Domain -> Care Intent -> Service -> Package
--
--    All nullable/defaulted. A legacy recovery centre, and every service
--    configured before today, stays valid.
--
--    `programme_activities` is the provider-approved default set of care
--    activities for this service — what a patient on it would do, before that
--    patient's own clinical information narrows it. Validated in the Edge
--    Function against the closed vocabulary in src/domain/careActivityModel.ts.
-- ---------------------------------------------------------------------------
alter table centre_services
  add column if not exists clinical_domain_id uuid references clinical_domains(id) on delete set null,
  add column if not exists knowledge_pack_id  uuid references knowledge_packs(id)  on delete set null,
  add column if not exists care_intent        text,
  add column if not exists programme_activities jsonb not null default '[]'::jsonb;

do $$ begin
  alter table centre_services
    add constraint centre_services_care_intent_check
    check (care_intent is null or care_intent in (
      'rehabilitation',
      'post_discharge_recovery',
      'supportive_care',
      'long_term_management',
      'monitoring',
      'maternal_support'
    ));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table centre_services
    add constraint centre_services_programme_activities_check
    check (jsonb_typeof(programme_activities) = 'array');
exception when duplicate_object then null; end $$;

create index if not exists centre_services_domain_idx on centre_services(clinical_domain_id);
create index if not exists centre_services_pack_idx   on centre_services(knowledge_pack_id);

comment on column centre_services.programme_activities is
  'Provider-approved default care activities for this service. Frozen onto each enrolment; narrowed per patient by the compiler and a clinician.';

-- 7b. A named knowledge pack must belong to the named domain. Without this a
--     service could be configured against another domain''s evidence.
create or replace function public.enforce_service_domain_pack()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_pack_domain uuid;
begin
  if new.knowledge_pack_id is not null then
    if new.clinical_domain_id is null then
      raise exception 'A knowledge pack cannot be selected without a clinical domain';
    end if;
    select clinical_domain_id into v_pack_domain from knowledge_packs where id = new.knowledge_pack_id;
    if v_pack_domain is distinct from new.clinical_domain_id then
      raise exception 'That knowledge pack belongs to a different clinical domain';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists centre_service_domain_pack on centre_services;
create trigger centre_service_domain_pack
  before insert or update on centre_services
  for each row execute function public.enforce_service_domain_pack();

-- ---------------------------------------------------------------------------
-- 8. subscriptions gains the activity snapshot.
--
--    Same principle as 0028's package_snapshot and for the same reason: what a
--    patient enrolled into must not move under them when the provider revises
--    the service. NULL for every legacy recovery subscription and for every
--    enrolment made before this migration.
-- ---------------------------------------------------------------------------
alter table subscriptions
  add column if not exists activity_snapshot jsonb;

comment on column subscriptions.activity_snapshot is
  'The service programme_activities as they stood at enrolment. Never re-derived.';

-- 8b. Freeze it at enrolment, and make it immutable afterwards.
--
--     Both functions are REPLACED here rather than rewritten: the bodies below
--     are 0031's and 0028's respectively, with the activity snapshot added.
--     Every other branch — the narrowed service_role bypass, the legacy path,
--     the eligibility checks — is byte-for-byte what it was.
create or replace function enforce_subscription_snapshot()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_centre uuid; v_name text; v_price integer; v_trial integer;
  v_pkg record; v_service_role boolean;
begin
  v_service_role := (request_role() = 'service_role');

  -- Legacy recovery path under service_role: byte-for-byte the 0028 behaviour.
  if v_service_role and new.service_package_id is null then
    return new;
  end if;

  select centre_id into v_centre from patients where id = new.patient_id;

  -- ---------------- universal service enrolment (0027 packages) -------------
  if new.service_package_id is not null then
    if not v_service_role and not is_staff() then
      raise exception 'Only the care team can enrol a patient into a programme';
    end if;

    select p.name, p.positioning, p.duration_days, p.monitoring_domains,
           p.checkin_frequency, p.review_frequency, p.support_level,
           p.includes, p.milestones, p.price, p.platform_fee_pct, p.currency,
           p.trial_days, p.status as pkg_status,
           s.id as svc_id, s.centre_id as svc_centre, s.status as svc_status,
           s.name as svc_name, s.programme_config, s.typical_duration_days,
           s.programme_activities, s.clinical_domain_id, s.care_intent
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
      'typical_duration_days', v_pkg.typical_duration_days,
      'clinical_domain_id',    v_pkg.clinical_domain_id,
      'care_intent',           v_pkg.care_intent
    );
    new.programme_config_snapshot := coalesce(v_pkg.programme_config, '{}'::jsonb);
    new.activity_snapshot         := coalesce(v_pkg.programme_activities, '[]'::jsonb);
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
       or new.activity_snapshot         is distinct from old.activity_snapshot
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

-- ---------------------------------------------------------------------------
-- 9. The five initial clinical domains.
--
--    Names only. Populating a knowledge pack is separate work and only Neuro is
--    the reference domain today — the other four exist so a service can be
--    grouped, not so five products can be built.
-- ---------------------------------------------------------------------------
insert into clinical_domains (key, name, summary, sort_order) values
  ('neuro_rehab_stroke',   'Neuro Rehabilitation & Stroke',
   'Continuing care after stroke and other acquired neurological injury.', 1),
  ('ortho_spine_recovery', 'Orthopaedic & Spine Recovery',
   'Recovery after orthopaedic and spinal procedures.', 2),
  ('cardioresp_continuum', 'Cardiorespiratory Continuum',
   'Continuing care for cardiac and respiratory conditions.', 3),
  ('mother_baby',          'Mother & Baby / Postpartum & Lactation',
   'Postpartum recovery, infant feeding and lactation support.', 4),
  ('oncology_supportive',  'Oncology Supportive & Survivorship',
   'Supportive care during and after cancer treatment.', 5)
on conflict (key) do nothing;

-- Let PostgREST see the new tables/columns immediately.
notify pgrst, 'reload schema';

-- ============================================================================
-- Done. Additive throughout. To reverse: drop the trigger/function added here
-- and restore enforce_subscription_snapshot/_immutable to their 0031/0028
-- bodies, drop the four centre_services columns and subscriptions.activity_
-- snapshot, then drop the three tables. No existing row is rewritten.
-- ============================================================================
