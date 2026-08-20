-- ============================================================================
-- Carelune — household capture: photos, event-level records, medicine purpose,
-- notifications. Run AFTER 0026. Idempotent.
--
-- Four changes, all driven by the caregiver experience:
--
--   1. STORAGE  — a family/caregiver may upload a photo for THEIR patient.
--                 Until now storage insert required is_staff(), so the people
--                 actually at the bedside could not send a wound or swallow
--                 photo at all.
--   2. care_events — event-level records. daily_readings holds ONE value per
--                 parameter per day, so "4 feeds, 5 position changes" was not
--                 merely unreported, it was unrepresentable.
--   3. medications.purpose — the plain-language reason a medicine is given
--                 ("blood thinner"), so a caregiver is not handling unnamed
--                 tablets.
--   4. notifications — per-user, per-patient, with the read stamp.
--
-- HOW TO APPLY: Supabase dashboard -> SQL Editor -> paste this file -> Run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Storage: household upload, scoped to their own patient.
--
-- The path is <centre_id>/<patient_id>/<file>. The centre segment must match
-- the PATIENT's real centre rather than the uploader's own claim, so a forged
-- path cannot place a file in another institution's folder. can_see_patient()
-- already restricts a family/caregiver to the patient they are linked to.
--
-- Insert only. Household accounts still cannot delete or overwrite: a clinical
-- record they can remove is not a record.
-- ---------------------------------------------------------------------------
drop policy if exists patient_docs_insert_household on storage.objects;
create policy patient_docs_insert_household on storage.objects for insert to authenticated
  with check (
    bucket_id = 'patient-docs'
    and not (select public.is_staff())
    and public.can_see_patient(((storage.foldername(name))[2])::uuid)
    and exists (
      select 1 from public.patients p
      where p.id = ((storage.foldername(name))[2])::uuid
        and p.centre_id = ((storage.foldername(name))[1])::uuid
    )
  );

-- The metadata row must be insertable by the same people, under the same rule.
drop policy if exists patient_documents_insert_household on public.patient_documents;
create policy patient_documents_insert_household on public.patient_documents for insert to authenticated
  with check (
    not (select public.is_staff())
    and (select public.can_see_patient(patient_id))
  );

-- ---------------------------------------------------------------------------
-- 2. care_events — one row per thing that happened.
--
-- Deliberately separate from daily_readings: that table is the day's summary
-- and several screens depend on its one-row-per-day shape. This is the event
-- stream beside it, so counts ("4 feeds") become real without a rewrite.
-- ---------------------------------------------------------------------------
create table if not exists care_events (
  id           uuid primary key default gen_random_uuid(),
  patient_id   uuid not null references patients(id) on delete cascade,
  centre_id    uuid not null references centres(id),
  kind         text not null check (kind in (
                 'feed','positioning','urine','bowel','vitals','medicine',
                 'therapy','secretion','pain','photo','note','other')),
  detail       text,
  amount       numeric,
  unit         text,
  document_id  uuid references patient_documents(id) on delete set null,
  occurred_at  timestamptz not null default now(),
  recorded_by  uuid references auth.users(id),
  created_at   timestamptz not null default now()
);
create index if not exists care_events_patient_day_idx on care_events (patient_id, occurred_at desc);

alter table care_events enable row level security;

drop policy if exists care_events_read on care_events;
create policy care_events_read on care_events for select
  using ((select can_see_patient(patient_id)));

-- Anyone who can see the patient may record an event: the caregiver at the
-- bedside is usually the one who saw it. Clinical DECISIONS remain staff-only
-- elsewhere; this is observation, not instruction.
drop policy if exists care_events_insert on care_events;
create policy care_events_insert on care_events for insert
  with check ((select can_see_patient(patient_id)));

-- Corrections are limited to the author, and only on the same day, so the
-- record cannot be quietly rewritten later.
drop policy if exists care_events_update_own on care_events;
create policy care_events_update_own on care_events for update
  using (recorded_by = auth.uid() and occurred_at > now() - interval '24 hours')
  with check (recorded_by = auth.uid());

grant select, insert, update on care_events to authenticated;

-- ---------------------------------------------------------------------------
-- 3. medications.purpose — plain language, for the person handing over tablets.
-- ---------------------------------------------------------------------------
alter table medications add column if not exists purpose text;

-- ---------------------------------------------------------------------------
-- 4. notifications — per recipient. Nobody reads anyone else's.
-- ---------------------------------------------------------------------------
create table if not exists notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  patient_id  uuid references patients(id) on delete cascade,
  kind        text not null check (kind in ('message','plan','task','reading','alert','system')),
  title       text not null,
  body        text,
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);
create index if not exists notifications_user_unread_idx
  on notifications (user_id, read_at, created_at desc);

alter table notifications enable row level security;

drop policy if exists notifications_read_own on notifications;
create policy notifications_read_own on notifications for select using (user_id = auth.uid());

-- Only the recipient marks their own notification read; nothing else is editable.
drop policy if exists notifications_update_own on notifications;
create policy notifications_update_own on notifications for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Insert is service_role / definer only: a client that could write notifications
-- to another user would be a spoofing surface.
revoke insert on notifications from authenticated;
grant select, update on notifications to authenticated;

-- Fan a notification out to everyone who can see the patient, except the actor.
create or replace function public.notify_patient_circle(
  p_patient uuid, p_kind text, p_title text, p_body text, p_except uuid default null
) returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications (user_id, patient_id, kind, title, body)
  select pr.id, p_patient, p_kind, p_title, p_body
  from public.profiles pr
  where pr.id is distinct from coalesce(p_except, '00000000-0000-0000-0000-000000000000'::uuid)
    and (
      (pr.centre_id = (select centre_id from public.patients where id = p_patient)
        and pr.role in ('nurse','duty_doctor','pmr'))
      or exists (select 1 from public.patient_members pm
                 where pm.patient_id = p_patient and pm.user_id = pr.id)
    );
end $$;
revoke execute on function public.notify_patient_circle(uuid, text, text, text, uuid) from public, anon;
grant execute on function public.notify_patient_circle(uuid, text, text, text, uuid) to authenticated, service_role;

-- Done.
