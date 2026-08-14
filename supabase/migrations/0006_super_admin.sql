-- ============================================================================
-- Carelune — platform Super Admin + temporary-password reset (run AFTER 0001-0005).
--
-- Hierarchy:
--   Super Admin (Carelune platform)  -> creates orgs + each org's admin
--   Org Admin (HOD)                  -> sets display name, creates team, onboards
--   Team (doctor/nurse/caregiver/family)
--
-- New accounts get a temporary password and must set their own on first login.
-- ============================================================================

-- Platform-level super admin (belongs to no single org; operates across all).
alter table profiles add column if not exists is_super_admin boolean not null default false;

-- Set true when an account is created with a temporary password; the app forces
-- a password reset on first login, then clears it.
alter table profiles add column if not exists must_reset_password boolean not null default false;

-- ============================================================================
-- Designate your Carelune super admin (edit the email), e.g.:
--   update profiles set is_super_admin = true
--   where id = (select id from auth.users where email = 'you@carelune.in');
-- ============================================================================
