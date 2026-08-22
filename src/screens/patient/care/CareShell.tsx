/*
 * The patient / caregiver shell.
 *
 *      TODAY  |  JOURNEY  |  +  |  CONNECT  |  PLAN
 *
 * One shell, five slots, and nothing in it knows what specialty it is drawing.
 * Every word below either comes from the patient's own approved programme or is
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
  getApprovedProgramme, getCareEvents, getCareTeam, getOccurrences,
  materialiseOccurrences, recordCareEvent,
  type CareEventDbRow, type CareOccurrenceRow, type CareTeamMember,
  type PatientProgrammeRow, type PatientRow, type SubscriptionRow,
} from "../../../lib/db";
import {
  validateCareActivities, type CareActivity, type DisplayGroup,
} from "../../../domain/careActivityModel";
import {
  acknowledgementFor, buildCareDay, routinesFrom, summariseDays,
  type CareDay, type CareEventRow, type OccurrenceRow, type TimelineItem,
} from "../../../domain/careDay";
import { useBranding } from "../../../branding/BrandingProvider";
import { ActivityRecorder, AckChip, CareIcon, SectionLabel, Sheet, type RecordSubmission } from "./careKit";
import { HcProvider, type HcData, type HcRole } from "../../home/hc-kit";
import { HomeCareMessages } from "../../home/HomeCareMessages";
import "../../home/homecare.css";

type Slot = "today" | "journey" | "connect" | "plan";

const firstName = (full?: string | null) => (full ?? "").trim().split(/\s+/)[0] ?? "";

function greeting(now = new Date()) {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

const DAY_MS = 86_400_000;

/** The patient's local calendar day, formatted the way the database stores it. */
function localIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

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
  const [live, setLive] = useState<PatientProgrammeRow>(programme);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);

  const providerName = org?.display_name?.trim() || org?.name?.trim() || "Your care team";

  /* Every activity in this patient's approved programme, validated once. */
  const activities: CareActivity[] = useMemo(() => {
    const r = validateCareActivities(live.activities);
    return r.ok ? r.activities : [];
  }, [live.activities]);

  const byKey = useMemo(() => new Map(activities.map((a) => [a.key, a])), [activities]);

  /* The quick records this programme offers, in the order it names them. */
  const quickRecords: CareActivity[] = useMemo(
    () => live.quick_records.map((k) => byKey.get(k)).filter((a): a is CareActivity => !!a),
    [live.quick_records, byKey],
  );

  const reload = useCallback(async () => {
    const from = new Date(Date.now() - 13 * DAY_MS);
    const to = new Date(Date.now() + DAY_MS);
    // Lazy materialisation: make sure the days we are about to draw actually
    // have their expectations. Idempotent, so calling it on every open is safe.
    await materialiseOccurrences(patient.id, new Date(Date.now() - DAY_MS), to).catch(() => 0);
    const [occ, evs] = await Promise.all([
      getOccurrences(patient.id, from, to).catch(() => [] as CareOccurrenceRow[]),
      getCareEvents(patient.id, from, to).catch(() => [] as CareEventDbRow[]),
    ]);
    setOccurrences(occ);
    setEvents(evs);
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

  /* Refresh when the app comes back to the foreground — a caregiver leaves this
     open all day, and a stale day is worse than a slow one. */
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
    setBanner(`${activity.title} — recorded.`);
    window.setTimeout(() => setBanner(null), 3200);
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
            onRecord={submit}
            onAsk={() => setSlot("connect")}
          />
        )}
        {slot === "journey" && (
          <JourneyView
            occurrences={occurrences as unknown as OccurrenceRow[]}
            events={events as unknown as CareEventRow[]}
            snapshot={snapshot}
            day={programmeDay}
            programmeName={programmeName}
          />
        )}
        {slot === "connect" && <ConnectView patient={patient} role={role} events={events} />}
        {slot === "plan" && (
          <PlanView
            activities={activities}
            snapshot={snapshot}
            providerName={providerName}
            approvedAt={live.approved_at}
          />
        )}
      </main>

      {banner && (
        <div
          role="status"
          className="fixed inset-x-0 bottom-24 z-50 mx-auto w-fit max-w-[92vw] rounded-full bg-ink px-4 py-2 text-[13.5px] font-medium text-white shadow-lift"
        >
          {banner}
        </div>
      )}

      {tellUs && (
        <TellUsSheet
          quickRecords={quickRecords}
          onClose={() => setTellUs(false)}
          onRecord={async (a, s) => { await submit(a, s, null); setTellUs(false); }}
          onMessage={() => { setTellUs(false); setSlot("connect"); }}
        />
      )}

      <BottomNav slot={slot} setSlot={setSlot} onTellUs={() => setTellUs(true)} />
    </div>
  );
}

