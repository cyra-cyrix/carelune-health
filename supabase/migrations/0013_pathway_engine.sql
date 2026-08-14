-- ============================================================================
-- Carelune — governed Pathway Engine (run AFTER 0012). Idempotent.
--
-- Platform-governed clinical pathways for the three Continuum Care programmes
-- (Spine / Joint / Neuro). Clinical content is authored once, stored as compact
-- VERSIONED config, and must be doctor-approved before clinical use. Institutions
-- can only use pathway packs a Super Admin has ASSIGNED to them (they cannot
-- self-enable via the API); institutions may edit only commercial fields.
--
-- Security model:
--   * pathway_packs / pathways / pathway_versions / pathway_sources: platform
--     catalogue — READ by any authenticated user, WRITE by service_role only
--     (Super Admin via platform-admin). No PHI.
--   * institution_pathways: which packs a centre has (super-admin assigned).
--     Staff READ their own centre's rows; only service_role may INSERT/UPDATE
--     `enabled` — enforced by having NO write policy for authenticated.
--   * institution_pathway_config: HOD-editable commercial fields, only for packs
--     already enabled for the centre (trigger); platform_fee_pct is server-held.
--
-- All seeded pathways are 'draft' / 'clinically_review_required' — never
-- 'approved' — until an authorised clinician signs off.
--
-- HOW TO APPLY: Supabase dashboard -> SQL Editor -> paste this file -> Run.
-- ============================================================================

do $$ begin
  if not exists (select 1 from pg_type where typname = 'pathway_status') then
    create type pathway_status as enum ('draft','clinically_review_required','approved','retired');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Catalogue tables (platform-governed, no PHI).
-- ---------------------------------------------------------------------------
create table if not exists pathway_packs (
  id          uuid primary key default gen_random_uuid(),
  key         text unique not null check (key in ('spine','joint','neuro')),
  name        text not null,
  specialty   text not null,
  description text,
  status      pathway_status not null default 'draft',
  created_at  timestamptz not null default now()
);

create table if not exists pathways (
  id                    uuid primary key default gen_random_uuid(),
  pack_id               uuid not null references pathway_packs(id) on delete cascade,
  key                   text not null,
  name                  text not null,
  applicable_procedures text[],
  eligibility           text,
  exclusions            text,
  status                pathway_status not null default 'clinically_review_required',
  created_at            timestamptz not null default now(),
  unique (pack_id, key)
);

create table if not exists pathway_versions (
  id          uuid primary key default gen_random_uuid(),
  pathway_id  uuid not null references pathways(id) on delete cascade,
  version     integer not null,
  config      jsonb not null,
  status      pathway_status not null default 'draft',
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_at  timestamptz not null default now(),
  unique (pathway_id, version)
);

