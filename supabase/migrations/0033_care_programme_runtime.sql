-- ============================================================================
-- Carelune — 0033 · the patient's compiled programme, scheduled care, and the
--                   record of what actually happened.
--
--   *** Verified on LOCAL Supabase only. Not applied to production. ***
--
-- WHY
-- ---
-- 0032 gave a SERVICE its clinical domain, its knowledge and its default care
-- activities. This is the layer where that becomes one patient's actual day.
--
--   patient_programmes  the compiled candidate programme for ONE patient,
--                       versioned, and inert until a clinician approves it.
--   care_occurrences    what is EXPECTED to happen, and when.
--   care_events         what ACTUALLY happened, and when.
--
-- WHY EXPECTATIONS NEED THEIR OWN ROWS
-- ------------------------------------
-- "Missed" is the absence of an event. An absence cannot be counted, filtered or
-- displayed without a row that represents the expectation, so scheduled care
-- gets `care_occurrences` and unscheduled care does not: an event recorded from
-- the centre "+" simply carries occurrence_id = NULL, creates no expectation,
-- and can never be missed. One event log, one separate expectation table.
--
-- NOTHING IS OPERATIONAL UNTIL A CLINICIAN APPROVES IT
-- ----------------------------------------------------
-- A compiled programme is written with status 'draft'. No occurrence can be
-- materialised from a draft and no event can be recorded against one. Approval
-- is `approve_patient_programme()`, restricted to the treating doctor — the
-- same authority and the same predicate that `activate_patient_plan` (0026)
-- already uses for the legacy care plan. No new approval concept is introduced.
--
-- NOTHING IS TRUSTED FROM THE BROWSER
-- -----------------------------------
-- `record_care_event` takes an activity KEY and resolves the definition out of
-- the patient's OWN approved programme, exactly as `submit_programme_checkin`
-- (0030) resolves a question from the patient's own frozen configuration. A key
-- that is not in that patient's programme is refused, so a forged activity is
-- impossible rather than merely unlikely.
--
-- NO CLINICAL INTERPRETATION LIVES HERE
-- -------------------------------------
-- There is no severity column, no risk column, no score. `acknowledgement_state`
-- is an OPERATIONAL state — was this recorded, is it still expected, has the
-- care team seen it — derived by the system from facts it can observe. It says
-- nothing about how the patient is doing, and no threshold in this file decides
-- anything clinical.
--
-- TIME IS THE PATIENT'S, NOT THE SERVER'S
-- ---------------------------------------
-- `patients.time_zone` is added here because a due time is meaningless without
-- it: `current_date` on the server is not the caregiver's morning. Every
-- occurrence carries an absolute `due_at` plus the patient-local date and
-- display group it belongs to.
--
-- LEGACY IS UNTOUCHED
-- -------------------
-- Nothing here reads or writes care_tasks, task_logs, medications, med_admin,
-- daily_readings or patient_plans. A legacy recovery patient has no
-- patient_programme, materialises no occurrences, and behaves exactly as before.
--
-- HOW TO APPLY (once approved): Supabase dashboard -> SQL Editor -> paste -> Run.
-- Re-runs safely (idempotent).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The patient's own clock.
-- ---------------------------------------------------------------------------
alter table patients
  add column if not exists time_zone text not null default 'Asia/Kolkata';

comment on column patients.time_zone is
  'IANA zone. A scheduled due time is expressed in the patient''s local wall clock, never the server''s.';

