import { useRef, useState } from "react";
import { ActionStage } from "./ActionStage";
import { HcIcon, OUTCOME_META, useHc, type TaskKind } from "./hc-kit";
import { buildTodayModel, nextSelectionAfterRecord, type TodayItem } from "./today-model";

export function HomeCareToday() {
  const { patient, day, tasks, outcomes } = useHc();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const outcomesRef = useRef(outcomes);
  outcomesRef.current = outcomes;

  const model = buildTodayModel(tasks, outcomes, selectedId);
  const patientFirstName = patient.full_name.split(" ")[0] || patient.full_name;

  const advance = () => {
    if (!model.active) return;
    setSelectedId(nextSelectionAfterRecord(tasks, outcomesRef.current, model.active.task.id));
  };

  return (
    <main className="hc-today">
      <header className="hc-today-head">
        <div>
          <h1>Today</h1>
          <p>{patientFirstName}&rsquo;s home recovery · Day {day}</p>
        </div>
        <span className="hc-daychip num">Day {day}</span>
      </header>

      <section className="hc-today-summary" aria-labelledby="today-summary-title">
        <div className="hc-summary-copy">
          <h2 id="today-summary-title">
            {model.recordableTotal === 0
              ? "No scheduled care yet"
              : model.allRecorded
                ? "Today’s scheduled care is recorded"
                : `${model.recordedCount} of ${model.recordableTotal} recorded`}
          </h2>
          <p>{summaryLine(model.active, model.recordableTotal)}</p>
        </div>
        {model.recordableTotal > 0 && (
          <div
            className="hc-summary-progress"
            role="progressbar"
            aria-label="Scheduled care recorded today"
            aria-valuemin={0}
            aria-valuemax={model.recordableTotal}
            aria-valuenow={model.recordedCount}
          >
            <span style={{ width: `${Math.round((model.recordedCount / model.recordableTotal) * 100)}%` }} />
          </div>
        )}
      </section>

      {model.active ? (
        <section className="hc-active-action" aria-labelledby="today-action-title">
          <div className="hc-section-title">
            <h2 id="today-action-title">Do this next</h2>
            <span>{model.active.task.time_label || "Today"}</span>
          </div>
          <ActionStage task={model.active.task} onRecorded={advance} />
        </section>
      ) : model.recordableTotal > 0 ? (
        <section className="hc-today-complete" aria-label="Today complete">
          <span className="hc-complete-icon"><HcIcon.Check size={20} /></span>
          <div><b>Care for today is recorded</b><p>You can open an activity below if anything needs correcting.</p></div>
        </section>
      ) : null}

      {model.rows.length > 0 && (
        <section className="hc-day-list" aria-labelledby="today-schedule-title" aria-label="Rest of today">
          <div className="hc-section-title">
            <h2 id="today-schedule-title">Rest of today</h2>
            <span>{model.rows.length} {model.rows.length === 1 ? "activity" : "activities"}</span>
          </div>
          <div className="hc-schedule">
            {model.rows.map((item) => (
              <ScheduleRow key={item.task.id} item={item} onSelect={setSelectedId} />
            ))}
          </div>
        </section>
      )}

      <p className="hc-plan-source">Everything here comes from the plan approved by the care team.</p>
    </main>
  );
}

function summaryLine(active: TodayItem | null, recordableTotal: number): string {
  if (recordableTotal === 0) return "The care team has not added activities for today.";
  if (!active) return "Nothing else needs recording right now.";
  const when = active.task.time_label ? `${active.task.time_label} · ` : "";
  return `${when}${active.task.title}`;
}

function ScheduleRow({ item, onSelect }: { item: TodayItem; onSelect: (id: string) => void }) {
  const state = item.destination === "medicines"
    ? "Record in Medicines"
    : item.outcome
      ? `Recorded: ${OUTCOME_META[item.outcome].label}`
      : "Not recorded";
  return (
    <button
      type="button"
      className={`hc-schedule-row${item.outcome ? " recorded" : ""}`}
      aria-label={`${item.task.title}, ${item.task.time_label || "today"}, ${state}`}
      onClick={() => onSelect(item.task.id)}
    >
      <span className="hc-schedule-time num">{item.task.time_label || "—"}</span>
      <span className="hc-schedule-icon">{kindIcon(item.kind)}</span>
      <span className="hc-schedule-copy">
        <b>{item.task.title}</b>
        <small>{item.task.discipline || "Care"}</small>
      </span>
      <span className={`hc-schedule-state${item.outcome ? " recorded" : ""}`}>{state}</span>
      <HcIcon.Right size={16} />
    </button>
  );
}

function kindIcon(kind: TaskKind) {
  switch (kind) {
    case "physio": return <HcIcon.Walk size={17} />;
    case "food": return <HcIcon.Food size={17} />;
    case "positioning": return <HcIcon.Bed size={17} />;
    case "medicine": return <HcIcon.Pill size={17} />;
    default: return <HcIcon.Pulse size={17} />;
  }
}
