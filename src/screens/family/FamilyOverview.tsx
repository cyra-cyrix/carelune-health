import { useEffect, useMemo, useState } from "react";
import { Icon, ProgressRing } from "../../components/ui";
import {
  Button, MetricCard, MilestoneTimeline, Disclosure, EmptyState, StatusTag, SectionLabel,
  Input, Field,
} from "../../components/clinical";
import RaiseConcern from "../../components/RaiseConcern";
import { useBranding } from "../../branding/BrandingProvider";
import { credentialsText, shareOnWhatsApp, generatePassword } from "../../lib/share";
import { loginUrl as appLoginUrl } from "../../config/urls";
import { familyParams, numericValue, statusFor, type MonitorParam } from "../../domain/monitoring";
import {
  getMyPatient,
  getReadingHistory,
  getDailyUpdates,
  getCareTasks,
  getTodayTaskLogs,
  getStorefront,
  getSubscription,
  startTrial,
  addCaregiver,
  getPatientPlan,
  getThresholds,
  getMedications,
  getMedAdminToday,
  readingRowToInput,
  type PatientRow,
  type ReadingRow,
  type ReadingsInput,
  type UpdateRow,
  type CareTaskRow,
  type Storefront,
  type SubscriptionRow,
  type PatientPlanRow,
  type ThresholdRow,
  type MedicationRow,
  type MedAdminStatus,
} from "../../lib/db";

/**
 * Family overview (database-backed). A calm, read-only recovery summary for the
 * family member linked to this patient at onboarding: how they are today, how
 * the day's care is going, the readings the doctor's plan actually monitors,
 * recovery milestones, medicines, and the real care-team feed. No clinical
 * controls. Attention is shown ONLY where a doctor set a threshold — never
 * invented. Everything here is the same patient the caregiver logs and the
 * doctor manages: that is the loop.
 */