create table if not exists pathway_sources (
  id               uuid primary key default gen_random_uuid(),
  pathway_id       uuid references pathways(id) on delete cascade,
  organisation     text not null,
  title            text not null,
  jurisdiction     text not null,
  published_on     text,
  url              text,
  supports_element text,
  created_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Institution assignment + commercial config.
-- ---------------------------------------------------------------------------
create table if not exists institution_pathways (
  id          uuid primary key default gen_random_uuid(),
  centre_id   uuid not null references centres(id) on delete cascade,
  pack_id     uuid not null references pathway_packs(id) on delete cascade,
  enabled     boolean not null default true,
  assigned_at timestamptz not null default now(),
  unique (centre_id, pack_id)
);

create table if not exists institution_pathway_config (
  id               uuid primary key default gen_random_uuid(),
  centre_id        uuid not null references centres(id) on delete cascade,
  pack_id          uuid not null references pathway_packs(id) on delete cascade,
  price            integer,
  trial_days       integer not null default 0,
  duration_days    integer,
  included         text,
  platform_fee_pct integer not null default 30,
  updated_at       timestamptz not null default now(),
  unique (centre_id, pack_id)
);

-- ---------------------------------------------------------------------------
-- Indexes (FKs + RLS filter columns).
-- ---------------------------------------------------------------------------
create index if not exists pathways_pack_idx           on pathways(pack_id);
create index if not exists pathway_versions_pathway_idx on pathway_versions(pathway_id);
create index if not exists pathway_sources_pathway_idx  on pathway_sources(pathway_id);
create index if not exists inst_pathways_centre_idx     on institution_pathways(centre_id);
create index if not exists inst_pathway_cfg_centre_idx  on institution_pathway_config(centre_id);

-- ---------------------------------------------------------------------------
-- RLS + grants.
-- ---------------------------------------------------------------------------
alter table pathway_packs             enable row level security;
alter table pathways                  enable row level security;
alter table pathway_versions          enable row level security;
alter table pathway_sources           enable row level security;
alter table institution_pathways      enable row level security;
alter table institution_pathway_config enable row level security;

grant select on pathway_packs, pathways, pathway_versions, pathway_sources, institution_pathways to authenticated;
grant select, insert, update on institution_pathway_config to authenticated;
grant select, insert, update, delete on
  pathway_packs, pathways, pathway_versions, pathway_sources, institution_pathways, institution_pathway_config
  to service_role;

-- Catalogue: readable by any authenticated user; writes are service_role only
-- (no write policy => authenticated cannot write even with table grants).
drop policy if exists pathway_packs_read on pathway_packs;
create policy pathway_packs_read on pathway_packs for select to authenticated using (true);
drop policy if exists pathways_read on pathways;
create policy pathways_read on pathways for select to authenticated using (true);
drop policy if exists pathway_versions_read on pathway_versions;
create policy pathway_versions_read on pathway_versions for select to authenticated using (true);
drop policy if exists pathway_sources_read on pathway_sources;
create policy pathway_sources_read on pathway_sources for select to authenticated using (true);

-- institution_pathways: staff read their centre's assignments; NO authenticated
-- write policy => only service_role (Super Admin) can enable a pack.
drop policy if exists inst_pathways_read on institution_pathways;
create policy inst_pathways_read on institution_pathways for select to authenticated
  using (centre_id = (select my_centre()));

-- institution_pathway_config: the org admin manages commercial fields for their
-- own centre; the enabled-pack + fee rules are enforced by the trigger below.
drop policy if exists inst_pathway_cfg_read on institution_pathway_config;
create policy inst_pathway_cfg_read on institution_pathway_config for select to authenticated
  using (centre_id = (select my_centre()) and (select is_admin_user()));
drop policy if exists inst_pathway_cfg_write on institution_pathway_config;
create policy inst_pathway_cfg_write on institution_pathway_config for insert to authenticated
  with check (centre_id = (select my_centre()) and (select is_admin_user()));
drop policy if exists inst_pathway_cfg_update on institution_pathway_config;
create policy inst_pathway_cfg_update on institution_pathway_config for update to authenticated
  using (centre_id = (select my_centre()) and (select is_admin_user()))
  with check (centre_id = (select my_centre()) and (select is_admin_user()));

-- ---------------------------------------------------------------------------
-- Governance triggers.
-- ---------------------------------------------------------------------------

-- An approved pathway version is immutable — a change requires a new version.
create or replace function enforce_pathway_version_immutable()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'approved' and (new.config is distinct from old.config) then
    raise exception 'An approved pathway version is immutable; create a new version';
  end if;
  return new;
end $$;
drop trigger if exists pathway_version_immutable_guard on pathway_versions;
create trigger pathway_version_immutable_guard
  before update on pathway_versions
  for each row execute function enforce_pathway_version_immutable();

-- A commercial config row may only exist for a pack ENABLED for that centre, and
-- platform_fee_pct is server-held (never client-set) for authenticated callers.
create or replace function enforce_pathway_config()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if request_role() <> 'service_role' then
    if tg_op = 'INSERT' then
      new.platform_fee_pct := 30;
    else
      new.platform_fee_pct := old.platform_fee_pct;
    end if;
    if not exists (
      select 1 from institution_pathways ip
      where ip.centre_id = new.centre_id and ip.pack_id = new.pack_id and ip.enabled
    ) then
      raise exception 'This pathway is not enabled for your institution';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists pathway_config_guard on institution_pathway_config;
create trigger pathway_config_guard
  before insert or update on institution_pathway_config
  for each row execute function enforce_pathway_config();

-- ---------------------------------------------------------------------------
-- Seed the three governed packs (idempotent: only if the catalogue is empty).
-- All content is draft / clinically_review_required — never approved.
-- ---------------------------------------------------------------------------
do $$
declare v_spine uuid; v_joint uuid; v_neuro uuid; p uuid;
begin
  if exists (select 1 from pathway_packs) then return; end if;

  insert into pathway_packs (key, name, specialty, description, status) values
    ('spine','Spine Recovery','Spine surgery','Post-operative recovery continuity for selected spine procedures.','draft'),
    ('joint','Joint Replacement Recovery','Orthopaedics — arthroplasty','Recovery continuity after total knee / total hip replacement.','draft'),
    ('neuro','Neuro-Rehabilitation Continuity','Neuro-rehabilitation','Home continuity for selected medically stable patients after neuro-rehabilitation.','draft');

  select id into v_spine from pathway_packs where key='spine';
  select id into v_joint from pathway_packs where key='joint';
  select id into v_neuro from pathway_packs where key='neuro';

  -- ---- SPINE pathways ----
  insert into pathways (pack_id, key, name, applicable_procedures, eligibility, exclusions, status) values
    (v_spine,'lumbar_discectomy','Lumbar discectomy', array['Microdiscectomy','Open discectomy'],
      'Medically stable adult discharged home after lumbar discectomy.',
      'Unstable neurology, active infection, unhealed complex wound.','draft'),
    (v_spine,'decompression','Lumbar decompression', array['Laminectomy','Laminotomy'],
      'Medically stable adult discharged home after lumbar decompression.',
      'Unstable neurology, active infection.','draft'),
    (v_spine,'lumbar_fusion','Lumbar spinal fusion', array['Posterior lumbar fusion','TLIF','PLIF'],
      'Medically stable adult discharged home after lumbar fusion.',
      'Unstable neurology, active/uncontrolled infection, unhealed complex wound, haemodynamic instability.','clinically_review_required'),
    (v_spine,'cervical','Selected cervical procedures', array['ACDF','Cervical decompression'],
      'Medically stable adult discharged home after a selected cervical procedure.',
      'Airway concern, unstable neurology, new myelopathic signs.','draft');

  select id into p from pathways where pack_id=v_spine and key='lumbar_fusion';
  insert into pathway_versions (pathway_id, version, status, config) values (p, 1, 'clinically_review_required', $j$
  {
    "content_status": "clinically_review_required",
    "phases": [
      {"key":"acute","name":"Early recovery (Day 0-14)","from_day":0,"to_day":14},
      {"key":"subacute","name":"Consolidation (Week 2-6)","from_day":15,"to_day":42},
      {"key":"functional","name":"Functional recovery (Week 6-12)","from_day":43,"to_day":84}
    ],
    "modules": [
      {"key":"diagnosis_procedure","recorded_by":"doctor","frequency":"once"},
      {"key":"medicines","recorded_by":"doctor","frequency":"as_needed"},
      {"key":"pain","recorded_by":"caregiver","frequency":"daily","fields":["score_0_10","location"]},
      {"key":"radiating_pain","recorded_by":"caregiver","frequency":"daily"},
      {"key":"numbness_weakness","recorded_by":"caregiver","frequency":"daily"},
      {"key":"mobility_function","recorded_by":"caregiver","frequency":"daily","fields":["walking_minutes","assistance"]},
      {"key":"wound_care","recorded_by":"caregiver","frequency":"daily","fields":["appearance","discharge"]},
      {"key":"vitals","recorded_by":"caregiver","frequency":"daily","fields":["temperature"]},
      {"key":"bowel_bladder","recorded_by":"caregiver","frequency":"daily"},
      {"key":"physiotherapy","recorded_by":"therapist","frequency":"per_visit"},
      {"key":"spine_precautions","recorded_by":"doctor","frequency":"once"},
      {"key":"milestones","recorded_by":"nurse","frequency":"weekly"},
      {"key":"questions_concerns","recorded_by":"family","frequency":"as_needed"}
    ],
    "milestones": [
      {"key":"sit_stand","name":"Sit-to-stand with minimal help","by_day":3,"phase":"acute"},
      {"key":"walk_indoor","name":"Walking indoors with an aid","by_day":7,"phase":"acute"},
      {"key":"wound_reviewed","name":"Wound reviewed / sutures checked","by_day":14,"phase":"acute"},
      {"key":"walk_unaided","name":"Walking unaided short distances","by_day":42,"phase":"subacute"}
    ],
    "warning_signs": [
      {"key":"fever","text":"Temperature 38C or higher","severity":"urgent"},
      {"key":"wound","text":"Increasing wound redness, swelling or discharge","severity":"urgent"},
      {"key":"new_weakness","text":"New or worsening leg weakness or numbness","severity":"urgent"},
      {"key":"cauda","text":"New difficulty passing urine, or loss of bladder or bowel control","severity":"urgent"},
      {"key":"dvt","text":"Calf pain or swelling, or breathlessness","severity":"urgent"}
    ],
    "escalation": {"routine":"nurse","urgent":"doctor","emergency":"Call 112 or 108, or go to the nearest hospital"},
    "education": [
      {"key":"precautions","title":"Back-care precautions after surgery","status":"approval_pending"},
      {"key":"wound","title":"Caring for your wound at home","status":"approval_pending"},
      {"key":"activity","title":"Safe activity and returning to daily life","status":"approval_pending"}
    ]
  }
  $j$::jsonb);
  insert into pathway_sources (pathway_id, organisation, title, jurisdiction, published_on, url, supports_element) values
    (p,'ERAS® Society','Consensus statement for perioperative care in lumbar spinal fusion: ERAS® Society recommendations','International (ERAS Society)','2021',
     'https://erassociety.org/guideline/consensus-statement-for-perioperative-care-in-lumbar-spinal-fusion-enhanced-recovery-after-surgery-eras-society-recommendations-2/',
     'Perioperative care structure, multimodal analgesia, early mobilisation');

  -- skeleton versions for the other spine pathways (draft, content pending)
  for p in select id from pathways where pack_id=v_spine and key in ('lumbar_discectomy','decompression','cervical') loop
    insert into pathway_versions (pathway_id, version, status, config) values (p, 1, 'draft', $j$
    {"content_status":"draft",
     "phases":[{"key":"acute","name":"Early recovery","from_day":0,"to_day":14}],
     "modules":[
       {"key":"diagnosis_procedure","recorded_by":"doctor","frequency":"once"},
       {"key":"medicines","recorded_by":"doctor","frequency":"as_needed"},
       {"key":"pain","recorded_by":"caregiver","frequency":"daily"},
       {"key":"numbness_weakness","recorded_by":"caregiver","frequency":"daily"},
       {"key":"wound_care","recorded_by":"caregiver","frequency":"daily"},
       {"key":"mobility_function","recorded_by":"caregiver","frequency":"daily"},
       {"key":"milestones","recorded_by":"nurse","frequency":"weekly"},
       {"key":"questions_concerns","recorded_by":"family","frequency":"as_needed"}
     ],
     "milestones":[],
     "warning_signs":[
       {"key":"cauda","text":"New difficulty passing urine, or loss of bladder or bowel control","severity":"urgent"},
       {"key":"new_weakness","text":"New or worsening leg weakness or numbness","severity":"urgent"}
     ],
     "escalation":{"routine":"nurse","urgent":"doctor","emergency":"Call 112 or 108, or go to the nearest hospital"},
     "education":[]}
    $j$::jsonb);
  end loop;

  -- ---- JOINT pathways ----
  insert into pathways (pack_id, key, name, applicable_procedures, eligibility, exclusions, status) values
    (v_joint,'tkr','Total knee replacement', array['Total knee arthroplasty'],
      'Medically stable adult discharged home after total knee replacement.',
      'Active infection, unstable wound, uncontrolled comorbidity.','clinically_review_required'),
    (v_joint,'thr','Total hip replacement', array['Total hip arthroplasty'],
      'Medically stable adult discharged home after total hip replacement.',
      'Active infection, dislocation risk requiring inpatient care, uncontrolled comorbidity.','draft');

  select id into p from pathways where pack_id=v_joint and key='tkr';
  insert into pathway_versions (pathway_id, version, status, config) values (p, 1, 'clinically_review_required', $j$
  {
    "content_status":"clinically_review_required",
    "phases":[
      {"key":"acute","name":"Early recovery (Day 0-14)","from_day":0,"to_day":14},
      {"key":"subacute","name":"Strength & motion (Week 2-6)","from_day":15,"to_day":42},
      {"key":"functional","name":"Functional recovery (Week 6-12)","from_day":43,"to_day":84}
    ],
    "modules":[
      {"key":"diagnosis_procedure","recorded_by":"doctor","frequency":"once"},
      {"key":"medicines","recorded_by":"doctor","frequency":"as_needed"},
      {"key":"pain","recorded_by":"caregiver","frequency":"daily","fields":["score_0_10"]},
      {"key":"swelling","recorded_by":"caregiver","frequency":"daily"},
      {"key":"wound_care","recorded_by":"caregiver","frequency":"daily"},
      {"key":"vitals","recorded_by":"caregiver","frequency":"daily","fields":["temperature"]},
      {"key":"range_of_motion","recorded_by":"therapist","frequency":"per_visit"},
      {"key":"weight_bearing","recorded_by":"doctor","frequency":"once"},
      {"key":"walking_distance","recorded_by":"caregiver","frequency":"daily"},
      {"key":"walking_aid","recorded_by":"caregiver","frequency":"daily"},
      {"key":"dvt_infection_watch","recorded_by":"caregiver","frequency":"daily"},
      {"key":"physiotherapy","recorded_by":"therapist","frequency":"per_visit"},
      {"key":"milestones","recorded_by":"nurse","frequency":"weekly"},
      {"key":"questions_concerns","recorded_by":"family","frequency":"as_needed"}
    ],
    "milestones":[
      {"key":"straight_leg","name":"Active straight-leg raise","by_day":7,"phase":"acute"},
      {"key":"knee_flex_90","name":"Knee flexion to ~90 degrees","by_day":21,"phase":"subacute"},
      {"key":"walk_aid_free","name":"Walking without an aid","by_day":42,"phase":"subacute"}
    ],
    "warning_signs":[
      {"key":"fever","text":"Temperature 38C or higher","severity":"urgent"},
      {"key":"wound","text":"Increasing wound redness, warmth or discharge","severity":"urgent"},
      {"key":"dvt","text":"Calf pain, swelling or redness","severity":"urgent"},
      {"key":"pe","text":"Sudden breathlessness or chest pain","severity":"urgent"}
    ],
    "escalation":{"routine":"nurse","urgent":"doctor","emergency":"Call 112 or 108, or go to the nearest hospital"},
    "education":[
      {"key":"exercises","title":"Your knee exercises","status":"approval_pending"},
      {"key":"dvt","title":"Preventing blood clots after surgery","status":"approval_pending"}
    ]
  }
  $j$::jsonb);
  insert into pathway_sources (pathway_id, organisation, title, jurisdiction, published_on, url, supports_element) values
    (p,'ERAS® Society','Consensus statement for perioperative care in total hip and total knee replacement: ERAS® Society recommendations (Acta Orthopaedica)','International (ERAS Society)','2019',
     'https://pmc.ncbi.nlm.nih.gov/articles/PMC7006728/',
     'Perioperative recovery structure, early mobilisation, VTE awareness');

  select id into p from pathways where pack_id=v_joint and key='thr';
  insert into pathway_versions (pathway_id, version, status, config) values (p, 1, 'draft', $j$
  {"content_status":"draft",
   "phases":[{"key":"acute","name":"Early recovery","from_day":0,"to_day":14}],
   "modules":[
     {"key":"diagnosis_procedure","recorded_by":"doctor","frequency":"once"},
     {"key":"medicines","recorded_by":"doctor","frequency":"as_needed"},
     {"key":"pain","recorded_by":"caregiver","frequency":"daily"},
     {"key":"wound_care","recorded_by":"caregiver","frequency":"daily"},
     {"key":"walking_distance","recorded_by":"caregiver","frequency":"daily"},
     {"key":"weight_bearing","recorded_by":"doctor","frequency":"once"},
     {"key":"dvt_infection_watch","recorded_by":"caregiver","frequency":"daily"},
     {"key":"physiotherapy","recorded_by":"therapist","frequency":"per_visit"},
     {"key":"milestones","recorded_by":"nurse","frequency":"weekly"},
     {"key":"questions_concerns","recorded_by":"family","frequency":"as_needed"}
   ],
   "milestones":[],
   "warning_signs":[
     {"key":"dislocation","text":"Sudden severe hip pain, inability to bear weight, or the leg looks shorter/rotated","severity":"urgent"},
     {"key":"dvt","text":"Calf pain, swelling or redness","severity":"urgent"}
   ],
   "escalation":{"routine":"nurse","urgent":"doctor","emergency":"Call 112 or 108, or go to the nearest hospital"},
   "education":[]}
  $j$::jsonb);

  -- ---- NEURO pathway ----
  insert into pathways (pack_id, key, name, applicable_procedures, eligibility, exclusions, status) values
    (v_neuro,'stroke','Post-stroke rehabilitation continuity', array['Ischaemic stroke','Haemorrhagic stroke (stabilised)'],
      'Medically stable adult discharged home after neurological rehabilitation, able to be safely cared for at home.',
      'Haemodynamic instability, ventilator dependence, tracheostomy dependence, minimally conscious state, unstable/uncontrolled seizures.',
      'clinically_review_required');

  select id into p from pathways where pack_id=v_neuro and key='stroke';
  insert into pathway_versions (pathway_id, version, status, config) values (p, 1, 'clinically_review_required', $j$
  {
    "content_status":"clinically_review_required",
    "phases":[
      {"key":"early","name":"Early home continuity (Week 0-4)","from_day":0,"to_day":28},
      {"key":"ongoing","name":"Ongoing rehabilitation (Week 4-12)","from_day":29,"to_day":84}
    ],
    "modules":[
      {"key":"affected_side","recorded_by":"doctor","frequency":"once"},
      {"key":"medicines","recorded_by":"doctor","frequency":"as_needed"},
      {"key":"mobility_function","recorded_by":"caregiver","frequency":"daily","fields":["assistance_level"]},
      {"key":"adl","recorded_by":"caregiver","frequency":"daily"},
      {"key":"feeding_swallowing","recorded_by":"caregiver","frequency":"daily"},
      {"key":"speech_communication","recorded_by":"therapist","frequency":"per_visit"},
      {"key":"cognition_behaviour","recorded_by":"caregiver","frequency":"weekly"},
      {"key":"bowel_bladder","recorded_by":"caregiver","frequency":"daily"},
      {"key":"skin_integrity","recorded_by":"caregiver","frequency":"daily"},
      {"key":"spasticity","recorded_by":"caregiver","frequency":"weekly"},
      {"key":"therapy_participation","recorded_by":"therapist","frequency":"per_visit"},
      {"key":"caregiver_burden","recorded_by":"family","frequency":"weekly"},
      {"key":"equipment_needs","recorded_by":"nurse","frequency":"phase_start"},
      {"key":"milestones","recorded_by":"nurse","frequency":"weekly"},
      {"key":"questions_concerns","recorded_by":"family","frequency":"as_needed"}
    ],
    "milestones":[
      {"key":"safe_transfer","name":"Safe transfers with assistance","by_day":14,"phase":"early"},
      {"key":"safe_swallow","name":"Safe swallowing confirmed by therapist","by_day":14,"phase":"early"}
    ],
    "warning_signs":[
      {"key":"swallow","text":"Coughing/choking with food or drink, or new difficulty swallowing","severity":"urgent"},
      {"key":"new_deficit","text":"Sudden new weakness, facial droop, or speech difficulty","severity":"urgent"},
      {"key":"seizure","text":"Any seizure","severity":"urgent"},
      {"key":"pressure_sore","text":"New skin breakdown or pressure sore","severity":"attention"}
    ],
    "escalation":{"routine":"nurse","urgent":"doctor","emergency":"Call 112 or 108, or go to the nearest hospital"},
    "education":[
      {"key":"swallow_safety","title":"Safe eating and drinking after stroke","status":"approval_pending"},
      {"key":"skin_care","title":"Preventing pressure sores at home","status":"approval_pending"}
    ]
  }
  $j$::jsonb);
  insert into pathway_sources (pathway_id, organisation, title, jurisdiction, published_on, url, supports_element) values
    (p,'World Health Organization','Package of interventions for rehabilitation. Module 3: Neurological conditions','International (WHO)','2023',
     'https://www.who.int/publications/i/item/9789240071155',
     'Rehabilitation domains for neurological conditions incl. stroke');
end $$;

-- ============================================================================
-- Done. Institutions get pathways only via Super Admin assignment
-- (institution_pathways, service_role only). No pathway is 'approved' yet.
-- ============================================================================
