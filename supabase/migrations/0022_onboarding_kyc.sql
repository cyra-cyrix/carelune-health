-- ============================================================================
-- Carelune — minimum onboarding: departments, basic KYC, consent (run AFTER 0021).
--
-- Trial-minimum only (no automation): the HOD declares the recovery departments
-- they serve, records basic credentialing (self-attested, not verified), and
-- accepts consent/terms. All fields sit on existing tables under existing RLS
-- (admin updates their own centre; a user updates their own profile) — no new
-- tables, functions, or policies. Reversible.
--
--   centres.departments         text[]   -- recovery departments served
--   centres.ce_reg_no           text     -- Clinical Establishments Act reg no.
--   centres.terms_accepted_at   timestamptz + terms_version text  -- consent stamp
--   profiles.med_reg_no         text     -- doctor NMC / state-council reg no.
--   profiles.specialty          text
--
-- Consent wording itself lives in the app as DRAFT copy — replace with
-- counsel-approved text before onboarding real patients.
-- HOW TO APPLY: supabase db push  (or Dashboard → SQL Editor → paste → Run).
-- ============================================================================

alter table public.centres
  add column if not exists departments       text[] not null default '{}',
  add column if not exists ce_reg_no          text,
  add column if not exists terms_accepted_at  timestamptz,
  add column if not exists terms_version      text;

alter table public.profiles
  add column if not exists med_reg_no text,
  add column if not exists specialty  text;

-- ============================================================================
-- Done. Additive columns only; existing rows keep departments = '{}' and nulls.
-- ============================================================================
