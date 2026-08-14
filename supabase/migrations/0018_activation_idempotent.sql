-- ============================================================================
-- Carelune — make plan activation non-destructive + idempotent (run AFTER 0017).
--
-- Correction to activate_patient_plan(): NEVER delete care_tasks/medications (and
-- therefore never cascade-delete task_logs). Behaviour:
--   * If the same plan is ALREADY active -> return success, change nothing.
--   * Activating a plan whose runtime rows exist but are inactive (an older
--     version) -> retire the currently-active rows and REACTIVATE this plan's rows.
--   * Activating a plan for the first time -> retire the currently-active rows and
--     INSERT this plan's rows.
-- All historical care_tasks, medications and task_logs are preserved.
--
-- HOW TO APPLY: Supabase dashboard -> SQL Editor -> paste this file -> Run.
-- ============================================================================

create or replace function public.activate_patient_plan(p_plan uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_patient uuid; v_centre uuid; v_status text; v_content jsonb;
  v_diag text[]; v_meds int; v_tasks int; v_existed boolean;
begin
  if public.my_role() not in ('pmr','duty_doctor') then
    raise exception 'Only a doctor can activate a care plan';
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

-- ============================================================================
-- Done. Activation is now non-destructive: same-plan retries are a no-op, version
-- changes flip active flags, and no care_task / medication / task_log is deleted.
-- ============================================================================
