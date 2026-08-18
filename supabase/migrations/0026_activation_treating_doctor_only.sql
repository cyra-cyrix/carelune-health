-- ============================================================================
-- Carelune — activation is the treating doctor's decision (run AFTER 0025).
--
-- PRODUCT DECISION BEING ENCODED
-- -----------------------------
--   * PMR / treating doctor : may approve AND activate.
--   * Duty doctor           : may approve, may NOT activate.
--   * Non-clinical admin    : may neither approve nor activate.
--   * An admin who is also role = 'pmr' keeps clinician authority through the
--     clinical role — the check is on the role, never on is_admin.
--
-- WHY
-- ---
-- 0018 admitted my_role() in ('pmr','duty_doctor') at the RPC, while the
-- patients_activation_guard trigger (0012) required 'pmr'. Activation therefore
-- behaved inconsistently for a duty doctor: blocked on a patient's FIRST plan
-- (patients.status still 'pending', so the guard fired), but permitted on a
-- LATER plan version (the patient was already 'active', the UPDATE matched no
-- row, and the guard never fired). This migration settles that inconsistency in
-- favour of the trigger, so both layers now state the same rule.
--
-- WHAT CHANGES
-- ------------
-- One predicate. `my_role() not in ('pmr','duty_doctor')` becomes
-- `my_role() is distinct from 'pmr'`, and the message names the role required.
--
-- Everything else is carried over from 0018 verbatim:
--   * idempotent same-plan retry (returns 'already_active', touches nothing);
--   * version change retires the previous rows by flipping `active`, never
--     deleting a care_task, medication or task_log;
--   * plan-not-found, institution (my_centre) and APPROVED-status checks;
--   * activated_at / activated_by stamping, and the diagnosis carry-over;
--   * the same return shape;
--   * security definer, search_path = '', and the identical revoke/grant pair.
--
-- WHAT THIS DOES NOT CHANGE
-- -------------------------
--   * patients_activation_guard (0012) stays exactly as it is. It required 'pmr'
--     before and still does — it is now a second, agreeing layer rather than a
--     contradicting one.
--   * Approval. patient_plans_update (0025) still admits pmr and duty_doctor, so
--     a duty doctor may still approve a plan; they simply cannot make it live.
--   * Existing activation records. No row is rewritten: plans already activated
--     keep their activated_at / activated_by, and their runtime care_tasks and
--     medications are untouched.
--
-- HOW TO APPLY: Supabase dashboard -> SQL Editor -> paste this file -> Run.
-- ============================================================================

