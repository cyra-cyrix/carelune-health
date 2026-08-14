import { useEffect, useState } from "react";
import { Icon, ProgressRing } from "../../components/ui";
import RaiseConcern from "../../components/RaiseConcern";
import { useBranding } from "../../branding/BrandingProvider";
import { credentialsText, shareOnWhatsApp, generatePassword } from "../../lib/share";
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
  type PatientRow,
  type ReadingRow,
  type UpdateRow,
  type CareTaskRow,
  type Storefront,
  type SubscriptionRow,
  type PatientPlanRow,
} from "../../lib/db";

/**
 * Family overview (database-backed). Read-only reassurance for the family member
 * whose account is linked to this patient at onboarding: how they are today
 * (latest recorded readings), the recovery day, and the real care-team feed.
 * No clinical controls. Everything here is the same patient the caregiver logs
 * and the doctor manages — that is the loop.
 */
export default function FamilyOverview() {
  const [patient, setPatient] = useState<PatientRow | null>(null);
  const [reading, setReading] = useState<ReadingRow | null>(null);
  const [feed, setFeed] = useState<UpdateRow[]>([]);
  const [tasks, setTasks] = useState<CareTaskRow[]>([]);
  const [doneCount, setDoneCount] = useState(0);
  const [storefront, setStorefront] = useState<Storefront | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionRow | null>(null);
  const [plan, setPlan] = useState<PatientPlanRow | null>(null);
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
          const [readings, updates, careTasks, logs, sf, sub, pl] = await Promise.all([
            getReadingHistory(p.id, 1).catch(() => [] as ReadingRow[]),
            getDailyUpdates(p.id, 8).catch(() => [] as UpdateRow[]),
            getCareTasks(p.id).catch(() => [] as CareTaskRow[]),
            getTodayTaskLogs(p.id).catch(() => new Set<string>()),
            getStorefront().catch(() => null),
            getSubscription(p.id).catch(() => null),
            getPatientPlan(p.id).catch(() => null),
          ]);
          if (!active) return;
          setReading(readings[readings.length - 1] ?? null);
          setFeed(updates);
          setTasks(careTasks);
          setDoneCount(careTasks.filter((t) => logs.has(t.id)).length);
          setStorefront(sf);
          setSubscription(sub);
          setPlan(pl);
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

  if (loading) return <div className="p-4"><div className="h-40 animate-pulse rounded-2xl bg-mist-200" /></div>;
  if (error) return <Shell><p className="text-[14px] text-sage-600">{error}</p></Shell>;
  if (!patient) return <NoPatient />;

  const first = patient.full_name.split(" ")[0];
  const day = dayAtHome(patient);

  return (
    <div className="min-h-full bg-mist pb-8">
      {/* Hero */}
      <section className="border-b border-line bg-white px-5 pb-6 pt-5">
        <h1 className="font-display text-[24px] font-semibold leading-tight text-ink">
          {first}&rsquo;s recovery
        </h1>
        <div className="mt-4 flex items-center gap-4">
          <ProgressRing value={day} total={patient.journey_total_days} size={84} />
          <div className="min-w-0">
            <div className="text-[17px] font-semibold text-ink">
              Day {day} of {patient.journey_total_days}
            </div>
            {patient.diagnosis.length > 0 && (
              <div className="truncate text-[13px] text-sage-600">{patient.diagnosis.join(" · ")}</div>
            )}
            <div className="mt-1 text-[12px] font-medium text-sage-500">
              {patient.status === "pending" ? "Registered · plan being prepared" : "Plan active · cared for by the team"}
            </div>
          </div>
        </div>
      </section>

      <div className="space-y-4 px-4 py-5">
        {patient.status === "pending" && (
          <div className="rounded-2xl bg-warn-100/70 p-4 ring-1 ring-warn-500/20">
            <p className="text-[13px] leading-relaxed text-ink">
              <span className="font-semibold">Awaiting the doctor&rsquo;s plan.</span> {first} is registered.
              Once the doctor prepares the recovery plan, the daily tasks and updates appear here.
            </p>
          </div>
        )}

        {/* Care package — the family's offer + free trial (pay at the centre) */}
        <PackageCard
          patientId={patient.id}
          storefront={storefront}
          subscription={subscription}
          onSubscribed={(s) => setSubscription(s)}
        />

        {/* Add caregiver */}
        <AddCaregiverCard patientId={patient.id} />

        {/* Today's care — reflects the caregiver ticking off the plan */}
        {tasks.length > 0 && (
          <section className="flex items-center gap-4 rounded-2xl bg-white p-4 shadow-lift ring-1 ring-ink/[0.05]">
            <ProgressRing value={doneCount} total={tasks.length} size={56} />
            <div className="min-w-0">
              <h2 className="font-display text-[15px] font-semibold text-ink">Today&rsquo;s care</h2>
              <p className="mt-0.5 text-[13px] text-sage-600">
                {doneCount === tasks.length
                  ? `All ${tasks.length} tasks done today. Thank you.`
                  : `${doneCount} of ${tasks.length} tasks done today`}
              </p>
            </div>
          </section>
        )}

        {/* The recovery plan (family-readable once the doctor approves it) */}
        <RecoveryPlanCard plan={plan} name={first} />

        {/* How they are today */}
        <section className="rounded-2xl bg-white p-4 shadow-lift ring-1 ring-ink/[0.05]">
          <h2 className="font-display text-[16px] font-semibold text-ink">How {first} is today</h2>
          {reading ? (
            <>
              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
                <Vital label="Blood pressure" value={reading.bp} />
                <Vital label="Blood sugar" value={reading.grbs} />
                <Vital label="Food intake" value={reading.food_intake} />
                <Vital label="Mood" value={reading.mood} />
              </div>
              <p className="mt-3 text-[11px] text-sage-400">
                Recorded by the care team{reading.reading_date ? ` · ${niceDate(reading.reading_date)}` : ""}.
              </p>
            </>
          ) : (
            <p className="mt-1.5 text-[14px] leading-relaxed text-sage-600">
              No readings have been recorded yet. They will appear here once the caregiver logs the day.
            </p>
          )}
        </section>

        {/* Care-team feed — the real loop */}
        <section aria-labelledby="ff" className="space-y-3">
          <h2 id="ff" className="font-display text-[17px] font-semibold text-ink">Updates from the care team</h2>
          {feed.length === 0 ? (
            <div className="rounded-2xl bg-white p-4 text-[14px] text-sage-600 shadow-lift ring-1 ring-ink/[0.05]">
              No updates yet. The care team will share progress here.
            </div>
          ) : (
            feed.map((u) => (
              <div key={u.id} className="rounded-2xl bg-white p-4 shadow-lift ring-1 ring-ink/[0.05]">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[13px] font-semibold text-ink">
                    {u.author_name || sourceLabel(u.source)}
                  </span>
                  <span className="shrink-0 text-[11px] text-sage-500">{niceDate(u.created_at)}</span>
                </div>
                <p className="mt-1 whitespace-pre-line text-[14px] leading-relaxed text-sage-700">{u.body}</p>
              </div>
            ))
          )}
        </section>

        {/* Ask the care team — type or voice */}
        <RaiseConcern patientId={patient.id} />

        {/* Emergency — from the org, with a safe fallback */}
        <EmergencyCard storefront={storefront} />

        <p className="px-1 text-[12px] leading-relaxed text-sage-500">
          A read-only view for family.
        </p>
      </div>
    </div>
  );
}

