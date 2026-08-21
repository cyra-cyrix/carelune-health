/*
 * The Super Admin service builder — Carelune's guided setup for a new care
 * provider, from "tell us about them" to a configured service awaiting the
 * provider's own confirmation (D-003 Level 1).
 *
 * NOTHING IN THIS FILE KNOWS ABOUT A SPECIALTY. It renders whatever structured
 * service the analysis returned and the operator confirmed, which is why the
 * same five steps configure a spine surgeon and a lactation consultant. The
 * words the operator reads are the model's; the shape they sit in is the
 * schema's.
 *
 * The browser never writes configuration: analysis and the Level-1 write are
 * both Edge Functions (see docs/DECISIONS.md D-003).
 */
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { LoopMark, Icon } from "../../components/ui";
import { ErrorNote, inputCls, PrimaryButton } from "../../components/system";
import {
  analyseProviderService,
  createProviderService,
  type CreatedProviderService,
  type ProviderTypeKey,
} from "../../lib/db";
import {
  durationLabel,
  periodsForPackage,
  validateServiceDraft,
  type ServiceDraft,
  type SuggestedPackage,
  type SuggestedService,
} from "../../domain/serviceDraft";
import { credentialsText, generatePassword, shareOnWhatsApp } from "../../lib/share";
import { loginUrl as appLoginUrl } from "../../config/urls";
import { AiDraftMark, Detail, DomainChips, PackageCard, ProgrammeTimeline } from "./programme-kit";

/* --------------------------------- model ---------------------------------- */

const STEPS = ["Provider", "Understanding", "Service", "Programmes", "Confirm"] as const;
type Step = (typeof STEPS)[number];

const PROVIDER_TYPES: { key: ProviderTypeKey; label: string; hint: string }[] = [
  { key: "solo_professional", label: "Solo professional", hint: "One practitioner" },
  { key: "clinic", label: "Clinic / practice", hint: "A small team" },
  { key: "hospital", label: "Hospital", hint: "Departments and wards" },
  { key: "rehab_centre", label: "Rehabilitation centre", hint: "Inpatient or day care" },
  { key: "allied_health", label: "Allied health practice", hint: "Therapy, nutrition, counselling" },
  { key: "other", label: "Other", hint: "Something else" },
];
const TYPE_LABEL: Record<string, string> = Object.fromEntries(PROVIDER_TYPES.map((t) => [t.key, t.label]));

type Brief = {
  org_name: string;
  provider_type: ProviderTypeKey | "";
  admin_name: string;
  admin_email: string;
  admin_password: string;
  description: string;
  website: string;
  social: string;
  notes: string;
};

const freshBrief = (): Brief => ({
  org_name: "",
  provider_type: "",
  admin_name: "",
  admin_email: "",
  admin_password: generatePassword(),
  description: "",
  website: "",
  social: "",
  notes: "",
});

/** A draft the operator fills in themselves when the analysis is unavailable. */
function manualDraft(brief: Brief): ServiceDraft {
  const blankPackage = (name: string, days: number): SuggestedPackage => ({
    name,
    positioning: "",
    duration_days: days,
    monitoring_domains: [],
    checkin_frequency: "Daily",
    review_frequency: "Weekly review",
    support_level: "",
    includes: [],
    milestones: [],
  });
  return {
    provider_summary: brief.description.trim() || `${brief.org_name} — written by the Carelune team.`,
    suggested_services: [
      {
        name: `${brief.org_name} programme`,
        summary: "",
        patient_type: "",
        entry_point: "",
        typical_duration_days: null,
        objective: "",
        end_condition: "",
        monitoring_domains: [],
        suggested_patient_inputs: [],
        care_team_suggestions: [],
        suggested_packages: [blankPackage("Essential", 30), blankPackage("Guided", 60), blankPackage("Complete", 90)],
        programme_outline: [],
      },
    ],
  };
}

const lines = (v: string): string[] => v.split("\n").map((s) => s.trim()).filter(Boolean);
const toLines = (v: string[]): string => v.join("\n");
const areaCls = `${inputCls} leading-relaxed`;
const areaTall = `${areaCls} min-h-[112px]`;

/* --------------------------------- screen --------------------------------- */

