import { describe, expect, it } from "vitest";

/* ============================================================================
   Who may approve a patient plan.

   There is no database in this test run, so these tests do NOT execute a live
   RLS round-trip. They assert two things instead:

     1. the EFFECTIVE `patient_plans_update` policy — the last definition across
        the migration chain, which is what Postgres ends up with — is written the
        way the clinical boundary requires;
     2. the actor rules implied by that policy, evaluated against a model of
        `my_role()` and `can_see_patient()` transcribed from 0001.

   If someone re-widens the policy in a later migration, (1) fails. If someone
   changes what the rule is meant to mean, (2) fails.
   ========================================================================== */

// Read through Vite rather than node:fs so the suite needs no extra typings.
const MIGRATIONS: Record<string, string> = import.meta.glob("../../supabase/migrations/*.sql", {
  query: "?raw",
  import: "default",
  eager: true,
});

/** One migration's SQL, by filename. */
function migration(file: string): string {
  const key = Object.keys(MIGRATIONS).find((k) => k.endsWith(`/${file}`));
  if (!key) throw new Error(`Migration ${file} not found`);
  return MIGRATIONS[key];
}

/** The last `create policy <name>` body in migration order — what actually applies. */
function effectivePolicy(name: string): string {
  let found: string | null = null;
  for (const key of Object.keys(MIGRATIONS).sort()) {
    const matches = MIGRATIONS[key].match(new RegExp(`create policy ${name} on [\\s\\S]*?;`, "gi"));
    if (matches) found = matches[matches.length - 1];
  }
  if (!found) throw new Error(`No policy named ${name} found in the migration chain`);
  return found.toLowerCase().replace(/\s+/g, " ");
}

describe("patient_plans_update — the effective policy", () => {
  const policy = effectivePolicy("patient_plans_update");

  it("requires a clinical role", () => {
    expect(policy).toContain("my_role()) in ('pmr', 'duty_doctor')");
  });

  it("still requires the patient-visibility rule that carries the institution boundary", () => {
    expect(policy).toContain("can_see_patient(patient_id)");
  });

  it("applies the same rule to USING and WITH CHECK, so a row cannot be written into view", () => {
    const clauses = policy.split("with check");
    expect(clauses).toHaveLength(2);
    for (const clause of clauses) {
      expect(clause).toContain("my_role()) in ('pmr', 'duty_doctor')");
      expect(clause).toContain("can_see_patient(patient_id)");
    }
  });

  it("does not let institution administration stand in for clinical sign-off", () => {
    expect(policy).not.toContain("is_admin_user");
  });
});

/* ------------------------- the rule, by actor ----------------------------- */

type Role = "pmr" | "duty_doctor" | "nurse" | "caregiver" | "family";

type Actor = {
  role: Role;
  /** profiles.is_admin — institution administration, not clinical authority. */
  isAdmin: boolean;
  centreId: string;
  /** An explicit patient_members row (the household route into can_see_patient). */
  memberOfPatient?: boolean;
};

type Patient = { centreId: string };

const STAFF: Role[] = ["nurse", "duty_doctor", "pmr"];

/** Transcribed from 0001: staff in the same centre, or an explicit member row. */
function canSeePatient(actor: Actor, patient: Patient): boolean {
  const asStaff = STAFF.includes(actor.role) && actor.centreId === patient.centreId;
  return asStaff || actor.memberOfPatient === true;
}

/** The effective patient_plans_update rule asserted above. */
function canApprovePlan(actor: Actor, patient: Patient): boolean {
  const clinical = actor.role === "pmr" || actor.role === "duty_doctor";
  return clinical && canSeePatient(actor, patient);
}

const OUR_CENTRE: Patient = { centreId: "centre-a" };
const OTHER_CENTRE: Patient = { centreId: "centre-b" };

describe("who may approve a patient plan", () => {
  it("a doctor with access to the patient can approve", () => {
    expect(canApprovePlan({ role: "pmr", isAdmin: false, centreId: "centre-a" }, OUR_CENTRE)).toBe(true);
  });

  it("a duty doctor with access to the patient can approve — the established role contract", () => {
    expect(canApprovePlan({ role: "duty_doctor", isAdmin: false, centreId: "centre-a" }, OUR_CENTRE)).toBe(true);
  });

  it("a nurse who is also an institution admin cannot approve", () => {
    expect(canApprovePlan({ role: "nurse", isAdmin: true, centreId: "centre-a" }, OUR_CENTRE)).toBe(false);
  });

  it("a non-clinical admin cannot approve", () => {
    for (const role of ["nurse", "caregiver", "family"] as Role[]) {
      expect(canApprovePlan({ role, isAdmin: true, centreId: "centre-a" }, OUR_CENTRE)).toBe(false);
    }
  });

  it("being an admin never adds authority a clinician would not already have", () => {
    const plain = canApprovePlan({ role: "pmr", isAdmin: false, centreId: "centre-a" }, OUR_CENTRE);
    const admin = canApprovePlan({ role: "pmr", isAdmin: true, centreId: "centre-a" }, OUR_CENTRE);
    expect(admin).toBe(plain);
  });

  it("a doctor from another institution is still denied", () => {
    expect(canApprovePlan({ role: "pmr", isAdmin: false, centreId: "centre-a" }, OTHER_CENTRE)).toBe(false);
    expect(canApprovePlan({ role: "duty_doctor", isAdmin: true, centreId: "centre-a" }, OTHER_CENTRE)).toBe(false);
  });

  it("a household member is not a clinician, even on their own patient", () => {
    expect(canApprovePlan({ role: "family", isAdmin: false, centreId: "centre-a", memberOfPatient: true }, OUR_CENTRE)).toBe(false);
  });
});

/* --------------------------- activation, unchanged ------------------------ */

describe("activation authority is deliberately untouched by this patch", () => {
  it("still admits pmr and duty_doctor at the RPC", () => {
    const rpc = migration("0018_activation_idempotent.sql");
    expect(rpc).toContain("my_role() not in ('pmr','duty_doctor')");
  });

  it("records the duty-doctor first-plan/subsequent-plan inconsistency as an open decision", () => {
    const patch = migration("0025_clinical_approval_authority.sql");
    expect(patch).toMatch(/remaining role-policy decision/i);
    // The patch must not quietly redefine activation while fixing approval.
    expect(patch).not.toMatch(/create or replace function public\.activate_patient_plan/i);
    expect(patch).not.toMatch(/create trigger/i);
  });
});