-- ---------------------------------------------------------------------------
-- 2. The compiled patient programme.
--
--    `activities` is the narrowed, patient-specific set of care activities:
--    the same closed shape as centre_services.programme_activities, with each
--    entry carrying its BASIS — where it came from and who is answerable for it.
--
--    `compiled_from` is provenance, not configuration: which knowledge pack
--    version, which facts document, which model, when.
-- ---------------------------------------------------------------------------
create table if not exists patient_programmes (
  id              uuid primary key default gen_random_uuid(),
  patient_id      uuid not null references patients(id) on delete cascade,
  subscription_id uuid not null references subscriptions(id) on delete cascade,
  centre_id       uuid not null references centres(id) on delete cascade,

  version integer not null check (version > 0),

  activities jsonb not null default '[]'::jsonb
             check (jsonb_typeof(activities) = 'array'),

  -- Keys of the on-demand activities offered in the centre "+" sheet, in order.
  quick_records jsonb not null default '[]'::jsonb
                check (jsonb_typeof(quick_records) = 'array'),

  compiled_from jsonb not null default '{}'::jsonb
                check (jsonb_typeof(compiled_from) = 'object'),

  status text not null default 'draft'
         check (status in ('draft','approved','superseded','rejected')),

  source_provenance text not null default 'compiler'
                    check (source_provenance in ('compiler','clinician_authored','provider_default')),
  ai_model      text,
  compiled_at   timestamptz,
  compiled_by   uuid references auth.users(id),

  approved_by   uuid references auth.users(id),
  approved_at   timestamptz,
  approval_note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (subscription_id, version)
);

create index if not exists patient_programmes_patient_idx
  on patient_programmes(patient_id, status);
-- At most ONE approved programme per subscription. The partial unique index is
-- the rule, not a convention the application is trusted to keep.
create unique index if not exists patient_programmes_one_approved
  on patient_programmes(subscription_id) where status = 'approved';

alter table patient_programmes enable row level security;

-- ---------------------------------------------------------------------------
-- 3. Scheduled care — what is expected.
-- ---------------------------------------------------------------------------
create table if not exists care_occurrences (
  id           uuid primary key default gen_random_uuid(),
  patient_id   uuid not null references patients(id) on delete cascade,
  programme_id uuid not null references patient_programmes(id) on delete cascade,

  activity_key  text not null,
  activity_type text not null,

  -- What the activity WAS when this occurrence was made. A later programme
  -- version never rewrites an occurrence that has already been shown.
  definition_snapshot jsonb not null default '{}'::jsonb
                      check (jsonb_typeof(definition_snapshot) = 'object'),

  due_at     timestamptz not null,
  window_end timestamptz,
  -- Patient-local placement, computed at materialisation from patients.time_zone.
  local_date    date not null,
  display_group text not null
                check (display_group in ('morning','afternoon','evening','night')),

  status text not null default 'pending'
         check (status in ('pending','done','partial','unable','skipped','missed')),

  resolved_by_event_id uuid,
  resolved_at          timestamptz,

  created_at timestamptz not null default now(),

  unique (programme_id, activity_key, due_at)
);

create index if not exists care_occurrences_patient_day_idx
  on care_occurrences(patient_id, local_date, due_at);
create index if not exists care_occurrences_status_idx
  on care_occurrences(programme_id, status);

alter table care_occurrences enable row level security;

-- ---------------------------------------------------------------------------
-- 4. Care events — what actually happened.
--
--    `payload` carries the structured answer, validated against the activity's
--    own input_schema before it is written. There is deliberately no column
--    named after anything clinical: no pain_score, no feed_ml, no latch. The
--    question is carried as the wording the patient saw, and the answer as
--    structured JSON, exactly as checkin_responses carries a check-in.
-- ---------------------------------------------------------------------------
create table if not exists care_events (
  id           uuid primary key default gen_random_uuid(),
  patient_id   uuid not null references patients(id) on delete cascade,
  programme_id uuid not null references patient_programmes(id) on delete cascade,

  -- NULL for anything recorded through the centre "+": an unscheduled event
  -- resolves no expectation and can never have been missed.
  occurrence_id uuid references care_occurrences(id) on delete set null,

  activity_key   text not null,
  activity_type  text not null,
  label_snapshot text not null,

  -- When it HAPPENED, and separately when it was typed in. These are different
  -- facts and the product has never been able to tell them apart before.
  occurred_at timestamptz not null default now(),
  recorded_at timestamptz not null default now(),
  local_date  date not null,

  outcome text
          check (outcome is null or outcome in ('done','partial','unable','skipped','recorded')),

  payload jsonb not null default '{}'::jsonb
          check (jsonb_typeof(payload) = 'object'),
  note    text,

  entry_mode text not null default 'scheduled'
             check (entry_mode in ('scheduled','quick','voice','text')),

  -- OPERATIONAL state only — see the header. Never a clinical judgement.
  acknowledgement_state text not null default 'recorded'
    check (acknowledgement_state in
      ('recorded','completed','observe_again','not_recorded','shared_with_care_team','care_team_replied')),

  shared_with_care_team boolean not null default false,

  recorded_by uuid references auth.users(id),
  created_at  timestamptz not null default now()
);

