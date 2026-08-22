/*
 * What the family actually recorded at home, as their clinician sees it.
 *
 * WHY THIS EXISTS
 * ---------------
 * Universal programmes record into `care_events`. Until this panel there was no
 * professional surface that read that table at all — a caregiver could record a
 * blood pressure, a pain score and a bowel movement, see each one acknowledged,
 * and none of it was visible to the clinician who approved the programme. The
 * patient side had been built end to end and the clinical side of the same
 * events had not.
 *
 * WHAT IT SHOWS, AND WHAT IT REFUSES TO
 * -------------------------------------
 * Facts, in the order they happened: what was recorded, when, by which route,
 * and the values as captured. It does not rank, flag, colour by severity,
 * threshold, trend or summarise. A pain of 8 and a pain of 1 are drawn
 * identically, because deciding which of those matters is the clinician's work
 * and this panel is only how they come to see it.
 *
 * It renders nothing for a patient with no such events, so a legacy recovery
 * patient's cockpit is exactly what it always was.
 */
import { useEffect, useState } from "react";
import { getCareEvents, type CareEventDbRow } from "../../lib/db";
import { Panel, SectionLabel } from "../../components/clinical";

const DAY_MS = 86_400_000;
/** How far back the panel looks. A fortnight is a programme's working memory. */
const WINDOW_DAYS = 14;

/** How an entry reached us. Route, never judgement. */
const ENTRY_LABEL: Record<string, string> = {
  scheduled: "At its scheduled time",
  quick: "Recorded when it happened",
  voice: "Spoken",
  text: "In their own words",
};

/** The captured values, exactly as captured. */
function valueLines(e: CareEventDbRow): string[] {
  const payload = (e.payload ?? {}) as Record<string, unknown>;

  // A medicine round names every medicine and what happened to it, so it is
  // never collapsed into "done".
  const medicines = payload.medicines as { name: string; status: string }[] | undefined;
  if (Array.isArray(medicines)) {
    return medicines.map((m) => `${m.name} — ${m.status === "given" ? "taken" : "not taken"}`);
  }

  return Object.entries(payload)
    .filter(([, v]) => v !== null && v !== "" && v !== undefined)
    .map(([k, v]) => {
      const label = k.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
      return `${label}: ${Array.isArray(v) ? v.join(", ") : String(v)}`;
    });
}

export default function HomeCareActivity({ patientId }: { patientId: string }) {
  const [events, setEvents] = useState<CareEventDbRow[] | null>(null);

  useEffect(() => {
    let active = true;
    const to = new Date(Date.now() + DAY_MS);
    const from = new Date(Date.now() - WINDOW_DAYS * DAY_MS);
    void getCareEvents(patientId, from, to)
      .then((rows) => { if (active) setEvents(rows); })
      .catch(() => { if (active) setEvents([]); });
    return () => { active = false; };
  }, [patientId]);

  // Nothing to say, or not a programme patient at all.
  if (!events || events.length === 0) return null;

  let lastDate = "";

  return (
    <Panel
      label="Recorded at home"
      title={`Care activity · last ${WINDOW_DAYS} days`}
      aside={<span className="text-[12.5px] tabular-nums text-sage-500">{events.length} entries</span>}
    >
      <ul className="space-y-3">
        {events.map((e) => {
          const newDay = e.local_date !== lastDate;
          lastDate = e.local_date;
          const values = valueLines(e);
          return (
            <li key={e.id}>
              {newDay && (
                <div className="mb-2 mt-1 first:mt-0">
                  <SectionLabel>
                    {new Date(`${e.local_date}T12:00:00`).toLocaleDateString([], {
                      weekday: "short", day: "numeric", month: "short",
                    })}
                  </SectionLabel>
                </div>
              )}
              <div className="flex items-start gap-3 rounded-2xl bg-mist/60 px-3.5 py-3">
                <span className="w-[52px] shrink-0 pt-0.5 text-[12.5px] tabular-nums text-sage-500">
                  {new Date(e.occurred_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[14.5px] font-semibold text-ink">{e.label_snapshot}</p>
                  {values.length > 0 && (
                    <p className="mt-0.5 text-[13.5px] leading-relaxed text-sage-600">{values.join(" · ")}</p>
                  )}
                  {e.note && (
                    <p className="mt-1 text-[13.5px] italic leading-relaxed text-sage-600">&ldquo;{e.note}&rdquo;</p>
                  )}
                  <p className="mt-1 text-[12px] text-sage-400">
                    {ENTRY_LABEL[e.entry_mode] ?? e.entry_mode}
                    {e.occurrence_id ? "" : " · no scheduled expectation"}
                  </p>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-[12px] leading-relaxed text-sage-500">
        Recorded by the household. Shown in the order it happened, with nothing ranked or interpreted.
      </p>
    </Panel>
  );
}