/** The family's care package: offer + free-trial CTA, or the current status. */
function PackageCard({
  patientId,
  storefront,
  subscription,
  onSubscribed,
}: {
  patientId: string;
  storefront: Storefront | null;
  subscription: SubscriptionRow | null;
  onSubscribed: (s: SubscriptionRow) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Nothing to show until the centre has set up a package.
  if (!storefront?.package_name && !subscription) return null;

  const price = subscription?.price ?? storefront?.package_price ?? null;
  const planName = subscription?.plan_name ?? storefront?.package_name ?? "Care package";
  const includes = (storefront?.package_includes ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  // Already subscribed → status banner.
  if (subscription) {
    const trialLeft =
      subscription.status === "trial" && subscription.trial_ends ? daysLeft(subscription.trial_ends) : null;
    return (
      <section className="rounded-2xl bg-white p-4 shadow-lift ring-1 ring-ink/[0.05]">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-[15px] font-semibold text-ink">{planName}</h2>
          <span
            className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
              subscription.status === "trial" ? "bg-brand-100 text-brand-700" : "bg-good-100 text-good-600"
            }`}
          >
            {subscription.status === "trial" ? "Free trial" : "Active"}
          </span>
        </div>
        <p className="mt-1.5 text-[13px] leading-relaxed text-sage-600">
          {subscription.status === "trial" ? (
            <>
              {trialLeft != null && trialLeft > 0
                ? `Your free trial has ${trialLeft} day${trialLeft === 1 ? "" : "s"} left. `
                : "Your free trial has ended. "}
              {price ? (
                <>
                  After the trial it is <span className="font-semibold text-ink">₹{price.toLocaleString("en-IN")}/month</span>,
                  payable at your centre.
                </>
              ) : (
                "Your centre will confirm the details."
              )}
            </>
          ) : (
            <>
              {price ? (
                <>
                  <span className="font-semibold text-ink">₹{price.toLocaleString("en-IN")}/month</span> — settled at
                  your centre.
                </>
              ) : (
                "Settled at your centre."
              )}
            </>
          )}
        </p>
      </section>
    );
  }

  // Not subscribed yet → the offer.
  const trialDays = storefront?.trial_days ?? 0;
  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const s = await startTrial(patientId);
      onSubscribed(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl bg-white shadow-lift ring-1 ring-ink/[0.05]">
      <div className="bg-gradient-to-br from-brand-600 to-brand-500 px-4 py-4 text-white">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/80">Care continues</div>
        <h2 className="mt-0.5 font-display text-[18px] font-semibold leading-tight">{planName}</h2>
        {price != null && (
          <div className="mt-1 text-[14px] font-medium text-white/90">
            ₹{price.toLocaleString("en-IN")}
            <span className="text-white/70">/month</span>
          </div>
        )}
      </div>
      <div className="p-4">
        {includes.length > 0 && (
          <ul className="space-y-1.5">
            {includes.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-[13.5px] leading-relaxed text-sage-700">
                <span className="mt-[3px] grid h-4 w-4 shrink-0 place-items-center rounded-full bg-good-100 text-[10px] font-bold text-good-600">
                  ✓
                </span>
                {item}
              </li>
            ))}
          </ul>
        )}

        {error && <p className="mt-3 text-[13px] text-coral-600">{error}</p>}

        <button
          type="button"
          onClick={start}
          disabled={busy}
          className="tap mt-4 w-full rounded-xl bg-brand-600 py-3 text-[15px] font-semibold text-white hover:bg-brand-500 disabled:opacity-60"
        >
          {busy ? "Starting…" : trialDays > 0 ? `Start ${trialDays}-day free trial` : "Join the programme"}
        </button>
        <p className="mt-2 text-center text-[11.5px] leading-relaxed text-sage-500">
          {trialDays > 0
            ? "No payment now. After the free trial, fees are settled at your centre."
            : "Fees are settled at your centre — nothing is charged here."}
        </p>
      </div>
    </section>
  );
}

/** The recovery plan, in plain language for the family — shown once the doctor
 *  has approved it (RLS returns approved plans to the household, never drafts). */
function RecoveryPlanCard({ plan, name }: { plan: PatientPlanRow | null; name: string }) {
  if (!plan || plan.status !== "approved") return null;
  const c = plan.content;
  const milestones = (c.milestones ?? []).slice(0, 4);
  const warnings = (c.warning_signs ?? []).slice(0, 4);
  return (
    <section className="rounded-2xl bg-white p-4 shadow-lift ring-1 ring-ink/[0.05]">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-[16px] font-semibold text-ink">{name}&rsquo;s recovery plan</h2>
        <span className="shrink-0 rounded-full bg-good-100 px-2.5 py-0.5 text-[11px] font-semibold text-good-600">Approved by the doctor</span>
      </div>
      {c.clinical_summary && <p className="mt-1.5 text-[13.5px] leading-relaxed text-sage-700">{c.clinical_summary}</p>}

      {milestones.length > 0 && (
        <div className="mt-3">
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-sage-500">Goals</h3>
          <ul className="mt-1.5 space-y-1">
            {milestones.map((m, i) => (
              <li key={i} className="flex items-start gap-2 text-[13.5px] text-ink">
                <span className="mt-[3px] grid h-4 w-4 shrink-0 place-items-center rounded-full bg-good-100 text-[10px] font-bold text-good-600">✓</span>
                {m.name}{m.by_day != null ? ` · by day ${m.by_day}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="mt-3 rounded-xl bg-coral-100/50 p-3 ring-1 ring-coral-500/15">
          <h3 className="text-[12px] font-semibold text-coral-700">Call the team if you notice</h3>
          <ul className="mt-1 space-y-0.5">
            {warnings.map((w, i) => <li key={i} className="text-[13px] leading-relaxed text-sage-700">• {w.text}</li>)}
          </ul>
        </div>
      )}
    </section>
  );
}

