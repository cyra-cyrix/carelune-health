-- ============================================================================
-- Carelune — 0030 · the programme check-in a patient actually submits.
--
--   *** DRAFT — verified on LOCAL Supabase only. Not applied to hosted. ***
--
-- WHY A SECOND STORE
-- ------------------
-- `daily_readings` is the recovery product's wide, rehab-shaped row: bp, grbs,
-- urine_ml, pain, spo2 … one column per thing a stroke patient is asked. It
-- works, it is in use, and it cannot describe a lactation programme. So the
-- universal engine gets a NORMALISED store instead — one row per answer — and
-- `daily_readings` is not touched, not read, and not written by this path.
-- Legacy recovery patients carry on exactly as they do today.
--
-- WHAT IS NOT IN HERE
-- -------------------
-- No pain_score, no latch_score, no feeding_count. A column named after a
-- specialty is the thing this whole architecture exists to avoid: the question
-- is carried as the wording the patient actually saw, and the answer as one of
-- four generic value columns.
--
-- QUESTION IDENTITY
-- -----------------
-- The frozen questions carry a label and a reason — no id, no type. So the
-- client sends the LABEL IT DISPLAYED and the server finds it in the patient's
-- own frozen `patient_inputs`, deriving the key from its position. A label that
-- is not in that patient's programme is refused, which makes a forged question
-- id impossible rather than merely unlikely. The wording is copied onto the
-- response, so an answer stays readable years later even if the provider
-- rewrites the programme for future patients.
--
-- HOW TO APPLY (once approved): Supabase dashboard -> SQL Editor -> paste -> Run.
-- Re-runs safely (idempotent). Rollback: drop the function, then the two tables.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. One submission per patient per day.
-- ---------------------------------------------------------------------------
create table if not exists checkin_submissions (
  id              uuid primary key default gen_random_uuid(),
  patient_id      uuid not null references patients(id) on delete cascade,
  subscription_id uuid not null references subscriptions(id) on delete cascade,
  submitted_by    uuid references auth.users(id),
  submitted_at    timestamptz not null default now(),
  /* The patient's own calendar day. The unique constraint below is the
     one-check-in-a-day rule, so a double tap cannot make two clinical records. */
  local_date      date not null default current_date,
  /* Frozen at submission: where in the programme this answer came from, so
     later reading never has to reconstruct it from mutable state. */
  programme_day          integer,
  programme_period_label text,
  status          text not null default 'submitted' check (status in ('submitted')),
  created_at      timestamptz not null default now(),
  unique (subscription_id, local_date)
);

create index if not exists checkin_submissions_patient_idx on checkin_submissions(patient_id, local_date desc);

-- ---------------------------------------------------------------------------
-- 2. One row per answer. Generic by construction.
-- ---------------------------------------------------------------------------
create table if not exists checkin_responses (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid not null references checkin_submissions(id) on delete cascade,
  /* Derived by the server from the question's position in the frozen
     programme — never accepted from the client. */
  question_key  text not null,
  /* The wording the patient read, copied at submission. */
  question_label_snapshot text not null,
  response_type text not null check (response_type in ('yes_no', 'choice', 'text', 'scale')),
  value_text    text,
  value_number  numeric,
  value_boolean boolean,
  created_at    timestamptz not null default now(),
  unique (submission_id, question_key)
);

create index if not exists checkin_responses_submission_idx on checkin_responses(submission_id);

-- A future phase may add an attachment reference here (a wound photo, a feeding
-- photo). Deliberately NOT in 0030: the existing document store carries clinical
-- document semantics and professional-only write access, and reusing it would
-- mean widening that to households.

alter table checkin_submissions enable row level security;
alter table checkin_responses   enable row level security;

-- ---------------------------------------------------------------------------
-- 3. Grants. The 0027 lesson: Supabase grants ALL on every new public table to
--    `authenticated`, including the table-emptying privilege, which RLS does
--    not filter. Revoke everything, then hand back reads only — writes go
--    through the function in section 5 and nowhere else.
-- ---------------------------------------------------------------------------
revoke all on checkin_submissions from anon, authenticated;
revoke all on checkin_responses   from anon, authenticated;
grant select on checkin_submissions, checkin_responses to authenticated;
grant select, insert, update, delete on checkin_submissions, checkin_responses to service_role;

-- ---------------------------------------------------------------------------
-- 4. RLS. Reads only, scoped by the boundary the product already uses:
--    can_see_patient() is same-centre staff OR a household member linked to
--    that patient. Nobody gets a new kind of access here.
-- ---------------------------------------------------------------------------
drop policy if exists checkin_submissions_read on checkin_submissions;
create policy checkin_submissions_read on checkin_submissions for select
  using ((select can_see_patient(patient_id)));

drop policy if exists checkin_responses_read on checkin_responses;
create policy checkin_responses_read on checkin_responses for select
  using (exists (
    select 1 from checkin_submissions s
    where s.id = checkin_responses.submission_id and (select can_see_patient(s.patient_id))
  ));