export default function ServiceBuilder({ onExit }: { onExit: () => void }) {
  const [step, setStep] = useState<Step>("Provider");
  const [brief, setBrief] = useState<Brief>(freshBrief);

  const [analysing, setAnalysing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ServiceDraft | null>(null);
  const [aiModel, setAiModel] = useState<string | null>(null);

  const [chosen, setChosen] = useState(0);
  const [service, setService] = useState<SuggestedService | null>(null);
  const [edited, setEdited] = useState(false);
  const [understandingConfirmed, setUnderstandingConfirmed] = useState(false);
  const [editingService, setEditingService] = useState(false);

  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [editingPackage, setEditingPackage] = useState(false);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveDetail, setSaveDetail] = useState<string[]>([]);
  const [created, setCreated] = useState<CreatedProviderService | null>(null);

  // Each step is a new page of the task, so start it at the top. Setting the
  // scroll position directly rather than calling scrollTo keeps this working
  // under jsdom, where the method does not exist.
  useEffect(() => {
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [step]);

  const canAnalyse =
    brief.org_name.trim().length > 1 &&
    !!brief.provider_type &&
    brief.admin_email.trim().includes("@") &&
    brief.description.trim().length >= 20;

  const startAnalysis = async () => {
    setAnalysing(true);
    setAnalysisError(null);
    try {
      const result = await analyseProviderService({
        provider_name: brief.org_name.trim(),
        provider_type: TYPE_LABEL[brief.provider_type] ?? "",
        description: brief.description.trim(),
        website: brief.website.trim(),
        social: brief.social.trim(),
        notes: brief.notes.trim(),
      });
      setDraft(result.draft);
      setAiModel(result.provenance?.ai_model ?? null);
      setChosen(0);
      setService(result.draft.suggested_services[0]);
      setEdited(false);
      setUnderstandingConfirmed(false);
      setStep("Understanding");
    } catch (e) {
      setAnalysisError(e instanceof Error ? e.message : "Carelune could not reach the analysis service.");
    } finally {
      setAnalysing(false);
    }
  };

  const continueManually = () => {
    const d = manualDraft(brief);
    setDraft(d);
    setAiModel(null);
    setChosen(0);
    setService(d.suggested_services[0]);
    setEdited(true);
    setAnalysisError(null);
    setStep("Service");
    setEditingService(true);
  };

  const chooseService = (i: number) => {
    if (!draft) return;
    setChosen(i);
    setService(draft.suggested_services[i]);
    setEdited(false);
    setUnderstandingConfirmed(false);
  };

  const patchService = (patch: Partial<SuggestedService>) => {
    setService((s) => (s ? { ...s, ...patch } : s));
    setEdited(true);
  };

  const patchPackage = (index: number, patch: Partial<SuggestedPackage>) => {
    setService((s) =>
      s ? { ...s, suggested_packages: s.suggested_packages.map((p, i) => (i === index ? { ...p, ...patch } : p)) } : s,
    );
    setEdited(true);
  };

  const validation = useMemo(
    () =>
      service
        ? validateServiceDraft({ provider_summary: draft?.provider_summary ?? "", suggested_services: [service] })
        : null,
    [service, draft],
  );

  const submit = async () => {
    if (!service || !draft) return;
    setSaving(true);
    setSaveError(null);
    setSaveDetail([]);
    try {
      const result = await createProviderService({
        org_name: brief.org_name.trim(),
        provider_type: brief.provider_type,
        admin_name: brief.admin_name.trim(),
        admin_email: brief.admin_email.trim(),
        admin_password: brief.admin_password,
        description: brief.description.trim(),
        website: brief.website.trim(),
        social: brief.social.trim(),
        notes: brief.notes.trim(),
        provider_summary: draft.provider_summary,
        service,
        source_provenance: aiModel ? "ai_drafted" : "super_admin",
        ai_model: aiModel,
      });
      setCreated(result);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Carelune could not save this configuration.");
      if (validation && !validation.ok) setSaveDetail(validation.errors.slice(0, 6));
    } finally {
      setSaving(false);
    }
  };

  const shareCredentials = () => {
    if (!created) return;
    shareOnWhatsApp(
      credentialsText({
        platformName: created.org.name,
        loginUrl: appLoginUrl(),
        email: created.admin.email,
        password: brief.admin_password,
        roleLabel: "Primary professional",
      }),
    );
  };

  /* ------------------------------- rendering ------------------------------ */

  const stepIndex = STEPS.indexOf(step);

  return (
    <div className="min-h-screen bg-mist">
      <header className="sticky top-0 z-40 border-b border-line bg-white/90 backdrop-blur">
        <div className="mx-auto flex min-h-[3.5rem] max-w-[1180px] items-center justify-between gap-4 px-5 py-2 lg:px-8">
          <div className="flex items-center gap-2 text-sky-700">
            <LoopMark size={20} />
            <span className="flex flex-col leading-none">
              <span className="text-[14px] font-semibold tracking-tight text-ink">Carelune</span>
              <span className="mt-[3px] text-[9.5px] font-semibold uppercase tracking-[0.14em] text-sage-500">Service builder</span>
            </span>
          </div>
          <button
            type="button"
            onClick={onExit}
            className="tap rounded-lg border border-line px-3 py-1.5 text-[12.5px] font-medium text-sage-600 hover:bg-mist-100 hover:text-ink"
          >
            {created ? "Back to console" : "Close"}
          </button>
        </div>
        {!created && <StepRail index={stepIndex} />}
      </header>

      <main className="mx-auto max-w-[1180px] px-5 pb-24 pt-9 lg:px-8">
        {created ? (
          <Done created={created} onShare={shareCredentials} onExit={onExit} />
        ) : analysing ? (
          <Analysing name={brief.org_name} />
        ) : step === "Provider" ? (
          <ProviderStep
            brief={brief}
            setBrief={setBrief}
            canAnalyse={canAnalyse}
            error={analysisError}
            onAnalyse={startAnalysis}
            onManual={continueManually}
          />
        ) : step === "Understanding" && draft ? (
          <UnderstandingStep
            draft={draft}
            chosen={chosen}
            onChoose={chooseService}
            onBack={() => setStep("Provider")}
            onNext={() => setStep("Service")}
            onRegenerate={() => void startAnalysis()}
          />
        ) : step === "Service" && service ? (
          <ServiceStep
            service={service}
            editing={editingService}
            setEditing={setEditingService}
            onPatch={patchService}
            confirmed={understandingConfirmed}
            onBack={() => setStep("Understanding")}
            onConfirm={() => { setUnderstandingConfirmed(true); setStep("Programmes"); }}
            regenerateGuard={edited || understandingConfirmed}
            confirmRegenerate={confirmRegenerate}
            setConfirmRegenerate={setConfirmRegenerate}
            onRegenerate={() => { setConfirmRegenerate(false); void startAnalysis(); }}
          />
        ) : step === "Programmes" && service ? (
          <ProgrammesStep
            service={service}
            onPreview={(i) => { setPreviewIndex(i); setEditingPackage(false); }}
            onEdit={(i) => { setPreviewIndex(i); setEditingPackage(true); }}
            onBack={() => setStep("Service")}
            onNext={() => setStep("Confirm")}
          />
        ) : step === "Confirm" && service ? (
          <ConfirmStep
            brief={brief}
            service={service}
            aiDrafted={!!aiModel}
            validation={validation}
            saving={saving}
            error={saveError}
            details={saveDetail}
            onBack={() => setStep("Programmes")}
            onSubmit={submit}
          />
        ) : null}
      </main>

      {previewIndex != null && service && (
        <ProgrammeDrawer
          service={service}
          index={previewIndex}
          editing={editingPackage}
          setEditing={setEditingPackage}
          onPatch={(patch) => patchPackage(previewIndex, patch)}
          onClose={() => setPreviewIndex(null)}
        />
      )}
    </div>
  );
}

/* ------------------------------- step rail -------------------------------- */

function StepRail({ index }: { index: number }) {
  return (
    <div className="mx-auto max-w-[1180px] px-5 pb-3 lg:px-8">
      {/* Compact on a phone: one line of orientation rather than five. */}
      <p className="text-[12px] font-medium text-sage-500 sm:hidden">
        Step {index + 1} of {STEPS.length} · <span className="text-ink">{STEPS[index]}</span>
      </p>
      <ol className="hidden items-center gap-2 sm:flex">
        {STEPS.map((s, i) => {
          const state = i < index ? "done" : i === index ? "current" : "todo";
          return (
            <li key={s} className="flex items-center gap-2">
              <span
                aria-current={state === "current" ? "step" : undefined}
                className={`text-[12.5px] font-semibold tracking-tight ${
                  state === "current" ? "text-ink" : state === "done" ? "text-sky-700" : "text-sage-400"
                }`}
              >
                {s}
              </span>
              {i < STEPS.length - 1 && <span aria-hidden className={`h-px w-8 ${i < index ? "bg-sky-300" : "bg-line"}`} />}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/* --------------------------------- layout --------------------------------- */

function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-3xl bg-white p-6 shadow-card ring-1 ring-ink/[0.06] sm:p-8 ${className}`}>{children}</section>;
}

function PageHead({ title, sub, aside }: { title: string; sub?: string; aside?: ReactNode }) {
  return (
    <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
      <div className="max-w-[46rem]">
        <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tight text-ink sm:text-[32px]">{title}</h1>
        {sub && <p className="mt-2 text-[15px] leading-relaxed text-sage-600">{sub}</p>}
      </div>
      {aside}
    </div>
  );
}

function Footer({ back, children }: { back?: () => void; children: ReactNode }) {
  return (
    <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
      {back ? (
        <button type="button" onClick={back} className="tap rounded-xl px-3 py-2.5 text-[13.5px] font-semibold text-sage-600 hover:text-ink">
          ← Back
        </button>
      ) : (
        <span />
      )}
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

/* ------------------------------ step: provider ---------------------------- */

function ProviderStep({
  brief, setBrief, canAnalyse, error, onAnalyse, onManual,
}: {
  brief: Brief;
  setBrief: (b: Brief) => void;
  canAnalyse: boolean;
  error: string | null;
  onAnalyse: () => void;
  onManual: () => void;
}) {
  const [showRefs, setShowRefs] = useState(false);
  const set = (patch: Partial<Brief>) => setBrief({ ...brief, ...patch });

  return (
    <>
      <PageHead
        title="Tell Carelune about this provider"
        sub="Write it the way you would explain it to a colleague. Carelune will turn it into a service, patient programmes and a care schedule for you to review."
      />

      <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr] lg:items-start">
        <Panel>
          <label htmlFor="sb-description" className="font-display text-[18px] font-semibold tracking-tight text-ink">
            What does this provider do?
          </label>
          <textarea
            id="sb-description"
            value={brief.description}
            onChange={(e) => set({ description: e.target.value })}
            placeholder="Tell us what this provider does, which patients they usually follow after consultation or discharge, and what they want to keep track of at home."
            className={`${areaCls} mt-3 min-h-[248px] text-[15px]`}
          />
          <p className="mt-2 text-[12.5px] text-sage-500">
            The more you say about who they follow and for how long, the better the first draft.
          </p>

          <div className="mt-6 border-t border-line/70 pt-5">
            <button
              type="button"
              onClick={() => setShowRefs((v) => !v)}
              aria-expanded={showRefs}
              className="tap text-[13.5px] font-semibold text-sky-700 hover:text-sky-800"
            >
              {showRefs ? "Hide references" : "Add a website, social profile or notes"}
            </button>
            {showRefs && (
              <div className="mt-4 space-y-4">
                <LabelledInput label="Website" value={brief.website} onChange={(v) => set({ website: v })} placeholder="https://" />
                <LabelledInput label="Instagram or social profile" value={brief.social} onChange={(v) => set({ social: v })} placeholder="@handle" />
                <div>
                  <span className="mb-1.5 block text-[12.5px] font-semibold text-sage-600">Notes from the Carelune team</span>
                  <textarea
                    value={brief.notes}
                    onChange={(e) => set({ notes: e.target.value })}
                    placeholder="Anything from the conversation that shaped what they want."
                    className={areaTall}
                  />
                </div>
                <p className="text-[12px] leading-relaxed text-sage-500">
                  Carelune records these as references. It does not read the website or social profile itself — paste anything
                  important into the description above.
                </p>
              </div>
            )}
          </div>
        </Panel>

        <div className="space-y-5">
          <Panel>
            <h2 className="font-display text-[18px] font-semibold tracking-tight text-ink">The provider</h2>
            <div className="mt-4 space-y-4">
              <LabelledInput
                label="Provider or practice name"
                value={brief.org_name}
                onChange={(v) => set({ org_name: v })}
                placeholder="e.g. Dr Vivek Spine Care"
              />
              <div>
                <span className="mb-2 block text-[12.5px] font-semibold text-sage-600">Provider type</span>
                <div className="grid grid-cols-2 gap-2">
                  {PROVIDER_TYPES.map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => set({ provider_type: t.key })}
                      aria-pressed={brief.provider_type === t.key}
                      className={`tap rounded-xl border px-3 py-2.5 text-left transition-colors ${
                        brief.provider_type === t.key
                          ? "border-sky-500 bg-sky-50 ring-1 ring-sky-500/30"
                          : "border-line bg-white hover:bg-mist-100"
                      }`}
                    >
                      <span className="block text-[13px] font-semibold text-ink">{t.label}</span>
                      <span className="mt-0.5 block text-[11.5px] text-sage-500">{t.hint}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Panel>

          <Panel>
            <h2 className="font-display text-[18px] font-semibold tracking-tight text-ink">Primary professional</h2>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-sage-600">
              They receive the first sign-in, and they are the person who confirms this programme before any patient joins it.
            </p>
            <div className="mt-4 space-y-4">
              <LabelledInput label="Full name" value={brief.admin_name} onChange={(v) => set({ admin_name: v })} placeholder="e.g. Dr Vivek Rao" />
              <LabelledInput label="Email" value={brief.admin_email} onChange={(v) => set({ admin_email: v })} placeholder="name@practice.in" type="email" />
              <div>
                <span className="mb-1.5 block text-[12.5px] font-semibold text-sage-600">Temporary password</span>
                <div className="flex items-center gap-1.5">
                  <input value={brief.admin_password} readOnly className={`${inputCls} font-mono`} />
                  <button
                    type="button"
                    onClick={() => set({ admin_password: generatePassword() })}
                    title="Generate another"
                    className="tap shrink-0 rounded-lg border border-line px-2.5 py-2 text-[13px] font-semibold text-sage-600 hover:bg-mist-100 hover:text-ink"
                  >
                    ↻
                  </button>
                </div>
                <p className="mt-1.5 text-[12px] text-sage-500">They set their own password on first sign-in.</p>
              </div>
            </div>
          </Panel>
        </div>
      </div>

      {error && (
        <div className="mt-6">
          <ErrorNote>
            We couldn&apos;t structure this service yet. Your information is still saved. Try again or continue editing manually.
            <span className="mt-1.5 block text-[12px] font-normal opacity-80">{error}</span>
          </ErrorNote>
        </div>
      )}

      <Footer>
        {error && (
          <button type="button" onClick={onManual} className="tap rounded-xl px-3.5 py-2.5 text-[13.5px] font-semibold text-sage-600 hover:text-ink">
            Continue manually
          </button>
        )}
        <PrimaryButton onClick={onAnalyse} disabled={!canAnalyse}>
          {error ? "Try again" : "Analyse with AI"}
        </PrimaryButton>
      </Footer>
    </>
  );
}

function LabelledInput({
  label, value, onChange, placeholder, type = "text",
}: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12.5px] font-semibold text-sage-600">{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={inputCls} />
    </label>
  );
}

/* ------------------------------ analysing state --------------------------- */

const ANALYSIS_STAGES = [
  "Reading what you told us",
  "Recognising the service they run",
  "Working out what is worth following at home",
  "Preparing patient programmes",
];

function Analysing({ name }: { name: string }) {
  const [stage, setStage] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStage((s) => Math.min(s + 1, ANALYSIS_STAGES.length - 1)), 2200);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="mx-auto max-w-[34rem] py-16 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-50 text-sky-600">
        <span className="animate-pulse"><LoopMark size={26} /></span>
      </div>
      <h1 className="mt-6 font-display text-[24px] font-semibold tracking-tight text-ink">Understanding this provider…</h1>
      <p className="mt-2 text-[14.5px] text-sage-600">{name || "This provider"} — this usually takes under a minute.</p>

      <ol className="mx-auto mt-8 max-w-[22rem] space-y-3 text-left">
        {ANALYSIS_STAGES.map((label, i) => (
          <li key={label} className="flex items-center gap-3">
            <span
              aria-hidden
              className={`h-2 w-2 shrink-0 rounded-full transition-colors ${
                i < stage ? "bg-good-500" : i === stage ? "animate-pulse bg-sky-500" : "bg-mist-200"
              }`}
            />
            <span className={`text-[14px] transition-colors ${i <= stage ? "text-ink" : "text-sage-400"}`}>{label}</span>
          </li>
        ))}
      </ol>
      <p className="mt-8 text-[12.5px] text-sage-500">Nothing is saved or made live until you confirm it.</p>
    </div>
  );
}

/* ---------------------------- step: understanding ------------------------- */

function UnderstandingStep({
  draft, chosen, onChoose, onBack, onNext, onRegenerate,
}: {
  draft: ServiceDraft;
  chosen: number;
  onChoose: (i: number) => void;
  onBack: () => void;
  onNext: () => void;
  onRegenerate: () => void;
}) {
  const many = draft.suggested_services.length > 1;
  return (
    <>
      <PageHead title="Carelune understood" aside={<AiDraftMark />} />

      <Panel className="!p-7 sm:!p-9">
        <p className="max-w-[52rem] text-[17px] leading-[1.75] text-ink">{draft.provider_summary}</p>
      </Panel>

      <h2 className="mt-9 font-display text-[20px] font-semibold tracking-tight text-ink">
        {many ? "Which service should Carelune configure?" : "Suggested service"}
      </h2>
      {many && (
        <p className="mt-1.5 text-[14px] text-sage-600">
          Carelune found more than one. Choose the one to set up now — the others can be added later.
        </p>
      )}

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {draft.suggested_services.map((s, i) => {
          const active = i === chosen;
          const dur = durationLabel(s.typical_duration_days);
          return (
            <button
              key={s.name}
              type="button"
              onClick={() => onChoose(i)}
              aria-pressed={active}
              className={`tap rounded-3xl bg-white p-6 text-left shadow-card ring-1 transition-all hover:shadow-lift ${
                active ? "ring-2 ring-sky-500/50" : "ring-ink/[0.06]"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-display text-[19px] font-semibold tracking-tight text-ink">{s.name}</h3>
                {active && (
                  <span className="shrink-0 rounded-full bg-sky-600 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-white">
                    Selected
                  </span>
                )}
              </div>
              <p className="mt-2 text-[14.5px] leading-relaxed text-sage-600">{s.summary}</p>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {dur && <span className="rounded-full bg-mist-100 px-2.5 py-1 text-[12px] font-semibold text-sage-600">{dur}</span>}
                <span className="rounded-full bg-mist-100 px-2.5 py-1 text-[12px] font-semibold text-sage-600">
                  {s.suggested_packages.length} programmes
                </span>
                <span className="rounded-full bg-mist-100 px-2.5 py-1 text-[12px] font-semibold text-sage-600">
                  {s.monitoring_domains.length} areas followed
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <Footer back={onBack}>
        <button type="button" onClick={onRegenerate} className="tap rounded-xl px-3.5 py-2.5 text-[13.5px] font-semibold text-sage-600 hover:text-ink">
          Regenerate
        </button>
        <PrimaryButton onClick={onNext}>Review this service</PrimaryButton>
      </Footer>
    </>
  );
}

/* ------------------------------- step: service ---------------------------- */

function ServiceStep({
  service, editing, setEditing, onPatch, confirmed, onBack, onConfirm,
  regenerateGuard, confirmRegenerate, setConfirmRegenerate, onRegenerate,
}: {
  service: SuggestedService;
  editing: boolean;
  setEditing: (v: boolean) => void;
  onPatch: (patch: Partial<SuggestedService>) => void;
  confirmed: boolean;
  onBack: () => void;
  onConfirm: () => void;
  regenerateGuard: boolean;
  confirmRegenerate: boolean;
  setConfirmRegenerate: (v: boolean) => void;
  onRegenerate: () => void;
}) {
  const dur = durationLabel(service.typical_duration_days);
  return (
    <>
      <PageHead
        title={editing ? "Edit this service" : service.name}
        sub={editing ? "Change anything Carelune got wrong. Your words replace the draft." : service.summary}
        aside={<AiDraftMark />}
      />

      {editing ? (
        <Panel>
          <div className="grid gap-5 sm:grid-cols-2">
            <LabelledInput label="Service name" value={service.name} onChange={(v) => onPatch({ name: v })} />
            <LabelledInput
              label="Typical duration (days)"
              value={service.typical_duration_days ? String(service.typical_duration_days) : ""}
              onChange={(v) => onPatch({ typical_duration_days: v.trim() ? Number(v) : null })}
              placeholder="Leave empty if it is open-ended"
            />
          </div>
          <div className="mt-5 space-y-5">
            <LabelledArea label="Summary" value={service.summary} onChange={(v) => onPatch({ summary: v })} />
            <div className="grid gap-5 sm:grid-cols-2">
              <LabelledArea label="Designed for" value={service.patient_type} onChange={(v) => onPatch({ patient_type: v })} />
              <LabelledArea label="How a patient joins" value={service.entry_point} onChange={(v) => onPatch({ entry_point: v })} />
              <LabelledArea label="Primary objective" value={service.objective} onChange={(v) => onPatch({ objective: v })} />
              <LabelledArea label="Complete when" value={service.end_condition} onChange={(v) => onPatch({ end_condition: v })} />
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <LabelledArea
                label="Areas worth following (one per line)"
                value={toLines(service.monitoring_domains)}
                onChange={(v) => onPatch({ monitoring_domains: lines(v) })}
              />
              <LabelledArea
                label="Care model (one role per line)"
                value={toLines(service.care_team_suggestions)}
                onChange={(v) => onPatch({ care_team_suggestions: lines(v) })}
              />
            </div>
          </div>
          <div className="mt-6 flex justify-end">
            <PrimaryButton onClick={() => setEditing(false)}>Done editing</PrimaryButton>
          </div>
        </Panel>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr] lg:items-start">
          <Panel>
            <dl className="grid gap-6 sm:grid-cols-2">
              <Detail label="Designed for">{service.patient_type}</Detail>
              <Detail label="How a patient joins">{service.entry_point}</Detail>
              <Detail label="Primary objective">{service.objective}</Detail>
              <Detail label="Complete when">{service.end_condition}</Detail>
              <Detail label="Suggested duration">{dur ?? "Open-ended"}</Detail>
              <Detail label="Care model">
                {service.care_team_suggestions.length ? service.care_team_suggestions.join(" · ") : "Not set yet"}
              </Detail>
            </dl>
            <div className="mt-7 border-t border-line/70 pt-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-sage-400">Areas worth following</p>
              <div className="mt-3">
                <DomainChips domains={service.monitoring_domains} />
              </div>
            </div>
          </Panel>

          <Panel>
            <h2 className="font-display text-[18px] font-semibold tracking-tight text-ink">What patients are asked at home</h2>
            <p className="mt-1.5 text-[13.5px] text-sage-600">In their words, with why it is worth asking.</p>
            <ul className="mt-5 space-y-4">
              {service.suggested_patient_inputs.map((q) => (
                <li key={q.label} className="border-l-2 border-sky-200 pl-4">
                  <p className="text-[15px] leading-snug text-ink">{q.label}</p>
                  {q.reason && <p className="mt-1 text-[13px] leading-relaxed text-sage-500">{q.reason}</p>}
                </li>
              ))}
              {service.suggested_patient_inputs.length === 0 && (
                <li className="text-[14px] text-sage-400">Nothing set yet — add questions with Edit.</li>
              )}
            </ul>
          </Panel>
        </div>
      )}

      {confirmRegenerate && (
        <div className="mt-6 rounded-2xl bg-warn-100 p-5 ring-1 ring-warn-500/20">
          <p className="text-[14px] font-semibold text-ink">Regenerate replaces this draft.</p>
          <p className="mt-1 text-[13.5px] leading-relaxed text-sage-600">
            Anything you edited or confirmed here will be written over by a fresh reading of the provider. What you typed on the
            first step is kept.
          </p>
          <div className="mt-3.5 flex flex-wrap gap-2">
            <button type="button" onClick={onRegenerate} className="tap rounded-xl bg-ink px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-midnight-800">
              Regenerate anyway
            </button>
            <button type="button" onClick={() => setConfirmRegenerate(false)} className="tap rounded-xl px-3 py-2 text-[13px] font-semibold text-sage-600 hover:text-ink">
              Keep this draft
            </button>
          </div>
        </div>
      )}

      <Footer back={onBack}>
        {!editing && (
          <button type="button" onClick={() => setEditing(true)} className="tap rounded-xl px-3.5 py-2.5 text-[13.5px] font-semibold text-sage-600 hover:text-ink">
            Edit
          </button>
        )}
        <button
          type="button"
          onClick={() => (regenerateGuard ? setConfirmRegenerate(true) : onRegenerate())}
          className="tap rounded-xl px-3.5 py-2.5 text-[13.5px] font-semibold text-sage-600 hover:text-ink"
        >
          Regenerate
        </button>
        <PrimaryButton onClick={onConfirm}>{confirmed ? "Continue" : "Confirm understanding"}</PrimaryButton>
      </Footer>
    </>
  );
}

function LabelledArea({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12.5px] font-semibold text-sage-600">{label}</span>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} className={areaTall} />
    </label>
  );
}

/* ----------------------------- step: programmes --------------------------- */

function ProgrammesStep({
  service, onPreview, onEdit, onBack, onNext,
}: {
  service: SuggestedService;
  onPreview: (i: number) => void;
  onEdit: (i: number) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <>
      <PageHead
        title="Carelune prepared your patient programmes"
        sub="Different lengths and intensities of the same service. The provider sets the price they charge — Carelune's platform fee is 20%."
        aside={<AiDraftMark />}
      />

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {service.suggested_packages.map((p, i) => (
          <PackageCard key={p.name} pkg={p} onPreview={() => onPreview(i)} onEdit={() => onEdit(i)} />
        ))}
      </div>

      <Footer back={onBack}>
        <PrimaryButton onClick={onNext}>Continue</PrimaryButton>
      </Footer>
    </>
  );
}

/* --------------------------- programme preview drawer --------------------- */

function ProgrammeDrawer({
  service, index, editing, setEditing, onPatch, onClose,
}: {
  service: SuggestedService;
  index: number;
  editing: boolean;
  setEditing: (v: boolean) => void;
  onPatch: (patch: Partial<SuggestedPackage>) => void;
  onClose: () => void;
}) {
  const pkg = service.suggested_packages[index];
  const periods = periodsForPackage(service.programme_outline, pkg, service.suggested_packages);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" aria-label="Close preview" onClick={onClose} className="absolute inset-0 bg-midnight-950/25 backdrop-blur-[2px]" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`${pkg.name} programme`}
        className="relative flex h-full w-full max-w-[36rem] animate-fade-up flex-col overflow-y-auto bg-white shadow-panel"
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-line bg-white/95 px-6 py-5 backdrop-blur">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-sage-400">{service.name}</p>
            <h2 className="mt-1 font-display text-[22px] font-semibold tracking-tight text-ink">{pkg.name}</h2>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => setEditing(!editing)}
              className="tap rounded-lg border border-line px-2.5 py-1.5 text-[12.5px] font-semibold text-sage-600 hover:bg-mist-100 hover:text-ink"
            >
              {editing ? "Done" : "Edit"}
            </button>
            <button type="button" onClick={onClose} aria-label="Close" className="tap rounded-lg px-2.5 py-1.5 text-[16px] text-sage-500 hover:text-ink">
              ×
            </button>
          </div>
        </div>

        <div className="px-6 py-7">
          {editing ? (
            <div className="space-y-5">
              <LabelledInput label="Package name" value={pkg.name} onChange={(v) => onPatch({ name: v })} />
              <LabelledInput label="Positioning" value={pkg.positioning} onChange={(v) => onPatch({ positioning: v })} />
              <div className="grid gap-5 sm:grid-cols-2">
                <LabelledInput
                  label="Duration (days)"
                  value={String(pkg.duration_days)}
                  onChange={(v) => onPatch({ duration_days: Number(v) || 0 })}
                />
                <LabelledInput label="Check-ins" value={pkg.checkin_frequency} onChange={(v) => onPatch({ checkin_frequency: v })} />
                <LabelledInput label="Professional review" value={pkg.review_frequency} onChange={(v) => onPatch({ review_frequency: v })} />
                <LabelledInput label="Support" value={pkg.support_level} onChange={(v) => onPatch({ support_level: v })} />
              </div>
              <LabelledArea
                label="Areas followed (one per line)"
                value={toLines(pkg.monitoring_domains)}
                onChange={(v) => onPatch({ monitoring_domains: lines(v) })}
              />
              <LabelledArea label="Milestones (one per line)" value={toLines(pkg.milestones)} onChange={(v) => onPatch({ milestones: lines(v) })} />
              <LabelledArea label="Includes (one per line)" value={toLines(pkg.includes)} onChange={(v) => onPatch({ includes: lines(v) })} />
            </div>
          ) : (
            <>
              {pkg.positioning && <p className="mb-7 text-[15.5px] leading-relaxed text-sage-600">{pkg.positioning}</p>}
              <ProgrammeTimeline periods={periods} />
              <p className="mt-9 border-t border-line/70 pt-5 text-[12.5px] leading-relaxed text-sage-500">
                Drawn from the service configuration — the same programme view is used for every Carelune service.
              </p>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

/* ------------------------------- step: confirm ---------------------------- */

function ConfirmStep({
  brief, service, aiDrafted, validation, saving, error, details, onBack, onSubmit,
}: {
  brief: Brief;
  service: SuggestedService;
  aiDrafted: boolean;
  validation: ReturnType<typeof validateServiceDraft> | null;
  saving: boolean;
  error: string | null;
  details: string[];
  onBack: () => void;
  onSubmit: () => void;
}) {
  const incomplete = validation && !validation.ok ? validation.errors : [];
  return (
    <>
      <PageHead
        title="Confirm this configuration"
        sub="This is Carelune's Level-1 confirmation: you are confirming that the structure below matches what this provider actually runs."
        aside={aiDrafted ? <AiDraftMark /> : undefined}
      />

      <div className="grid gap-5 lg:grid-cols-[1.25fr_1fr] lg:items-start">
        <Panel>
          <dl className="grid gap-6 sm:grid-cols-2">
            <Detail label="Provider">{brief.org_name}</Detail>
            <Detail label="Provider type">{TYPE_LABEL[brief.provider_type] ?? "—"}</Detail>
            <Detail label="Service">{service.name}</Detail>
            <Detail label="Patient programmes">{service.suggested_packages.length}</Detail>
            <Detail label="Areas followed">{service.monitoring_domains.length}</Detail>
            <Detail label="Questions at home">{service.suggested_patient_inputs.length}</Detail>
          </dl>
          <div className="mt-7 border-t border-line/70 pt-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-sage-400">Programmes</p>
            <ul className="mt-3 space-y-2">
              {service.suggested_packages.map((p) => (
                <li key={p.name} className="flex items-baseline justify-between gap-4 text-[14.5px]">
                  <span className="text-ink">{p.name}</span>
                  <span className="shrink-0 text-sage-500">
                    {p.duration_days} days · {p.checkin_frequency}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Panel>

        <div className="space-y-5">
          {aiDrafted && (
            <section className="rounded-3xl bg-warn-100 p-6 ring-1 ring-warn-500/20">
              <AiDraftMark />
              <p className="mt-3 text-[14.5px] leading-relaxed text-ink">
                This programme was drafted with AI assistance from what you wrote about the provider. Confirming it records your
                reading of it — it does not make it live.
              </p>
            </section>
          )}

          <Panel>
            <h2 className="font-display text-[17px] font-semibold tracking-tight text-ink">What happens next</h2>
            <ol className="mt-4 space-y-4">
              <NextStep n={1} title="You confirm the configuration" body="The service is recorded and moves to the provider for their confirmation." />
              <NextStep
                n={2}
                title={`${brief.admin_name || "The primary professional"} confirms it`}
                body="They review the monitoring, milestones and programme, and confirm it as the person accountable for it."
              />
              <NextStep n={3} title="Patients can be enrolled" body="Only after that second confirmation does the service become selectable for a patient." />
            </ol>
          </Panel>
        </div>
      </div>

      {incomplete.length > 0 && (
        <div className="mt-6">
          <ErrorNote>
            Some of this service is still incomplete:
            <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-[12.5px] font-normal">
              {incomplete.slice(0, 6).map((e) => <li key={e}>{e}</li>)}
            </ul>
          </ErrorNote>
        </div>
      )}
      {error && (
        <div className="mt-6">
          <ErrorNote>
            {error}
            {details.length > 0 && (
              <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-[12.5px] font-normal">
                {details.map((e) => <li key={e}>{e}</li>)}
              </ul>
            )}
          </ErrorNote>
        </div>
      )}

      <Footer back={onBack}>
        <PrimaryButton onClick={onSubmit} disabled={saving || incomplete.length > 0}>
          {saving ? "Confirming…" : "Confirm configuration"}
        </PrimaryButton>
      </Footer>
    </>
  );
}

function NextStep({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <li className="flex gap-3.5">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-mist-100 text-[12px] font-semibold text-sage-600">
        {n}
      </span>
      <span>
        <span className="block text-[14.5px] font-semibold text-ink">{title}</span>
        <span className="mt-0.5 block text-[13.5px] leading-relaxed text-sage-600">{body}</span>
      </span>
    </li>
  );
}

/* --------------------------------- done ----------------------------------- */

function Done({ created, onShare, onExit }: { created: CreatedProviderService; onShare: () => void; onExit: () => void }) {
  return (
    <div className="mx-auto max-w-[40rem] py-10">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-good-100 text-good-600">
        <Icon.Check width={26} height={26} />
      </div>
      <h1 className="mt-6 font-display text-[30px] font-semibold leading-tight tracking-tight text-ink">
        {created.service.name} is configured
      </h1>
      <p className="mt-2.5 text-[15.5px] leading-relaxed text-sage-600">
        {created.org.name} is set up with {created.service.packages} patient programmes. The service is now with{" "}
        {created.service.approver_name || "the primary professional"} for their confirmation — no patient can be enrolled until
        they confirm it.
      </p>

      <div className="mt-7 rounded-3xl bg-white p-6 shadow-card ring-1 ring-ink/[0.06]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-sage-400">Service status</p>
        <p className="mt-2 text-[15px] text-ink">Awaiting the provider&apos;s confirmation</p>
        <div className="mt-5 border-t border-line/70 pt-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-sage-400">First sign-in</p>
          <p className="mt-2 text-[14.5px] text-ink">{created.admin.email}</p>
          <button
            type="button"
            onClick={onShare}
            className="tap mt-3.5 inline-flex items-center gap-1.5 rounded-full bg-brand-800 px-4 py-2 text-[13.5px] font-semibold text-white hover:bg-brand-900"
          >
            <Icon.Phone width={14} height={14} /> Share on WhatsApp
          </button>
        </div>
      </div>

      <div className="mt-7">
        <PrimaryButton onClick={onExit}>Back to console</PrimaryButton>
      </div>
    </div>
  );
}
