import { useEffect, useRef, useState } from "react";
import { ActionStage } from "./ActionStage";
import { HcIcon, OUTCOME_META, useHc, type Period, type TaskKind } from "./hc-kit";
import {
  buildPeriodBlocks, buildTodayModel, initialBlockKey, nextSelectionAfterRecord,
  type PeriodBlock, type TodayItem,
} from "./today-model";

/**
 * Today — one time block at a time.
 *
 * The day used to be a single column: the next activity, then every remaining
 * activity beneath it, scrolling from morning to bedtime. On a phone that put
 * bedtime care and 6am vitals in the same list, and recording anything other
 * than "next" meant hunting down the page or leaving for the Log screen.
 *
 * Now the day is four cards — Morning, Afternoon, Evening, Bedtime — swiped
 * horizontally, and recording happens inside the card. Nothing sends the
 * caregiver to another screen to enter a reading.
 */
export function HomeCareToday() {
  const { patient, day, tasks, outcomes } = useHc();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const outcomesRef = useRef(outcomes);
  outcomesRef.current = outcomes;

  const model = buildTodayModel(tasks, outcomes, selectedId);
  const blocks = buildPeriodBlocks(model.ordered);
  const patientFirstName = patient.full_name.split(" ")[0] || patient.full_name;

  const [openBlock, setOpenBlock] = useState<Period | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef(new Map<Period, HTMLElement>());

  // Land on the block that still needs work, once, without stealing the caregiver's
  // place if they have already swiped somewhere.
  // Not every environment implements scrollIntoView (jsdom does not), and it must
  // never take the screen down with it — the tab strip still moves without it.
  const revealCard = (key: Period, behavior: ScrollBehavior) => {
    const el = cardRefs.current.get(key);
    if (typeof el?.scrollIntoView === "function") {
      el.scrollIntoView({ inline: "center", block: "nearest", behavior });
    }
  };

  const landed = useRef(false);
  useEffect(() => {
    if (landed.current || !blocks.length) return;
    landed.current = true;
    const key = initialBlockKey(blocks);
    if (!key) return;
    setOpenBlock(key);
    // `auto` not `smooth`: a scroll animation on first paint reads as a glitch.
    revealCard(key, "auto");
  }, [blocks.length]);

  const goTo = (key: Period) => {
    setOpenBlock(key);
    revealCard(key, "smooth");
  };

  const advance = (item: TodayItem) => {
    setSelectedId(nextSelectionAfterRecord(tasks, outcomesRef.current, item.task.id));
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
          <p>
            {model.recordableTotal === 0
              ? "The care team has not added activities for today."
              : model.allRecorded
                ? "Nothing outstanding. Open any card to correct something."
                : "Work through one time of day at a time — swipe for the next."}
          </p>
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

      {blocks.length > 0 && (
        <>
          {/* Jump between times of day without swiping — and a visible position marker. */}
          <nav className="hc-block-tabs" aria-label="Time of day">
            {blocks.map((b) => (
              <button
                key={b.key}
                type="button"
                onClick={() => goTo(b.key)}
                aria-current={openBlock === b.key}
                className={`hc-block-tab${openBlock === b.key ? " on" : ""}${b.done ? " done" : ""}`}
              >
                {b.label}
                {b.recordable > 0 && (
                  <span className="hc-block-tab-count num">
                    {b.done ? <HcIcon.Check size={12} /> : `${b.recorded}/${b.recordable}`}
                  </span>
                )}
              </button>
            ))}
          </nav>

          <div className="hc-block-track" ref={trackRef}>
            {blocks.map((b) => (
              <BlockCard
                key={b.key}
                block={b}
                activeId={model.active?.task.id ?? null}
                onRef={(el) => { if (el) cardRefs.current.set(b.key, el); }}
                onVisible={() => setOpenBlock(b.key)}
                onSelect={setSelectedId}
                onRecorded={advance}
              />
            ))}
          </div>
        </>
      )}

      {blocks.length === 0 && (
        <section className="hc-today-complete" aria-label="Nothing scheduled">
          <span className="hc-complete-icon"><HcIcon.Check size={20} /></span>
          <div><b>Nothing scheduled yet</b><p>Activities appear here once the care team approves the plan.</p></div>
        </section>
      )}

      <p className="hc-plan-source">Everything here comes from the plan approved by the care team.</p>
    </main>
  );
}

/** One time-of-day card. Recording happens in place, never on another screen. */
function BlockCard({
  block, activeId, onRef, onVisible, onSelect, onRecorded,
}: {
  block: PeriodBlock;
  activeId: string | null;
  onRef: (el: HTMLElement | null) => void;
  onVisible: () => void;
  onSelect: (id: string) => void;
  onRecorded: (item: TodayItem) => void;
}) {
  const ref = useRef<HTMLElement | null>(null);

  // Keep the tab strip honest when the caregiver swipes rather than taps.
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting && e.intersectionRatio > 0.6) onVisible(); }),
      { root: el.parentElement, threshold: [0.6] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [onVisible]);

  return (
    <section
      ref={(el) => { ref.current = el; onRef(el); }}
      className={`hc-block-card${block.done ? " done" : ""}`}
      aria-label={`${block.label}, ${block.range}`}
    >
      <div className="hc-block-head">
        <div>
          <h2>{block.label}</h2>
          <p className="num">{block.range}</p>
        </div>
        {block.recordable > 0 && (
          <span className={`hc-block-badge${block.done ? " done" : ""} num`}>
            {block.done ? "Done" : `${block.recorded}/${block.recordable}`}
          </span>
        )}
      </div>

      <div className="hc-block-items">
        {block.items.map((item) => {
          const open = item.task.id === activeId;
          return (
            <div key={item.task.id} className={`hc-block-item${open ? " open" : ""}`}>
              {open ? (
                <ActionStage task={item.task} onRecorded={() => onRecorded(item)} />
              ) : (
                <ScheduleRow item={item} onSelect={onSelect} />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
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