create or replace function public.activate_patient_plan(p_plan uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_patient uuid; v_centre uuid; v_status text; v_content jsonb;
  v_diag text[]; v_meds int; v_tasks int; v_existed boolean;
begin
  -- Only the treating doctor activates care. A duty doctor may approve a plan
  -- (0025) but may not make it the live plan the home team follows.
  if public.my_role() is distinct from 'pmr' then
    raise exception 'Only the treating doctor can activate a care plan';
  end if;

  select patient_id, centre_id, status, content
    into v_patient, v_centre, v_status, v_content
    from public.patient_plans where id = p_plan;
  if v_patient is null then raise exception 'Plan not found'; end if;
  if v_centre is distinct from public.my_centre() then raise exception 'Not your institution'; end if;
  if v_status <> 'approved' then raise exception 'Only an APPROVED plan can be activated'; end if;

  -- Already active with this exact plan -> idempotent no-op (keep tasks + task_logs).
  if exists (select 1 from public.care_tasks  where patient_id = v_patient and source_plan_id = p_plan and active)
     or exists (select 1 from public.medications where patient_id = v_patient and source_plan_id = p_plan and active) then
    update public.patients set status = 'active' where id = v_patient and status <> 'active';
    select count(*)::int into v_meds  from public.medications where patient_id = v_patient and source_plan_id = p_plan and active;
    select count(*)::int into v_tasks from public.care_tasks  where patient_id = v_patient and source_plan_id = p_plan and active;
    return jsonb_build_object('medicines', v_meds, 'tasks', v_tasks, 'plan_id', p_plan, 'status', 'already_active');
  end if;

  -- Retire whatever is currently active (a previous plan version) — never deleted.
  update public.care_tasks  set active = false where patient_id = v_patient and active;
  update public.medications set active = false where patient_id = v_patient and active;

  -- Does this plan already have (now-inactive) runtime rows from an earlier activation?
  v_existed := exists (select 1 from public.care_tasks  where patient_id = v_patient and source_plan_id = p_plan)
            or exists (select 1 from public.medications where patient_id = v_patient and source_plan_id = p_plan);

  if v_existed then
    -- Re-activate this plan's preserved rows (no new inserts, no duplicates).
    update public.care_tasks  set active = true where patient_id = v_patient and source_plan_id = p_plan;
    update public.medications set active = true where patient_id = v_patient and source_plan_id = p_plan;
  else
    -- First activation of this plan: insert its runtime records.
    insert into public.medications (patient_id, name, dose, freq, timing, note, active, updated_by, source_plan_id)
    select v_patient, m->>'name', nullif(m->>'dose',''), nullif(m->>'freq',''), nullif(m->>'timing',''),
           nullif(m->>'note',''), true, auth.uid(), p_plan
    from jsonb_array_elements(coalesce(v_content->'medicines','[]'::jsonb)) m
    where coalesce(m->>'name','') <> '';

    insert into public.care_tasks (patient_id, time_label, sort_order, discipline, title, detail, active, source_plan_id)
    select v_patient, coalesce(nullif(t->>'time_label',''),'08:00'), (row_number() over ())::int,
           coalesce(nullif(t->>'discipline',''),'General care'), t->>'title', coalesce(t->>'detail',''), true, p_plan
    from jsonb_array_elements(
          coalesce(v_content->'daily_tasks','[]'::jsonb) || coalesce(v_content->'therapy_tasks','[]'::jsonb)) t
    where coalesce(t->>'title','') <> '';

    insert into public.care_tasks (patient_id, time_label, sort_order, discipline, title, detail, active, source_plan_id)
    select v_patient, '09:00', 100 + (row_number() over ())::int, 'Monitoring',
           'Record ' || initcap(replace(o->>'module','_',' ')), 'Frequency: ' || coalesce(o->>'frequency','daily'), true, p_plan
    from jsonb_array_elements(coalesce(v_content->'observations','[]'::jsonb)) o
    where coalesce(o->>'module','') <> '';

    insert into public.care_tasks (patient_id, time_label, sort_order, discipline, title, detail, active, source_plan_id)
    select v_patient, '08:30', 200 + (row_number() over ())::int, 'Diet', d->>'text', '', true, p_plan
    from jsonb_array_elements(coalesce(v_content->'diet','[]'::jsonb)) d
    where coalesce(d->>'text','') <> '';
  end if;

  select count(*)::int into v_meds  from public.medications where patient_id = v_patient and source_plan_id = p_plan and active;
  select count(*)::int into v_tasks from public.care_tasks  where patient_id = v_patient and source_plan_id = p_plan and active;

  v_diag := (select array_agg(x->>'text')
             from jsonb_array_elements(coalesce(v_content->'diagnosis','[]'::jsonb)) x
             where coalesce(x->>'text','') <> '');
  update public.patients set status = 'active', diagnosis = coalesce(v_diag, diagnosis) where id = v_patient;
  update public.patient_plans set activated_at = now(), activated_by = auth.uid() where id = p_plan;

  return jsonb_build_object('medicines', v_meds, 'tasks', v_tasks, 'plan_id', p_plan, 'status', 'activated');
end $$;
revoke execute on function public.activate_patient_plan(uuid) from public, anon;
grant execute on function public.activate_patient_plan(uuid) to authenticated, service_role;

comment on function public.activate_patient_plan(uuid) is
  'Activates an APPROVED care plan into runtime care_tasks + medications. Treating '
  'doctor only (my_role() = ''pmr''); a duty doctor may approve but not activate. '
  'Idempotent: re-running for the already-active plan changes nothing.';

-- ============================================================================
-- Done. The RPC and patients_activation_guard now state the same rule, so a duty
-- doctor is refused consistently on a first plan and on every later version.
-- ============================================================================
