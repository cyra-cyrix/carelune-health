import { useRef, useState } from "react";
import { addCareEvent, uploadPatientDocument } from "../../lib/db";
import { HcIcon, useHc } from "./hc-kit";

/**
 * Optional photo on a care activity (brief §6A).
 *
 * Offered, never required: forcing a photo on every activity would slow the
 * routine ones and train people to photograph anything to get past the step.
 * It appears after an activity is recorded, when the caregiver is still with
 * the patient and a photo is actually possible.
 *
 * Reuses the existing patient-docs storage and patient_documents metadata —
 * no parallel attachment architecture. Household upload requires migration
 * 0027; until that is applied this fails cleanly with the policy's message
 * rather than pretending to have saved.
 */
export function CareAttachment({ activity }: { activity: string }) {
  const { patient, reload } = useHc();
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [err, setErr] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setState("busy"); setErr(null);
    try {
      const doc = await uploadPatientDocument(patient.id, file, "other");
      await addCareEvent(patient.id, patient.centre_id, {
        kind: "photo",
        // The activity is the caption: "what is this a photo of" is the only
        // question a clinician asks of it later.
        detail: activity,
        documentId: doc.id,
      });
      setState("done");
      reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not attach that photo.");
      setState("idle");
    }
  };

  if (state === "done") {
    return <p className="hc-attach-done"><HcIcon.Check size={14} /> Photo attached</p>;
  }

  return (
    <>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ""; }}
      />
      <button type="button" className="hc-attach-btn" disabled={state === "busy"} onClick={() => cameraRef.current?.click()}>
        <HcIcon.Plus size={14} /> {state === "busy" ? "Attaching…" : "Add a photo (optional)"}
      </button>
      {err && <p className="hc-save-error">{err}</p>}
    </>
  );
}
