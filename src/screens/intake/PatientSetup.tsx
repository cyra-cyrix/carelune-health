import { useEffect, useRef, useState } from "react";
import {
  getPatient, extractFacts, savePlanIntake,
  getCentreStaff, getCareTeam, setCareTeamMember,
  getHouseholdMembers, addCaregiver,
  getPatientDocuments, uploadPatientDocument, deletePatientDocument, getDocumentUrl,
  type PatientRow, type StaffMember, type CareTeamMember,
  type HouseholdMember, type DocumentRow, type TeamRole,
} from "../../lib/db";
import {
  Card, Field, inputCls, PrimaryButton, GhostButton, Chip,
  Skeleton, ErrorNote, SectionHeader,
} from "../../components/system";

const DOC_TYPES: { key: DocumentRow["doc_type"]; label: string }[] = [
  { key: "discharge_summary", label: "Discharge summary" },
  { key: "imaging", label: "Imaging / scan" },
  { key: "prescription", label: "Prescription" },
  { key: "lab", label: "Lab report" },
  { key: "other", label: "Other" },
];
const DOC_LABEL = Object.fromEntries(DOC_TYPES.map((d) => [d.key, d.label]));

const fmtSize = (b: number | null) =>
  b == null ? "" : b < 1024 ? `${b} B` : b < 1_048_576 ? `${Math.round(b / 1024)} KB` : `${(b / 1_048_576).toFixed(1)} MB`;

/**
 * Patient Setup — the staff step between registration and plan-building. Assign the
 * clinical pathway (only institution-enabled packs appear), the care team (doctor /
 * nurse / coordinator, all same-institution), and upload private documents. Nothing
 * here activates clinical care; the doctor builds and approves the plan next.
 */
