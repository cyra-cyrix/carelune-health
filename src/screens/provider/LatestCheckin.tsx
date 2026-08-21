/*
 * What the patient sent, as their care team reads it.
 *
 * Raw structured answers, in the wording the patient saw, with no interpretation
 * of any kind: no status, no score, no summary. Deciding what a check-in MEANS
 * is the attention work of the next phase, and inventing it here would be the
 * platform making a clinical judgement it is not allowed to make.
 */
import { useEffect, useState } from "react";
import {
  getCheckinResponses, getLatestCheckin,
  type CheckinResponseRow, type CheckinSubmissionRow,
} from "../../lib/db";
import { Card, SectionHeader, Skeleton } from "../../components/system";
import { responseText } from "../patient/CheckinFlow";

export default function LatestCheckin({ patientId }: { patientId: string }) {
  const [submission, setSubmission] = useState<CheckinSubmissionRow | null | undefined>(undefined);
  const [responses, setResponses] = useState<CheckinResponseRow[] | null>(null);

  useEffect(() => {
    let active = true;
    void getLatestCheckin(patientId)
      .then((row) => { if (active) setSubmission(row); })
      .catch(() => { if (active) setSubmission(null); });
    return () => { active = false; };
  }, [patientId]);

  if (submission === undefined) return <Card><Skeleton className="h-20" /></Card>;
  if (!submission) return null;   // nothing sent yet, and nothing to say about it

  const when = new Date(submission.submitted_at);
  const today = when.toDateString() === new Date().toDateString();

  return (
    <Card>
      <SectionHeader
        title="Latest check-in"
        sub={`${today ? "Today" : when.toLocaleDateString()} at ${when.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}${
          submission.programme_day ? ` · day ${submission.programme_day}` : ""
        }${submission.programme_period_label ? ` · ${submission.programme_period_label}` : ""}`}
      />
      {responses === null ? (
        <button
          type="button"
          onClick={() => void getCheckinResponses(submission.id).then(setResponses).catch(() => setResponses([]))}
          className="tap mt-4 rounded-xl bg-mist-100 px-3.5 py-2 text-[13.5px] font-semibold text-ink hover:bg-mist-200"
        >
          Read the answers
        </button>
      ) : responses.length === 0 ? (
        <p className="mt-4 text-[14px] text-sage-500">No answers recorded.</p>
      ) : (
        <ol className="mt-4 space-y-4">
          {responses.map((r) => (
            <li key={r.id}>
              <p className="text-[12.5px] leading-snug text-sage-500">{r.question_label_snapshot}</p>
              <p className="mt-0.5 text-[15px] leading-snug text-ink">{responseText(r)}</p>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
