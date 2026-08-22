-- ============================================================================
-- Carelune — 0034 · a clinician may change a draft before approving it.
--
--   *** Verified on LOCAL Supabase only. Not applied to production. ***
--
-- WHY
-- ---
-- 0033 gave the treating doctor `approve_patient_programme`. Approval that can
-- only say yes is not review: a compiler proposes activities marked
-- `ai_suggested`, and the clinician must be able to remove the ones they do not
-- want, and reorder the quick records a family will see, BEFORE they put their
-- name to it. This adds exactly that and nothing else.
--
-- WHAT IT DOES NOT DO
-- -------------------
-- It edits a DRAFT only. An approved programme is a clinical record and stays
-- immutable — changing care means compiling a new version and approving that,
-- which is why `patient_programmes` is versioned. The check is explicit rather
-- than implied.
--
-- HOW TO APPLY (once approved): Supabase dashboard -> SQL Editor -> paste -> Run.
-- Re-runs safely (idempotent).
-- ============================================================================

create or replace function public.revise_patient_programme_draft(
  p_programme     uuid,
  p_activities    jsonb,
  p_quick_records jsonb default '[]'::jsonb
) returns patient_programmes
language plpgsql security definer set search_path = public as $$
declare v_row patient_programmes;
begin
  select * into v_row from patient_programmes where id = p_programme;
  if not found then
    raise exception 'That programme does not exist';
  end if;
  if not is_staff() then
    raise exception 'Only the care team can change a care programme';
  end if;
  if not can_see_patient(v_row.patient_id) then
    raise exception 'That patient is not yours';
  end if;
  if v_row.status <> 'draft' then
    raise exception 'An approved programme is a clinical record — compile a new version instead of editing it';
  end if;

  if jsonb_typeof(p_activities) <> 'array' then
    raise exception 'Activities must be an array';
  end if;
  if jsonb_array_length(p_activities) = 0 then
    raise exception 'A programme with no care activities cannot be saved';
  end if;
  if jsonb_typeof(coalesce(p_quick_records, '[]'::jsonb)) <> 'array' then
    raise exception 'Quick records must be an array';
  end if;

  -- A quick record must name an activity that is actually in this programme.
  -- Otherwise a family is offered a button that resolves to nothing.
  if exists (
    select 1
      from jsonb_array_elements_text(coalesce(p_quick_records, '[]'::jsonb)) q(key)
     where not exists (
       select 1 from jsonb_array_elements(p_activities) a
        where a.value->>'key' = q.key
     )
  ) then
    raise exception 'A quick record must be one of this programme''s own activities';
  end if;

  update patient_programmes
     set activities    = p_activities,
         quick_records = coalesce(p_quick_records, '[]'::jsonb),
         updated_at    = now()
   where id = p_programme
  returning * into v_row;

  return v_row;
end $$;

revoke all on function public.revise_patient_programme_draft(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.revise_patient_programme_draft(uuid, jsonb, jsonb) to authenticated, service_role;

notify pgrst, 'reload schema';

-- ============================================================================
-- Done. One function. To reverse: drop it.
-- ============================================================================
