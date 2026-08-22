-- ===========================================================================
-- 0036 — capture mode: when a person may record an activity
--
-- `schedule` says when an activity is EXPECTED. Capture mode says when it may
-- be RECORDED, and they are not the same question. An extra blood pressure
-- taken at 3pm because someone was worried is a real event with no expectation
-- behind it; a second "morning medicines" at 3pm is not.
--
-- The client derives the centre "+" from this. That alone would make it a
-- convention rather than a rule: `record_care_event` is callable by any
-- signed-in member of the household, so without the check below a caller could
-- still post an unscheduled medicine round and the day would read as a dose
-- given twice. A rule the UI merely observes is not a rule.
--
-- Nothing here reads a specialty.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. The effective capture mode of a stored activity.
--
-- Declared where the compiler stated one; derived where it did not, so that
-- programmes approved before capture modes existed keep working. The derivation
-- is the same one the TypeScript validator applies and the two must stay in
-- step (src/domain/careActivityModel.ts :: defaultCaptureMode).
-- ---------------------------------------------------------------------------
create or replace function public.effective_capture_mode(p_activity jsonb)
returns text
language sql immutable as $$
  select case
    when p_activity->>'capture_mode' in ('scheduled','unscheduled','both')
      -- An activity with no clock has no occurrences to record against, so
      -- "scheduled" would make it unrecordable by anyone. Read it as ad hoc.
      then case
        when p_activity->>'capture_mode' = 'scheduled'
         and coalesce(p_activity->'schedule'->>'kind', 'on_demand') <> 'clock'
        then 'unscheduled'
        else p_activity->>'capture_mode'
      end
    when coalesce(p_activity->'schedule'->>'kind', 'on_demand') <> 'clock' then 'unscheduled'
    when p_activity->>'activity_type' = 'dose' then 'scheduled'
    else 'both'
  end
$$;

revoke all on function public.effective_capture_mode(jsonb) from public, anon;
grant execute on function public.effective_capture_mode(jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Refuse an unscheduled record of a scheduled-only activity.
--
-- Identical to the 0033 definition in every other respect; only the block
-- marked NEW below is added.
-- ---------------------------------------------------------------------------
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

  -- NEW: something the clinician approved for its scheduled times only can be
  -- recorded only against one of those times.
  if p_occurrence is null and effective_capture_mode(v_act) = 'scheduled' then
    raise exception '% is recorded against its scheduled time, not on its own',
      coalesce(nullif(v_act->>'title',''), p_activity_key);
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
