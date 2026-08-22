/*
 * The patient / caregiver shell.
 *
 *   TODAY  |  MY CARE  |  + TELL US  |  PROGRESS  |  TEAM
 *
 * The mental model, and the only one:
 *   TODAY     what should I do?
 *   MY CARE   what am I following?
 *   + TELL US something happened.
 *   PROGRESS  how are things going?
 *   TEAM      I need, or heard from, a person.
 *
 * One shell, five slots, and nothing in it knows what specialty it is drawing.
 * Every word either comes from the patient's own approved programme or is
 * neutral chrome. There is no `if (domain === ...)` anywhere in this file, and
 * the Lactation configuration renders through exactly these components.
 *
 * WHAT THIS DOES NOT DO
 * ---------------------
 * It never interprets a recorded value. A pain of 9 and a pain of 1 produce the
 * same timeline, the same acknowledgement and the same colours, because deciding
 * what a value MEANS is the care team's work and this screen does not do it.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  getApprovedProgramme, getCareEvents, getCareTeam, getMedications, getOccurrences,
  materialiseOccurrences, raiseApproval, recordCareEvent,
  type CareEventDbRow, type CareOccurrenceRow, type CareTeamMember, type MedicationRow,
  type PatientProgrammeRow, type PatientRow, type SubscriptionRow,
} from "../../../lib/db";
import {
  quickRecordActivities, validateCareActivities,
  type CareActivity, type DisplayGroup, type QuickRecord,
} from "../../../domain/careActivityModel";
import {
  acknowledgementFor, buildCareDay, summariseDays,
  type CareDay, type CareEventRow, type OccurrenceRow, type TimelineItem,
} from "../../../domain/careDay";
import { useBranding } from "../../../branding/BrandingProvider";
import { ActivityRecorder, AckChip, CareIcon, SectionLabel, Sheet, type RecordSubmission } from "./careKit";
import MedicineSheet from "./MedicineSheet";
import TellUsSheet from "./TellUs";
import { HcProvider, type HcData, type HcRole } from "../../home/hc-kit";
import { HomeCareMessages } from "../../home/HomeCareMessages";
import "../../home/homecare.css";

type Slot = "today" | "mycare" | "progress" | "team";

const firstName = (full?: string | null) => (full ?? "").trim().split(/\s+/)[0] ?? "";
const DAY_MS = 86_400_000;

function greeting(now = new Date()) {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/** The patient's local calendar day, formatted the way the database stores it. */
function localIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const timeNow = () => new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/* ================================== shell ================================= */