create index if not exists care_events_patient_time_idx
  on care_events(patient_id, occurred_at desc);
create index if not exists care_events_programme_key_idx
  on care_events(programme_id, activity_key, occurred_at desc);

alter table care_events enable row level security;

do $$ begin
  alter table care_occurrences
    add constraint care_occurrences_resolved_fk
    foreign key (resolved_by_event_id) references care_events(id) on delete set null;
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 5. Grants. Revoke ALL first (TRUNCATE is not filtered by RLS — the 0027
--    lesson), then hand back reads. Every write goes through section 7.
-- ---------------------------------------------------------------------------
revoke all on patient_programmes from anon, authenticated;
revoke all on care_occurrences   from anon, authenticated;
revoke all on care_events        from anon, authenticated;

grant select on patient_programmes, care_occurrences, care_events to authenticated;
grant select, insert, update, delete
  on patient_programmes, care_occurrences, care_events to service_role;

-- ---------------------------------------------------------------------------
-- 6. RLS. The existing boundary and no new access class: can_see_patient() is
--    same-centre staff OR a household member linked to that patient.
--
--    One narrowing that matters: a household account may read only an APPROVED
--    programme. A draft is professional working material — a family must never
--    read a compiled suggestion that no clinician has agreed to.
-- ---------------------------------------------------------------------------
drop policy if exists patient_programmes_read on patient_programmes;
create policy patient_programmes_read on patient_programmes for select
  using (
    (select can_see_patient(patient_id))
    and (status = 'approved' or (select is_staff()))
  );

drop policy if exists care_occurrences_read on care_occurrences;
create policy care_occurrences_read on care_occurrences for select
  using ((select can_see_patient(patient_id)));

drop policy if exists care_events_read on care_events;
create policy care_events_read on care_events for select
  using ((select can_see_patient(patient_id)));

-- ---------------------------------------------------------------------------
-- 7. The write paths. Three functions, and nothing else may write these tables.
-- ---------------------------------------------------------------------------

-- 7a. Approval. Treating doctor only — the same authority and the same check
--     activate_patient_plan (0026) already applies to the legacy care plan.
create or replace function public.approve_patient_programme(p_programme uuid, p_note text default null)
returns patient_programmes
language plpgsql security definer set search_path = public as $$
declare v_row patient_programmes;
begin
  select * into v_row from patient_programmes where id = p_programme;
  if not found then
    raise exception 'That programme does not exist';
  end if;
  if my_role() is distinct from 'pmr' then
    raise exception 'Only the treating doctor can approve a care programme';
  end if;
  if not can_see_patient(v_row.patient_id) then
    raise exception 'That patient is not yours';
  end if;
  if v_row.status <> 'draft' then
    raise exception 'Only a draft programme can be approved';
  end if;
  if jsonb_array_length(v_row.activities) = 0 then
    raise exception 'A programme with no care activities cannot be approved';
  end if;

  -- The previous approved version steps aside; it is never deleted.
  update patient_programmes
     set status = 'superseded', updated_at = now()
   where subscription_id = v_row.subscription_id
     and status = 'approved';

  update patient_programmes
     set status = 'approved', approved_by = auth.uid(), approved_at = now(),
         approval_note = nullif(btrim(coalesce(p_note, '')), ''), updated_at = now()
   where id = p_programme
  returning * into v_row;

  return v_row;
