-- ============================================================================
-- Carelune — patient self-registration via an org invite link (run AFTER 0006).
--
-- Adds a reusable per-org registration token. A family opens the link, and the
-- `registry` Edge Function (service_role) creates their login + a PENDING patient
-- record + consent. The doctor later attaches the plan and activates it.
--
-- We never expose `centres` to the public. Instead a SECURITY DEFINER function
-- resolves ONLY the centre id for an exact token match, callable by the function.
--
-- HOW TO APPLY: Supabase dashboard -> SQL Editor -> paste this file -> Run.
-- ============================================================================

-- A random, unguessable token per org. Regenerating it invalidates old links.
alter table centres add column if not exists invite_token text;
create unique index if not exists centres_invite_token_idx
  on centres(invite_token) where invite_token is not null;

-- Resolve a centre id from a registration token, bypassing RLS safely: it can
-- only ever return the id for an exact token match, nothing else about the org.
create or replace function centre_id_for_token(t text)
returns uuid
language sql stable security definer set search_path = public as $$
  select id from centres where invite_token = t and t is not null limit 1
$$;

grant execute on function centre_id_for_token(text) to anon, authenticated, service_role;

-- ============================================================================
-- Notes:
-- * Pending patients use patients.status = 'pending' (already a free-text
--   column, no schema change) until the doctor activates the plan.
-- * The `registry` function is deployed with --no-verify-jwt because the
--   register action runs before the family has an account; it authorises via
--   the token instead. The add-caregiver action verifies the caller's JWT.
-- ============================================================================
