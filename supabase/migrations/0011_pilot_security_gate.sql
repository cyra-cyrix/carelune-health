-- ============================================================================
-- Carelune — pre-pilot security gate (run AFTER 0010). Idempotent.
--
-- Closes the access-control blockers found in the pre-pilot security review:
--   B1. Privileged SECURITY DEFINER RPCs were executable by PUBLIC (Postgres
--       grants EXECUTE to PUBLIC by default; we only added a service_role grant).
--       add_caregiver_tx does no internal caller check, so any authenticated user
--       could link themselves to any patient and read the record. -> revoke PUBLIC.
--   B2. Households could read EVERY approval type (nurse_query / duty_med / internal
--       decisions) via the API. -> households now read only patient_query.
--   B3. Approval inserts accepted client-supplied type / raised_by. -> a trigger
--       forces raised_by = caller and restricts the type to the caller's role.
--   B4. query_messages / task_logs did not guarantee the referenced row belongs to
--       the stated patient. -> triggers enforce the relationship.
--   + Consent grantor and subscription price/plan are now server-derived, not
--     trusted from the browser.
--
-- Service-role (Edge Functions) and SECURITY DEFINER owner paths are exempt from
-- the triggers via a current_user guard, so registration still works.
--
-- HOW TO APPLY: Supabase dashboard -> SQL Editor -> paste this file -> Run.
-- Re-runs safely.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- B1. Revoke the default PUBLIC execute on privileged functions. Only the
--     Edge Functions (service_role) may call them; RLS helper functions used
--     inside policies are intentionally left executable by authenticated.
-- ---------------------------------------------------------------------------
revoke execute on function register_patient_tx(uuid, uuid, jsonb, jsonb) from public;
revoke execute on function add_caregiver_tx(uuid, uuid) from public;
revoke execute on function centre_id_for_token(text) from public, anon, authenticated;
-- Re-assert the only intended grants.
grant execute on function register_patient_tx(uuid, uuid, jsonb, jsonb) to service_role;
grant execute on function add_caregiver_tx(uuid, uuid) to service_role;
grant execute on function centre_id_for_token(text) to service_role;

-- ---------------------------------------------------------------------------
-- B2. Households read only their own patient_query rows; staff read all types.
-- ---------------------------------------------------------------------------
drop policy if exists approvals_read on approvals;
create policy approvals_read on approvals for select using (
  (select can_see_patient(patient_id))
  and ((select is_staff()) or type = 'patient_query')
);

-- ---------------------------------------------------------------------------
-- B3. Approval provenance: the caller cannot forge who raised it or raise a
--     type their role isn't allowed to. raised_by is always the caller.
-- ---------------------------------------------------------------------------
create or replace function enforce_approval_provenance()
returns trigger language plpgsql security definer set search_path = public as $$
declare r app_role;
begin
  if current_user <> 'authenticated' then
    return new;  -- service_role / definer paths are trusted
  end if;
  r := my_role();
  new.raised_by := auth.uid();
  if r in ('family', 'caregiver') and new.type <> 'patient_query' then
    raise exception 'This role may only raise a family query';
  elsif r = 'nurse' and new.type not in ('nurse_query', 'patient_query') then
    raise exception 'A nurse may only raise a nurse query';
  elsif r = 'duty_doctor' and new.type not in ('duty_med', 'patient_query') then
    raise exception 'A duty doctor may only raise a medicine suggestion';
  end if;
  return new;
end $$;

drop trigger if exists approvals_provenance_guard on approvals;
create trigger approvals_provenance_guard
  before insert on approvals
  for each row execute function enforce_approval_provenance();

-- ---------------------------------------------------------------------------
-- B4. Relationship integrity — the referenced row must belong to the patient.
-- ---------------------------------------------------------------------------
create or replace function enforce_query_message_patient()
returns trigger language plpgsql security definer set search_path = public as $$
declare qp uuid;
begin
  select patient_id into qp from approvals where id = new.query_id;
  if qp is null or qp <> new.patient_id then
    raise exception 'The reply''s query does not belong to that patient';
  end if;
  return new;
end $$;

drop trigger if exists query_messages_patient_guard on query_messages;
create trigger query_messages_patient_guard
  before insert or update on query_messages
  for each row execute function enforce_query_message_patient();

create or replace function enforce_task_log_patient()
returns trigger language plpgsql security definer set search_path = public as $$
declare tp uuid;
begin
  select patient_id into tp from care_tasks where id = new.task_id;
  if tp is null or tp <> new.patient_id then
    raise exception 'The task does not belong to that patient';
  end if;
  return new;
end $$;

drop trigger if exists task_logs_patient_guard on task_logs;
create trigger task_logs_patient_guard
  before insert or update on task_logs
  for each row execute function enforce_task_log_patient();

-- ---------------------------------------------------------------------------
-- Consent grantor is always the authenticated caller (not client-supplied).
-- ---------------------------------------------------------------------------
create or replace function enforce_consent_grantor()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_user = 'authenticated' then
    new.granted_by := auth.uid();
  end if;
  return new;
end $$;

drop trigger if exists consents_grantor_guard on consents;
create trigger consents_grantor_guard
  before insert on consents
  for each row execute function enforce_consent_grantor();

-- ---------------------------------------------------------------------------
-- Subscription is snapshotted from the centre's configured package, never
-- trusted from the browser. Households can start it; staff still UPDATE later
-- (e.g. mark paid) via the existing subscriptions_update policy.
-- ---------------------------------------------------------------------------
create or replace function enforce_subscription_snapshot()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_centre uuid; v_name text; v_price integer; v_trial integer;
begin
  if current_user <> 'authenticated' then
    return new;  -- service_role paths trusted
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

drop trigger if exists subscriptions_snapshot_guard on subscriptions;
create trigger subscriptions_snapshot_guard
  before insert on subscriptions
  for each row execute function enforce_subscription_snapshot();

-- ============================================================================
-- Done. Still OUTSIDE this migration (tracked as the remaining pilot gate):
--   * registration-link expiry / usage cap / rate limiting
--   * per-user/tenant rate limits on the OpenAI functions (cost abuse)
--   * an immutable audit_events table
--   * OpenAI DPA / zero-retention + de-identification of discharge text
--   * a real multi-account RLS + RPC integration test suite
-- ============================================================================