export default function CareShell({
  role, patient, subscription, programme,
}: {
  role: HcRole;
  patient: PatientRow;
  subscription: SubscriptionRow;
  programme: PatientProgrammeRow;
}) {
  const { org, profile } = useBranding();
  const [slot, setSlot] = useState<Slot>("today");
  const [tellUs, setTellUs] = useState(false);
  const [occurrences, setOccurrences] = useState<CareOccurrenceRow[]>([]);
  const [events, setEvents] = useState<CareEventDbRow[]>([]);
  const [meds, setMeds] = useState<MedicationRow[]>([]);
  const [live, setLive] = useState<PatientProgrammeRow>(programme);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);

  const providerName = org?.display_name?.trim() || org?.name?.trim() || "Your care team";

  const activities: CareActivity[] = useMemo(() => {
    const r = validateCareActivities(live.activities);
    return r.ok ? r.activities : [];
  }, [live.activities]);

  const byKey = useMemo(() => new Map(activities.map((a) => [a.key, a])), [activities]);

  /* What the centre "+" offers, derived from the approved programme itself:
     every activity a clinician approved as capturable ad hoc, ordered and
     labelled by the programme's own quick-record configuration where it states
     one. Recording a scheduled activity this way is an extra, unscheduled
     event, which is exactly what an unplanned blood pressure is. */
  const quickRecords: QuickRecord[] = useMemo(
    () => quickRecordActivities(activities, live.quick_records),
    [activities, live.quick_records],
  );

  const reload = useCallback(async () => {
    const from = new Date(Date.now() - 13 * DAY_MS);
    const to = new Date(Date.now() + DAY_MS);
    await materialiseOccurrences(patient.id, new Date(Date.now() - DAY_MS), to).catch(() => 0);
    const [occ, evs, ms] = await Promise.all([
      getOccurrences(patient.id, from, to).catch(() => [] as CareOccurrenceRow[]),
      getCareEvents(patient.id, from, to).catch(() => [] as CareEventDbRow[]),
      getMedications(patient.id).catch(() => [] as MedicationRow[]),
    ]);
    setOccurrences(occ);
    setEvents(evs);
    setMeds(ms.filter((m) => m.active));
  }, [patient.id]);

  useEffect(() => {
    let active = true;
    void (async () => {
      await reload();
      const fresh = await getApprovedProgramme(patient.id).catch(() => null);
      if (active && fresh) setLive(fresh);
      if (active) setLoading(false);
    })();
    return () => { active = false; };
  }, [patient.id, reload]);

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") void reload(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [reload]);

  const today = useMemo(() => {
    const iso = localIso(new Date());
    return buildCareDay(
      occurrences.filter((o) => o.local_date === iso) as unknown as OccurrenceRow[],
      events.filter((e) => e.local_date === iso) as unknown as CareEventRow[],
    );
  }, [occurrences, events]);

  /**
   * Acknowledge an entry.
   *
   * The wording is chosen from what is observably true — what was recorded, and
   * when. Nothing here decides urgency, and nothing here says how the patient
   * is doing.
   */
  const say = (message: string) => {
    setBanner(message);
    window.setTimeout(() => setBanner(null), 3600);
  };

  const submit = async (activity: CareActivity, s: RecordSubmission, occurrenceId: string | null) => {
    await recordCareEvent({
      subscriptionId: subscription.id,
      activityKey: activity.key,
      payload: s.payload,
      note: s.note,
      outcome: s.outcome,
      occurredAt: s.occurredAt,
      occurrenceId,
      entryMode: occurrenceId ? "scheduled" : "quick",
    });
    await reload();
    say(`${activity.title} recorded at ${timeNow()}.`);
  };

  /** A medicine slot: one event carrying every medicine's own outcome. */
  const submitMedicines = async (
    activity: CareActivity,
    detail: { name: string; status: string }[],
    occurrenceId: string | null,
  ) => {
    const given = detail.filter((d) => d.status === "given").length;
    await recordCareEvent({
      subscriptionId: subscription.id,
      activityKey: activity.key,
      // Never a bare "completed": the record names each medicine and what
      // happened to it, so nothing unknown is represented as given.
      payload: { medicines: detail, given, total: detail.length },
      outcome: given === detail.length ? "done" : given === 0 ? "unable" : "partial",
      occurrenceId,
      entryMode: occurrenceId ? "scheduled" : "quick",
    });
    await reload();
    say(`${activity.title} recorded — ${given} of ${detail.length} taken.`);
  };

  const programmeDay = useMemo(() => {
    const started = new Date(subscription.started_at);
    if (Number.isNaN(started.getTime())) return 1;
    const a = new Date(started.getFullYear(), started.getMonth(), started.getDate()).getTime();
    const now = new Date();
    const b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    return Math.max(1, Math.round((b - a) / DAY_MS) + 1);
  }, [subscription.started_at]);

  const snapshot = (subscription.package_snapshot ?? {}) as Record<string, unknown>;
  const programmeName = String(snapshot.service_name ?? snapshot.name ?? "Your programme");

  return (
    <div className="hc min-h-screen bg-mist">
      <header className="mx-auto max-w-[430px] px-5 pt-4">
        <p className="truncate text-[12px] font-semibold uppercase tracking-[0.13em] text-sage-400">
          {providerName}
        </p>
      </header>

      <main className="mx-auto max-w-[430px] px-5 pb-32 pt-3">
        {slot === "today" && (
          <TodayView
            greetingName={firstName(profile?.full_name)}
            patientName={firstName(patient.full_name) || "your patient"}
            programmeName={programmeName}
            day={programmeDay}
            day0={today}
            loading={loading}
            byKey={byKey}
            patientId={patient.id}
            medicines={meds}
            onRecord={submit}
            onRecordMedicines={submitMedicines}
            onAsk={() => setSlot("team")}
          />
        )}
        {slot === "mycare" && (
          <MyCareView
            activities={activities}
            medicines={meds}
            snapshot={snapshot}
            providerName={providerName}
            approvedAt={live.approved_at}
          />
        )}
        {slot === "progress" && (
          <ProgressView
            activities={activities}
            occurrences={occurrences as unknown as OccurrenceRow[]}
            events={events as unknown as CareEventRow[]}
            snapshot={snapshot}
            day={programmeDay}
          />
        )}
        {slot === "team" && <TeamView patient={patient} role={role} events={events} onSaid={say} />}
      </main>

      {banner && (
        <div
          role="status"
          className="fixed inset-x-0 bottom-24 z-50 mx-auto w-fit max-w-[92vw] rounded-full bg-ink px-4 py-2 text-center text-[13.5px] font-medium text-white shadow-lift"
        >
          {banner}
        </div>
      )}

      {tellUs && (
        <TellUsSheet
          quickRecords={quickRecords}
          patientId={patient.id}
          subscriptionId={subscription.id}
          onClose={() => setTellUs(false)}
          onRecord={async (a, s) => { await submit(a, s, null); setTellUs(false); }}
          onRecordMedicines={async (a, d) => { await submitMedicines(a, d, null); setTellUs(false); }}
          onMessage={() => { setTellUs(false); setSlot("team"); }}
        />
      )}

      <BottomNav slot={slot} setSlot={setSlot} onTellUs={() => setTellUs(true)} />
    </div>
  );
}

