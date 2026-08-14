-- ============================================================================
-- Carelune — Stage A completion: document-sourced facts + transactional plan
-- activation (run AFTER 0016). Idempotent.
--
-- 1. Fact provenance to a source document + doctor-editable facts:
--      * patient_document_facts.source_document_id links the extracted facts to the
--        governing discharge document the doctor selected.
--      * the doctor (admin/doctor role) may CORRECT the extracted facts (an
--        authenticated UPDATE policy); creation stays service_role (the Edge Fn).
--
-- 2. The activated plan is visible to the family/caregiver (approved plans only).
--
-- 3. activate_patient_plan(): a doctor-only, ATOMIC RPC that turns an APPROVED
--    plan draft into the runtime records the existing app screens read
--    (medications, care_tasks incl. monitoring/pain/physio/diet). Each runtime row
--    is tagged with the plan it came from; re-running is idempotent (no duplicates)
--    and older active items are retired, preserving previous versions.
--
-- All new SECURITY DEFINER functions use an EMPTY search_path with schema-
-- qualified references and explicit EXECUTE revocations.
--
-- HOW TO APPLY: Supabase dashboard -> SQL Editor -> paste this file -> Run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Source-document link + doctor-editable facts.
-- ---------------------------------------------------------------------------
alter table patient_document_facts add column if not exists source_document_id uuid references patient_documents(id);

grant update on patient_document_facts to authenticated;
drop policy if exists doc_facts_update on patient_document_facts;
create policy doc_facts_update on patient_document_facts for update to authenticated
  using (((select is_admin_user()) or (select my_role()) in ('pmr','duty_doctor')) and (select can_see_patient(patient_id)))
  with check (((select is_admin_user()) or (select my_role()) in ('pmr','duty_doctor')) and (select can_see_patient(patient_id)));

-- ---------------------------------------------------------------------------
-- 2. Runtime-record provenance to the plan version, + activation state.
-- ---------------------------------------------------------------------------
alter table care_tasks   add column if not exists source_plan_id uuid references patient_plans(id);
alter table medications  add column if not exists source_plan_id uuid references patient_plans(id);
alter table patient_plans add column if not exists activated_at timestamptz;
alter table patient_plans add column if not exists activated_by uuid references auth.users(id);
create index if not exists care_tasks_source_plan_idx  on care_tasks(source_plan_id);
create index if not exists medications_source_plan_idx on medications(source_plan_id);

-- The family/caregiver may read an APPROVED (activated) plan — never a draft.
drop policy if exists patient_plans_read on patient_plans;
create policy patient_plans_read on patient_plans for select to authenticated
  using ((select can_see_patient(patient_id)) and ((select is_staff()) or status = 'approved'));

-- ---------------------------------------------------------------------------
-- 3. Transactional activation of an approved plan into runtime records.
-- ---------------------------------------------------------------------------
create or replace function public.activate_patient_plan(p_plan uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_patient uuid; v_centre uuid; v_status text; v_content jsonb;
  v_diag text[]; v_meds int; v_tasks int;
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

  -- Idempotency: drop anything this exact plan created before (safe re-run), then
  -- retire the patient's currently-active runtime items (older versions kept as history).
  delete from public.care_tasks  where patient_id = v_patient and source_plan_id = p_plan;
  delete from public.medications where patient_id = v_patient and source_plan_id = p_plan;
  update public.care_tasks  set active = false where patient_id = v_patient and active;
  update public.medications set active = false where patient_id = v_patient and active;

  -- Medicines (copied exactly from the approved plan).
  insert into public.medications (patient_id, name, dose, freq, timing, note, active, updated_by, source_plan_id)
  select v_patient, m->>'name', nullif(m->>'dose',''), nullif(m->>'freq',''), nullif(m->>'timing',''),
         nullif(m->>'note',''), true, auth.uid(), p_plan
  from jsonb_array_elements(coalesce(v_content->'medicines','[]'::jsonb)) m
  where coalesce(m->>'name','') <> '';
  get diagnostics v_meds = row_count;

  -- Daily + therapy tasks.
  insert into public.care_tasks (patient_id, time_label, sort_order, discipline, title, detail, active, source_plan_id)
  select v_patient, coalesce(nullif(t->>'time_label',''),'08:00'), (row_number() over ())::int,
         coalesce(nullif(t->>'discipline',''),'General care'), t->>'title', coalesce(t->>'detail',''), true, p_plan
  from jsonb_array_elements(
        coalesce(v_content->'daily_tasks','[]'::jsonb) || coalesce(v_content->'therapy_tasks','[]'::jsonb)) t
  where coalesce(t->>'title','') <> '';

  -- Monitoring modules become caregiver-visible monitoring tasks (pain/vitals/etc.).
  insert into public.care_tasks (patient_id, time_label, sort_order, discipline, title, detail, active, source_plan_id)
  select v_patient, '09:00', 100 + (row_number() over ())::int, 'Monitoring',
         'Record ' || initcap(replace(o->>'module','_',' ')), 'Frequency: ' || coalesce(o->>'frequency','daily'), true, p_plan
  from jsonb_array_elements(coalesce(v_content->'observations','[]'::jsonb)) o
  where coalesce(o->>'module','') <> '';

  -- Diet instructions as a care task.
  insert into public.care_tasks (patient_id, time_label, sort_order, discipline, title, detail, active, source_plan_id)
  select v_patient, '08:30', 200 + (row_number() over ())::int, 'Diet', d->>'text', '', true, p_plan
  from jsonb_array_elements(coalesce(v_content->'diet','[]'::jsonb)) d
  where coalesce(d->>'text','') <> '';

  select count(*)::int into v_tasks from public.care_tasks where patient_id = v_patient and source_plan_id = p_plan;

  -- Patient becomes active; diagnosis reflects the approved plan.
  v_diag := (select array_agg(x->>'text')
             from jsonb_array_elements(coalesce(v_content->'diagnosis','[]'::jsonb)) x
             where coalesce(x->>'text','') <> '');
  update public.patients
    set status = 'active', diagnosis = coalesce(v_diag, diagnosis)
    where id = v_patient;

  update public.patient_plans set activated_at = now(), activated_by = auth.uid() where id = p_plan;

  return jsonb_build_object('medicines', v_meds, 'tasks', v_tasks, 'plan_id', p_plan);
end $$;
revoke execute on function public.activate_patient_plan(uuid) from public, anon;
grant execute on function public.activate_patient_plan(uuid) to authenticated, service_role;

-- ============================================================================
-- Done. Facts trace to their source document and are doctor-correctable; an
-- approved plan activates atomically into the runtime records the caregiver,
-- family, nurse and doctor already read, tagged by plan version and idempotent
-- on retry.
-- ============================================================================
