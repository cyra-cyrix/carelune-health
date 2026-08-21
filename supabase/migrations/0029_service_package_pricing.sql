-- ============================================================================
-- Carelune — 0029 · the provider sets what families pay.
--
--   *** DRAFT — verified on LOCAL Supabase only. Not applied to hosted. ***
--
-- WHY THIS EXISTS AT ALL
-- ----------------------
-- The AI deliberately never prices a package (D-003: it structures a service,
-- it does not set commercials), and 0027 gives `authenticated` SELECT and
-- nothing else on service_packages. So until now only service_role could put a
-- number on a package, and a provider had no way to price their own programmes
-- — enrolment showed "Price not set". This is the narrowest thing that closes
-- that: one function, no schema change, no policy change, no new table grant.
--
-- WHAT IT DELIBERATELY CANNOT DO
-- ------------------------------
--   * It takes a price and a currency. It does not take a platform fee — that
--     stays 20% (D-004), and 0027's guard independently pins platform_fee_pct
--     to its previous value for every non-service_role caller, so the fee is
--     safe even if this function were wrong.
--   * It cannot touch duration, monitoring domains, check-in or review cadence,
--     support level, milestones or includes. Those are clinical configuration,
--     frozen by 0027 once the service is published, and a repricing is not a
--     clinical change.
--   * It is not billing. No discounts, tax, invoices or collection exist here;
--     `price` is what a family is told they pay, settled at the centre.
--
-- WHO MAY CALL IT
-- ---------------
-- The clinician designated on the service — the same person who confirmed it at
-- Level 2. Designation is the authority (D-003), so an administrator who does
-- not own the service cannot reprice it.
--
-- EXISTING ENROLMENTS ARE UNAFFECTED
-- ----------------------------------
-- 0028 froze price_snapshot and platform_fee_pct_snapshot onto each enrolment,
-- and enforce_subscription_immutable() rejects any attempt to move them. A
-- patient stays on the price they enrolled at; the next patient gets the new one.
--
-- HOW TO APPLY (once approved): Supabase dashboard -> SQL Editor -> paste -> Run.
-- Re-runs safely (idempotent). Rollback: drop the function.
-- ============================================================================

create or replace function public.set_service_package_price(
  p_package  uuid,
  p_price    integer,
  p_currency text default 'INR'
)
returns service_packages
language plpgsql security definer set search_path = public as $$
declare v_row service_packages; v_ctx record; v_currency text;
begin
  select s.centre_id as svc_centre, s.status as svc_status,
         s.provider_approver_profile_id as approver
    into v_ctx
    from service_packages p
    join centre_services s on s.id = p.centre_service_id
   where p.id = p_package;

  if not found then
    raise exception 'That programme does not exist';
  end if;
  if v_ctx.svc_centre is distinct from my_centre() then
    raise exception 'That programme belongs to another organisation';
  end if;
  if v_ctx.approver is distinct from auth.uid() then
    raise exception 'Only the clinician this service is assigned to may set its price';
  end if;
  if v_ctx.svc_status <> 'published' then
    raise exception 'Confirm this service before pricing it';
  end if;

  if p_price is null or p_price < 0 then
    raise exception 'A price cannot be negative';
  end if;
  -- A sanity ceiling, not a business rule: it catches a stray keystroke turning
  -- 18,000 into 1,800,000 before a family is ever shown it.
  if p_price > 10000000 then
    raise exception 'That price looks wrong — check it before saving';
  end if;

  v_currency := upper(coalesce(nullif(trim(p_currency), ''), 'INR'));
  if v_currency !~ '^[A-Z]{3}$' then
    raise exception 'That is not a currency Carelune recognises';
  end if;

  -- Only these two columns. platform_fee_pct is not in the statement at all,
  -- and the 0027 guard would pin it back regardless.
  update service_packages
     set price = p_price, currency = v_currency
   where id = p_package
  returning * into v_row;

  return v_row;
end $$;

-- 0011 lesson B1: Postgres grants EXECUTE to PUBLIC by default on new functions.
revoke execute on function public.set_service_package_price(uuid, integer, text) from public, anon;
grant  execute on function public.set_service_package_price(uuid, integer, text) to authenticated, service_role;
