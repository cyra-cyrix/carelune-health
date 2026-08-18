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

/* ------------------------- activation, by actor --------------------------- */

/** The last `create or replace function <name>` body in migration order. */
function effectiveFunction(name: string): string {
  let found: string | null = null;
  for (const key of Object.keys(MIGRATIONS).sort()) {
    const matches = MIGRATIONS[key].match(
      new RegExp(`create or replace function ${name}\\([^)]*\\)[\\s\\S]*?end \\$\\$;`, "gi"),
    );
    if (matches) found = matches[matches.length - 1];
  }
  if (!found) throw new Error(`No function named ${name} found in the migration chain`);
  return found;
}

describe("activate_patient_plan — the effective function", () => {
  const fn = effectiveFunction("public\\.activate_patient_plan");

  it("admits the treating doctor only", () => {
    expect(fn).toContain("public.my_role() is distinct from 'pmr'");
  });

  it("no longer admits a duty doctor", () => {
    expect(fn).not.toContain("not in ('pmr','duty_doctor')");
    expect(fn).not.toContain("duty_doctor");
  });

  it("keeps the institution and plan-state checks", () => {
    expect(fn).toContain("v_centre is distinct from public.my_centre()");
    expect(fn).toContain("v_status <> 'approved'");
    expect(fn).toContain("Plan not found");
  });

  it("keeps the idempotent same-plan branch", () => {
    expect(fn).toContain("'already_active'");
  });

  it("still never deletes a care task, medication or task log", () => {
    expect(fn.toLowerCase()).not.toContain("delete from");
  });

  it("keeps the activation audit stamp", () => {
    expect(fn).toContain("activated_at = now(), activated_by = auth.uid()");
  });

  it("keeps its security configuration and grants", () => {
    const patch = migration("0026_activation_treating_doctor_only.sql");
    expect(fn).toContain("security definer set search_path = ''");
    expect(patch).toContain("revoke execute on function public.activate_patient_plan(uuid) from public, anon;");
    expect(patch).toContain("grant execute on function public.activate_patient_plan(uuid) to authenticated, service_role;");
  });

  it("leaves the patients_activation_guard trigger alone", () => {
    const patch = migration("0026_activation_treating_doctor_only.sql");
    expect(patch).not.toMatch(/create (or replace )?trigger/i);
    expect(patch).not.toMatch(/create or replace function enforce_plan_activation/i);
  });
});

/* The rule, modelled. `plan` carries whether this patient already has an active
   plan, which is what used to make a duty doctor's authority differ between a
   first plan and a later version. */
type Plan = { centreId: string; approved: boolean; alreadyActiveForThisPlan?: boolean };

function canActivatePlan(actor: Actor, plan: Plan): boolean {
  if (actor.role !== "pmr") return false;
  if (!canSeePatient(actor, { centreId: plan.centreId })) return false;
  return plan.approved;
}

const FIRST_PLAN: Plan = { centreId: "centre-a", approved: true };
const LATER_VERSION: Plan = { centreId: "centre-a", approved: true, alreadyActiveForThisPlan: false };

describe("who may activate a care plan", () => {
  const pmr: Actor = { role: "pmr", isAdmin: false, centreId: "centre-a" };
  const duty: Actor = { role: "duty_doctor", isAdmin: false, centreId: "centre-a" };

  it("the treating doctor can activate a plan for a patient they can see", () => {
    expect(canActivatePlan(pmr, FIRST_PLAN)).toBe(true);
  });

  it("a duty doctor cannot activate a first plan", () => {
    expect(canActivatePlan(duty, FIRST_PLAN)).toBe(false);
  });

  it("a duty doctor cannot activate a later plan version either", () => {
    expect(canActivatePlan(duty, LATER_VERSION)).toBe(false);
  });

  it("a duty doctor's authority no longer depends on whether the patient is already active", () => {
    expect(canActivatePlan(duty, FIRST_PLAN)).toBe(canActivatePlan(duty, LATER_VERSION));
  });

  it("an admin without the treating-doctor role cannot activate", () => {
    for (const role of ["nurse", "duty_doctor", "caregiver", "family"] as Role[]) {
      expect(canActivatePlan({ role, isAdmin: true, centreId: "centre-a" }, FIRST_PLAN)).toBe(false);
    }
  });

  it("a nurse cannot activate", () => {
    expect(canActivatePlan({ role: "nurse", isAdmin: false, centreId: "centre-a" }, FIRST_PLAN)).toBe(false);
  });

  it("an admin who is also the treating doctor keeps authority through the clinical role", () => {
    expect(canActivatePlan({ role: "pmr", isAdmin: true, centreId: "centre-a" }, FIRST_PLAN)).toBe(true);
  });

  it("a treating doctor from another institution is still denied", () => {
    expect(canActivatePlan(pmr, { centreId: "centre-b", approved: true })).toBe(false);
  });

  it("an unapproved plan cannot be activated by anyone", () => {
    expect(canActivatePlan(pmr, { centreId: "centre-a", approved: false })).toBe(false);
  });
});

/* Idempotency, modelled on the function's own branch: once this plan's runtime
   rows are active, a repeat call reports already_active and mutates nothing. */
type RuntimeState = { activePlanId: string | null; activations: number };

function activate(state: RuntimeState, actor: Actor, plan: Plan, planId: string): { status: string; state: RuntimeState } {
  if (!canActivatePlan(actor, plan)) throw new Error("Only the treating doctor can activate a care plan");
  if (state.activePlanId === planId) return { status: "already_active", state };
  return { status: "activated", state: { activePlanId: planId, activations: state.activations + 1 } };
}

describe("repeated activation by the treating doctor", () => {
  const pmr: Actor = { role: "pmr", isAdmin: false, centreId: "centre-a" };

  it("is idempotent — the second call changes nothing", () => {
    const first = activate({ activePlanId: null, activations: 0 }, pmr, FIRST_PLAN, "plan-1");
    expect(first.status).toBe("activated");

    const second = activate(first.state, pmr, FIRST_PLAN, "plan-1");
    expect(second.status).toBe("already_active");
    expect(second.state).toBe(first.state);
    expect(second.state.activations).toBe(1);
  });

  it("still switches cleanly to a new plan version", () => {
    const first = activate({ activePlanId: null, activations: 0 }, pmr, FIRST_PLAN, "plan-1");
    const next = activate(first.state, pmr, LATER_VERSION, "plan-2");
    expect(next.status).toBe("activated");
    expect(next.state.activePlanId).toBe("plan-2");
  });

  it("refuses a duty doctor at every attempt, first or repeat", () => {
    const duty: Actor = { role: "duty_doctor", isAdmin: true, centreId: "centre-a" };
    expect(() => activate({ activePlanId: null, activations: 0 }, duty, FIRST_PLAN, "plan-1")).toThrow();
    expect(() => activate({ activePlanId: "plan-1", activations: 1 }, duty, LATER_VERSION, "plan-2")).toThrow();
  });
});
