/*
 * A medicine slot, as the person giving it sees it.
 *
 * "Morning medicines" is not a checkbox. It is a list of the actual medicines
 * this patient takes at that time, each recorded on its own — because one can be
 * given while another is refused, and a single tick over the lot would record
 * something that did not happen.
 *
 * EVERYTHING SHOWN HERE IS VERIFIED PRESCRIPTION DATA.
 * ---------------------------------------------------
 * The name, strength, timing and food relation come from the patient's own
 * `medications` records — the one medication store, maintained by a clinician.
 * The programme's dose activity holds only IDS into it. Nothing about a drug is
 * copied into the programme, produced by the compiler, or inferred from text.
 * If the link is missing or resolves to nothing, this says so and refuses to
 * record a completion for medicines it cannot name.
 *
 * PURPOSE is shown only when the prescriber wrote one (`medications.note`).
 * There is no fallback, because a plausible-sounding purpose presented as fact
 * is worse than no purpose at all.
 */
import { useEffect, useMemo, useState } from "react";
import {
  clearMedAdmin, getMedAdminToday, getMedications, setMedAdmin,
  type MedAdminStatus, type MedicationRow,
} from "../../../lib/db";
import type { CareActivity } from "../../../domain/careActivityModel";
import { CareIcon, SectionLabel } from "./careKit";

/** What the prescriber said about food, read from the medication record only. */
export type FoodRelation = "before" | "after" | "unspecified";

export function foodRelationOf(m: MedicationRow): FoodRelation {
  // Only the prescriber's own wording is read. Nothing is inferred from the
  // drug, and anything unrecognised stays "unspecified" rather than guessed.
  const t = `${m.timing ?? ""}`.toLowerCase();
  if (/before food|empty stomach|before meal/.test(t)) return "before";
  if (/after food|with food|after meal|post food/.test(t)) return "after";
  return "unspecified";
}

const GROUPS: { key: FoodRelation; label: string }[] = [
  { key: "before", label: "Before food" },
  { key: "after", label: "After food" },
  { key: "unspecified", label: "As directed" },
];

export type MedicineDoseState = { medication: MedicationRow; status: MedAdminStatus | undefined };

/** The slot's headline: how many medicines, and how many are still outstanding. */
export function summariseSlot(rows: MedicineDoseState[]): { total: number; remaining: number } {
  return {
    total: rows.length,
    remaining: rows.filter((r) => r.status === undefined).length,
  };
}

