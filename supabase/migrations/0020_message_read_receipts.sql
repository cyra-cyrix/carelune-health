-- ============================================================================
-- Carelune — family-message read receipts (run AFTER 0019).
--
-- Accountability for the nurse (first point of contact): when staff open a
-- family message (approvals.type = 'patient_query'), it is stamped read. The
-- family then sees "Seen by the care team · <time>" and, once answered, "Replied".
--
--   * approvals.read_at / read_by : when + who first read the family message.
--   * mark_patient_query_read(p_patient) : staff-only, same-institution; stamps
--     every still-unread family query for a patient. SECURITY DEFINER so it does
--     not depend on the approvals UPDATE policy shape; it self-checks is_staff()
--     and the caller's centre. Households can already READ these columns (they
--     read their own patient_query rows), so the receipt shows on the family side.
--
-- No RLS is relaxed and no data is removed. Reversible (drop the columns/function).
-- HOW TO APPLY: supabase db push  (or Dashboard → SQL Editor → paste → Run).
-- ============================================================================

alter table public.approvals
  add column if not exists read_at timestamptz,
  add column if not exists read_by uuid references auth.users(id);

create or replace function public.mark_patient_query_read(p_patient uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_staff() then
    raise exception 'Only staff can mark messages read';
  end if;
  if (select centre_id from public.patients where id = p_patient) is distinct from public.my_centre() then
    raise exception 'Not your institution';
  end if;
  update public.approvals
     set read_at = now(), read_by = auth.uid()
   where patient_id = p_patient
     and type = 'patient_query'
     and read_at is null;
end $$;
revoke execute on function public.mark_patient_query_read(uuid) from public, anon;
grant execute on function public.mark_patient_query_read(uuid) to authenticated, service_role;

-- ============================================================================
-- Done. Opening a family message thread (staff) stamps read_at/read_by; the
-- family sees "Seen …" until the care team replies.
-- ============================================================================
