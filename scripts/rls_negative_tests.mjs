#!/usr/bin/env node
/**
 * Carelune — live RLS negative-test harness (Layer 1 of PRELAUNCH_AUDIT.md).
 *
 * Proves TENANT ISOLATION on the real database: seeds two centres + two
 * households of synthetic accounts, then asserts every cross-tenant read/write
 * is DENIED. Cleans up after itself (best-effort teardown in `finally`).
 *
 * ── Run it ────────────────────────────────────────────────────────────────
 *   SUPABASE_URL=...  \
 *   SUPABASE_SERVICE_ROLE_KEY=...       # server secret — never in the client
 *   SUPABASE_PUBLISHABLE_KEY=...        # the anon/publishable key
 *   node scripts/rls_negative_tests.mjs
 *
 * Exit code 0 = all isolation assertions held. Non-zero = a leak was found.
 *
 * ⚠️  Run against STAGING or the freshly-reset DB *before* real patients exist.
 *     It creates and deletes @example.com accounts + test patients.
 */
import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
if (!URL || !SERVICE || !ANON) {
  console.error("Missing env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_PUBLISHABLE_KEY");
  process.exit(2);
}

const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const PW = "Rls-Test-Pw-12345!";
const TAG = `rls${Date.now()}`;
const anonClient = () => createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });

// ── tiny test runner ────────────────────────────────────────────────────────
let pass = 0, fail = 0;
const ok = (label) => { pass++; console.log(`  ✓ PASS  ${label}`); };
const bad = (label, detail) => { fail++; console.log(`  ✗ FAIL  ${label}${detail ? `  — ${detail}` : ""}`); };

/** A denial = an error OR an empty result set (RLS filters silently). */
function expectDenied(label, { data, error }) {
  if (error) return ok(`${label} (denied: ${error.code || "err"})`);
  if (!data || data.length === 0) return ok(`${label} (0 rows)`);
  bad(label, `LEAKED ${data.length} row(s)`);
}
/** A sanity check that legitimate access still works (guards against false-green). */
function expectVisible(label, { data, error }, min = 1) {
  if (error) return bad(label, `unexpected error ${error.code || ""} ${error.message || ""}`);
  if ((data?.length ?? 0) >= min) return ok(label);
  bad(label, `expected ≥${min} row(s), got ${data?.length ?? 0}`);
}
async function signIn(email) {
  const c = anonClient();
  const { error } = await c.auth.signInWithPassword({ email, password: PW });
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
  return c;
}

const ids = { users: [], centres: [], patients: [] };