export default function MedicineSheet({
  activity, patientId, onRecorded, onClose,
}: {
  activity: CareActivity;
  patientId: string;
  /** Called with the per-medicine outcome once every medicine has one. */
  onRecorded: (detail: { name: string; status: MedAdminStatus }[]) => Promise<void>;
  onClose: () => void;
}) {
  const [meds, setMeds] = useState<MedicationRow[] | null>(null);
  const [admin, setAdmin] = useState<Map<string, MedAdminStatus>>(new Map());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([
      getMedications(patientId).catch(() => [] as MedicationRow[]),
      getMedAdminToday(patientId).catch(() => new Map<string, MedAdminStatus>()),
    ]).then(([m, a]) => {
      if (!active) return;
      setMeds(m.filter((x) => x.active));
      setAdmin(a);
    });
    return () => { active = false; };
  }, [patientId]);

  /* Only the medicines a clinician linked to THIS slot. An id that no longer
     resolves to an active medication is simply absent — never substituted. */
  const mine = useMemo(
    () => (meds ?? []).filter((m) => activity.medicationIds.includes(m.id)),
    [meds, activity.medicationIds],
  );

  const statusOf = (m: MedicationRow) => admin.get(`${m.id}|${activity.key}`);

  const mark = async (m: MedicationRow, status: MedAdminStatus) => {
    const key = `${m.id}|${activity.key}`;
    const current = admin.get(key);
    setError(null);
    // Tapping the same answer again clears it — a mis-tap must be correctable
    // before it becomes part of the day's record.
    const next = new Map(admin);
    if (current === status) next.delete(key);
    else next.set(key, status);
    setAdmin(next);
    try {
      if (current === status) await clearMedAdmin(patientId, m.id, activity.key);
      else await setMedAdmin(patientId, m.id, activity.key, status);
    } catch (e) {
      setAdmin(admin);
      setError(e instanceof Error ? e.message : "Could not save that.");
    }
  };

  const rows: MedicineDoseState[] = mine.map((m) => ({ medication: m, status: statusOf(m) }));
  const { total, remaining } = summariseSlot(rows);
  const allAnswered = total > 0 && remaining === 0;

  /* ---- the link has not been made, or resolves to nothing ---- */
  if (meds !== null && mine.length === 0) {
    return (
      <div className="pb-2">
        <div className="mt-2 rounded-2xl bg-warn-50 p-4 ring-1 ring-warn-500/25">
          <p className="text-[15px] font-semibold text-ink">
            Medication details need confirmation from your care team.
          </p>
          <p className="mt-1.5 text-[14px] leading-relaxed text-sage-600">
            We will not record this as given until your care team has confirmed which medicines
            belong to this time.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="tap mt-5 w-full rounded-2xl bg-mist-100 py-3.5 text-[15px] font-semibold text-ink hover:bg-mist-200"
        >
          Close
        </button>
      </div>
    );
  }

  if (meds === null) {
    return <p className="py-8 text-center text-[14px] text-sage-500">Loading this patient&apos;s medicines…</p>;
  }

  return (
    <div className="pb-2">
      {activity.instructions && (
        <p className="mt-1 text-[15px] leading-relaxed text-sage-600">{activity.instructions}</p>
      )}
      <p className="mt-2 text-[13px] text-sage-500">
        {total} {total === 1 ? "medicine" : "medicines"}
        {remaining > 0 ? ` · ${remaining} remaining` : " · all recorded"}
      </p>

      {GROUPS.map((g) => {
        const inGroup = rows.filter((r) => foodRelationOf(r.medication) === g.key);
        if (inGroup.length === 0) return null;
        return (
          <section key={g.key} className="mt-6">
            <SectionLabel>{g.label}</SectionLabel>
            <ul className="mt-2 space-y-2.5">
              {inGroup.map((r) => <MedicineRow key={r.medication.id} row={r} onMark={mark} />)}
            </ul>
          </section>
        );
      })}

      {error && <p className="mt-4 text-[13.5px] text-coral-600">{error}</p>}

      <div className="mt-6 flex gap-2.5">
        <button
          type="button"
          onClick={onClose}
          className="tap min-h-[50px] flex-1 rounded-2xl bg-mist-100 text-[15px] font-semibold text-ink hover:bg-mist-200"
        >
          Close
        </button>
        <button
          type="button"
          disabled={busy || !allAnswered}
          onClick={async () => {
            setBusy(true); setError(null);
            try {
              await onRecorded(
                rows.map((r) => ({ name: r.medication.name, status: r.status as MedAdminStatus })),
              );
            } catch (e) {
              setError(e instanceof Error ? e.message : "Could not save that.");
            } finally {
              setBusy(false);
            }
          }}
          className="tap min-h-[50px] flex-[1.6] rounded-2xl bg-ink text-[15px] font-semibold text-white disabled:opacity-40"
        >
          {busy ? "Saving…" : "Done"}
        </button>
      </div>
      {!allAnswered && total > 0 && (
        <p className="mt-2 text-center text-[12.5px] text-sage-500">
          Answer each medicine — one can be given while another is not.
        </p>
      )}
      <p className="mt-4 text-[12px] leading-relaxed text-sage-500">
        These are the medicines on{" "}
        <span className="font-medium text-sage-600">your care team&apos;s own record</span>. If
        anything here looks wrong, tell them rather than changing what you give.
      </p>
    </div>
  );
}

function MedicineRow({
  row, onMark,
}: { row: MedicineDoseState; onMark: (m: MedicationRow, s: MedAdminStatus) => void }) {
  const m = row.medication;
  const given = row.status === "given";
  const notGiven = row.status === "missed" || row.status === "skipped";

  return (
    <li className="rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(23,33,38,0.04)] ring-1 ring-ink/[0.06]">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[16px] font-semibold text-ink">{m.name}</p>
        {row.status && (
          <span className={`shrink-0 text-[12px] font-semibold ${given ? "text-good-600" : "text-warn-600"}`}>
            {given ? "Taken" : "Not taken"}
          </span>
        )}
      </div>
      {m.dose && <p className="mt-0.5 text-[14.5px] text-sage-600">{m.dose}</p>}
      {/* Purpose only where the prescriber wrote one. Never inferred. */}
      {m.note && <p className="mt-1 text-[13.5px] leading-relaxed text-sage-500">{m.note}</p>}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          aria-pressed={given}
          onClick={() => onMark(m, "given")}
          className={`tap min-h-[46px] rounded-xl text-[15px] font-semibold transition-colors ${
            given ? "bg-ink text-white" : "bg-mist text-ink ring-1 ring-ink/10 hover:bg-mist-100"
          }`}
        >
          Taken
        </button>
        <button
          type="button"
          aria-pressed={notGiven}
          onClick={() => onMark(m, "missed")}
          className={`tap min-h-[46px] rounded-xl text-[15px] font-semibold transition-colors ${
            notGiven ? "bg-ink text-white" : "bg-mist text-ink ring-1 ring-ink/10 hover:bg-mist-100"
          }`}
        >
          Not taken
        </button>
      </div>
      {given && (
        <p className="mt-2 flex items-center gap-1 text-[12px] text-sage-500">
          <CareIcon.Check size={12} /> Recorded
        </p>
      )}
    </li>
  );
}