/* ================================== TODAY ================================= */

/** How many medicines a dose slot covers, and how many still have no answer. */
export function medicineSummary(
  activity: CareActivity,
  medicines: MedicationRow[],
  recorded: CareEventRow | null,
): string | null {
  if (activity.activityType !== "dose") return null;
  const mine = medicines.filter((m) => activity.medicationIds.includes(m.id));
  if (mine.length === 0) return "Needs confirmation from your care team";
  if (recorded) {
    const given = Number((recorded.payload as { given?: number })?.given ?? 0);
    const total = Number((recorded.payload as { total?: number })?.total ?? mine.length);
    return `${total} medicines · ${given} taken`;
  }
  return `${mine.length} ${mine.length === 1 ? "medicine" : "medicines"} · ${mine.length} remaining`;
}

function TodayView({
  greetingName, patientName, programmeName, day, day0, loading, byKey,
  patientId, medicines, onRecord, onRecordMedicines, onAsk,
}: {
  greetingName: string;
  patientName: string;
  programmeName: string;
  day: number;
  day0: CareDay;
  loading: boolean;
  byKey: Map<string, CareActivity>;
  patientId: string;
  medicines: MedicationRow[];
  onRecord: (a: CareActivity, s: RecordSubmission, occurrenceId: string | null) => Promise<void>;
  onRecordMedicines: (a: CareActivity, d: { name: string; status: string }[], occurrenceId: string | null) => Promise<void>;
  onAsk: () => void;
}) {
  const [group, setGroup] = useState<DisplayGroup | null>(null);
  const [open, setOpen] = useState<TimelineItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shown = group ? day0.groups.find((g) => g.key === group)?.items ?? [] : null;
  const subtitleFor = (i: TimelineItem) => {
    const a = i.activity ?? byKey.get(i.activityKey);
    return a ? medicineSummary(a, medicines, i.event) : null;
  };

  const renderRows = (items: TimelineItem[], emphasis = false) =>
    items.map((i) => (
      <Row key={i.occurrenceId} item={i} subtitle={subtitleFor(i)} onOpen={() => setOpen(i)} emphasis={emphasis} />
    ));

  return (
    <>
      <h1 className="font-display text-[26px] font-semibold leading-tight tracking-tight text-ink">
        {greeting()}{greetingName ? `, ${greetingName}` : ""}
      </h1>
      <p className="mt-1.5 text-[16px] leading-relaxed text-sage-600">
        Day <span className="font-semibold text-ink">{day}</span> of {patientName}&apos;s{" "}
        <span className="font-semibold text-ink">{programmeName}</span>
      </p>

      {/* Morning / Afternoon / Evening / Night — display grouping only. */}
      {day0.groups.length > 0 && (
        <nav aria-label="Parts of the day" className="mt-5 flex gap-2 overflow-x-auto pb-1">
          {day0.groups.map((g) => {
            const on = group === g.key;
            const isNow = day0.currentGroup === g.key;
            return (
              <button
                key={g.key}
                type="button"
                aria-pressed={on}
                onClick={() => setGroup(on ? null : g.key)}
                className={`tap shrink-0 rounded-full px-3.5 py-2 text-[13.5px] font-semibold transition-colors ${
                  on ? "bg-ink text-white"
                    : isNow ? "bg-white text-ink ring-1 ring-sky-500/40"
                    : "bg-white text-sage-600 ring-1 ring-ink/[0.06]"
                }`}
              >
                {g.label}
                <span className="ml-1.5 tabular-nums opacity-60">{g.items.length}</span>
              </button>
            );
          })}
        </nav>
      )}

      {loading && <p className="mt-8 text-[14px] text-sage-500">Loading your day…</p>}

      {!loading && shown && (
        <Block title={`${day0.groups.find((g) => g.key === group)?.label ?? ""} · everything`}>
          {renderRows(shown)}
        </Block>
      )}

      {!loading && !shown && (
        <>
          {day0.now.length > 0 && <Block title="Now">{renderRows(day0.now, true)}</Block>}
          {day0.unresolved.length > 0 && (
            <Block title="Earlier today — not recorded yet">{renderRows(day0.unresolved)}</Block>
          )}
          {day0.completed.length > 0 && <Block title="Recorded today">{renderRows(day0.completed)}</Block>}
          {day0.next.length > 0 && <Block title="Next">{renderRows(day0.next)}</Block>}

          {day0.unscheduled.length > 0 && (
            <Block title="You also told us">
              {day0.unscheduled.map((e) => (
                <div key={e.id} className="flex items-start gap-3 py-3">
                  <span className="w-[46px] shrink-0 pt-0.5 text-[12.5px] tabular-nums text-sage-500">
                    {new Date(e.occurred_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-medium text-ink">{e.label_snapshot}</span>
                    {e.note && <span className="mt-0.5 block text-[13.5px] text-sage-600">{e.note}</span>}
                  </span>
                  <AckChip state={acknowledgementFor(e)} />
                </div>
              ))}
            </Block>
          )}

          {day0.scheduledTotal === 0 && day0.unscheduled.length === 0 && (
            <section className="mt-8 rounded-3xl bg-white p-6 shadow-card ring-1 ring-ink/[0.05]">
              <h2 className="font-display text-[18px] font-semibold text-ink">Nothing scheduled today</h2>
              <p className="mt-2 text-[15px] leading-relaxed text-sage-600">
                You can still tell your care team anything using the + button below.
              </p>
            </section>
          )}
        </>
      )}

      <button
        type="button"
        onClick={onAsk}
        className="tap mt-8 flex w-full items-center justify-between rounded-2xl bg-white px-5 py-4 text-left shadow-card ring-1 ring-ink/[0.05]"
      >
        <span>
          <span className="block text-[15.5px] font-semibold text-ink">Ask your care team</span>
          <span className="mt-0.5 block text-[13px] text-sage-500">They read everything you send.</span>
        </span>
        <CareIcon.Team size={20} />
      </button>

      {open && (
        <Sheet title={open.title} onClose={() => { setOpen(null); setError(null); }}>
          {(() => {
            const activity = open.activity ?? byKey.get(open.activityKey);
            if (!activity) {
              return <p className="py-6 text-[15px] text-sage-600">This item is no longer part of the programme.</p>;
            }
            // A medicine slot is a list of medicines, never a checkbox.
            if (activity.activityType === "dose") {
              return (
                <MedicineSheet
                  activity={activity}
                  patientId={patientId}
                  onClose={() => setOpen(null)}
                  onRecorded={async (detail) => {
                    await onRecordMedicines(activity, detail, open.occurrenceId);
                    setOpen(null);
                  }}
                />
              );
            }
            if (open.state === "completed" && open.event) return <RecordedDetail item={open} />;
            return (
              <ActivityRecorder
                activity={activity}
                busy={busy}
                error={error}
                onCancel={() => { setOpen(null); setError(null); }}
                onSubmit={async (s) => {
                  setBusy(true); setError(null);
                  try {
                    await onRecord(activity, s, open.occurrenceId);
                    setOpen(null);
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Could not save that.");
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            );
          })()}
        </Sheet>
      )}
    </>
  );
}

function RecordedDetail({ item }: { item: TimelineItem }) {
  const e = item.event;
  if (!e) return null;
  const medicines = (e.payload as { medicines?: { name: string; status: string }[] })?.medicines;
  const entries = Object.entries(e.payload ?? {})
    .filter(([k, v]) => k !== "medicines" && k !== "given" && k !== "total" && v !== null && v !== "");
  return (
    <div className="pb-2">
      <p className="mt-1 text-[14px] text-sage-600">
        Recorded at {new Date(e.occurred_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </p>
      <div className="mt-3"><AckChip state={acknowledgementFor(e)} /></div>

      {medicines && medicines.length > 0 && (
        <ul className="mt-5 space-y-2">
          {medicines.map((m) => (
            <li key={m.name} className="flex items-baseline justify-between gap-3 text-[15px]">
              <span className="text-ink">{m.name}</span>
              <span className={`shrink-0 text-[13px] font-semibold ${m.status === "given" ? "text-good-600" : "text-warn-600"}`}>
                {m.status === "given" ? "Taken" : "Not taken"}
              </span>
            </li>
          ))}
        </ul>
      )}

      {entries.length > 0 && (
        <dl className="mt-5 space-y-3">
          {entries.map(([k, v]) => (
            <div key={k}>
              <dt className="text-[12.5px] font-medium text-sage-500">{k.replace(/_/g, " ")}</dt>
              <dd className="mt-0.5 text-[15.5px] text-ink">{Array.isArray(v) ? v.join(", ") : String(v)}</dd>
            </div>
          ))}
        </dl>
      )}
      {e.note && (
        <div className="mt-5">
          <p className="text-[12.5px] font-medium text-sage-500">Note</p>
          <p className="mt-0.5 text-[15.5px] leading-relaxed text-ink">{e.note}</p>
        </div>
      )}
      <p className="mt-6 text-[12.5px] leading-relaxed text-sage-500">
        A recorded entry is part of the clinical record and is not edited. If something was wrong,
        record it again or tell your care team.
      </p>
    </div>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <SectionLabel>{title}</SectionLabel>
      <div className="mt-2 divide-y divide-line/70 rounded-2xl bg-white px-4 shadow-card ring-1 ring-ink/[0.05]">
        {children}
      </div>
    </section>
  );
}

function Row({
  item, subtitle, onOpen, emphasis,
}: { item: TimelineItem; subtitle: string | null; onOpen: () => void; emphasis?: boolean }) {
  const done = item.state === "completed";
  const missed = item.state === "not_recorded";
  return (
    <button type="button" onClick={onOpen} className="tap flex w-full items-center gap-3 py-3.5 text-left">
      <span className={`w-[46px] shrink-0 text-[12.5px] tabular-nums ${emphasis ? "font-semibold text-ink" : "text-sage-500"}`}>
        {item.timeLabel}
      </span>
      <span
        aria-hidden
        className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] ${
          done ? "bg-good-100 text-good-700" : missed ? "bg-warn-100 text-warn-600" : "bg-mist-100 text-sage-400"
        }`}
      >
        {done ? <CareIcon.Check size={13} /> : missed ? "!" : "○"}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-[15.5px] ${emphasis ? "font-semibold text-ink" : done ? "text-sage-600" : "text-ink"}`}>
          {item.title}
        </span>
        {subtitle && <span className="mt-0.5 block truncate text-[12.5px] text-sage-500">{subtitle}</span>}
        {!subtitle && missed && <span className="mt-0.5 block text-[12.5px] text-warn-600">Not recorded</span>}
      </span>
      <CareIcon.Chevron size={16} />
    </button>
  );
}

/* ================================= MY CARE ================================ */

/**
 * What the patient is following, grouped by the kind of care it is.
 *
 * Grouped by the INTERACTION type, which is what lets one section list a neuro
 * tube feed and a breastfeed without either being named in code. A section with
 * nothing in it does not appear, so a programme with no medicines simply has no
 * Medicines section.
 */
const CARE_SECTIONS: { title: string; types: string[] }[] = [
  { title: "Therapy", types: ["exercise"] },
  { title: "Feeding and diet", types: ["intake"] },
  { title: "Nursing and daily care", types: ["task"] },
  { title: "Measurements", types: ["measurement"] },
  { title: "What to watch and record", types: ["observation", "symptom"] },
  { title: "Instructions and education", types: ["education"] },
];

/** "Every day at 09:00" / "Mon, Wed, Fri at 18:00" / "Whenever it happens". */
export function scheduleLabel(a: CareActivity): string {
  if (!a.schedule || a.schedule.kind === "on_demand") return "Record whenever it happens";
  const times = a.schedule.times.join(", ");
  if (a.schedule.days === "all") return `Every day at ${times}`;
  const names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return `${a.schedule.days.map((d) => names[d - 1]).join(", ")} at ${times}`;
}

function MyCareView({
  activities, medicines, snapshot, providerName, approvedAt,
}: {
  activities: CareActivity[];
  medicines: MedicationRow[];
  snapshot: Record<string, unknown>;
  providerName: string;
  approvedAt: string | null;
}) {
  const doseActivities = activities.filter((a) => a.activityType === "dose");
  /* The complete active regimen, from the medication record — not from the
     programme, which holds only references into it. */
  const linked = medicines.filter((m) => doseActivities.some((a) => a.medicationIds.includes(m.id)));
  const reviewFrequency = typeof snapshot.review_frequency === "string" ? snapshot.review_frequency : "";

  return (
    <>
      <h1 className="font-display text-[26px] font-semibold leading-tight tracking-tight text-ink">My care</h1>
      <p className="mt-1.5 text-[15px] leading-relaxed text-sage-600">
        What {providerName} put together for you
        {approvedAt ? `, approved on ${new Date(approvedAt).toLocaleDateString([], { day: "numeric", month: "long" })}` : ""}.
      </p>

      {/* Medicines come from the medication record, so the regimen is shown in
          full rather than as the slots it happens to be given in. */}
      {doseActivities.length > 0 && (
        <section className="mt-7">
          <SectionLabel>Medicines</SectionLabel>
          {linked.length === 0 ? (
            <p className="mt-2 rounded-2xl bg-warn-50 p-4 text-[14px] leading-relaxed text-sage-600 ring-1 ring-warn-500/25">
              Medication details need confirmation from your care team.
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-line/70 rounded-2xl bg-white px-4 shadow-card ring-1 ring-ink/[0.05]">
              {linked.map((m) => {
                const slots = doseActivities.filter((a) => a.medicationIds.includes(m.id));
                return (
                  <li key={m.id} className="py-3.5">
                    <p className="text-[15.5px] font-semibold text-ink">{m.name}</p>
                    {m.dose && <p className="mt-0.5 text-[14px] text-sage-600">{m.dose}</p>}
                    {m.note && <p className="mt-0.5 text-[13.5px] text-sage-500">{m.note}</p>}
                    <p className="mt-1 text-[12.5px] text-sage-500">
                      {[m.timing, slots.map((s) => s.title).join(", ")].filter(Boolean).join(" · ")}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {CARE_SECTIONS.map((section) => {
        const items = activities.filter((a) => section.types.includes(a.activityType));
        if (items.length === 0) return null;
        return (
          <section key={section.title} className="mt-7">
            <SectionLabel>{section.title}</SectionLabel>
            <ul className="mt-2 divide-y divide-line/70 rounded-2xl bg-white px-4 shadow-card ring-1 ring-ink/[0.05]">
              {items.map((a) => (
                <li key={a.key} className="py-3.5">
                  <p className="text-[15.5px] font-medium text-ink">{a.title}</p>
                  {a.instructions && (
                    <p className="mt-1 text-[14px] leading-relaxed text-sage-600">{a.instructions}</p>
                  )}
                  <p className="mt-1 text-[12.5px] text-sage-500">{scheduleLabel(a)}</p>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {reviewFrequency && (
        <section className="mt-7 rounded-2xl bg-white p-5 shadow-card ring-1 ring-ink/[0.05]">
          <SectionLabel>Professional review</SectionLabel>
          <p className="mt-1.5 text-[15.5px] text-ink">{reviewFrequency}</p>
        </section>
      )}
    </>
  );
}

/* ================================= PROGRESS =============================== */

export type AdherenceRow = { key: string; title: string; done: number; total: number; unit: string };

/**
 * How often each planned activity was actually recorded, over a window.
 *
 * Counting, not judging. "6 of 7 recorded as planned" is a fact about the
 * household's week; whether that is good is the care team's call.
 */
export function adherenceOver(
  activities: CareActivity[],
  occurrences: OccurrenceRow[],
  days = 7,
  now: Date = new Date(),
): AdherenceRow[] {
  const from = localIso(new Date(now.getTime() - (days - 1) * DAY_MS));
  const rows: AdherenceRow[] = [];
  for (const a of activities) {
    if (!a.schedule || a.schedule.kind !== "clock") continue;
    const mine = occurrences.filter(
      (o) => o.activity_key === a.key && o.local_date >= from && o.status !== "cancelled",
    );
    if (mine.length === 0) continue;
    const done = mine.filter((o) => o.status === "done" || o.status === "partial").length;
    // A once-a-day activity reads naturally as days; anything more frequent
    // reads as times, because "6 of 42 days" would be nonsense.
    const perDay = a.schedule.times.length;
    rows.push({
      key: a.key,
      title: a.title,
      done,
      total: mine.length,
      unit: perDay === 1 ? "days" : "times",
    });
  }
  return rows.sort((x, y) => y.total - x.total);
}

function ProgressView({
  activities, occurrences, events, snapshot, day,
}: {
  activities: CareActivity[];
  occurrences: OccurrenceRow[];
  events: CareEventRow[];
  snapshot: Record<string, unknown>;
  day: number;
}) {
  const adherence = useMemo(() => adherenceOver(activities, occurrences), [activities, occurrences]);
  const days = useMemo(() => summariseDays(occurrences, events).slice(0, 7), [occurrences, events]);
  const milestones = Array.isArray(snapshot.milestones) ? (snapshot.milestones as unknown[]) : [];
  const reviewFrequency = typeof snapshot.review_frequency === "string" ? snapshot.review_frequency : "";
  const recent = events.slice(0, 8);

  return (
    <>
      <h1 className="font-display text-[26px] font-semibold leading-tight tracking-tight text-ink">Progress</h1>
      <p className="mt-1.5 text-[15px] leading-relaxed text-sage-600">
        Day {day}. What has actually been recorded over the last week.
      </p>

      {adherence.length > 0 && (
        <section className="mt-7">
          <SectionLabel>Planned care, last 7 days</SectionLabel>
          <ul className="mt-2 divide-y divide-line/70 rounded-2xl bg-white px-4 shadow-card ring-1 ring-ink/[0.05]">
            {adherence.map((r) => (
              <li key={r.key} className="py-3.5">
                <p className="text-[15px] font-medium text-ink">{r.title}</p>
                <p className="mt-0.5 text-[13.5px] text-sage-600">
                  <span className="font-semibold tabular-nums text-ink">{r.done}</span> of{" "}
                  <span className="tabular-nums">{r.total}</span> {r.unit} recorded as planned
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {days.length > 0 && (
        <section className="mt-7">
          <SectionLabel>Day by day</SectionLabel>
          <div className="mt-2 divide-y divide-line/70 rounded-2xl bg-white px-4 shadow-card ring-1 ring-ink/[0.05]">
            {days.map((d) => (
              <div key={d.localDate} className="flex items-center gap-3 py-3">
                <span className="w-[70px] shrink-0 text-[13px] font-medium text-ink">
                  {new Date(`${d.localDate}T00:00:00`).toLocaleDateString([], { day: "numeric", month: "short" })}
                </span>
                <span className="min-w-0 flex-1 text-[13.5px] text-sage-600">
                  <span className="font-semibold tabular-nums text-ink">{d.recorded}</span> of{" "}
                  <span className="tabular-nums">{d.scheduled}</span> recorded
                  {d.unscheduled > 0 && ` · ${d.unscheduled} you told us`}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {recent.length > 0 && (
        <section className="mt-7">
          <SectionLabel>Recent entries</SectionLabel>
          <ul className="mt-2 divide-y divide-line/70 rounded-2xl bg-white px-4 shadow-card ring-1 ring-ink/[0.05]">
            {recent.map((e) => (
              <li key={e.id} className="flex items-baseline justify-between gap-3 py-2.5">
                <span className="min-w-0 truncate text-[14.5px] text-ink">{e.label_snapshot}</span>
                <span className="shrink-0 text-[12px] tabular-nums text-sage-500">
                  {new Date(e.occurred_at).toLocaleDateString([], { day: "numeric", month: "short" })}
                  {" · "}
                  {new Date(e.occurred_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {milestones.length > 0 && (
        <section className="mt-7">
          <SectionLabel>Milestones in your programme</SectionLabel>
          <ul className="mt-2 space-y-2 rounded-2xl bg-white p-4 shadow-card ring-1 ring-ink/[0.05]">
            {milestones.map((m, i) => (
              <li key={i} className="flex items-baseline gap-2.5 text-[15px] text-ink">
                <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400" />
                {typeof m === "string" ? m : JSON.stringify(m)}
              </li>
            ))}
          </ul>
        </section>
      )}

      {reviewFrequency && (
        <section className="mt-7 rounded-2xl bg-white p-5 shadow-card ring-1 ring-ink/[0.05]">
          <SectionLabel>Next professional review</SectionLabel>
          <p className="mt-1.5 text-[15.5px] text-ink">{reviewFrequency}</p>
        </section>
      )}

      <p className="mt-7 text-[12.5px] leading-relaxed text-sage-500">
        This counts what was recorded at home. How your care is progressing is for your care team to
        judge with you.
      </p>
    </>
  );
}

/* =================================== TEAM ================================= */

const TEAM_LABEL: Record<string, string> = {
  lead_doctor: "Lead clinician",
  nurse: "Nurse",
  coordinator: "Care coordinator",
};

function TeamView({
  patient, role, events, onSaid,
}: {
  patient: PatientRow;
  role: HcRole;
  events: CareEventDbRow[];
  onSaid: (m: string) => void;
}) {
  const [team, setTeam] = useState<CareTeamMember[]>([]);
  const [calling, setCalling] = useState(false);
  useEffect(() => {
    void getCareTeam(patient.id).then(setTeam).catch(() => setTeam([]));
  }, [patient.id]);

  const shared = events.filter((e) => e.shared_with_care_team).slice(0, 8);

  const requestCall = async () => {
    setCalling(true);
    try {
      await raiseApproval(patient.id, {
        type: "patient_query",
        message: "The family has asked for a call back.",
        urgency: "routine",
      });
      onSaid("Your care team has been asked to call you back.");
    } catch {
      onSaid("That could not be sent. Please try again.");
    } finally {
      setCalling(false);
    }
  };

  return (
    <>
      <h1 className="font-display text-[26px] font-semibold leading-tight tracking-tight text-ink">Team</h1>
      <p className="mt-1.5 text-[15px] leading-relaxed text-sage-600">
        Your care team reads what you send during their working hours. They are not watching
        continuously.
      </p>

      {team.length > 0 && (
        <section className="mt-6">
          <SectionLabel>Who is looking after you</SectionLabel>
          <ul className="mt-2 divide-y divide-line/70 rounded-2xl bg-white px-4 shadow-card ring-1 ring-ink/[0.05]">
            {team.map((m) => (
              <li key={`${m.team_role}-${m.staff_id}`} className="py-3">
                <p className="text-[15.5px] font-medium text-ink">{m.full_name}</p>
                <p className="text-[13px] text-sage-500">{TEAM_LABEL[m.team_role] ?? m.team_role}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <button
        type="button"
        onClick={requestCall}
        disabled={calling}
        className="tap mt-4 w-full rounded-2xl bg-white px-5 py-4 text-left shadow-card ring-1 ring-ink/[0.05] disabled:opacity-60"
      >
        <span className="block text-[15.5px] font-semibold text-ink">
          {calling ? "Sending…" : "Request a call"}
        </span>
        <span className="mt-0.5 block text-[13px] text-sage-500">
          They will call you back during their working hours.
        </span>
      </button>

      {shared.length > 0 && (
        <section className="mt-6">
          <SectionLabel>Shared for review</SectionLabel>
          <ul className="mt-2 divide-y divide-line/70 rounded-2xl bg-white px-4 shadow-card ring-1 ring-ink/[0.05]">
            {shared.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 py-3">
                <span className="min-w-0">
                  <span className="block truncate text-[15px] text-ink">{e.label_snapshot}</span>
                  <span className="text-[12.5px] text-sage-500">
                    {new Date(e.occurred_at).toLocaleDateString([], { day: "numeric", month: "short" })}
                  </span>
                </span>
                <AckChip state={acknowledgementFor(e as unknown as CareEventRow)} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* The existing patient/care-team messaging, unchanged: the same
          `approvals` + `query_messages` rows the nurse and doctor already read. */}
      <div className="mt-6">
        <HcProvider value={{ patient, role } as unknown as HcData}>
          <HomeCareMessages />
        </HcProvider>
      </div>
    </>
  );
}

/* ================================ bottom nav ============================== */

const LEFT: { key: Slot; label: string; icon: (p: { size?: number }) => ReactNode }[] = [
  { key: "today", label: "Today", icon: CareIcon.Today },
  { key: "mycare", label: "My Care", icon: CareIcon.Plan },
];
const RIGHT: { key: Slot; label: string; icon: (p: { size?: number }) => ReactNode }[] = [
  { key: "progress", label: "Progress", icon: CareIcon.Journey },
  { key: "team", label: "Team", icon: CareIcon.Team },
];

function BottomNav({
  slot, setSlot, onTellUs,
}: { slot: Slot; setSlot: (s: Slot) => void; onTellUs: () => void }) {
  const Item = ({ item }: { item: (typeof LEFT)[number] }) => {
    const on = slot === item.key;
    return (
      <li className="flex-1">
        <button
          type="button"
          aria-current={on ? "page" : undefined}
          onClick={() => setSlot(item.key)}
          className={`tap flex w-full flex-col items-center gap-1 py-2.5 text-[11px] font-semibold ${
            on ? "text-sky-700" : "text-sage-400"
          }`}
        >
          <item.icon size={21} />
          {item.label}
        </button>
      </li>
    );
  };

  return (
    <nav aria-label="Sections" className="fixed inset-x-0 bottom-0 z-40 border-t border-line/70 bg-white/95 backdrop-blur">
      <ul className="mx-auto flex max-w-[430px] items-end">
        {LEFT.map((i) => <Item key={i.key} item={i} />)}
        <li className="flex w-[86px] shrink-0 justify-center">
          <button
            type="button"
            onClick={onTellUs}
            aria-label="Tell us — record something that happened"
            className="tap -mt-6 flex h-[58px] w-[58px] flex-col items-center justify-center rounded-full bg-ink text-white shadow-lift transition-transform active:scale-95"
          >
            <CareIcon.Plus size={24} />
            <span className="text-[8.5px] font-bold uppercase tracking-[0.08em]">Tell us</span>
          </button>
        </li>
        {RIGHT.map((i) => <Item key={i.key} item={i} />)}
      </ul>
    </nav>
  );
}
