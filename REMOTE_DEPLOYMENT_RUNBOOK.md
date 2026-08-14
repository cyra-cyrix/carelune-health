# Carelune — Remote Deployment Runbook

**Target project ref:** `eixndbgphecohmandztq`
**Prepared:** 2026-08-14 · **Status:** NOT executed. This is a plan. Nothing in here has
been run against remote. Run it yourself, phase by phase, and stop at each ⛔ checkpoint.

**Goal:** reconcile the remote frontend/backend version mismatch that is currently
blocking `getMyOrg()`, registration-link generation, Super Admin, pathway assignment,
patient setup, and AI plan generation/activation — by bringing remote to the same
schema (`0001`–`0018`) and Edge Function set the frontend already expects.

**Local state (verified in this repo):**
- Migrations present locally: `0001` … `0018` (18 files).
- Edge Functions present locally: `admin-users`, `extract-facts`, `generate-plan`,
  `platform-admin`, `registry`, `structure-discharge`, `transcribe` (7).
- Repo is already linked to `eixndbgphecohmandztq` (`supabase/.temp/project-ref`).
- Supabase CLI observed locally: `2.109.0`. Postgres major version: `17`.

> ⚠️ **Ground rules**
> - Do **not** run `supabase db reset` against `--linked` — it wipes remote data.
> - Take the backup (Phase 2) **before** any `db push` / `migration repair`.
> - Migrations here have **no down-scripts**; rollback = restore from backup (Phase 8).
> - You will need the **database password** and a Supabase **access token** (login).
> - This project has **real patient data**. Treat every dump/backup as PHI: encrypt it,
>   keep it off shared drives, delete it when the deploy is confirmed good.

---

## Phase 0 — Prerequisites (safe; local + read-only auth)

```bash
# 1. Authenticate the CLI (opens a browser; creates a local access token)
supabase login

# 2. Confirm you can see the project
supabase projects list          # expect eixndbgphecohmandztq in the list

# 3. Link this repo to the project (idempotent; will prompt for the DB password)
supabase link --project-ref eixndbgphecohmandztq

# 4. Sanity: CLI version and that functions/migrations are present locally
supabase --version
ls supabase/migrations && ls supabase/functions
```

⛔ **Checkpoint 0:** `supabase projects list` shows the project and `link` succeeds. If
`login`/`link` fails, stop — everything downstream needs them.

---

## Phase 1 — Inspect remote state & detect manual (history-less) applies

### 1a. What the migration history says

```bash
supabase migration list --linked
```

This prints three columns: `Local | Remote | Time`. Read it as:

- **Local + Remote both present** → applied and recorded. Nothing to do.
- **Local present, Remote blank** → *candidate to apply* (Phase 3) — unless 1b shows its
  objects already exist (then it was applied manually → repair in Phase 3a).
- **Remote present, Local blank** → remote is ahead of the repo (unexpected here) — STOP
  and investigate before pushing.

Record the result into the table at the end of this doc (§ "Remote inventory result").

### 1b. What the schema actually contains (detects manual applies without history)

Run this **read-only** query in the Supabase Dashboard → SQL Editor. It reports whether
each migration's *canonical object* exists, independent of the history table:

```sql
select
  to_regclass('public.centres')                          is not null as m0001_centres,
  to_regclass('public.patients')                         is not null as m0001_patients,
  exists(select 1 from information_schema.columns
         where table_schema='public' and table_name='centres'
           and column_name='display_name')               as m0004_centres_branding,
  exists(select 1 from information_schema.columns
         where table_schema='public' and table_name='profiles'
           and column_name='is_super_admin')             as m0006_super_admin,
  exists(select 1 from information_schema.columns
         where table_schema='public' and table_name='centres'
           and column_name='invite_token')               as m0007_registration,
  to_regclass('public.storefronts')                      is not null as m0009_storefront,
  to_regclass('public.query_messages')                   is not null as m0010_query_replies,
  to_regclass('public.pathway_packs')                    is not null as m0013_pathway_engine,
  to_regclass('public.institution_pathways')             is not null as m0014_institution_setup,
  exists(select 1 from information_schema.columns
         where table_schema='public' and table_name='patients'
           and column_name='pathway_pack_id')            as m0015_patient_pathway_cols,
  to_regclass('public.patient_care_team')                is not null as m0015_care_team,
  to_regclass('public.patient_documents')                is not null as m0015_documents,
  to_regclass('public.patient_plans')                    is not null as m0016_plans,
  to_regclass('public.patient_document_facts')           is not null as m0016_doc_facts,
  to_regclass('public.institution_pathway_versions')     is not null as m0016_inst_versions,
  exists(select 1 from information_schema.columns
         where table_schema='public' and table_name='care_tasks'
           and column_name='source_plan_id')             as m0017_source_plan_id,
  exists(select 1 from information_schema.columns
         where table_schema='public' and table_name='patient_plans'
           and column_name='activated_at')               as m0017_activation_cols,
  exists(select 1 from pg_proc
         where proname='activate_patient_plan'
           and pg_get_functiondef(oid) ilike '%already_active%') as m0018_idempotent_activation;
```

Also confirm the private storage bucket the document flow needs (added in `0015`):

```sql
select id, public from storage.buckets where id = 'patient-docs';
```

**Interpretation (requirement 2 — manual applies):**
For each migration version V:
- history **has** V and objects **exist** → fine.
- history **missing** V but objects **exist** → *applied manually without a record*.
  **Do not push** V; **repair** it (Phase 3a) so `db push` won't try to recreate it.
- history **missing** V and objects **absent** → V is genuinely pending → apply (Phase 3).
- history **has** V but objects **absent** → history/schema drift (a manual drop, or a
  half-applied migration). STOP and investigate; do not push over it.

> Given the reported symptom (`getMyOrg()` failing on new `centres` columns, Super Admin
> and pathways broken), expect the boundary to sit somewhere around `0004`/`0014`–`0018`:
> early tables exist, later columns/tables do not. The two checks above tell you exactly
> where.

⛔ **Checkpoint 1:** you have a per-migration decision (apply / repair / already-applied /
investigate) written down. Do not proceed until every `0001`–`0018` row is classified.

---

## Phase 2 — Pre-deployment backup checklist (do this before any write)

Do **all** of the following and confirm each:

- [ ] **Dashboard backup point.** Dashboard → Database → **Backups**. Confirm a recent
      daily backup exists; if PITR is enabled, note the current timestamp as the restore
      target. If you can trigger an on-demand backup, do it now and record its ID/time.
- [ ] **Logical schema dump (belt-and-suspenders):**
      ```bash
      supabase db dump --linked -f backups/pre_deploy_schema_$(date +%Y%m%d).sql
      ```
- [ ] **Logical data dump (PHI — encrypt & store securely):**
      ```bash
      supabase db dump --linked --data-only -f backups/pre_deploy_data_$(date +%Y%m%d).sql
      ```
- [ ] **Roles dump:**
      ```bash
      supabase db dump --linked --role-only -f backups/pre_deploy_roles_$(date +%Y%m%d).sql
      ```
- [ ] **Record the deploy baseline:** current `git rev-parse HEAD` of this repo, the
      `supabase migration list` output, and the Phase-1 SQL result.
- [ ] **Note the current secrets:** `supabase secrets list` (names only) so you know what
      changed.
- [ ] **Announce a short maintenance window** — activation and registration writes should
      be quiet during the push.

⛔ **Checkpoint 2 (HARD GATE):** backups exist and are restorable. **Do not continue**
without a verified backup. This is the point of no cheap return.

---

## Phase 3 — Apply ONLY the missing migrations (safe order)

### 3a. Reconcile history for any manually-applied migrations (from Phase 1b)

For **each** version that the schema already contains but history is missing, record it as
applied so `db push` skips it:

```bash
# Example only — run for the actual versions you identified in Phase 1.
supabase migration repair --status applied 0013
supabase migration repair --status applied 0014
# ...one per manually-applied version...
supabase migration list --linked   # re-verify: those versions now show under Remote
```