-- ---------------------------------------------------------------------------
-- 5. The one way a check-in is written.
--
--    The browser sends a subscription and a list of answers, each carrying the
--    label it displayed. Everything else is derived here: the patient, the
--    programme day, and each question's key. Nothing about who the patient is,
--    which centre they belong to, or what they were asked comes from the client.
--
--    p_answers: [{ "label": "...", "type": "yes_no|choice|text|scale",
--                  "text": "...", "number": 3, "boolean": true }, ...]
--    A single free-text note is allowed alongside the configured questions.
-- ---------------------------------------------------------------------------
create or replace function public.submit_programme_checkin(
  p_subscription uuid,
  p_answers      jsonb,
  p_period_label text default null,
  p_note         text default null
)
returns checkin_submissions
language plpgsql security definer set search_path = public as $$
declare
  v_sub   subscriptions;
  v_row   checkin_submissions;
  v_day   integer;
  v_ans   jsonb;
  v_label text;
  v_type  text;
  v_key   text;
  v_idx   integer;
  v_count integer := 0;
begin
  select * into v_sub from subscriptions where id = p_subscription;
  if not found then
    raise exception 'That programme could not be found';
  end if;

  -- The caller must legitimately represent this patient. Note the patient is
  -- read off the subscription: a client-supplied patient id is never used.
  if not can_see_patient(v_sub.patient_id) then
    raise exception 'That patient is not yours to check in for';
  end if;

  -- Universal programmes only. A legacy recovery subscription records through
  -- daily_readings exactly as it always has.
  if v_sub.service_package_id is null then
    raise exception 'This patient is not on a Carelune programme check-in';
  end if;

  if jsonb_typeof(p_answers) <> 'array' or jsonb_array_length(p_answers) = 0 then
    raise exception 'A check-in needs at least one answer';
  end if;

  v_day := (current_date - v_sub.started_at::date) + 1;
  if v_day < 1 then v_day := 1; end if;

  -- The period is verified, not trusted: it must be one the patient's own
  -- frozen outline actually contains.
  if p_period_label is not null and not exists (
    select 1 from jsonb_array_elements(coalesce(v_sub.programme_config_snapshot->'programme_outline', '[]'::jsonb)) o
    where o->>'period_label' = p_period_label
  ) then
    raise exception 'That is not a stage of this programme';
  end if;

  insert into checkin_submissions (patient_id, subscription_id, submitted_by,
                                   local_date, programme_day, programme_period_label)
  values (v_sub.patient_id, v_sub.id, auth.uid(), current_date, v_day, p_period_label)
  returning * into v_row;

  for v_ans in select * from jsonb_array_elements(p_answers) loop
    v_label := trim(coalesce(v_ans->>'label', ''));
    if v_label = '' then
      raise exception 'An answer arrived without its question';
    end if;

    -- Find the question in the patient's OWN frozen programme. Its position is
    -- the key; a label that is not there cannot be answered.
    select ord into v_idx
      from jsonb_array_elements(coalesce(v_sub.programme_config_snapshot->'patient_inputs', '[]'::jsonb))
           with ordinality as t(q, ord)
     where t.q->>'label' = v_label
     limit 1;
    if v_idx is null then
      raise exception 'That question is not part of this programme';
    end if;
    v_key := 'q' || v_idx;

    v_type := coalesce(v_ans->>'type', 'text');
    if v_type not in ('yes_no', 'choice', 'text', 'scale') then
      raise exception 'Unknown answer type';
    end if;

    insert into checkin_responses (submission_id, question_key, question_label_snapshot,
                                   response_type, value_text, value_number, value_boolean)
    values (v_row.id, v_key, v_label, v_type,
            nullif(trim(coalesce(v_ans->>'text', '')), ''),
            case when v_ans->>'number' ~ '^-?\d+(\.\d+)?$' then (v_ans->>'number')::numeric end,
            case when v_ans->>'boolean' in ('true','false') then (v_ans->>'boolean')::boolean end);
    v_count := v_count + 1;
  end loop;

  -- The optional closing note, stored under a reserved key so it can never
  -- collide with a configured question.
  if nullif(trim(coalesce(p_note, '')), '') is not null then
    insert into checkin_responses (submission_id, question_key, question_label_snapshot, response_type, value_text)
    values (v_row.id, 'note', 'Anything else you''d like your care team to know?', 'text', trim(p_note));
  end if;

  if v_count = 0 then
    raise exception 'A check-in needs at least one answer';
  end if;

  return v_row;
end $$;

-- 0011 lesson B1: Postgres grants EXECUTE to PUBLIC by default on new functions.
revoke execute on function public.submit_programme_checkin(uuid, jsonb, text, text) from public, anon;
grant  execute on function public.submit_programme_checkin(uuid, jsonb, text, text) to authenticated, service_role;

-- ============================================================================
-- Deliberately NOT in this migration:
--   * anything touching daily_readings, medications, care_tasks, patient_plans
--   * attention scoring or any caseload status derived from a check-in  -> Phase 5
--   * AI summaries of check-ins — storage here is deterministic         -> Phase 5
--   * photo/attachment capture                                          -> later
--   * editing a submitted check-in: a completed submission is read-only
-- ============================================================================
