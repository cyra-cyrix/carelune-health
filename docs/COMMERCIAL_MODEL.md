# Carelune — commercial model (MVP)

_Last updated: 2026-08-14. Owner decision, recorded verbatim in intent below._

## The rule

**An institution has ONE commercial package and one price.** This holds even when the
institution has several clinical pathways enabled (Spine / Joint / Neuro).

- **Clinical pathways are templates, not products.** Enabling Spine + Neuro does **not**
  create two priced packages. It means the institution may run either clinical template;
  the family still buys the single institution package.
- **The single commercial source of truth is the institution record** —
  `centres.package_name`, `centres.package_price`, `centres.package_includes`,
  `centres.trial_days` (plus `centres.platform_fee_pct`, server-held, default 30%).
  These are edited by the HOD/admin on the **Programme** tab and in the onboarding wizard,
  and read by the family storefront.
- **We do NOT build** (at this stage): multi-package pricing, per-pathway pricing, a
  "primary pack" selector, plan catalogues, or storefront complexity.

## What changed from Phase 2

Phase 2 briefly made the per-pack `institution_pathway_config` the authoritative commercial
record and mirrored it down into `centres.package_*`. That is **reversed** for the MVP:

- Migration `0015` **drops** the `pathway_config_mirror` trigger. `centres.package_*` is once
  again the single, directly-edited commercial record.
- `set_institution_pathways()` now only **enables** the packs a Super Admin assigns; it no
  longer creates per-pack commercial config rows. Pathways carry clinical content only.
- The `institution_pathway_config` table is retained in the schema (unused for pricing) so no
  data is dropped; it may hold non-commercial clinical config later. The app neither reads nor
  writes its commercial columns.

## Billing

Billing is **settled at the centre** (`pay_mode = 'pay_at_centre'`). No payment gateway,
no card data. The family accepts the package (optionally a free trial); the centre collects
payment directly. Carelune's platform fee (`platform_fee_pct`, default 30%) is informational
and admin/super-admin facing only.