export default function PatientSetup({
  patientId, onExit, onContinue,
}: { patientId: string; onExit: () => void; onContinue: () => void }) {
  const [patient, setPatient] = useState<PatientRow | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  /*
   * Pasted text and the doctor's instruction are collected HERE, beside the
   * upload, because this is the screen where the doctor is holding the paperwork.
   * Continue commits them so the next screen can draft without asking again:
   * the instruction is stored as a non-negotiable, and pasted text is turned into
   * document facts exactly as an uploaded file would be.
   */
  const [extras, setExtras] = useState<{ pasted: string; note: string }>({ pasted: "", note: "" });
  const [continuing, setContinuing] = useState(false);
  const [continueErr, setContinueErr] = useState<string | null>(null);

  const handleContinue = async () => {
    setContinuing(true); setContinueErr(null);
    try {
      if (extras.note.trim()) {
        await savePlanIntake(patientId, {
          milestone_goal: "", milestone_by: "", monitor_focus: "", non_negotiables: extras.note.trim(),
        });
      }
      if (extras.pasted.trim().length > 40) {
        await extractFacts(patientId, { dischargeText: extras.pasted.trim() });
      }
      onContinue();
    } catch (e) {
      setContinueErr(e instanceof Error ? e.message : "Could not save that. Try again.");
      setContinuing(false);
    }
  };

  useEffect(() => {
    let active = true;
    void getPatient(patientId)
      .then((p) => { if (active) setPatient(p); })
      .catch((e) => { if (active) setLoadErr(e instanceof Error ? e.message : "Could not load the patient."); });
    return () => { active = false; };
  }, [patientId]);

  if (loadErr) {
    return (
      <div className="min-h-full bg-mist p-6">
        <ErrorNote>{loadErr}</ErrorNote>
        <GhostButton onClick={onExit} className="mt-3">← Back</GhostButton>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-mist">
      <div className="mx-auto max-w-[920px] px-5 py-6 lg:px-8">
        <GhostButton onClick={onExit} className="!px-3 !py-1.5 text-[13px]">← Back to caseload</GhostButton>

        <div className="mt-3 flex flex-wrap items-center gap-2.5">
          <h1 className="font-display text-[24px] font-semibold tracking-tight text-ink">
            Set up {patient?.full_name ?? "…"}
          </h1>
          {patient && (
            <span className="rounded-full bg-warn-100 px-2.5 py-0.5 text-[11px] font-semibold text-warn-600">
              {patient.status === "pending" ? "Needs setup" : patient.status}
            </span>
          )}
        </div>
        <p className="mt-1 text-[14px] text-sage-500">
          Add the care team and the discharge document. Carelune drafts the recovery programme next — you review and approve it.
        </p>

        <div className="mt-6 space-y-5">
          <TeamSection patientId={patientId} />
          <DocumentsSection patientId={patientId} extras={extras} onExtras={setExtras} />

          {continueErr && <ErrorNote>{continueErr}</ErrorNote>}
          <div className="flex flex-wrap items-center justify-end gap-3 pt-1">
            <GhostButton onClick={onExit}>Save &amp; close</GhostButton>
            <PrimaryButton onClick={handleContinue} disabled={continuing}>
              {continuing ? "Saving…" : "Continue — draft the recovery plan →"}
            </PrimaryButton>
          </div>
        </div>
      </div>
    </div>
  );
}

const TEAM_ROLES: { key: TeamRole; label: string; roles: StaffMember["role"][] }[] = [
  { key: "lead_doctor", label: "Lead doctor", roles: ["pmr", "duty_doctor"] },
  { key: "nurse", label: "Nurse", roles: ["nurse"] },
  { key: "coordinator", label: "Coordinator", roles: ["pmr", "nurse", "duty_doctor"] },
];

function TeamSection({ patientId }: { patientId: string }) {
  const [staff, setStaff] = useState<StaffMember[] | null>(null);
  const [team, setTeam] = useState<CareTeamMember[]>([]);
  const [household, setHousehold] = useState<HouseholdMember[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busyRole, setBusyRole] = useState<TeamRole | null>(null);

  const load = async () => {
    const [s, t, h] = await Promise.all([
      getCentreStaff().catch(() => [] as StaffMember[]),
      getCareTeam(patientId).catch(() => [] as CareTeamMember[]),
      getHouseholdMembers(patientId).catch(() => [] as HouseholdMember[]),
    ]);
    setStaff(s); setTeam(t); setHousehold(h);
  };
  useEffect(() => { void load(); }, [patientId]);

  const currentFor = (role: TeamRole) => team.find((m) => m.team_role === role)?.staff_id ?? "";

  const change = async (role: TeamRole, staffId: string) => {
    setBusyRole(role); setErr(null);
    try {
      await setCareTeamMember(patientId, role, staffId || null);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not update the care team.");
    } finally { setBusyRole(null); }
  };

  return (
    <Card>
      <SectionHeader title="Care team" sub="Assign staff from your institution. Caregivers are added by the family or below." />
      <div className="mt-4 space-y-3">
        {err && <ErrorNote>{err}</ErrorNote>}
        {staff === null ? (
          <Skeleton className="h-32" />
        ) : (
          TEAM_ROLES.map((tr) => {
            const options = staff.filter((s) => tr.roles.includes(s.role));
            return (
              <div key={tr.key} className="grid items-center gap-2 sm:grid-cols-[140px_1fr]">
                <span className="text-[13px] font-semibold text-sage-700">{tr.label}</span>
                <select
                  value={currentFor(tr.key)}
                  disabled={busyRole === tr.key}
                  onChange={(e) => void change(tr.key, e.target.value)}
                  className={inputCls}
                  aria-label={`Assign ${tr.label}`}
                >
                  <option value="">— Not assigned —</option>
                  {options.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.full_name || s.email} ({s.role === "pmr" ? "PM&R" : s.role === "duty_doctor" ? "Doctor" : "Nurse"})
                    </option>
                  ))}
                </select>
              </div>
            );
          })
        )}

        <div className="h-px bg-line" />
        <div>
          <p className="text-[12.5px] font-semibold text-sage-600">Household</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {household.length === 0 ? (
              <span className="text-[12.5px] text-sage-500">No caregiver or family linked yet.</span>
            ) : (
              household.map((h) => (
                <Chip key={h.user_id} tone="grey">
                  {(h.full_name || "Member")} · {h.relation === "self" ? "Patient" : h.relation === "caregiver" ? "Caregiver" : "Family"}
                </Chip>
              ))
            )}
          </div>
          <AddCaregiver patientId={patientId} onAdded={load} />
        </div>
      </div>
    </Card>
  );
}

function AddCaregiver({ patientId, onAdded }: { patientId: string; onAdded: () => void | Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const canAdd = fullName.trim().length > 1 && email.trim().length > 3 && password.length >= 6 && !busy;

  const add = async () => {
    setBusy(true); setErr(null); setOk(false);
    try {
      await addCaregiver({ patient_id: patientId, full_name: fullName.trim(), email: email.trim(), password, phone: phone.trim() || undefined });
      setOk(true); setFullName(""); setEmail(""); setPhone(""); setPassword("");
      await onAdded();
      setTimeout(() => { setOk(false); setOpen(false); }, 1400);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not add the caregiver.");
    } finally { setBusy(false); }
  };

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-2.5 text-[12.5px] font-semibold text-sky-700 hover:text-sky-800">
        + Add a caregiver login
      </button>
    );
  }

  return (
    <div className="mt-3 rounded-2xl border border-line bg-mist-50 p-3.5">
      <div className="grid gap-2.5 sm:grid-cols-2">
        <Field label="Caregiver name"><input value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputCls} placeholder="Full name" /></Field>
        <Field label="Phone (optional)"><input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" className={inputCls} placeholder="Mobile" /></Field>
        <Field label="Email (their login)"><input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className={inputCls} placeholder="caregiver@email.com" /></Field>
        <Field label="Temporary password" hint="They reset it on first sign-in."><input value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} placeholder="At least 6 characters" /></Field>
      </div>
      {err && <p className="mt-2 text-[12px] text-coral-600">{err}</p>}
      <div className="mt-2.5 flex items-center gap-3">
        <PrimaryButton onClick={add} disabled={!canAdd}>{busy ? "Adding…" : "Add caregiver"}</PrimaryButton>
        <GhostButton onClick={() => setOpen(false)} className="!py-2 !px-3 text-[13px]">Cancel</GhostButton>
        {ok && <span className="text-[12.5px] font-semibold text-good-600">Added ✓</span>}
      </div>
    </div>
  );
}