/* ================================== TODAY ================================= */

function TodayView({
  greetingName, patientName, programmeName, day, day0, loading, byKey, onRecord, onAsk,
}: {
  greetingName: string;
  patientName: string;
  programmeName: string;
  day: number;
  day0: CareDay;
  loading: boolean;
  byKey: Map<string, CareActivity>;
  onRecord: (a: CareActivity, s: RecordSubmission, occurrenceId: string | null) => Promise<void>;
  onAsk: () => void;
}) {
  const [group, setGroup] = useState<DisplayGroup | null>(null);
  const [open, setOpen] = useState<TimelineItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shown = group ? day0.groups.find((g) => g.key === group)?.items ?? [] : null;

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
          {shown.map((i) => <Row key={i.occurrenceId} item={i} onOpen={() => setOpen(i)} />)}
        </Block>
      )}

      {!loading && !shown && (
        <>
          {day0.now.length > 0 && (
            <Block title="Now">
              {day0.now.map((i) => <Row key={i.occurrenceId} item={i} onOpen={() => setOpen(i)} emphasis />)}
            </Block>
          )}

          {day0.unresolved.length > 0 && (
            <Block title="Earlier today — not recorded yet">
              {day0.unresolved.map((i) => <Row key={i.occurrenceId} item={i} onOpen={() => setOpen(i)} />)}
            </Block>
          )}

          {day0.completed.length > 0 && (
            <Block title="Recorded today">
              {day0.completed.map((i) => <Row key={i.occurrenceId} item={i} onOpen={() => setOpen(i)} />)}
            </Block>
          )}

          {day0.next.length > 0 && (
            <Block title="Next">
              {day0.next.map((i) => <Row key={i.occurrenceId} item={i} onOpen={() => setOpen(i)} />)}
            </Block>
          )}

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
        <CareIcon.Connect size={20} />
      </button>

      {open && (
        <Sheet title={open.title} onClose={() => { setOpen(null); setError(null); }}>
          {(() => {
            const activity = open.activity ?? byKey.get(open.activityKey);
            if (!activity) {
              return <p className="py-6 text-[15px] text-sage-600">This item is no longer part of the programme.</p>;
            }
            if (open.state === "completed" && open.event) {
              return <RecordedDetail item={open} />;
            }
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
  const entries = Object.entries(e.payload ?? {}).filter(([, v]) => v !== null && v !== "");
  return (
    <div className="pb-2">
      <p className="mt-1 text-[14px] text-sage-600">
        Recorded at {new Date(e.occurred_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </p>
      <div className="mt-3"><AckChip state={acknowledgementFor(e)} /></div>
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

function Row({ item, onOpen, emphasis }: { item: TimelineItem; onOpen: () => void; emphasis?: boolean }) {
  const done = item.state === "completed";
  const missed = item.state === "not_recorded";
  return (
    <button
      type="button"
      onClick={onOpen}
      className="tap flex w-full items-center gap-3 py-3.5 text-left"
    >
      <span className={`w-[46px] shrink-0 text-[12.5px] tabular-nums ${emphasis ? "font-semibold text-ink" : "text-sage-500"}`}>
        {item.timeLabel}
      </span>
      <span
        aria-hidden
        className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] ${
          done ? "bg-good-100 text-good-700"
            : missed ? "bg-warn-100 text-warn-600"
            : "bg-mist-100 text-sage-400"
        }`}
      >
        {done ? <CareIcon.Check size={13} /> : missed ? "!" : "○"}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-[15.5px] ${emphasis ? "font-semibold text-ink" : done ? "text-sage-600" : "text-ink"}`}>
          {item.title}
        </span>
        {missed && <span className="mt-0.5 block text-[12.5px] text-warn-600">Not recorded</span>}
      </span>
      <CareIcon.Chevron size={16} />
    </button>
  );
}

/* ================================= JOURNEY ================================ */

function JourneyView({
  occurrences, events, snapshot, day, programmeName,
}: {
  occurrences: OccurrenceRow[];
  events: CareEventRow[];
  snapshot: Record<string, unknown>;
  day: number;
  programmeName: string;
}) {
  const days = useMemo(() => summariseDays(occurrences, events), [occurrences, events]);
  const routines = useMemo(() => routinesFrom(events), [events]);
  const milestones = Array.isArray(snapshot.milestones) ? (snapshot.milestones as unknown[]) : [];
  const reviewFrequency = typeof snapshot.review_frequency === "string" ? snapshot.review_frequency : "";

  return (
    <>
      <h1 className="font-display text-[26px] font-semibold leading-tight tracking-tight text-ink">Journey</h1>
      <p className="mt-1.5 text-[15px] leading-relaxed text-sage-600">
        Day {day} of {programmeName}. What has actually been recorded, day by day.
      </p>

      <section className="mt-7">
        <SectionLabel>Recent days</SectionLabel>
        <div className="mt-2 divide-y divide-line/70 rounded-2xl bg-white px-4 shadow-card ring-1 ring-ink/[0.05]">
          {days.length === 0 && <p className="py-5 text-[14.5px] text-sage-500">Nothing recorded yet.</p>}
          {days.map((d) => (
            <div key={d.localDate} className="flex items-center gap-3 py-3.5">
              <span className="w-[70px] shrink-0 text-[13px] font-medium text-ink">
                {new Date(`${d.localDate}T00:00:00`).toLocaleDateString([], { day: "numeric", month: "short" })}
              </span>
              <span className="min-w-0 flex-1 text-[14px] text-sage-600">
                <span className="font-semibold tabular-nums text-ink">{d.recorded}</span> of{" "}
                <span className="tabular-nums">{d.scheduled}</span> scheduled recorded
                {d.unscheduled > 0 && ` · ${d.unscheduled} you told us`}
              </span>
              {d.notRecorded > 0 && (
                <span className="shrink-0 text-[12px] font-semibold tabular-nums text-warn-600">
                  {d.notRecorded} not recorded
                </span>
              )}
            </div>
          ))}
        </div>
        <p className="mt-2.5 px-1 text-[12px] leading-relaxed text-sage-500">
          This counts what was recorded at home. How your care is progressing is for your care team to
          judge with you.
        </p>
      </section>

      {routines.length > 0 && (
        <section className="mt-7">
          <SectionLabel>Your routines</SectionLabel>
          <ul className="mt-2 divide-y divide-line/70 rounded-2xl bg-white px-4 shadow-card ring-1 ring-ink/[0.05]">
            {routines.map((r) => (
              <li key={r.key} className="flex items-center justify-between gap-3 py-3">
                <span className="min-w-0 truncate text-[15px] text-ink">{r.label}</span>
                <span className="shrink-0 text-[13px] tabular-nums text-sage-500">
                  {r.count} {r.count === 1 ? "time" : "times"}
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
          <SectionLabel>Professional review</SectionLabel>
          <p className="mt-1.5 text-[15.5px] text-ink">{reviewFrequency}</p>
        </section>
      )}
    </>
  );
}

/* ================================= CONNECT ================================ */

const TEAM_LABEL: Record<string, string> = {
  lead_doctor: "Lead clinician",
  nurse: "Nurse",
  coordinator: "Care coordinator",
};

function ConnectView({
  patient, role, events,
}: { patient: PatientRow; role: HcRole; events: CareEventDbRow[] }) {
  const [team, setTeam] = useState<CareTeamMember[]>([]);
  useEffect(() => {
    void getCareTeam(patient.id).then(setTeam).catch(() => setTeam([]));
  }, [patient.id]);

  const shared = events.filter((e) => e.shared_with_care_team).slice(0, 8);

  return (
    <>
      <h1 className="font-display text-[26px] font-semibold leading-tight tracking-tight text-ink">Connect</h1>
      <p className="mt-1.5 text-[15px] leading-relaxed text-sage-600">
        Your care team reads everything you send.
      </p>

      {team.length > 0 && (
        <section className="mt-6">
          <SectionLabel>Your care team</SectionLabel>
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

/* =================================== PLAN ================================= */

/**
 * What the patient is supposed to follow.
 *
 * Grouped by the INTERACTION type, which is what makes one section list a neuro
 * tube feed and a breastfeed under the same heading without either being named
 * in code.
 */
const PLAN_SECTIONS: { title: string; types: string[] }[] = [
  { title: "Medicines", types: ["dose"] },
  { title: "Therapy and exercises", types: ["exercise"] },
  { title: "Feeding and fluids", types: ["intake"] },
  { title: "Daily care", types: ["task"] },
  { title: "What to record", types: ["measurement", "observation", "symptom"] },
  { title: "Things to read", types: ["education"] },
];

/** "Every day at 09:00" / "Mon, Wed, Fri at 18:00" / "Whenever it happens". */
export function scheduleLabel(a: CareActivity): string {
  if (!a.schedule || a.schedule.kind === "on_demand") return "Record whenever it happens";
  const times = a.schedule.times.join(", ");
  if (a.schedule.days === "all") return `Every day at ${times}`;
  const names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return `${a.schedule.days.map((d) => names[d - 1]).join(", ")} at ${times}`;
}

function PlanView({
  activities, snapshot, providerName, approvedAt,
}: {
  activities: CareActivity[];
  snapshot: Record<string, unknown>;
  providerName: string;
  approvedAt: string | null;
}) {
  const includes = Array.isArray(snapshot.includes) ? (snapshot.includes as string[]) : [];
  const reviewFrequency = typeof snapshot.review_frequency === "string" ? snapshot.review_frequency : "";
  const checkinFrequency = typeof snapshot.checkin_frequency === "string" ? snapshot.checkin_frequency : "";

  return (
    <>
      <h1 className="font-display text-[26px] font-semibold leading-tight tracking-tight text-ink">Plan</h1>
      <p className="mt-1.5 text-[15px] leading-relaxed text-sage-600">
        What {providerName} put together for you
        {approvedAt ? `, approved on ${new Date(approvedAt).toLocaleDateString([], { day: "numeric", month: "long" })}` : ""}.
      </p>

      {PLAN_SECTIONS.map((section) => {
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
                  <p className="mt-1.5 text-[12.5px] text-sage-500">{scheduleLabel(a)}</p>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {(reviewFrequency || checkinFrequency) && (
        <section className="mt-7">
          <SectionLabel>Your care rhythm</SectionLabel>
          <dl className="mt-2 space-y-4 rounded-2xl bg-white p-5 shadow-card ring-1 ring-ink/[0.05]">
            {checkinFrequency && (
              <div>
                <dt className="text-[12.5px] font-medium text-sage-500">Check-in</dt>
                <dd className="mt-0.5 text-[15.5px] text-ink">{checkinFrequency}</dd>
              </div>
            )}
            {reviewFrequency && (
              <div>
                <dt className="text-[12.5px] font-medium text-sage-500">Professional review</dt>
                <dd className="mt-0.5 text-[15.5px] text-ink">{reviewFrequency}</dd>
              </div>
            )}
          </dl>
        </section>
      )}

      {includes.length > 0 && (
        <section className="mt-7">
          <SectionLabel>What&apos;s included</SectionLabel>
          <ul className="mt-2 space-y-2 rounded-2xl bg-white p-5 shadow-card ring-1 ring-ink/[0.05]">
            {includes.map((i) => (
              <li key={i} className="flex items-baseline gap-2.5 text-[15px] text-ink">
                <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-good-300" />
                {i}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

/* ============================== TELL US (the +) =========================== */

/**
 * "Something happened."
 *
 * Speak, type, or pick one of the quick records this programme configures. The
 * quick records come from the patient's own approved programme, which is why
 * Neuro offers swallowing and Lactation offers nappies without either being
 * named here.
 */
function TellUsSheet({
  quickRecords, onClose, onRecord, onMessage,
}: {
  quickRecords: CareActivity[];
  onClose: () => void;
  onRecord: (a: CareActivity, s: RecordSubmission) => Promise<void>;
  onMessage: () => void;
}) {
  const [chosen, setChosen] = useState<CareActivity | null>(null);
  const [freeText, setFreeText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* The programme's own free-text activity, if it configures one: a single
     required text field. That is what "Type" and "Speak" record into. */
  const openTextActivity = quickRecords.find(
    (a) => a.inputSchema.length === 1 && a.inputSchema[0].type === "text" && a.inputSchema[0].required,
  );

  if (chosen) {
    return (
      <Sheet title={chosen.title} onClose={onClose}>
        <ActivityRecorder
          activity={chosen}
          busy={busy}
          error={error}
          onCancel={() => setChosen(null)}
          onSubmit={async (s) => {
            setBusy(true); setError(null);
            try { await onRecord(chosen, s); }
            catch (e) { setError(e instanceof Error ? e.message : "Could not save that."); }
            finally { setBusy(false); }
          }}
        />
      </Sheet>
    );
  }

  if (freeText !== null) {
    return (
      <Sheet title="Tell us what happened" onClose={onClose}>
        <FreeTextEntry
          initial={freeText}
          target={openTextActivity ?? null}
          quickRecords={quickRecords}
          busy={busy}
          error={error}
          onPick={(a) => { setFreeText(null); setChosen(a); }}
          onCancel={() => setFreeText(null)}
          onMessage={onMessage}
          onSubmit={async (text) => {
            if (!openTextActivity) return;
            setBusy(true); setError(null);
            try {
              await onRecord(openTextActivity, {
                payload: { [openTextActivity.inputSchema[0].key]: text },
                outcome: "recorded",
                note: null,
                occurredAt: null,
              });
            } catch (e) {
              setError(e instanceof Error ? e.message : "Could not save that.");
            } finally { setBusy(false); }
          }}
        />
      </Sheet>
    );
  }

  return (
    <Sheet title="Tell us" onClose={onClose}>
      <p className="mt-1 text-[15px] leading-relaxed text-sage-600">
        Anything at all. You do not need to know whether it matters.
      </p>

      <div className="mt-5 grid grid-cols-2 gap-2.5">
        <SpeakButton onText={(t) => setFreeText(t)} disabled={!openTextActivity} />
        <button
          type="button"
          onClick={() => setFreeText("")}
          disabled={!openTextActivity}
          className="tap flex min-h-[88px] flex-col items-center justify-center gap-1.5 rounded-2xl bg-mist text-[14.5px] font-semibold text-ink ring-1 ring-ink/10 hover:bg-mist-100 disabled:opacity-40"
        >
          <CareIcon.Pencil />
          Type
        </button>
      </div>

      {quickRecords.length > 0 && (
        <>
          <div className="mt-7"><SectionLabel>Quick record</SectionLabel></div>
          <div className="mt-2 flex flex-wrap gap-2 pb-2">
            {quickRecords.map((a) => (
              <button
                key={a.key}
                type="button"
                onClick={() => setChosen(a)}
                className="tap min-h-[46px] rounded-xl bg-white px-4 text-[15px] font-medium text-ink ring-1 ring-ink/10 hover:bg-mist-100"
              >
                {a.title}
              </button>
            ))}
          </div>
        </>
      )}

      <button
        type="button"
        onClick={onMessage}
        className="tap mt-6 w-full rounded-2xl bg-mist-100 py-3.5 text-[15px] font-semibold text-ink hover:bg-mist-200"
      >
        Message your care team instead
      </button>
    </Sheet>
  );
}

/**
 * Free text, with a DETERMINISTIC suggestion.
 *
 * If what the person wrote names one of their own quick records, that record is
 * offered — and they choose. No model is involved and nothing is auto-filed:
 * matching is a plain case-insensitive comparison against the titles the
 * programme already configured, and an unmatched entry is simply saved as words.
 */
function FreeTextEntry({
  initial, target, quickRecords, busy, error, onPick, onCancel, onMessage, onSubmit,
}: {
  initial: string;
  target: CareActivity | null;
  quickRecords: CareActivity[];
  busy: boolean;
  error: string | null;
  onPick: (a: CareActivity) => void;
  onCancel: () => void;
  onMessage: () => void;
  onSubmit: (text: string) => Promise<void>;
}) {
  const [text, setText] = useState(initial);
  const lower = text.toLowerCase();
  const suggestions = text.trim().length > 2
    ? quickRecords
        .filter(
          (a) =>
            a !== target &&
            (lower.includes(a.title.toLowerCase()) ||
              (!!a.domain && lower.includes(a.domain.replace(/_/g, " ")))),
        )
        .slice(0, 3)
    : [];

  if (!target) {
    return (
      <div className="pb-4">
        <p className="mt-1 text-[15px] leading-relaxed text-sage-600">
          This programme does not have a free-text record. You can message your care team instead.
        </p>
        <button
          type="button"
          onClick={onMessage}
          className="tap mt-5 w-full rounded-2xl bg-ink py-3.5 text-[15px] font-semibold text-white"
        >
          Message your care team
        </button>
      </div>
    );
  }

  return (
    <div className="pb-2">
      <textarea
        rows={5}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="In your own words"
        className="mt-3 w-full rounded-xl bg-mist px-3.5 py-3 text-[16px] text-ink ring-1 ring-ink/10 placeholder:text-sage-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
      />

      {suggestions.length > 0 && (
        <div className="mt-4 rounded-2xl bg-sky-50 p-4 ring-1 ring-sky-500/20">
          <p className="text-[13.5px] font-medium text-ink">
            Would you rather record {suggestions.length === 1 ? "this" : "one of these"}?
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {suggestions.map((a) => (
              <button
                key={a.key}
                type="button"
                onClick={() => onPick(a)}
                className="tap min-h-[42px] rounded-xl bg-white px-3.5 text-[14.5px] font-semibold text-ink ring-1 ring-ink/10"
              >
                {a.title}
              </button>
            ))}
          </div>
          <p className="mt-2.5 text-[12px] text-sage-500">Your words are kept either way.</p>
        </div>
      )}

      {error && <p className="mt-4 text-[13.5px] text-coral-600">{error}</p>}

      <div className="mt-5 flex gap-2.5">
        <button
          type="button"
          onClick={onCancel}
          className="tap min-h-[50px] flex-1 rounded-2xl bg-mist-100 text-[15px] font-semibold text-ink hover:bg-mist-200"
        >
          Back
        </button>
        <button
          type="button"
          disabled={busy || text.trim().length === 0}
          onClick={() => void onSubmit(text.trim())}
          className="tap min-h-[50px] flex-[1.6] rounded-2xl bg-ink text-[15px] font-semibold text-white disabled:opacity-40"
        >
          {busy ? "Saving…" : "Send to your care team"}
        </button>
      </div>
    </div>
  );
}

/**
 * Speech, where the browser offers it.
 *
 * The transcript is never saved directly — it lands in the text box for the
 * person to read and correct first. Where the browser has no speech recognition
 * this says so plainly rather than pretending to listen.
 */
function SpeakButton({ onText, disabled }: { onText: (t: string) => void; disabled?: boolean }) {
  const [listening, setListening] = useState(false);
  const [unsupported, setUnsupported] = useState(false);

  const start = () => {
    const w = window as unknown as Record<string, unknown>;
    const Ctor = (w.SpeechRecognition ?? w.webkitSpeechRecognition) as
      | (new () => {
          lang: string;
          interimResults: boolean;
          maxAlternatives: number;
          onresult: (e: { results: Array<Array<{ transcript: string }>> }) => void;
          onerror: () => void;
          onend: () => void;
          start: () => void;
        })
      | undefined;
    if (!Ctor) { setUnsupported(true); return; }
    const rec = new Ctor();
    rec.lang = navigator.language || "en-IN";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => onText(e.results[0]?.[0]?.transcript ?? "");
    rec.onerror = () => { setListening(false); setUnsupported(true); };
    rec.onend = () => setListening(false);
    setListening(true);
    rec.start();
  };

  return (
    <button
      type="button"
      onClick={start}
      disabled={disabled || listening}
      className="tap flex min-h-[88px] flex-col items-center justify-center gap-1.5 rounded-2xl bg-mist text-[14.5px] font-semibold text-ink ring-1 ring-ink/10 hover:bg-mist-100 disabled:opacity-40"
    >
      <CareIcon.Mic />
      {listening ? "Listening…" : unsupported ? "Not available" : "Speak"}
    </button>
  );
}

/* ================================ bottom nav ============================== */

const NAV: { key: Slot; label: string; icon: (p: { size?: number }) => ReactNode }[] = [
  { key: "today", label: "Today", icon: CareIcon.Today },
  { key: "journey", label: "Journey", icon: CareIcon.Journey },
  { key: "connect", label: "Connect", icon: CareIcon.Connect },
  { key: "plan", label: "Plan", icon: CareIcon.Plan },
];

function BottomNav({
  slot, setSlot, onTellUs,
}: { slot: Slot; setSlot: (s: Slot) => void; onTellUs: () => void }) {
  const left = NAV.slice(0, 2);
  const right = NAV.slice(2);
  const Item = ({ item }: { item: (typeof NAV)[number] }) => {
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
        {left.map((i) => <Item key={i.key} item={i} />)}
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
        {right.map((i) => <Item key={i.key} item={i} />)}
      </ul>
    </nav>
  );
}
