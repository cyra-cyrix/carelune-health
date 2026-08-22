-- ============================================================================
-- Carelune — 0035 · superseding a programme cancels its unmet expectations.
--
--   *** Verified on LOCAL Supabase only. Not applied to production. ***
--
-- WHY
-- ---
-- Approving a new version leaves the previous version's scheduled care in
-- place. Anything already recorded against it is history and must stay, but
-- anything still PENDING is an expectation from a plan that has been replaced —
-- and it keeps appearing on the family's day beside its replacement. Found on
-- staging: a patient on version 2 was shown every activity twice.
--
-- WHAT THIS DOES
-- --------------
-- On approval, the superseded version's PENDING occurrences become 'cancelled'.
-- Nothing is deleted: an occurrence that was recorded, partly recorded, refused
-- or missed is untouched, because each of those is a fact about what happened.
-- A cancelled row says "this was expected, then the plan changed", which is
-- also a fact, and one a clinician may want to see.
--
-- HOW TO APPLY (once approved): Supabase dashboard -> SQL Editor -> paste -> Run.
-- Re-runs safely (idempotent).
-- ============================================================================

alter table care_occurrences drop constraint if exists care_occurrences_status_check;
alter table care_occurrences add constraint care_occurrences_status_check
  check (status in ('pending','done','partial','unable','skipped','missed','cancelled'));

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

  -- Its unmet expectations stop being expected. Anything that was actually
  -- recorded — done, partial, unable, skipped — or that was missed is left
  -- exactly as it is, because each of those is a fact about what happened.
  update care_occurrences o
     set status = 'cancelled'
    from patient_programmes p
   where p.id = o.programme_id
     and p.subscription_id = v_row.subscription_id
     and p.id <> v_row.id
     and o.status = 'pending';

  update patient_programmes
     set status = 'approved', approved_by = auth.uid(), approved_at = now(),
         approval_note = nullif(btrim(coalesce(p_note, '')), ''), updated_at = now()
   where id = p_programme
  returning * into v_row;

  return v_row;
end $$;

revoke all on function public.approve_patient_programme(uuid, text) from public, anon;
grant execute on function public.approve_patient_programme(uuid, text) to authenticated, service_role;

notify pgrst, 'reload schema';

-- ============================================================================
-- Done. To reverse: restore the 0033 body of approve_patient_programme and drop
-- 'cancelled' from the status constraint (after moving any cancelled rows).
-- ============================================================================
