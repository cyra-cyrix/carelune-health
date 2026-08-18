-- ============================================================================
-- Carelune — clinical approval requires a clinician (run AFTER 0024).
--
-- WHY
-- ---
-- 0016 defined patient_plans_update as:
--
--     (is_admin_user() or my_role() in ('pmr','duty_doctor')) and can_see_patient(...)
--
-- The is_admin_user() branch means an institution admin could write to
-- patient_plans — including flipping status to 'approved' — without holding any
-- clinical role. The enforce_patient_plan() trigger then stamps approved_by and
-- approved_at unconditionally, so that write is persisted as a clinical approval
-- of record. Being the person who administers the institution is not the same as
-- being the person who may approve a patient's care plan.
--
-- WHAT THIS CHANGES
-- -----------------
-- Approval/update of a patient plan now requires a clinical role AND the
-- existing patient-visibility rule, which carries the institution boundary
-- (can_see_patient -> is_staff() and p.centre_id = my_centre(), or an explicit
-- patient_members row). Cross-institution access therefore stays denied exactly
-- as before; only the non-clinical admin bypass is removed.
--
-- An admin who is ALSO a clinician (profiles.role in ('pmr','duty_doctor')) is
-- unaffected — the check is on the role, not on is_admin.
--
-- WHAT THIS DOES NOT CHANGE
-- -------------------------
--   * Activation. activate_patient_plan() (0018) and the patients_activation_guard
--     trigger (0012) are untouched by this migration.
--   * Reads. patient_plans_read (0017) is untouched: staff still read drafts, and
--     the household still reads an approved plan only.
--   * Any table, column, grant, trigger or function.
--
-- KNOWN, DELIBERATELY UNCHANGED — remaining role-policy decision
-- --------------------------------------------------------------
-- Activation authority is inconsistent for duty_doctor between a patient's FIRST
-- plan and subsequent ones:
--
--   * activate_patient_plan() admits my_role() in ('pmr','duty_doctor').
--   * That function also runs `update patients set status='active' ... where
--     status <> 'active'`, which fires patients_activation_guard, and that guard
--     requires my_role() = 'pmr'.
--   * So for a patient still 'pending' (their first plan) a duty doctor is
--     blocked by the guard, while for an already-'active' patient the UPDATE
--     matches no row, the guard never fires, and a duty doctor CAN activate a new
--     plan version.
--
-- Whether a duty doctor should hold activation authority at all is a product
-- decision about the role contract, not a defect to be silently patched here.
-- It is recorded so the decision is made deliberately before general
-- availability.
--
-- HOW TO APPLY: Supabase dashboard -> SQL Editor -> paste this file -> Run.
-- ============================================================================

drop policy if exists patient_plans_update on patient_plans;
create policy patient_plans_update on patient_plans for update to authenticated
  using (
    (select my_role()) in ('pmr', 'duty_doctor')
    and (select can_see_patient(patient_id))
  )
  with check (
    (select my_role()) in ('pmr', 'duty_doctor')
    and (select can_see_patient(patient_id))
  );

comment on policy patient_plans_update on patient_plans is
  'Clinical approval/update requires a clinician role (pmr or duty_doctor) plus the '
  'existing patient-visibility rule. is_admin_user() is deliberately NOT a permit: '
  'administering an institution does not confer clinical sign-off.';
