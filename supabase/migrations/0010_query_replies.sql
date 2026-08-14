-- ============================================================================
-- Carelune — nurse-led family communication (run AFTER 0009).
--
-- Model: a family/caregiver raises a concern or question (an `approvals` row of
-- type 'patient_query'). The NURSE is the first-level responder and replies to
-- the family. The DOCTOR sees the whole exchange and can also reply / intervene,
-- especially on urgent (serious) ones. A single reply field can't hold that
-- back-and-forth, so replies live in their own thread table.
--
--   * query_messages : one row per staff reply on a patient_query. Everyone who
--     can see the patient can READ the thread (so the family sees the replies).
--     Only STAFF (nurse / duty_doctor / pmr) may POST a reply.
--   * approvals: the nurse may now mark a patient_query answered (status change).
--     Clinical decisions on nurse_query / duty_med stay PMR-only (unchanged).
--
-- HOW TO APPLY: Supabase dashboard -> SQL Editor -> paste this file -> Run.
-- Re-runs safely.
-- ============================================================================

create table if not exists query_messages (
  id           uuid primary key default gen_random_uuid(),
  query_id     uuid not null references approvals(id) on delete cascade,
  patient_id   uuid not null references patients(id) on delete cascade,
  author_id    uuid references auth.users(id),
  author_role  app_role,
  author_name  text,
  body         text not null,
  created_at   timestamptz not null default now()
);

create index if not exists query_messages_query_idx on query_messages(query_id, created_at);
create index if not exists query_messages_patient_idx on query_messages(patient_id, created_at);

alter table query_messages enable row level security;
grant select, insert on query_messages to authenticated, service_role;

-- Read: anyone who can see the patient (family + caregiver + their centre staff).
drop policy if exists query_messages_read on query_messages;
create policy query_messages_read on query_messages for select
  using ((select can_see_patient(patient_id)));

-- Insert: only staff reply, and only as themselves (author_id + author_role must
-- match the caller). The family raises concerns via `approvals`, not here.
drop policy if exists query_messages_insert on query_messages;
create policy query_messages_insert on query_messages for insert
  with check (
    (select is_staff())
    and (select can_see_patient(patient_id))
    and author_id = auth.uid()
    and author_role = (select my_role())
  );

-- ---------------------------------------------------------------------------
-- Let the nurse mark a FAMILY query answered/reviewed (status change on a
-- patient_query row only). PMR keeps full decide rights via approvals_decide.
-- Clinical approvals (nurse_query / duty_med) remain PMR-only.
-- ---------------------------------------------------------------------------
drop policy if exists approvals_nurse_reply on approvals;
create policy approvals_nurse_reply on approvals for update
  using ((select my_role()) = 'nurse' and type = 'patient_query' and (select can_see_patient(patient_id)))
  with check ((select my_role()) = 'nurse' and type = 'patient_query' and (select can_see_patient(patient_id)));

-- ============================================================================
-- Done. No Edge Function changes required — the app reads/writes these under
-- RLS with the caller's own JWT.
-- ============================================================================