> If Phase 1b showed history/schema drift (history has V but objects are gone), resolve
> that first — do not repair or push over it.

### 3b. Dry-run, then apply the genuinely-pending migrations

`supabase db push` applies all pending migrations **in ascending numeric order**
(`0001 → 0018`), which is the correct and only safe order here. Preview first:

```bash
supabase db push --linked --dry-run      # lists exactly what WILL run — read it
```

⛔ **Checkpoint 3a:** the dry-run lists **only** the versions you classified as "apply" in
Phase 1 — no surprises, nothing already-present. If it lists a migration whose objects
already exist, stop and repair it (3a) instead.

Then apply:

```bash
supabase db push --linked                # applies pending migrations in order
supabase migration list --linked         # confirm 0001..0018 all show under Remote
```

Re-run the **Phase 1b SQL** — every column should now be `true`, including
`m0018_idempotent_activation` and the `patient-docs` bucket.

⛔ **Checkpoint 3b:** all 18 migrations recorded remotely; Phase-1b SQL all `true`.

---

## Phase 4 — Deploy / redeploy Edge Functions

All seven must be deployed so remote matches the frontend contract. Redeploying an
already-present function is safe (it publishes a new version).

| Function | Purpose | Uses OpenAI | Uses service role |
|---|---|:--:|:--:|
| `platform-admin`     | Super Admin org/platform operations         |    | ✅ |
| `admin-users`        | Org admin: create/list team users           |    | ✅ |
| `registry`           | Public patient registration + add-caregiver |    | ✅ |
| `structure-discharge`| Legacy discharge structuring                | ✅ |    |
| `transcribe`         | Caregiver voice-note transcription          | ✅ |    |
| `extract-facts`      | Stage A: read discharge doc → facts         | ✅ | ✅ |
| `generate-plan`      | Stage B: governed plan draft                | ✅ | ✅ |

Deploy all at once, or one at a time:

```bash
# All functions:
supabase functions deploy --project-ref eixndbgphecohmandztq

# …or individually (use if you want to watch each build; extract-facts pulls unpdf/npm
# deps and takes longest):
supabase functions deploy platform-admin      --project-ref eixndbgphecohmandztq
supabase functions deploy admin-users         --project-ref eixndbgphecohmandztq
supabase functions deploy registry            --project-ref eixndbgphecohmandztq
supabase functions deploy structure-discharge --project-ref eixndbgphecohmandztq
supabase functions deploy transcribe          --project-ref eixndbgphecohmandztq
supabase functions deploy extract-facts       --project-ref eixndbgphecohmandztq
supabase functions deploy generate-plan       --project-ref eixndbgphecohmandztq

supabase functions list --project-ref eixndbgphecohmandztq   # confirm all 7 ACTIVE
```

> `config.toml` sets no per-function `verify_jwt` overrides, so all deploy with the
> default (`verify_jwt = true`). The public registration page authorises via the anon key
> + invite token, which satisfies JWT verification — no override needed.

⛔ **Checkpoint 4:** `functions list` shows all 7 with a fresh deploy timestamp.

---

## Phase 5 — Required secrets

Supabase **auto-injects** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
(and `SUPABASE_DB_URL`) into every Edge Function at runtime. The `SUPABASE_` prefix is
**reserved** — you cannot and must not set those via `secrets set`. The only secret you
must provide is the OpenAI key (plus optional model overrides):

```bash
supabase secrets set OPENAI_API_KEY=sk-...             --project-ref eixndbgphecohmandztq
# Optional model pins (defaults exist in code if unset):
supabase secrets set OPENAI_MODEL=gpt-4o-mini          --project-ref eixndbgphecohmandztq
supabase secrets set OPENAI_TRANSCRIBE_MODEL=whisper-1 --project-ref eixndbgphecohmandztq

supabase secrets list --project-ref eixndbgphecohmandztq   # confirm OPENAI_API_KEY present
```

> ⚠️ Do **not** paste the key into this file, chat, or a commit. Enter it directly in your
> terminal. If it was ever exposed, rotate it in the OpenAI dashboard.