/** What to do in an emergency — from the org, with a safe 112/108 fallback. */
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
          className="tap mt-2 inline-flex items-center gap-1.5 rounded-full bg-coral-600 px-3.5 py-1.5 text-[13px] font-semibold text-white hover:bg-coral-500"
        >
          Call {number}
        </a>
      )}
    </section>
  );
}

/** Whole days from today until an ISO date (YYYY-MM-DD); clamped at 0. */
function daysLeft(iso: string): number {
  const end = new Date(iso + "T23:59:59").getTime();
  return Math.max(0, Math.ceil((end - Date.now()) / 86_400_000));
}

function Vital({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-sage-500">{label}</div>
      <div className="mt-0.5 truncate text-[15px] font-semibold text-ink">{value?.trim() || "—"}</div>
    </div>
  );
}

/** Whole days since journey start, 1-indexed. */
function dayAtHome(p: PatientRow): number {
  const start = new Date(p.journey_start).getTime();
  return Math.max(1, Math.floor((Date.now() - start) / 86_400_000) + 1);
}

function niceDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function sourceLabel(s: UpdateRow["source"]): string {
  return { caregiver: "Caregiver", nurse: "Nurse", duty_doctor: "Duty Doctor", pmr: "Doctor" }[s] ?? "Care team";
}