async function mkUser(kind, role, centre_id) {
  const email = `${TAG}+${kind}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email, password: PW, email_confirm: true, user_metadata: { full_name: `Test ${kind}` },
  });
  if (error) throw new Error(`createUser ${kind}: ${error.message}`);
  const id = data.user.id;
  ids.users.push(id);
  // handle_new_user() already inserted a profiles row; set its role/centre via service_role.
  const { error: pe } = await admin.from("profiles").update({ role, centre_id: centre_id ?? null }).eq("id", id);
  if (pe) throw new Error(`profile update ${kind}: ${pe.message} (service_role needs UPDATE on profiles.role/centre_id)`);
  return { id, email };
}

async function setup() {
  console.log("• Seeding two centres + two households …");
  const { data: cA } = await admin.from("centres").insert({ name: `${TAG} Centre A` }).select("id").single();
  const { data: cB } = await admin.from("centres").insert({ name: `${TAG} Centre B` }).select("id").single();
  ids.centres.push(cA.id, cB.id);

  const pmrA = await mkUser("pmrA", "pmr", cA.id);
  const nurseA = await mkUser("nurseA", "nurse", cA.id);
  const familyA = await mkUser("familyA", "family", null);
  const caregiverA = await mkUser("caregiverA", "caregiver", null);
  const nurseB = await mkUser("nurseB", "nurse", cB.id);
  const familyB = await mkUser("familyB", "family", null);

  const { data: pA } = await admin.from("patients")
    .insert({ centre_id: cA.id, full_name: `${TAG} Patient A`, diagnosis: ["Ischaemic stroke"] }).select("id").single();
  const { data: pB } = await admin.from("patients")
    .insert({ centre_id: cB.id, full_name: `${TAG} Patient B`, diagnosis: ["Ischaemic stroke"] }).select("id").single();
  ids.patients.push(pA.id, pB.id);

  await admin.from("patient_members").insert([
    { patient_id: pA.id, user_id: familyA.id, relation: "family" },
    { patient_id: pA.id, user_id: caregiverA.id, relation: "caregiver" },
    { patient_id: pB.id, user_id: familyB.id, relation: "family" },
  ]);
  await admin.from("patient_care_team").insert([
    { patient_id: pA.id, staff_id: pmrA.id, team_role: "lead_doctor" },
    { patient_id: pA.id, staff_id: nurseA.id, team_role: "nurse" },
    { patient_id: pB.id, staff_id: nurseB.id, team_role: "nurse" },
  ]);
  await admin.from("medications").insert([
    { patient_id: pA.id, name: "Aspirin", dose: "75 mg", freq: "0-0-1" },
    { patient_id: pB.id, name: "Aspirin", dose: "75 mg", freq: "0-0-1" },
  ]);
  await admin.from("reading_thresholds").insert({ patient_id: pA.id, param: "bp_sys", min_val: 90, max_val: 140, unit: "mmHg" });
  await admin.from("daily_readings").insert([
    { patient_id: pA.id, bp: "132/84", grbs: "120" },
    { patient_id: pB.id, bp: "128/80", grbs: "118" },
  ]);
  await admin.from("patient_plans").insert({ patient_id: pA.id, centre_id: cA.id, content: {}, status: "draft" });

  return { pmrA, nurseA, familyA, caregiverA, nurseB, familyB, pA, pB };
}

async function run(s) {
  const { pA, pB } = s;

  console.log("\n─ Sanity (legitimate access must still work) ─");
  const pmrA = await signIn(s.pmrA.email);
  expectVisible("pmrA can see own-centre Patient A",
    await pmrA.from("patients").select("id").eq("id", pA.id));
  const familyA = await signIn(s.familyA.email);
  expectVisible("familyA can see own patient's readings",
    await familyA.from("daily_readings").select("id").eq("patient_id", pA.id));

  console.log("\n─ Cross-centre staff isolation ─");
  expectDenied("pmrA CANNOT read Centre B's Patient B",
    await pmrA.from("patients").select("id").eq("id", pB.id));
  const nurseB = await signIn(s.nurseB.email);
  expectDenied("Centre B nurse CANNOT read Centre A readings",
    await nurseB.from("daily_readings").select("id").eq("patient_id", pA.id));
  expectDenied("Centre B nurse CANNOT read Centre A medications",
    await nurseB.from("medications").select("id").eq("patient_id", pA.id));

  console.log("\n─ Cross-household (family/caregiver) isolation ─");
  expectDenied("familyA CANNOT read Patient B",
    await familyA.from("patients").select("id").eq("id", pB.id));
  expectDenied("familyA CANNOT read Patient B readings (direct PostgREST filter)",
    await familyA.from("daily_readings").select("id").eq("patient_id", pB.id));
  const familyB = await signIn(s.familyB.email);
  expectDenied("familyB CANNOT read Patient A medications",
    await familyB.from("medications").select("id").eq("patient_id", pA.id));

  console.log("\n─ Write-boundary (least privilege) ─");
  const caregiverA = await signIn(s.caregiverA.email);
  expectDenied("caregiverA CANNOT edit medications",
    await caregiverA.from("medications").update({ note: "hacked" }).eq("patient_id", pA.id).select());
  expectDenied("caregiverA CANNOT insert a threshold",
    await caregiverA.from("reading_thresholds").insert({ patient_id: pA.id, param: "grbs", max_val: 999 }).select());
  const nurseA = await signIn(s.nurseA.email);
  expectDenied("nurseA CANNOT edit medications (doctor-only)",
    await nurseA.from("medications").update({ note: "hacked" }).eq("patient_id", pA.id).select());
  expectDenied("nurseA CANNOT activate a plan (doctor-only gate)",
    await nurseA.from("patient_plans").update({ status: "active" }).eq("patient_id", pA.id).select());

  console.log("\n─ Unauthenticated ─");
  const anon = anonClient();
  expectDenied("anonymous CANNOT list patients",
    await anon.from("patients").select("id"));
  expectDenied("anonymous CANNOT list readings",
    await anon.from("daily_readings").select("id"));
}

async function teardown() {
  console.log("\n• Teardown …");
  for (const pid of ids.patients) await admin.from("patients").delete().eq("id", pid);
  for (const cid of ids.centres) await admin.from("centres").delete().eq("id", cid);
  for (const uid of ids.users) await admin.auth.admin.deleteUser(uid).catch(() => {});
}

(async () => {
  let setupOk = false;
  try {
    const s = await setup();
    setupOk = true;
    await run(s);
  } catch (e) {
    console.error(`\nSETUP/RUN ERROR: ${e.message}`);
    fail++;
  } finally {
    try { await teardown(); } catch (e) { console.error(`teardown error: ${e.message}`); }
  }
  console.log(`\n─── ${pass} passed, ${fail} failed ───`);
  if (!setupOk || fail > 0) {
    console.log("RESULT: ✗ isolation NOT proven — do not launch to real patients.");
    process.exit(1);
  }
  console.log("RESULT: ✓ all tenant-isolation assertions held.");
})();
