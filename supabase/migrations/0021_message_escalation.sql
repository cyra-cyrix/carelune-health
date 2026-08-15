-- ============================================================================
-- Carelune — family-message escalation SLA (run AFTER 0020).
--
-- Accountability: a family message that a nurse has READ but not REPLIED to
-- within 30 minutes is escalated — to the patient's centre duty doctor if one
-- exists, otherwise the HOD. The 30-minute clock only fires during nurse duty
-- hours (08:00–20:00 IST); overnight it pauses, so a late-evening message is
-- caught the next morning.
--
--   * approvals.escalated_at / escalated_to ('duty_doctor' | 'hod').
--   * escalate_overdue_patient_queries() : system job (SECURITY DEFINER; NOT
--     callable by app users) — scans every centre for read-but-unreplied family
--     queries past SLA, marks them escalated and drops a care-feed note.
--   * pg_cron runs it every 5 minutes (best-effort; if pg_cron cannot be enabled
--     the columns + function still install and you can schedule it manually).
--
-- No RLS is relaxed and no data is removed. Reversible.
-- HOW TO APPLY: supabase db push  (or Dashboard → SQL Editor → paste → Run).
-- ============================================================================

alter table public.approvals
  add column if not exists escalated_at timestamptz,
  add column if not exists escalated_to text check (escalated_to in ('duty_doctor', 'hod'));

-- System escalation sweep. Runs under pg_cron (no JWT), so it must NOT rely on
-- request_role()/my_centre(); it operates across all centres by design.
create or replace function public.escalate_overdue_patient_queries()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_count int := 0;
  r record;
  v_target text;
begin
  -- Duty hours only (08:00–20:00 IST). Outside the window the SLA clock pauses.
  if extract(hour from (now() at time zone 'Asia/Kolkata')) not between 8 and 19 then
    return 0;
  end if;

  for r in
    select a.id, a.patient_id, p.centre_id
    from public.approvals a
    join public.patients p on p.id = a.patient_id
    where a.type = 'patient_query'
      and a.status = 'pending'
      and a.read_at is not null
      and a.read_at < now() - interval '30 minutes'
      and a.escalated_at is null
      and not exists (select 1 from public.query_messages qm where qm.query_id = a.id)
  loop
    v_target := case
      when exists (select 1 from public.profiles pr where pr.centre_id = r.centre_id and pr.role = 'duty_doctor')
        then 'duty_doctor' else 'hod' end;

    update public.approvals set escalated_at = now(), escalated_to = v_target where id = r.id;

    insert into public.daily_updates (patient_id, source, author_name, body, flag)
    values (
      r.patient_id, 'nurse', 'Carelune',
      'A family message went unanswered for 30 minutes and was escalated to '
        || case when v_target = 'duty_doctor' then 'the duty doctor' else 'the HOD' end || '.',
      'watch'
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
revoke execute on function public.escalate_overdue_patient_queries() from public, anon, authenticated;
grant execute on function public.escalate_overdue_patient_queries() to service_role;

-- Schedule every 5 minutes via pg_cron. Best-effort: the migration must not fail
-- if pg_cron is unavailable — the columns and function are what matter.
do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'Carelune: pg_cron could not be enabled (%). Schedule escalate_overdue_patient_queries() manually.', sqlerrm;
  end;

  if exists (select 1 from pg_namespace where nspname = 'cron') then
    if exists (select 1 from cron.job where jobname = 'carelune-escalate-queries') then
      perform cron.unschedule('carelune-escalate-queries');
    end if;
    perform cron.schedule(
      'carelune-escalate-queries', '*/5 * * * *',
      'select public.escalate_overdue_patient_queries();'
    );
  else
    raise notice 'Carelune: cron schema absent — schedule escalate_overdue_patient_queries() every 5 min manually.';
  end if;
end $$;

-- ============================================================================
-- Done. Read-but-unreplied family messages escalate after 30 min of duty time.
-- ============================================================================
