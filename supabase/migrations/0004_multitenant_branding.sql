-- ============================================================================
-- Carelune — multi-tenant white-label + admin capability (run AFTER 0001-0003).
--
-- Each `centres` row is an ORG (tenant). The org admin names the platform and
-- (later) uploads a logo; the app rebrands to that name for everyone in the org.
-- One account per org is the admin (is_admin); the admin creates the rest.
-- ============================================================================

-- Branding on the org.
alter table centres add column if not exists display_name   text;      -- "Dr. Vivek — Care Continues"
alter table centres add column if not exists logo_url       text;
alter table centres add column if not exists subdomain      text;      -- reserved; wildcard routing comes later
alter table centres add column if not exists setup_complete boolean not null default false;

-- Unique subdomain when set (nulls allowed and not unique-constrained).
create unique index if not exists centres_subdomain_key on centres (subdomain) where subdomain is not null;

-- Admin capability on the account.
alter table profiles add column if not exists is_admin boolean not null default false;

-- Security-definer helper: is the current user an org admin?
create or replace function is_admin_user()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from profiles where id = auth.uid()), false)
$$;

-- Admins may update their own org's branding.
drop policy if exists centres_admin_update on centres;
create policy centres_admin_update on centres for update
  using (id = my_centre() and is_admin_user())
  with check (id = my_centre() and is_admin_user());

-- ============================================================================
-- Done. `authenticated` already has table/function grants from 0003; the new
-- helper inherits execute via the default privileges set there.
-- ============================================================================
