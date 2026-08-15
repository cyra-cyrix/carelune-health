-- ============================================================================
-- Carelune — grant self-update on the KYC columns (run AFTER 0022).
--
-- 0022 added profiles.med_reg_no / profiles.specialty as columns, but the
-- `authenticated` role only had COLUMN-LEVEL update grants on
-- (full_name, must_reset_password) — a deliberate anti-privilege-escalation
-- pattern (a user must never be able to update their own is_admin / role /
-- centre_id). So saveDoctorKyc() failed with 42501 "permission denied for
-- table profiles" — the grant, not RLS, blocks it: PostgREST checks table/column
-- privileges BEFORE the profiles_self_update (id = auth.uid()) policy applies.
--
-- Extend the SAME column-level grant to the two self-attested KYC fields. RLS
-- still restricts the write to the user's own row. No table-level grant is added.
-- HOW TO APPLY: supabase db push  (or Dashboard → SQL Editor → paste → Run).
-- ============================================================================

grant update (med_reg_no, specialty) on public.profiles to authenticated;

-- Tell PostgREST to pick up the new grants (and 0022's columns) immediately,
-- otherwise the REST API lags the database until its next cache reload.
notify pgrst, 'reload schema';

-- ============================================================================
-- Done. Users can now self-attest med_reg_no + specialty on their own profile.
-- ============================================================================