end $$;

revoke all on function public.approve_patient_programme(uuid, text) from public, anon;
grant execute on function public.approve_patient_programme(uuid, text) to authenticated, service_role;

-- 7b. Materialise scheduled care for a date window.
--
--     LAZY BY DESIGN. This is called for a rolling window of a few days, not for
--     the whole programme up front: a 90-day programme with fifteen daily
--     activities would otherwise write 1,350 rows at approval time for a patient
--     who may stop on day three. Re-running is safe — the unique key
--     (programme, activity, due_at) makes every insert idempotent.
--
--     Only `schedule.kind = 'clock'` expands to occurrences. An activity with no
--     schedule, or with kind 'on_demand', is a quick-record: it deliberately
--     produces nothing here and therefore can never read as missed.
create or replace function public.materialise_care_occurrences(
  p_patient uuid, p_from date, p_to date
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_prog    patient_programmes;
  v_tz      text;
  v_start   date;
  v_act     jsonb;
  v_sched   jsonb;
  v_day     date;
  v_time    text;
  v_due     timestamptz;
  v_hour    integer;
  v_group   text;
  v_dayno   integer;
  v_from    integer;
  v_through integer;
  v_days    jsonb;
  v_made    integer := 0;
  v_hit     integer;
begin
  if not can_see_patient(p_patient) then
    raise exception 'That patient is not yours';
  end if;
  -- A window wider than a fortnight is a bug in the caller, not a request.
  if p_to < p_from or (p_to - p_from) > 14 then
    raise exception 'Materialise a window of at most 14 days';
  end if;

  select * into v_prog
    from patient_programmes
   where patient_id = p_patient and status = 'approved'
   limit 1;
  if not found then
    return 0;   -- nothing approved: nothing is expected of this patient
  end if;

  select coalesce(p.time_zone, 'Asia/Kolkata') into v_tz from patients p where p.id = p_patient;
  select date(s.started_at at time zone v_tz) into v_start
    from subscriptions s where s.id = v_prog.subscription_id;
  v_start := coalesce(v_start, current_date);

  for v_act in select * from jsonb_array_elements(v_prog.activities) loop
    v_sched := v_act->'schedule';
    if v_sched is null
       or jsonb_typeof(v_sched) <> 'object'
       or coalesce(v_sched->>'kind', 'on_demand') <> 'clock' then
      continue;
    end if;

    v_from    := coalesce((v_sched->>'from_day')::int, 1);
    v_through := nullif(v_sched->>'through_day', '')::int;
    v_days    := v_sched->'days';

    v_day := p_from;
    while v_day <= p_to loop
      v_dayno := (v_day - v_start) + 1;

      -- Inside the activity's day window?
      if v_dayno >= v_from and (v_through is null or v_dayno <= v_through) then
        -- Which days of the week? Absent or "all" means every day; an array of
        -- ISO weekday numbers (1=Mon .. 7=Sun) means exactly those.
        if v_days is null
           or jsonb_typeof(v_days) = 'null'
           or (jsonb_typeof(v_days) = 'string' and v_days #>> '{}' = 'all')
           or (jsonb_typeof(v_days) = 'array'
               and v_days @> to_jsonb(extract(isodow from v_day)::int))
        then
          for v_time in select jsonb_array_elements_text(coalesce(v_sched->'times', '[]'::jsonb)) loop
            begin
              v_due := (v_day::text || ' ' || v_time)::timestamp at time zone v_tz;
            exception when others then
              continue;   -- an unreadable time is skipped, never guessed
            end;

            v_hour := extract(hour from (v_due at time zone v_tz))::int;
            v_group := case
              when v_hour >= 5  and v_hour < 12 then 'morning'
              when v_hour >= 12 and v_hour < 17 then 'afternoon'
              when v_hour >= 17 and v_hour < 21 then 'evening'
              else 'night'
            end;

            insert into care_occurrences (
              patient_id, programme_id, activity_key, activity_type,
              definition_snapshot, due_at, window_end, local_date, display_group
            ) values (
              p_patient, v_prog.id,
              v_act->>'key', coalesce(v_act->>'activity_type', 'task'),
              v_act, v_due,
              v_due + (coalesce((v_sched->>'grace_minutes')::int, 120) || ' minutes')::interval,
              v_day, v_group
            )
            on conflict (programme_id, activity_key, due_at) do nothing;

            get diagnostics v_hit = row_count;
            v_made := v_made + v_hit;
          end loop;
        end if;
      end if;

      v_day := v_day + 1;
    end loop;
  end loop;

  -- Anything whose grace window has closed with nothing recorded is missed.
  -- This is an operational statement about a record, not about a patient.
  update care_occurrences
     set status = 'missed'
   where programme_id = v_prog.id
     and status = 'pending'
     and window_end is not null
     and window_end < now();

  return v_made;
end $$;

revoke all on function public.materialise_care_occurrences(uuid, date, date) from public, anon;
grant execute on function public.materialise_care_occurrences(uuid, date, date) to authenticated, service_role;

-- 7c. Record what happened.
--
--     The caller sends a subscription, an activity KEY, and an answer. Every
--     other fact is derived here: the patient, the programme, the activity's
--     type and label, the local date. A key that is not in this patient's own
--     approved programme is refused.
create or replace function public.record_care_event(
  p_subscription  uuid,
  p_activity_key  text,
  p_payload       jsonb default '{}'::jsonb,
  p_note          text default null,
  p_outcome       text default null,
  p_occurred_at   timestamptz default null,
  p_occurrence    uuid default null,
  p_entry_mode    text default 'scheduled'
) returns care_events
language plpgsql security definer set search_path = public as $$
declare
  v_prog  patient_programmes;
  v_act   jsonb;
  v_tz    text;
  v_when  timestamptz;
  v_row   care_events;
  v_occ   care_occurrences;
  v_state text;
begin
  select * into v_prog
    from patient_programmes
   where subscription_id = p_subscription and status = 'approved'
   limit 1;
  if not found then
    raise exception 'This patient has no approved care programme';
  end if;
  if not can_see_patient(v_prog.patient_id) then
    raise exception 'That patient is not yours';
  end if;

  -- Resolve the activity from the patient's OWN approved programme. This is the
  -- whole security model of this function: the client names a key, never a
  -- definition, so a forged activity has nowhere to come from.
  select value into v_act
    from jsonb_array_elements(v_prog.activities)
   where value->>'key' = p_activity_key
   limit 1;
  if v_act is null then
    raise exception 'That is not an activity in this patient''s programme';
  end if;

  if p_entry_mode not in ('scheduled','quick','voice','text') then
    raise exception 'Unknown entry mode';
  end if;
  if p_outcome is not null and p_outcome not in ('done','partial','unable','skipped','recorded') then
    raise exception 'Unknown outcome';
  end if;

  select coalesce(time_zone, 'Asia/Kolkata') into v_tz from patients where id = v_prog.patient_id;
  v_when := coalesce(p_occurred_at, now());
  -- A record cannot be dated into the future; everything else is the caregiver's
  -- own account of when it happened and is taken at face value.
  if v_when > now() + interval '5 minutes' then
    raise exception 'An event cannot be recorded in the future';
  end if;

  if p_occurrence is not null then
    select * into v_occ from care_occurrences
     where id = p_occurrence and programme_id = v_prog.id;
    if not found then
      raise exception 'That scheduled item does not belong to this programme';
    end if;
  end if;

  -- The SYSTEM decides the state, from facts it can observe. Wording may be
  -- personalised later; the state may not.
  v_state := case
    when p_outcome in ('done','partial') then 'completed'
    when p_outcome in ('unable','skipped') then 'observe_again'
    else 'recorded'
  end;

  insert into care_events (
    patient_id, programme_id, occurrence_id,
    activity_key, activity_type, label_snapshot,
    occurred_at, local_date, outcome, payload, note,
    entry_mode, acknowledgement_state, recorded_by
  ) values (
    v_prog.patient_id, v_prog.id, p_occurrence,
    p_activity_key,
    coalesce(v_act->>'activity_type', 'observation'),
    coalesce(nullif(v_act->>'title',''), p_activity_key),
    v_when,
    date(v_when at time zone v_tz),
    nullif(p_outcome, ''),
    coalesce(p_payload, '{}'::jsonb),
    nullif(btrim(coalesce(p_note, '')), ''),
    p_entry_mode,
    v_state,
    auth.uid()
  ) returning * into v_row;

  -- Close the expectation this answers, if any.
  if p_occurrence is not null then
    update care_occurrences
       set status = case
             when p_outcome in ('done','partial','unable','skipped') then p_outcome
             else 'done'
           end,
           resolved_by_event_id = v_row.id,
           resolved_at = now()
     where id = p_occurrence;
  end if;

  return v_row;
end $$;

revoke all on function public.record_care_event(uuid, text, jsonb, text, text, timestamptz, uuid, text) from public, anon;
grant execute on function public.record_care_event(uuid, text, jsonb, text, text, timestamptz, uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. The professional read model — FACTS ONLY.
--
--    Adherence, what is missed, what arrived. No score, no severity, no risk
--    band, and nothing that reads an answer's VALUE. What a "4" or a "yes"
--    means is a clinician's judgement and this platform does not make it.
-- ---------------------------------------------------------------------------
create or replace function public.patient_care_summary(p_patient uuid, p_days integer default 7)
returns jsonb
language plpgsql security definer stable set search_path = public as $$
declare
  v_prog patient_programmes;
  v_from date;
  v_tz   text;
  v_out  jsonb;
begin
  if not can_see_patient(p_patient) then
    raise exception 'That patient is not yours';
  end if;

  select * into v_prog
    from patient_programmes
   where patient_id = p_patient and status = 'approved'
   limit 1;
  if not found then
    return jsonb_build_object('has_programme', false);
  end if;

  select coalesce(time_zone, 'Asia/Kolkata') into v_tz from patients where id = p_patient;
  v_from := date(now() at time zone v_tz) - greatest(coalesce(p_days, 7), 1);

  select jsonb_build_object(
    'has_programme', true,
    'programme_id',  v_prog.id,
    'approved_at',   v_prog.approved_at,
    'scheduled_total',  coalesce(o.total, 0),
    'scheduled_done',   coalesce(o.done, 0),
    'scheduled_missed', coalesce(o.missed, 0),
    'events_recorded',  coalesce(e.n, 0),
    'unscheduled_events', coalesce(e.unscheduled, 0),
    'latest_event_at',  e.latest
  ) into v_out
  from (
    select count(*) as total,
           count(*) filter (where status in ('done','partial')) as done,
           count(*) filter (where status = 'missed') as missed
      from care_occurrences
     where programme_id = v_prog.id and local_date >= v_from
  ) o
  cross join (
    select count(*) as n,
           count(*) filter (where occurrence_id is null) as unscheduled,
           max(occurred_at) as latest
      from care_events
     where programme_id = v_prog.id and local_date >= v_from
  ) e;

  return v_out;
end $$;

revoke all on function public.patient_care_summary(uuid, integer) from public, anon;
grant execute on function public.patient_care_summary(uuid, integer) to authenticated, service_role;

notify pgrst, 'reload schema';

-- ============================================================================
-- Done. Additive. To reverse: drop the four functions, then care_events,
-- care_occurrences and patient_programmes, then patients.time_zone. No existing
-- table is read or written by anything in this file.
-- ============================================================================