> **Verify the API context:** confirm the project's API values in Dashboard → Settings →
> API match what the frontend `.env.local` uses (same `VITE_SUPABASE_URL` and anon key),
> so the functions the frontend calls are on the same project as the schema you just
> pushed.

⛔ **Checkpoint 5:** `secrets list` shows `OPENAI_API_KEY`. The AI functions
(`extract-facts`, `generate-plan`) will 500 without it.

---

## Phase 6 — Post-deployment functional checks (synthetic UAT)

Do these in order in the app (http://localhost:5173 against remote, or the deployed URL).
Use **synthetic** data only — no real discharge summaries. Sign in as the doctor
(`vivek@carelune.in`).

1. [ ] **Doctor profile & admin nav** — Command Centre loads; **Team** and **Programme**
       tabs are visible (profile `is_admin`); the console no longer shows `getMyOrg` 400s.
2. [ ] **Super Admin visible** — sign in as the platform super-admin; the org console
       renders (backed by `platform-admin`).
3. [ ] **Pathway packs appear** — in Programme / pathway assignment, the packs
       **Spine**, **Joint Replacement**, **Neuro** are listed.
4. [ ] **Assign Joint Replacement to Vivek's institution** — enable the `joint` pack for
       the institution; confirm it persists (super-admin `set_institution_pathways`, or the
       admin surface). Re-open to verify it stays enabled.
5. [ ] **Generate a permanent registration link** — Registration link tab → generate;
       confirm a stable `?register=<token>` URL is produced and reloads consistently.
6. [ ] **Register one synthetic patient** — open the link in a fresh/incognito window,
       create a synthetic family account, register a fake patient (e.g. "Test Patient TKR").
7. [ ] **Upload a synthetic discharge summary** — in patient setup, upload a small
       synthetic PDF/JPG (≤10 MB) as the discharge summary; confirm it lists.
8. [ ] **Extract facts** — in Plan Studio, "Read document" → facts populate with
       `document` provenance (exercises `extract-facts` + `patient-docs` bucket + OpenAI).
9. [ ] **Generate → approve → activate a plan** — assign/approve the `joint` pathway
       version, answer the three questions, Generate, edit, **Approve & activate**
       (exercises `generate-plan` + `activate_patient_plan`). Confirm the success summary.
10. [ ] **Caregiver sees tasks** — sign in as the synthetic caregiver; Today shows the
        activated care tasks and medicines.
11. [ ] **Family sees the activated plan** — sign in as the synthetic family; the approved
        recovery plan card renders.
12. [ ] **Re-activation is safe** — re-run activation on the same plan; no duplicate tasks,
        task logs preserved (idempotency from `0018`).

⛔ **Checkpoint 6:** all 12 pass. Any failure → capture the console/network error and the
function logs (`supabase functions logs <name> --project-ref eixndbgphecohmandztq`), then
decide fix-forward vs rollback (Phase 8).

---

## Phase 7 — Run the Supabase Advisors (Security + Performance)

- **Dashboard → Advisors → Security Advisor** — run it. Expect **0 ERROR**. Review any
  WARN: RLS-disabled tables, `SECURITY DEFINER` functions without a pinned `search_path`,
  exposed extensions. (The migrations enable RLS and pin `search_path = ''` on definer
  functions — new WARNs here would indicate something applied differently on remote.)
- **Dashboard → Advisors → Performance Advisor** — run it. Review unindexed foreign keys /
  unused indexes on the new tables (`patient_plans`, `patient_care_team`,
  `patient_documents`, `patient_document_facts`, `institution_pathway_versions`).
- **Export/screenshot both reports** and attach to the deploy record.

Optional CLI lint (same rule family as the advisors):

```bash
supabase db lint --linked --level warning
```

⛔ **Checkpoint 7:** Security Advisor = 0 ERROR; every WARN is either resolved or explicitly
accepted with a reason recorded. Do **not** open new migrations to "fix" advisor warnings
as part of this deploy unless a finding is a genuine ERROR — file them as follow-up.

---

## Phase 8 — Rollback / recovery

**If Phase 3 (migrations) goes wrong:**
- These migrations have no down-scripts. Restore from the Phase-2 backup:
  - **PITR** (if enabled): Dashboard → Database → Backups → restore to the timestamp you
    recorded **before** the push.
  - **Daily backup:** restore the most recent pre-deploy daily backup.
  - **Logical dump:** restore `pre_deploy_schema` + `pre_deploy_data` into a **staging**
    project first, verify, then cut over — never blind-restore data over live.
- If a migration failed **mid-push**, `supabase migration list` will show a partial state.
  Do **not** re-push blindly. Restore the backup, then re-run Phase 1 to re-plan.
- To fix only the history table (objects fine, history wrong):
  `supabase migration repair --status applied|reverted <version>`.

**If Phase 4 (functions) goes wrong:**
- Redeploy the previous good version from git:
  ```bash
  git checkout <last-known-good-sha> -- supabase/functions/<name>
  supabase functions deploy <name> --project-ref eixndbgphecohmandztq
  git checkout HEAD -- supabase/functions/<name>
  ```
- Functions are independent of the DB; a bad function never corrupts data.

**If Phase 5 (secrets) is wrong:**
- Re-set `OPENAI_API_KEY` (secrets are read at runtime; no redeploy needed). Rotate the key
  if it may have leaked.

**Data integrity note:** activation (`activate_patient_plan`) is non-destructive and
idempotent (`0018`) — a retried activation cannot duplicate or delete runtime records, so
re-running Phase 6 step 9/12 is safe.

---

## Remote inventory result (fill in during Phase 1)

| Migration | In history (list) | Objects exist (SQL) | Decision |
|---|:--:|:--:|---|
| 0001 carelune_core |  |  |  |
| 0002 seed_pilot |  |  |  |
| 0003 grants |  |  |  |
| 0004 multitenant_branding |  |  |  |
| 0005 service_role_grants |  |  |  |
| 0006 super_admin |  |  |  |
| 0007 registration |  |  |  |
| 0008 hardening |  |  |  |
| 0009 storefront |  |  |  |
| 0010 query_replies |  |  |  |
| 0011 pilot_security_gate |  |  |  |
| 0012 fix_trigger_execution_context |  |  |  |
| 0013 pathway_engine |  |  |  |
| 0014 institution_setup |  |  |  |
| 0015 patient_intake_assignment |  |  |  |
| 0016 plan_generation |  |  |  |
| 0017 document_extraction_and_activation |  |  |  |
| 0018 activation_idempotent |  |  |  |

Decision key: **apply** (pending) · **repair** (manual-applied, record only) ·
**skip** (already applied+recorded) · **investigate** (drift).

---

## One-page command sequence (after each ⛔ passes)

```bash
# 0. prereqs
supabase login && supabase link --project-ref eixndbgphecohmandztq

# 1. inspect  (also run the Phase-1b SQL in the dashboard)
supabase migration list --linked

# 2. backup  (HARD GATE)
supabase db dump --linked -f backups/pre_deploy_schema_$(date +%Y%m%d).sql
supabase db dump --linked --data-only -f backups/pre_deploy_data_$(date +%Y%m%d).sql
supabase db dump --linked --role-only -f backups/pre_deploy_roles_$(date +%Y%m%d).sql

# 3. reconcile history for manual applies, then apply the rest
#    supabase migration repair --status applied <version>   # per Phase 1 finding
supabase db push --linked --dry-run
supabase db push --linked
supabase migration list --linked

# 4. functions
supabase functions deploy --project-ref eixndbgphecohmandztq
supabase functions list --project-ref eixndbgphecohmandztq

# 5. secret
supabase secrets set OPENAI_API_KEY=sk-... --project-ref eixndbgphecohmandztq
supabase secrets list --project-ref eixndbgphecohmandztq

# 6. functional UAT in the app (12 steps)
# 7. Advisors in the dashboard (Security = 0 ERROR)
```

**Nothing above has been executed. Confirm you want to proceed, and I'll walk each phase
with you — but you run the commands that touch remote.**