const CG_FIELD =
  "w-full rounded-xl bg-white px-3 py-2 text-[14px] text-ink ring-1 ring-line focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400";

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
        className="tap flex w-full items-center justify-between rounded-2xl bg-white p-4 text-left shadow-lift ring-1 ring-ink/[0.05] hover:ring-brand-300"
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
    <section className="rounded-2xl bg-white p-4 shadow-lift ring-1 ring-ink/[0.05]">
      <h2 className="font-display text-[15px] font-semibold text-ink">Add a caregiver</h2>
      {created ? (
        <div className="mt-3 rounded-xl bg-good-100 p-3 ring-1 ring-good-500/20">
          <p className="text-[13px] font-semibold text-ink">Caregiver added — {created.email}</p>
          <p className="mt-0.5 text-[12px] text-sage-600">
            Temporary password <span className="font-semibold text-ink">{created.password}</span> · they reset it
            on first sign-in.
          </p>
          <button
            type="button"
            onClick={() =>
              shareOnWhatsApp(
                credentialsText({
                  platformName,
                  loginUrl: window.location.origin + window.location.pathname,
                  email: created.email,
                  password: created.password,
                  roleLabel: "Caregiver",
                }),
              )
            }
            className="tap mt-2 inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-3.5 py-1.5 text-[13px] font-semibold text-white hover:bg-brand-500"
          >
            <Icon.Phone width={14} height={14} /> Share on WhatsApp
          </button>
          <button type="button" onClick={() => { setCreated(null); setOpen(false); }} className="tap mt-2 block text-[12px] font-semibold text-sage-600 hover:text-ink">
            Done
          </button>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Caregiver's name" className={CG_FIELD} />
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Caregiver's email (their login)" className={CG_FIELD} />
          <div className="flex items-center gap-1.5">
            <input value={password} readOnly className={`${CG_FIELD} font-mono`} />
            <button
              type="button"
              onClick={() => setPassword(generatePassword())}
              title="Generate a new password"
              className="tap shrink-0 rounded-lg border border-line px-2.5 py-2 text-[13px] font-semibold text-sage-600 hover:bg-mist-100 hover:text-ink"
            >
              ↻
            </button>
          </div>
          <p className="text-[11px] text-sage-500">Auto-generated temporary password — the caregiver resets it on first sign-in.</p>
          {error && <p className="text-[13px] text-coral-600">{error}</p>}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={submit}
              disabled={busy || !email || password.length < 6}
              className="tap flex-1 rounded-xl bg-brand-600 py-2.5 text-[14px] font-semibold text-white hover:bg-brand-500 disabled:opacity-60"
            >
              {busy ? "Adding…" : "Add caregiver"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="tap rounded-xl px-3 py-2.5 text-[13px] font-semibold text-sage-600 hover:text-ink">
              Cancel
            </button>
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
      <div className="rounded-2xl bg-white p-5 shadow-card">
        <h1 className="text-[17px] font-semibold text-ink">No patient linked yet</h1>
        <p className="mt-1 text-[13px] leading-relaxed text-sage-600">
          Your centre will link your family account to the patient at onboarding. Once that&rsquo;s done,
          their recovery overview appears here.
        </p>
      </div>
    </div>
  );
}
