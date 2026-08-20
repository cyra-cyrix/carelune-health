import { useMemo, useState } from "react";
import { ActionStage } from "./ActionStage";
import { NotificationBell } from "./Notifications";
import { HomeCareTimeline } from "./HomeCareTimeline";
import { HcIcon, OUTCOME_META, useHc, PERIODS, type TaskKind } from "./hc-kit";
import { buildTodayModel, eventTiles, glanceTiles, nextSelectionAfterRecord, type TodayItem } from "./today-model";

/**
 * Today — the caregiver's home screen, arranged per the approved mockup.
 *
 * Reading order matches what a caregiver actually needs: who and which day,
 * the ONE thing due now, how the day is going, then the plan itself. Recording
 * is reachable from three places — the next-up card, any plan row, and the
 * floating button — because the old design forced a trip to a separate Log
 * screen to enter a reading.
 *
 * Colours are the Carelune caregiver tokens (--sky/--ok/--amber). The mockup's
 * teal is deliberately not carried across.
 */
export function HomeCareToday() {
  const { patient, day, tasks, outcomes, meds, events, medAdmin, goTab } = useHc();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<"plan" | "timeline">("plan");

  const model = buildTodayModel(tasks, outcomes, selectedId);
  /*
   * Real event counts win over recorded-of-scheduled: "4 feeds" is what a nurse
   * asks about. Scheduled progress is the fallback until events exist for the day.
   */
  const tiles = useMemo(() => {
    const fromEvents = eventTiles(events);
    return fromEvents.length ? fromEvents.slice(0, 4) : glanceTiles(model.ordered);
  }, [events, model.ordered]);
  const firstName = patient.full_name.split(" ")[0] || patient.full_name;

  /*
   * Medicines summarised on the home screen. It was two taps away under More,
   * which is the wrong depth for the thing most likely to be missed — and a
   * missed dose is not the same class of mistake as a missed note.
   */
  const medSlots = meds.flatMap((m) => {
    const text = `${m.freq ?? ""} ${m.timing ?? ""}`.toLowerCase();
    const nums = (m.freq ?? "").match(/\d/g);
    if (nums) return PERIODS.slice(0, nums.length).filter((_, i) => Number(nums[i]) > 0).map((p) => `${m.id}|${p.key}`);
    if (/morning|breakfast/.test(text)) return [`${m.id}|morning`];
    if (/night|bed/.test(text)) return [`${m.id}|bedtime`];
    return [`${m.id}|morning`];
  });
  const medsDue = medSlots.length;
  const medsGiven = medSlots.filter((k) => medAdmin.get(k) === "given").length;
  const open = model.active;

  const advance = () => {
    if (!open) return;
    setSelectedId(nextSelectionAfterRecord(tasks, outcomes, open.task.id));
  };

  if (view === "timeline") {
    return <HomeCareTimeline onBack={() => setView("plan")} />;
  }

  return (
    <main className="hc-today">
      <header className="hc-greet">
        <div className="hc-greet-copy">
          <p>{greeting()},</p>
          <h1>{firstName}&rsquo;s care</h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <NotificationBell />
          <button type="button" className="hc-team-btn" onClick={() => setView("timeline")}>
            <HcIcon.Clock size={15} /> Timeline
          </button>
        </div>
      </header>

      <div className="hc-greet-meta">
        <HcIcon.Calendar size={14} />
        <span>{today()}</span>
        <span className="hc-greet-sep" aria-hidden />
        <span><b>Day {day}</b> of recovery</span>
      </div>

      {open ? (
        <section className="hc-next" aria-labelledby="hc-next-title">
          <span className="hc-next-icon">{kindIcon(open.kind)}</span>
          <div className="hc-next-body">
            <p className="hc-next-kicker">Next up</p>
            <h2 id="hc-next-title">{open.task.title}</h2>
            <p>{open.task.time_label || "Today"}{open.task.discipline ? ` · ${open.task.discipline}` : ""}</p>
            <ActionStage task={open.task} onRecorded={advance} />
          </div>
          {open.kind === "medicine" && meds.length > 0 && (
            <div className="hc-next-side">
              <span className="hc-next-due">Due now</span>
              <span className="hc-next-count num">{meds.length}</span>
              <span className="hc-next-unit">medicines</span>
            </div>
          )}
        </section>
      ) : model.recordableTotal > 0 ? (
        <section className="hc-today-complete" aria-label="Today complete">
          <span className="hc-complete-icon"><HcIcon.Check size={20} /></span>
          <div><b>Care for today is recorded</b><p>Open any activity below if something needs correcting.</p></div>
        </section>
      ) : null}

      <section className="hc-glance" aria-labelledby="hc-glance-title">
        <div className="hc-glance-head">
          <div>
            <h2 id="hc-glance-title">Today at a glance</h2>
            <p>
              {model.recordableTotal === 0
                ? "Nothing scheduled yet"
                : `${model.recordedCount} of ${model.recordableTotal} activities recorded`}
            </p>
          </div>
          <button type="button" className="hc-glance-link" onClick={() => setView("timeline")}>
            <HcIcon.Clock size={13} /> View timeline
          </button>
        </div>

        {model.recordableTotal > 0 && (
          <div
            className="hc-glance-bar"
            role="progressbar"
            aria-label="Scheduled care recorded today"
            aria-valuemin={0}
            aria-valuemax={model.recordableTotal}
            aria-valuenow={model.recordedCount}
          >
            <span style={{ width: `${Math.round((model.recordedCount / model.recordableTotal) * 100)}%` }} />
          </div>
        )}

        {tiles.length > 0 && (
          <div className="hc-tiles">
            {tiles.map((t) => (
              <div key={t.key} className={`hc-tile${t.done ? " done" : t.total != null && t.recorded < t.total ? " due" : ""}`}>
                <span className="hc-tile-label">{kindIcon(t.kind)} {t.label}</span>
                <span className="hc-tile-n num">{t.recorded}</span>
                <span className="hc-tile-sub">{t.total == null ? "recorded" : `of ${t.total}`}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {meds.length > 0 && (
        <section className="hc-medsum" aria-labelledby="hc-medsum-title">
          <div className="hc-plan-head">
            <h2 id="hc-medsum-title">Medicines</h2>
            <button type="button" className="hc-glance-link" onClick={() => goTab("medicines")}>Open</button>
          </div>
          <button type="button" className="hc-medsum-btn" onClick={() => goTab("medicines")}>
            <span className="i"><HcIcon.Pill size={18} /></span>
            <span className="t">
              <b>{medsGiven} of {medsDue} doses given today</b>
              <small>
                {medsDue === 0
                  ? "Nothing scheduled"
                  : medsGiven >= medsDue
                    ? "All recorded"
                    : `${medsDue - medsGiven} still to record`}
              </small>
            </span>
            <HcIcon.Right size={16} />
          </button>
        </section>
      )}

      <section className="hc-day-list" aria-labelledby="hc-plan-title">
        <div className="hc-plan-head">
          <h2 id="hc-plan-title">Today&rsquo;s plan</h2>
          <button type="button" className="hc-glance-link" onClick={() => setView("timeline")}>See all</button>
        </div>
        <div className="hc-schedule">
          {model.ordered.map((item) => (
            <ScheduleRow key={item.task.id} item={item} onSelect={setSelectedId} meds={meds.length} />
          ))}
        </div>
      </section>

      <p className="hc-plan-source">Everything here comes from the plan approved by the care team.</p>
    </main>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function today(): string {
  return new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

function ScheduleRow({ item, onSelect, meds }: { item: TodayItem; onSelect: (id: string) => void; meds: number }) {
  const state = rowStatus(item, meds);
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
        <small>{item.task.detail || item.task.discipline || "Care"}</small>
      </span>
      <span className={`hc-schedule-state${item.outcome ? " recorded" : ""}`}>{state}</span>
      <HcIcon.Right size={16} />
    </button>
  );
}

/**
 * The status a caregiver can act on, not a bare state word.
 *
 * "Not recorded" tells someone nothing about what is being asked of them, so a
 * row says what it is instead: how many medicines are due, that a therapy
 * session is planned, or that this one is already done.
 */
function rowStatus(item: TodayItem, meds: number): string {
  if (item.outcome) return OUTCOME_META[item.outcome].label;
  if (item.destination === "medicines") return meds > 0 ? `${meds} medicine${meds === 1 ? "" : "s"}` : "In Medicines";
  if (item.kind === "physio") return "Session planned";
  return "To record";
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
