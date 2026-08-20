import { useMemo, useState } from "react";
import { prescribedParams } from "../../domain/monitoring";
import { classifyTask, HcIcon, niceTime, OUTCOME_META, useHc } from "./hc-kit";

type Filter = "all" | "care" | "therapy" | "medicines" | "alerts";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "care", label: "Care" },
  { key: "therapy", label: "Therapy" },
  { key: "medicines", label: "Medicines" },
  { key: "alerts", label: "Alerts" },
];

interface Entry {
  id: string;
  at: string;
  time: number;
  title: string;
  detail: string;
  filter: Exclude<Filter, "all">;
  done: boolean;
}

/**
 * Today's timeline — what actually happened, in the order it happened.
 *
 * The plan answers "what should happen"; this answers "what did", which is the
 * question a nurse or family member asks first. Entries are built from records
 * we hold: task outcomes, today's readings, and care-team feed posts.
 */
export function HomeCareTimeline({ onBack }: { onBack: () => void }) {
  const { tasks, outcomes, readings, feed, plan, patient } = useHc();
  const [filter, setFilter] = useState<Filter>("all");

  const entries = useMemo<Entry[]>(() => {
    const out: Entry[] = [];

    for (const task of tasks) {
      const outcome = outcomes.get(task.id);
      if (!outcome) continue;
      const kind = classifyTask(task);
      out.push({
        id: `task-${task.id}`,
        at: task.time_label || "—",
        time: hhmm(task.time_label),
        title: task.title,
        detail: OUTCOME_META[outcome]?.label ?? "Recorded",
        filter: kind === "medicine" ? "medicines" : kind === "physio" ? "therapy" : "care",
        done: outcome === "done",
      });
    }

    const params = prescribedParams(
      (plan?.content?.observations ?? []).map((o) => o.module),
      patient.diagnosis ?? [],
    );
    for (const p of params) {
      const v = (readings[p.field] ?? "").trim();
      if (!v) continue;
      out.push({
        id: `reading-${p.key}`,
        at: "Today",
        time: 24 * 60,
        title: p.label,
        detail: `${v}${p.unit ? ` ${p.unit}` : ""}`,
        filter: "care",
        done: true,
      });
    }

    for (const u of feed) {
      out.push({
        id: `feed-${u.id}`,
        at: niceTime(u.created_at),
        time: new Date(u.created_at).getHours() * 60 + new Date(u.created_at).getMinutes(),
        title: u.author_name || "Care team",
        detail: u.body,
        filter: u.flag ? "alerts" : "care",
        done: !u.flag,
      });
    }

    return out.sort((a, b) => a.time - b.time);
  }, [tasks, outcomes, readings, feed, plan, patient.diagnosis]);

  const shown = filter === "all" ? entries : entries.filter((e) => e.filter === filter);

  return (
    <main className="hc-today">
      <header className="hc-greet">
        <div className="hc-greet-copy">
          <p>
            <button type="button" className="hc-glance-link" onClick={onBack}>
              <HcIcon.Left size={13} /> Today
            </button>
          </p>
          <h1>Today&rsquo;s timeline</h1>
        </div>
      </header>

      <nav className="hc-tl-filters" aria-label="Filter timeline">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            aria-pressed={filter === f.key}
            className={`hc-tl-chip${filter === f.key ? " on" : ""}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </nav>

      {shown.length === 0 ? (
        <div className="hc-empty">
          <b>{entries.length === 0 ? "Nothing recorded yet today" : "Nothing under this filter"}</b>
          <p>{entries.length === 0 ? "Activities appear here as you record them." : "Try another filter."}</p>
        </div>
      ) : (
        <div className="hc-tl">
          {shown.map((e) => (
            <div key={e.id} className={`hc-tl-row${e.done ? " done" : ""}`}>
              <span className="hc-tl-time num">{e.at}</span>
              <span className="hc-tl-rail" aria-hidden><span className="hc-tl-dot" /></span>
              <span className="hc-tl-body">
                <b>{e.title}</b>
                <small>{e.detail}</small>
              </span>
            </div>
          ))}
        </div>
      )}

      <p className="hc-plan-source">Times shown are when the activity was scheduled or recorded.</p>
    </main>
  );
}

/** Minutes since midnight, for ordering. Unlabelled items sort to the end. */
function hhmm(label: string | null): number {
  const m = (label ?? "").match(/(\d{1,2}):(\d{2})/);
  if (!m) return 24 * 60 - 1;
  return Number(m[1]) * 60 + Number(m[2]);
}
