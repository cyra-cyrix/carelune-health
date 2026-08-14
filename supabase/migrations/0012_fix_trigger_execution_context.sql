-- ============================================================================
-- Carelune — fix trigger execution-context checks (run AFTER 0011). Idempotent.
--
-- WHY: the guards added in 0008 and 0011 used `current_user` to tell an end-user
-- request apart from a service_role (Edge Function) request. But these are all
-- SECURITY DEFINER functions, and inside a SECURITY DEFINER function `current_user`
-- is the FUNCTION OWNER (e.g. `postgres`), never `authenticated`. So:
--   * `current_user = 'authenticated'`  was ALWAYS false  -> the 0008 doctor-only
--     plan-activation guard never fired (any staff could activate a plan).
--   * `current_user <> 'authenticated'` was ALWAYS true   -> every 0011 provenance
--     / snapshot / consent guard took the "trusted, skip" branch and enforced
--     nothing.
--
-- FIX: identify the real caller from the request's JWT `role` claim
-- (`request.jwt.claims`), a request-scoped GUC that is NOT affected by
-- SECURITY DEFINER. `auth.uid()` / `my_role()` were already correct (they read
-- the same request GUCs), so only the `current_user` comparisons were wrong.
--
-- This migration is forward-only: it CREATE OR REPLACEs the guard functions
-- (triggers already reference them). It also:
--   * makes query replies enforce same-patient AND only-on-patient_query,
--   * derives author id/role/name (and approval/consent provenance) server-side,
--   * revokes unnecessary EXECUTE on the helper.
--
-- HOW TO APPLY: Supabase dashboard -> SQL Editor -> paste this file -> Run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- The reliable caller-role primitive: the JWT `role` claim set by PostgREST.
-- 'service_role' for Edge Functions, 'authenticated' for a signed-in user,
-- 'anon' otherwise. Unaffected by SECURITY DEFINER (reads a request GUC).
-- ---------------------------------------------------------------------------
create or replace function public.request_role()
returns text
language sql
stable
set search_path = public
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    'anon'
  );
$$;

-- ---------------------------------------------------------------------------
-- (4) Doctor-only plan activation (fixes the 0008 guard).
-- ---------------------------------------------------------------------------
create or replace function enforce_plan_activation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if request_role() <> 'service_role'
     and new.status = 'active'
     and old.status is distinct from 'active'
     and coalesce(my_role()::text, '') <> 'pmr' then
    raise exception 'Only a doctor can activate a patient plan';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- (1,6) Approval provenance: raised_by + from_name derived from the caller;
--       type restricted to what the caller's role may raise.
-- ---------------------------------------------------------------------------
create or replace function enforce_approval_provenance()
returns trigger language plpgsql security definer set search_path = public as $$
declare r app_role; nm text;
begin
  if request_role() = 'service_role' then
    return new;  -- trusted server path (registry Edge Function)
  end if;
  r := my_role();
  if r is null then
    raise exception 'Authentication required to raise a request';
  end if;
  new.raised_by := auth.uid();
  select full_name into nm from profiles where id = auth.uid();
  if nm is not null then new.from_name := nm; end if;
  if r in ('family', 'caregiver') and new.type <> 'patient_query' then
    raise exception 'This role may only raise a family query';
  elsif r = 'nurse' and new.type not in ('nurse_query', 'patient_query') then
    raise exception 'A nurse may only raise a nurse query';
  elsif r = 'duty_doctor' and new.type not in ('duty_med', 'patient_query') then
    raise exception 'A duty doctor may only raise a medicine suggestion';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- (5,6) Query replies: author id/role/name derived server-side; the reply must
--       belong to the same patient AND target a family query (patient_query).
-- ---------------------------------------------------------------------------
create or replace function enforce_query_message_patient()
returns trigger language plpgsql security definer set search_path = public as $$
declare qp uuid; qt approval_type;
begin
  if request_role() <> 'service_role' then
    new.author_id   := auth.uid();
    new.author_role := my_role();
    select full_name into new.author_name from profiles where id = auth.uid();
  end if;
  select patient_id, type into qp, qt from approvals where id = new.query_id;
  if qp is null or qp <> new.patient_id then
    raise exception 'The reply''s query does not belong to that patient';
  end if;
  if qt <> 'patient_query' then
    raise exception 'Replies are only allowed on family queries';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- (6) Task log: the logged task must belong to the patient; done_by derived.
-- ---------------------------------------------------------------------------
create or replace function enforce_task_log_patient()
returns trigger language plpgsql security definer set search_path = public as $$
declare tp uuid;
begin
  if request_role() <> 'service_role' then
    new.done_by := auth.uid();
  end if;
  select patient_id into tp from care_tasks where id = new.task_id;
  if tp is null or tp <> new.patient_id then
    raise exception 'The task does not belong to that patient';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- (2) Consent grantor derived from the caller; service_role (registry) keeps
--     the grantor it sets deliberately.
-- ---------------------------------------------------------------------------
create or replace function enforce_consent_grantor()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if request_role() <> 'service_role' then
    new.granted_by := auth.uid();
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- (3) Subscription package snapshot from the centre; never trusted from client.
-- ---------------------------------------------------------------------------
create or replace function enforce_subscription_snapshot()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_centre uuid; v_name text; v_price integer; v_trial integer;
begin
  if request_role() = 'service_role' then
    return new;
  end if;
  select centre_id into v_centre from patients where id = new.patient_id;
  select package_name, package_price, coalesce(trial_days, 0)
    into v_name, v_price, v_trial
    from centres where id = v_centre;
  new.recorded_by := auth.uid();
  new.pay_mode    := 'pay_at_centre';
  new.plan_name   := v_name;
  new.price       := v_price;
  new.trial_days  := v_trial;
  if v_trial > 0 then
    new.status     := 'trial';
    new.trial_ends := current_date + v_trial;
  else
    new.status     := 'active';
    new.trial_ends := null;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- (8) Least privilege.
--
-- 0011 revoked the privileged RPCs from PUBLIC only, but 0003 ran
-- `grant execute on all functions in schema public to authenticated`, leaving a
-- DIRECT grant to `authenticated` that PUBLIC-revoke does not remove. Verified by
-- the pgTAP tests: authenticated could still call add_caregiver_tx. Revoke the
-- direct grants too; only the Edge Functions (service_role) may call them.
-- ---------------------------------------------------------------------------
revoke execute on function register_patient_tx(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function add_caregiver_tx(uuid, uuid) from public, anon, authenticated;
grant execute on function register_patient_tx(uuid, uuid, jsonb, jsonb) to service_role;
grant execute on function add_caregiver_tx(uuid, uuid) to service_role;

-- request_role() is only needed by the SECURITY DEFINER guards (which run as the
-- owner), so no client role needs EXECUTE on it.
revoke execute on function public.request_role() from public, anon, authenticated;

-- ============================================================================
-- Done. Still outside this migration (remaining pilot gate): registration-link
-- expiry/rate-limit, OpenAI per-tenant rate limits + de-identification/DPA,
-- immutable audit_events table, orphan cleanup on platform-admin/admin-users.
-- ============================================================================