/* ------------------------------ documents -------------------------------- */

function DocumentsSection({ patientId, extras, onExtras }: {
  patientId: string;
  extras: { pasted: string; note: string };
  onExtras: (e: { pasted: string; note: string }) => void;
}) {
  const [docs, setDocs] = useState<DocumentRow[] | null>(null);
  const [docType, setDocType] = useState<DocumentRow["doc_type"]>("discharge_summary");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);

  const load = async () => {
    try { setDocs(await getPatientDocuments(patientId)); }
    catch (e) { setErr(e instanceof Error ? e.message : "Could not load documents."); setDocs([]); }
  };
  useEffect(() => { void load(); }, [patientId]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true); setErr(null);
    try {
      await uploadPatientDocument(patientId, file, docType);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const view = async (d: DocumentRow) => {
    try { window.open(await getDocumentUrl(d.storage_path), "_blank", "noopener"); }
    catch (e) { setErr(e instanceof Error ? e.message : "Could not open the document."); }
  };

  const remove = async (d: DocumentRow) => {
    setErr(null);
    try { await deletePatientDocument(d); await load(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Could not delete the document."); }
  };

  return (
    <Card>
      <SectionHeader title="Discharge document" sub="PDF, JPG or PNG up to 10 MB — a clear photo of the sheet works. Private to this patient's care team." />
      <div className="mt-4 space-y-3">
        {err && <ErrorNote>{err}</ErrorNote>}

        <div className="flex flex-wrap items-end gap-2.5">
          <div className="min-w-[180px] flex-1">
            <Field label="Document type">
              <select value={docType} onChange={(e) => setDocType(e.target.value as DocumentRow["doc_type"])} className={inputCls}>
                {DOC_TYPES.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
              </select>
            </Field>
          </div>
          {/* A paper discharge sheet photographed on a phone is the common case here,
              so the camera is a first-class control rather than a hidden fallback.
              extract-facts reads JPG/PNG with the vision model. */}
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            className="hidden"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
          <PrimaryButton onClick={() => fileRef.current?.click()} disabled={busy}>
            {busy ? "Uploading…" : "Upload PDF or photo"}
          </PrimaryButton>
          <GhostButton onClick={() => cameraRef.current?.click()} disabled={busy}>
            Take a photo
          </GhostButton>
        </div>

        <details open={!!extras.pasted}>
          <summary className="tap cursor-pointer list-none text-[12.5px] font-semibold text-sky-700 hover:text-sky-800">
            No file? Paste the discharge text instead
          </summary>
          <div className="mt-2">
            <textarea
              value={extras.pasted}
              onChange={(e) => onExtras({ ...extras, pasted: e.target.value })}
              rows={7}
              placeholder="Paste the discharge summary text here…"
              className={`${inputCls} resize-y`}
              aria-label="Paste the discharge summary"
            />
          </div>
        </details>

        <Field label="Anything you want included? (optional)" hint="Carried through to the plan as a non-negotiable.">
          <input
            value={extras.note}
            onChange={(e) => onExtras({ ...extras, note: e.target.value })}
            placeholder="e.g. No weight-bearing on the left leg for 3 weeks"
            className={inputCls}
          />
        </Field>

        {docs === null ? (
          <Skeleton className="h-16" />
        ) : docs.length === 0 ? (
          <p className="text-[13px] text-sage-500">No documents yet.</p>
        ) : (
          <ul className="divide-y divide-ink/[0.06]">
            {docs.map((d) => (
              <li key={d.id} className="flex items-center gap-3 py-2.5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-sky-50 text-sky-700 text-[12px] font-bold">
                  {(d.file_name.split(".").pop() || "?").slice(0, 4).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-semibold text-ink">{d.file_name}</span>
                  <span className="block text-[11.5px] text-sage-500">{DOC_LABEL[d.doc_type]} · {fmtSize(d.size_bytes)}</span>
                </span>
                <button type="button" onClick={() => void view(d)} className="shrink-0 rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold text-sky-700 hover:bg-sky-50">View</button>
                <button type="button" onClick={() => void remove(d)} className="shrink-0 rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold text-sage-500 hover:bg-mist-100 hover:text-coral-600" aria-label={`Delete ${d.file_name}`}>Delete</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