export default function FamilyOverview() {
  const [patient, setPatient] = useState<PatientRow | null>(null);
  const [readings, setReadings] = useState<ReadingRow[]>([]);
  const [feed, setFeed] = useState<UpdateRow[]>([]);
  const [tasks, setTasks] = useState<CareTaskRow[]>([]);
  const [doneCount, setDoneCount] = useState(0);
  const [storefront, setStorefront] = useState<Storefront | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionRow | null>(null);
  const [plan, setPlan] = useState<PatientPlanRow | null>(null);
  const [thresholds, setThresholds] = useState<ThresholdRow[]>([]);
  const [meds, setMeds] = useState<MedicationRow[]>([]);
  const [medAdmin, setMedAdmin] = useState<Map<string, MedAdminStatus>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Silently refetch when the tab regains focus (catches the caregiver's/doctor's
  // updates without a manual reload).
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") setRefreshKey((k) => k + 1);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const p = await getMyPatient();
        if (!active) return;
        setPatient(p);
        if (p) {
          const [hist, updates, careTasks, logs, sf, sub, pl, th, ms, ma] = await Promise.all([
            getReadingHistory(p.id, 7).catch(() => [] as ReadingRow[]),
            getDailyUpdates(p.id, 8).catch(() => [] as UpdateRow[]),
            getCareTasks(p.id).catch(() => [] as CareTaskRow[]),
            getTodayTaskLogs(p.id).catch(() => new Set<string>()),
            getStorefront().catch(() => null),
            getSubscription(p.id).catch(() => null),
            getPatientPlan(p.id).catch(() => null),
            getThresholds(p.id).catch(() => [] as ThresholdRow[]),
            getMedications(p.id).catch(() => [] as MedicationRow[]),
            getMedAdminToday(p.id).catch(() => new Map<string, MedAdminStatus>()),
          ]);
          if (!active) return;
          setReadings(hist);
          setFeed(updates);
          setTasks(careTasks);
          setDoneCount(careTasks.filter((t) => logs.has(t.id)).length);
          setStorefront(sf);
          setSubscription(sub);
          setPlan(pl);
          setThresholds(th);
          setMeds(ms.filter((m) => m.active));
          setMedAdmin(ma);
        }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Could not load the overview.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [refreshKey]);

  if (loading) {
    return (
      <div className="space-y-4 p-4">
        <div className="h-36 animate-pulse rounded-2xl bg-mist-200" />
        <div className="h-24 animate-pulse rounded-2xl bg-mist-200" />
      </div>
    );
  }
  if (error) return <Shell><p className="text-[14px] text-sage-600">{error}</p></Shell>;
  if (!patient) return <NoPatient />;

  const first = patient.full_name.split(" ")[0];
  const day = dayAtHome(patient);
  const latestUpdate = feed.find((u) => u.source === "caregiver") ?? feed[0] ?? null;

  return (
    <div className="min-h-full bg-mist pb-10">
      {/* ---- Hero ---- */}
      <section className="border-b border-line bg-white px-5 pb-6 pt-6">
        <SectionLabel>Recovery overview</SectionLabel>
        <h1 className="mt-1 font-display text-[24px] font-semibold leading-tight tracking-[-0.01em] text-ink">
          {first}&rsquo;s recovery
        </h1>
        <div className="mt-4 flex items-center gap-4">
          <ProgressRing value={day} total={patient.journey_total_days} size={82} />
          <div className="min-w-0">
            <div className="text-[16px] font-semibold text-ink">
              Day {day} of {patient.journey_total_days}
            </div>
            {patient.diagnosis.length > 0 && (
              <div className="mt-0.5 truncate text-[13px] text-sage-600">{patient.diagnosis.join(" · ")}</div>
            )}
            <div className="mt-1.5">
              <StatusTag tone={patient.status === "pending" ? "calm" : "recovery"}>
                {patient.status === "pending" ? "Plan being prepared" : "Plan active · care team engaged"}
              </StatusTag>
            </div>
          </div>
        </div>
        {patient.status !== "pending" && latestUpdate && (
          <p className="mt-4 rounded-xl bg-mist-100 px-3.5 py-2.5 text-[13px] leading-relaxed text-sage-700">
            <span className="font-semibold text-ink">Latest:</span> {latestUpdate.body.length > 130 ? latestUpdate.body.slice(0, 130) + "…" : latestUpdate.body}
          </p>
        )}
      </section>

      <div className="space-y-4 px-4 py-5">
        {patient.status === "pending" && (
          <div className="rounded-2xl bg-warn-100/70 p-4 ring-1 ring-warn-500/20">
            <p className="text-[13px] leading-relaxed text-ink">
              <span className="font-semibold">Awaiting the doctor&rsquo;s plan.</span> {first} is registered.
              Once the doctor prepares the recovery plan, the daily care and updates appear here.
            </p>
          </div>
        )}

        {/* ---- Today's care ---- */}
        {tasks.length > 0 && (
          <section className="flex items-center gap-4 rounded-2xl bg-white p-4 shadow-card ring-1 ring-ink/[0.05]">
            <ProgressRing value={doneCount} total={tasks.length} size={54} />
            <div className="min-w-0">
              <h2 className="font-display text-[15px] font-semibold text-ink">Today&rsquo;s care</h2>
              <p className="mt-0.5 text-[13px] text-sage-600">
                {doneCount === tasks.length
                  ? `All ${tasks.length} care steps done today. Thank you.`
                  : `${doneCount} of ${tasks.length} care steps done so far today`}
              </p>
            </div>
          </section>
        )}

        {/* ---- Latest readings (plan-specific only) ---- */}
        {patient.status !== "pending" && (
          <ReadingsSection
            name={first}
            plan={plan}
            diagnosis={patient.diagnosis}
            readings={readings}
            thresholds={thresholds}
          />
        )}

        {/* ---- Recovery milestones + warning signs ---- */}
        <RecoveryPlanCard plan={plan} name={first} day={day} />

        {/* ---- Medicines today (read-only summary) ---- */}
        {patient.status !== "pending" && meds.length > 0 && (
          <MedicinesSummary meds={meds} admin={medAdmin} />
        )}

        {/* ---- Care-team feed ---- */}
        <section aria-labelledby="ff" className="space-y-2.5">
          <h2 id="ff" className="px-1 font-display text-[16px] font-semibold text-ink">Updates from the care team</h2>
          {feed.length === 0 ? (
            <EmptyState title="No updates yet">The care team will share progress here as {first}&rsquo;s recovery continues.</EmptyState>
          ) : (
            feed.map((u) => (
              <div key={u.id} className="rounded-2xl bg-white p-4 shadow-card ring-1 ring-ink/[0.05]">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[13px] font-semibold text-ink">{u.author_name || sourceLabel(u.source)}</span>
                  <span className="shrink-0 text-[11px] text-sage-500">{niceDate(u.created_at)}</span>
                </div>
                <p className="mt-1 whitespace-pre-line text-[14px] leading-relaxed text-sage-700">{u.body}</p>
              </div>
            ))
          )}
        </section>

        {/* ---- Ask the care team ---- */}
        <RaiseConcern patientId={patient.id} />

        {/* ---- Care package + add caregiver (preserved actions) ---- */}
        <PackageCard
          patientId={patient.id}
          storefront={storefront}
          subscription={subscription}
          onSubscribed={(s) => setSubscription(s)}
        />
        <AddCaregiverCard patientId={patient.id} />

        {/* ---- Emergency ---- */}
        <EmergencyCard storefront={storefront} />

        <p className="px-1 text-center text-[11.5px] leading-relaxed text-sage-500">
          A read-only view for family. Care is delivered by the treating team.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------ latest readings --------------------------- */

type ReadingView = {
  param: MonitorParam;
  value: string;
  previous: string | null;
  series: number[];
  status: "normal" | "attention" | "unknown";
  updated: string;
};

/** The doctor-approved readings, most-recent value with a quiet trend, shown
 *  only for parameters the plan actually monitors. Attention chips appear only
 *  where a doctor threshold exists. */
function ReadingsSection({
  name, plan, diagnosis, readings, thresholds,
}: {
  name: string;
  plan: PatientPlanRow | null;
  diagnosis: string[];
  readings: ReadingRow[];
  thresholds: ThresholdRow[];
}) {
  const views = useMemo<ReadingView[]>(() => {
    const modules = (plan?.content?.observations ?? []).map((o) => o.module);
    const params = familyParams(modules, diagnosis);
    const inputs = readings.map(readingRowToInput);
    const latestDate = readings.length ? readings[readings.length - 1].reading_date : null;
    const thByKey = new Map(thresholds.map((t) => [t.param, t]));
    return params
      .map((param) => {
        const field = param.field as keyof ReadingsInput;
        const raw = inputs.map((inp) => (inp[field] ?? "").toString().trim());
        const nonEmpty = raw.filter(Boolean);
        if (nonEmpty.length === 0) return null;
        const value = nonEmpty[nonEmpty.length - 1];
        const previous = nonEmpty.length >= 2 ? nonEmpty[nonEmpty.length - 2] : null;
        const series = param.trend
          ? raw.map((r) => numericValue(param, r)).filter((n): n is number => n != null)
          : [];
        const th = thByKey.get(param.key);
        const status = statusFor(param, value, th ? { min_val: th.min_val, max_val: th.max_val } : undefined);
        return {
          param, value, previous, series, status,
          updated: latestDate ? niceDate(latestDate) : "",
        } satisfies ReadingView;
      })
      .filter((v): v is ReadingView => v !== null);
  }, [plan, diagnosis, readings, thresholds]);

  if (views.length === 0) {
    return (
      <section className="space-y-2.5">
        <h2 className="px-1 font-display text-[16px] font-semibold text-ink">How {name} is today</h2>
        <EmptyState title="No readings yet">
          Readings appear here once the caregiver records the day. Only the checks in {name}&rsquo;s plan are shown.
        </EmptyState>
      </section>
    );
  }

  const anyAttention = views.some((v) => v.status === "attention");

  return (
    <section className="space-y-2.5">
      <h2 className="px-1 font-display text-[16px] font-semibold text-ink">How {name} is today</h2>
      {anyAttention && (
        <div className="flex items-start gap-2 rounded-xl bg-warn-100/70 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-ink ring-1 ring-warn-500/20">
          <Icon.Warn width={16} height={16} className="mt-0.5 shrink-0 text-warn-600" />
          <span>A reading is outside the range the doctor set. The care team can see this too and will follow up.</span>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2.5">
        {views.map((v) => {
          const numeric = v.param.input === "number" || v.param.input === "bp" || v.param.input === "scale";
          return (
            <MetricCard
              key={v.param.key}
              label={v.param.short}
              value={v.value || "—"}
              emphasis={numeric ? "number" : "text"}
              unit={numeric ? v.param.unit : undefined}
              previous={numeric ? (v.previous ?? undefined) : undefined}
              updated={v.updated}
              status={v.status}
              values={v.series.length >= 2 ? v.series : undefined}
              tone={v.status === "attention" ? "attention" : "recovery"}
            />
          );
        })}
      </div>
      <p className="px-1 text-[11px] text-sage-400">Recorded by the care team. Shown for the checks in {name}&rsquo;s plan.</p>
    </section>
  );
}

/* ------------------------------ medicines summary ------------------------- */

/** A calm read-only summary of today's medicines: how many given, with the list
 *  available on demand. Detailed administration is the caregiver/nurse's job. */
function MedicinesSummary({ meds, admin }: { meds: MedicationRow[]; admin: Map<string, MedAdminStatus> }) {
  const medStatus = (medId: string): MedAdminStatus | null => {
    let given = false, missed = false;
    for (const [key, status] of admin) {
      if (!key.startsWith(medId + "|")) continue;
      if (status === "given") given = true;
      if (status === "missed") missed = true;
    }
    return given ? "given" : missed ? "missed" : null;
  };
  const givenCount = meds.filter((m) => medStatus(m.id) === "given").length;

  return (
    <section className="rounded-2xl bg-white p-4 shadow-card ring-1 ring-ink/[0.05]">
      <Disclosure
        summary={
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600 ring-1 ring-brand-100">
              <Icon.Pill width={18} height={18} />
            </span>
            <div className="min-w-0">
              <div className="text-[15px] font-semibold text-ink">Medicines today</div>
              <div className="mt-0.5 text-[12.5px] text-sage-600">
                {givenCount} of {meds.length} given so far
              </div>
            </div>
          </div>
        }
      >
        <ul className="space-y-1.5 border-t border-line pt-3">
          {meds.map((m) => {
            const st = medStatus(m.id);
            return (
              <li key={m.id} className="flex items-center justify-between gap-3 text-[13.5px]">
                <span className="min-w-0 truncate text-ink">
                  {m.name}{m.dose ? <span className="text-sage-500"> · {m.dose}</span> : null}
                </span>
                {st === "given" ? (
                  <StatusTag tone="recovery">Given</StatusTag>
                ) : st === "missed" ? (
                  <StatusTag tone="attention">Missed</StatusTag>
                ) : (
                  <span className="shrink-0 text-[12px] text-sage-400">Scheduled</span>
                )}
              </li>
            );
          })}
        </ul>
      </Disclosure>
    </section>
  );
}

/* ------------------------------ recovery plan ----------------------------- */

/** Recovery milestones + warning signs, in plain language — shown once the
 *  doctor has approved the plan (RLS returns approved plans to the household). */
function RecoveryPlanCard({ plan, name, day }: { plan: PatientPlanRow | null; name: string; day: number }) {
  if (!plan || plan.status !== "approved") return null;
  const c = plan.content;
  const milestones = (c.milestones ?? []).map((m) => ({
    name: m.name,
    caption: m.by_day != null ? `Target: day ${m.by_day}` : undefined,
    done: m.by_day != null ? day >= m.by_day : false,
  }));
  const warnings = (c.warning_signs ?? []).slice(0, 5);
  const shown = milestones.slice(0, 3);
  const rest = milestones.slice(3);

  return (
    <section className="space-y-4 rounded-2xl bg-white p-4 shadow-card ring-1 ring-ink/[0.05]">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-[16px] font-semibold text-ink">{name}&rsquo;s recovery plan</h2>
        <StatusTag tone="recovery">Doctor-approved</StatusTag>
      </div>
      {c.clinical_summary && <p className="text-[13.5px] leading-relaxed text-sage-700">{c.clinical_summary}</p>}

      {milestones.length > 0 && (
        <div>
          <SectionLabel>Recovery milestones</SectionLabel>
          <div className="mt-2.5"><MilestoneTimeline items={shown} /></div>
          {rest.length > 0 && (
            <Disclosure className="mt-1" summary={<span className="text-[13px] font-semibold text-sky-700">View all {milestones.length} milestones</span>}>
              <MilestoneTimeline items={rest} />
            </Disclosure>
          )}
        </div>
      )}

      {warnings.length > 0 && (
        <div className="rounded-xl bg-coral-100/50 p-3 ring-1 ring-coral-500/15">
          <h3 className="text-[12px] font-semibold text-coral-700">Call the care team if you notice</h3>
          <ul className="mt-1 space-y-0.5">
            {warnings.map((w, i) => <li key={i} className="text-[13px] leading-relaxed text-sage-700">• {w.text}</li>)}
          </ul>
        </div>
      )}
    </section>
  );
}

/* ------------------------------- care package ----------------------------- */

/** The family's care package: offer + free-trial CTA, or the current status. */
function PackageCard({
  patientId, storefront, subscription, onSubscribed,
}: {
  patientId: string;
  storefront: Storefront | null;
  subscription: SubscriptionRow | null;
  onSubscribed: (s: SubscriptionRow) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!storefront?.package_name && !subscription) return null;

  const price = subscription?.price ?? storefront?.package_price ?? null;
  const planName = subscription?.plan_name ?? storefront?.package_name ?? "Care package";
  const includes = (storefront?.package_includes ?? "").split("\n").map((s) => s.trim()).filter(Boolean);

  if (subscription) {
    const trialLeft =
      subscription.status === "trial" && subscription.trial_ends ? daysLeft(subscription.trial_ends) : null;
    return (
      <section className="rounded-2xl bg-white p-4 shadow-card ring-1 ring-ink/[0.05]">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-[15px] font-semibold text-ink">{planName}</h2>
          <StatusTag tone={subscription.status === "trial" ? "calm" : "recovery"}>
            {subscription.status === "trial" ? "Free trial" : "Active"}
          </StatusTag>
        </div>
        <p className="mt-1.5 text-[13px] leading-relaxed text-sage-600">
          {subscription.status === "trial" ? (
            <>
              {trialLeft != null && trialLeft > 0
                ? `Your free trial has ${trialLeft} day${trialLeft === 1 ? "" : "s"} left. `
                : "Your free trial has ended. "}
              {price ? (
                <>After the trial it is <span className="font-semibold text-ink">₹{price.toLocaleString("en-IN")}/month</span>, payable at your centre.</>
              ) : "Your centre will confirm the details."}
            </>
          ) : (
            <>{price ? <><span className="font-semibold text-ink">₹{price.toLocaleString("en-IN")}/month</span> — settled at your centre.</> : "Settled at your centre."}</>
          )}
        </p>
      </section>
    );
  }

  const trialDays = storefront?.trial_days ?? 0;
  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      onSubscribed(await startTrial(patientId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl bg-white shadow-card ring-1 ring-ink/[0.05]">
      <div className="border-b border-line px-4 pb-3 pt-4">
        <SectionLabel>Recovery programme</SectionLabel>
        <div className="mt-1 flex items-baseline justify-between gap-2">
          <h2 className="font-display text-[17px] font-semibold leading-tight text-ink">{planName}</h2>
          {price != null && (
            <div className="shrink-0 text-[14px] font-semibold text-ink">
              ₹{price.toLocaleString("en-IN")}<span className="font-normal text-sage-500">/mo</span>
            </div>
          )}
        </div>
      </div>
      <div className="p-4">
        {includes.length > 0 && (
          <ul className="space-y-1.5">
            {includes.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-[13.5px] leading-relaxed text-sage-700">
                <span className="mt-[3px] grid h-4 w-4 shrink-0 place-items-center rounded-full bg-brand-50 text-[10px] font-bold text-brand-600">✓</span>
                {item}
              </li>
            ))}
          </ul>
        )}
        {error && <p className="mt-3 text-[13px] text-coral-600">{error}</p>}
        <Button variant="primary" full busy={busy} onClick={start} className="mt-4">
          {busy ? "Starting…" : trialDays > 0 ? `Start ${trialDays}-day free trial` : "Join the programme"}
        </Button>
        <p className="mt-2 text-center text-[11.5px] leading-relaxed text-sage-500">
          {trialDays > 0
            ? "No payment now. After the free trial, fees are settled at your centre."
            : "Fees are settled at your centre — nothing is charged here."}
        </p>
      </div>
    </section>
  );
}

/* ------------------------------- emergency -------------------------------- */

function EmergencyCard({ storefront }: { storefront: Storefront | null }) {
  const note = storefront?.emergency_note?.trim();
  const number = storefront?.emergency_number?.trim();
  return (
    <section className="rounded-2xl bg-coral-100/60 p-4 ring-1 ring-coral-500/20">
      <h2 className="font-display text-[14px] font-semibold text-ink">In an emergency</h2>
      <p className="mt-1 whitespace-pre-line text-[13px] leading-relaxed text-sage-700">
        {note || "Call your centre first. If unreachable, call 112 or 108, or go to the nearest hospital."}
      </p>
      {number && (
        <a
          href={`tel:${number.replace(/\s/g, "")}`}
          className="tap mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-coral-600 px-3.5 py-1.5 text-[13px] font-semibold text-white hover:bg-coral-500"
        >
          <Icon.Phone width={14} height={14} /> Call {number}
        </a>
      )}
    </section>
  );
}

/* -------------------------------- helpers --------------------------------- */

/** Whole days from today until an ISO date (YYYY-MM-DD); clamped at 0. */
function daysLeft(iso: string): number {
  const end = new Date(iso + "T23:59:59").getTime();
  return Math.max(0, Math.ceil((end - Date.now()) / 86_400_000));
}

/** Whole days since journey start, 1-indexed. */
function dayAtHome(p: PatientRow): number {
  const start = new Date(p.journey_start).getTime();
  return Math.max(1, Math.floor((Date.now() - start) / 86_400_000) + 1);
}

function niceDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "Today";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function sourceLabel(s: UpdateRow["source"]): string {
  return { caregiver: "Caregiver", nurse: "Nurse", duty_doctor: "Duty Doctor", pmr: "Doctor" }[s] ?? "Care team";
}

/** Family adds the caregiver who does the daily care. Creates their login and
 *  links them to this patient; the caregiver resets the password on first sign-in. */
function AddCaregiverCard({ patientId }: { patientId: string }) {
  const { platformName } = useBranding();
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState(generatePassword);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await addCaregiver({ patient_id: patientId, full_name: fullName, email, password });
      setCreated({ email, password });
      setFullName("");
      setEmail("");
      setPassword(generatePassword());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add the caregiver.");
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="tap flex w-full items-center justify-between rounded-2xl bg-white p-4 text-left shadow-card ring-1 ring-ink/[0.05] hover:ring-brand-300"
      >
        <span>
          <span className="block text-[14px] font-semibold text-ink">Add a caregiver</span>
          <span className="block text-[12px] text-sage-500">The person who does the daily care at home</span>
        </span>
        <Icon.ChevronRight width={18} height={18} className="text-brand-600" />
      </button>
    );
  }

  return (
    <section className="rounded-2xl bg-white p-4 shadow-card ring-1 ring-ink/[0.05]">
      <h2 className="font-display text-[15px] font-semibold text-ink">Add a caregiver</h2>
      {created ? (
        <div className="mt-3 rounded-xl bg-brand-50 p-3 ring-1 ring-brand-100">
          <p className="text-[13px] font-semibold text-ink">Caregiver added — {created.email}</p>
          <p className="mt-0.5 text-[12px] text-sage-600">
            Temporary password <span className="font-semibold text-ink">{created.password}</span> · they reset it on first sign-in.
          </p>
          <Button
            variant="primary"
            size="sm"
            icon={<Icon.Phone width={14} height={14} />}
            className="mt-2.5"
            onClick={() =>
              shareOnWhatsApp(
                credentialsText({
                  platformName,
                  loginUrl: appLoginUrl(),
                  email: created.email,
                  password: created.password,
                  roleLabel: "Caregiver",
                }),
              )
            }
          >
            Share on WhatsApp
          </Button>
          <button type="button" onClick={() => { setCreated(null); setOpen(false); }} className="tap mt-2 block text-[12px] font-semibold text-sage-600 hover:text-ink">Done</button>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <Field label="Caregiver's name">
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Full name" />
          </Field>
          <Field label="Caregiver's email" hint="This becomes their login.">
            <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="name@example.com" />
          </Field>
          <Field label="Temporary password" hint="Auto-generated — the caregiver resets it on first sign-in.">
            <div className="flex items-center gap-1.5">
              <Input value={password} readOnly className="font-mono" />
              <button
                type="button"
                onClick={() => setPassword(generatePassword())}
                title="Generate a new password"
                className="tap shrink-0 rounded-lg border border-line px-2.5 py-2.5 text-[13px] font-semibold text-sage-600 hover:bg-mist-100 hover:text-ink"
              >
                ↻
              </button>
            </div>
          </Field>
          {error && <p className="text-[13px] text-coral-600">{error}</p>}
          <div className="flex items-center gap-2">
            <Button variant="primary" full busy={busy} disabled={!email || password.length < 6} onClick={submit}>
              {busy ? "Adding…" : "Add caregiver"}
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </section>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-full bg-mist p-4">{children}</div>;
}

function NoPatient() {
  return (
    <div className="min-h-full bg-mist p-4">
      <div className="rounded-2xl bg-white p-5 shadow-card ring-1 ring-ink/[0.05]">
        <h1 className="text-[17px] font-semibold text-ink">No patient linked yet</h1>
        <p className="mt-1 text-[13px] leading-relaxed text-sage-600">
          Your centre will link your family account to the patient at onboarding. Once that&rsquo;s done,
          their recovery overview appears here.
        </p>
      </div>
    </div>
  );
}
