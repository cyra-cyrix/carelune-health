import { useEffect, useState } from "react";
import { LoopMark, Icon } from "../../components/ui";
import { useAuth } from "../../auth/AuthProvider";
import {
  listOrgs,
  createOrg,
  setInstitutionStatus,
  listPathwayPacks,
  type OrgSummary,
  type NewOrg,
  type InstitutionType,
  type PathwayPackRow,
} from "../../lib/db";
import { credentialsText, shareOnWhatsApp, generatePassword } from "../../lib/share";
import { loginUrl as appLoginUrl } from "../../config/urls";
import {
  Card, Field, inputCls, PrimaryButton, PackCard, PathwayStatusBadge, Chip,
  EmptyState, Skeleton, ErrorNote, Kpi, SectionHeader,
} from "../../components/system";

const TYPES: { key: InstitutionType; label: string }[] = [
  { key: "hospital", label: "Hospital" },
  { key: "rehab_centre", label: "Rehab centre" },
  { key: "doctor_practice", label: "Doctor practice" },
  { key: "clinical_group", label: "Clinical group" },
];
const TYPE_LABEL: Record<string, string> = Object.fromEntries(TYPES.map((t) => [t.key, t.label]));

const freshDraft = (): NewOrg => ({
  org_name: "", admin_name: "", admin_email: "", admin_password: generatePassword(),
  institution_type: "", pathway_keys: [],
});

/**
 * Carelune platform console (Super Admin). Create an institution — its type, its
 * admin (HOD) account, and the Continuum Care pathway packs it may run — in one
 * elegant flow. Assignment of packs is service_role-only (the HOD cannot self-enable).
 */
export default function SuperAdmin() {
  const { signOut } = useAuth();
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);
  const [packs, setPacks] = useState<PathwayPackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [draft, setDraft] = useState<NewOrg>(freshDraft);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState<NewOrg | null>(null);

  const [actingId, setActingId] = useState<string | null>(null);
  const [confirmPauseId, setConfirmPauseId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const toggleStatus = async (o: OrgSummary) => {
    const next = o.status === "paused" ? "active" : "paused";
    setActingId(o.id);
    setConfirmPauseId(null);
    setActionError(null);
    const prev = orgs;
    setOrgs((xs) => xs.map((x) => (x.id === o.id ? { ...x, status: next } : x)));
    try {
      await setInstitutionStatus(o.id, next);
    } catch (e) {
      setOrgs(prev);
      setActionError(e instanceof Error ? e.message : "Could not update the institution.");
    } finally {
      setActingId(null);
    }
  };

  const load = async () => {
    try {
      const [o, p] = await Promise.all([listOrgs(), listPathwayPacks().catch(() => [] as PathwayPackRow[])]);
      setOrgs(o);
      setPacks(p);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the console.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, []);

  const togglePack = (key: string) =>
    setDraft((d) => ({
      ...d,
      pathway_keys: d.pathway_keys.includes(key) ? d.pathway_keys.filter((k) => k !== key) : [...d.pathway_keys, key],
    }));

  const canCreate = draft.org_name.trim() && draft.admin_email.trim() && draft.admin_password && draft.institution_type;

  const submit = async () => {
    setBusy(true);
    setFormError(null);
    try {
      await createOrg(draft);
      setCreated(draft);
      setDraft(freshDraft());
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Could not create the institution.");
    } finally {
      setBusy(false);
    }
  };

  const shareCreated = () => {
    if (!created) return;
    shareOnWhatsApp(
      credentialsText({
        platformName: created.org_name, loginUrl: appLoginUrl(),
        email: created.admin_email, password: created.admin_password, roleLabel: "Admin",
      }),
    );
  };

  const activeCount = orgs.filter((o) => o.setup_complete).length;

  return (
    <div className="min-h-screen bg-mist">
      <header className="sticky top-0 z-50 flex min-h-[3.25rem] items-center justify-between gap-3 border-b border-line bg-white/90 px-4 py-2 backdrop-blur sm:px-6">
        <div className="flex items-center gap-2 text-sky-700">
          <LoopMark size={20} />
          <span className="flex flex-col leading-none">
            <span className="text-[14px] font-semibold tracking-tight text-ink">Carelune</span>
            <span className="mt-[3px] text-[9.5px] font-semibold uppercase tracking-[0.14em] text-sage-500">Platform console</span>
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[12px] font-medium text-sage-600">Super Admin</span>
          <button type="button" onClick={() => void signOut()} className="tap rounded-lg border border-line px-2.5 py-1 text-[12px] font-medium text-sage-600 hover:bg-mist-100 hover:text-ink">
            Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-[1140px] px-5 py-7 lg:px-8">
        <h1 className="font-display text-[26px] font-semibold tracking-tight text-ink">Institutions</h1>
        <p className="mt-1 text-[14px] text-sage-500">
          Create an institution, assign its Continuum Care programmes, and hand the admin a secure first-login.
        </p>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Kpi label="Institutions" value={loading ? "—" : orgs.length} />
          <Kpi label="Active" value={loading ? "—" : activeCount} hint="setup complete" />
          <Kpi label="Programmes" value={loading ? "—" : packs.length} hint="governed packs" />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.05fr_1fr]">
          {/* Create */}
          <Card>
            <SectionHeader title="New institution" sub="Type, admin account, and enabled programmes." />
            <div className="mt-4 space-y-4">
              <Field label="Institution name">
                <input value={draft.org_name} onChange={(e) => setDraft({ ...draft, org_name: e.target.value })} placeholder="e.g. Sunrise Spine & Rehab" className={inputCls} />
              </Field>

              <div>
                <span className="mb-1.5 block text-[12.5px] font-semibold text-sage-600">Institution type</span>
                <div className="grid grid-cols-2 gap-2">
                  {TYPES.map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setDraft({ ...draft, institution_type: t.key })}
                      aria-pressed={draft.institution_type === t.key}
                      className={`tap rounded-xl border px-3 py-2 text-[13px] font-semibold transition-colors ${
                        draft.institution_type === t.key ? "border-sky-500 bg-sky-50 text-sky-700 ring-1 ring-sky-500/30" : "border-line bg-white text-ink hover:bg-mist-100"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="mb-1.5 block text-[12.5px] font-semibold text-sage-600">Continuum Care programmes</span>
                <div className="space-y-2">
                  {packs.length === 0 ? (
                    <p className="text-[12.5px] text-sage-500">No pathway packs found (run migration 0013).</p>
                  ) : (
                    packs.map((p) => (
                      <div key={p.id} className="relative">
                        <PackCard
                          name={p.name} specialty={p.specialty} description={p.description}
                          selected={draft.pathway_keys.includes(p.key)} onToggle={() => togglePack(p.key)}
                        />
                        <span className="pointer-events-none absolute right-11 top-4"><PathwayStatusBadge status={p.status} /></span>
                      </div>
                    ))
                  )}
                </div>
                <p className="mt-1.5 text-[11.5px] leading-relaxed text-sage-500">
                  Programmes are draft pathways and require institutional clinical approval before any patient plan is activated.
                </p>
              </div>

              <div className="h-px bg-line" />
              <p className="text-[12.5px] font-semibold text-sage-600">Admin (HOD) account</p>
              <Field label="Admin full name">
                <input value={draft.admin_name} onChange={(e) => setDraft({ ...draft, admin_name: e.target.value })} placeholder="e.g. Dr. Meera Nair" className={inputCls} />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Admin email">
                  <input value={draft.admin_email} onChange={(e) => setDraft({ ...draft, admin_email: e.target.value })} type="email" placeholder="admin@institution.in" className={inputCls} />
                </Field>
                <Field label="Temporary password" hint="They reset it on first sign-in.">
                  <div className="flex items-center gap-1.5">
                    <input value={draft.admin_password} readOnly className={`${inputCls} font-mono`} />
                    <button type="button" onClick={() => setDraft({ ...draft, admin_password: generatePassword() })} title="Regenerate" className="tap shrink-0 rounded-lg border border-line px-2.5 py-2 text-[13px] font-semibold text-sage-600 hover:bg-mist-100 hover:text-ink">↻</button>
                  </div>
                </Field>
              </div>

              {formError && <ErrorNote>{formError}</ErrorNote>}
              <PrimaryButton onClick={submit} disabled={busy || !canCreate} className="w-full">
                {busy ? "Creating…" : "Create institution"}
              </PrimaryButton>

              {created && (
                <div className="rounded-2xl bg-good-100 p-4 ring-1 ring-good-500/20">
                  <p className="text-[13px] font-semibold text-ink">{created.org_name} created.</p>
                  <p className="mt-1 text-[12px] text-sage-600">
                    {created.admin_email} · temporary password <span className="font-semibold text-ink">{created.admin_password}</span>
                    {created.pathway_keys.length ? ` · ${created.pathway_keys.length} programme${created.pathway_keys.length > 1 ? "s" : ""}` : ""}
                  </p>
                  <button type="button" onClick={shareCreated} className="tap mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-brand-800 px-3.5 py-1.5 text-[13px] font-semibold text-white hover:bg-brand-900">
                    <Icon.Phone width={14} height={14} /> Share on WhatsApp
                  </button>
                </div>
              )}
            </div>
          </Card>

          {/* List */}
          <Card>
            <SectionHeader title="All institutions" sub="No patient data is shown here." />
            <div className="mt-4">
              {loading ? (
                <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16" />)}</div>
              ) : error ? (
                <ErrorNote>{error}</ErrorNote>
              ) : orgs.length === 0 ? (
                <EmptyState title="No institutions yet" body="Create the first institution with the form on the left." />
              ) : (
                <>
                  {actionError && <div className="mb-2"><ErrorNote>{actionError}</ErrorNote></div>}
                  <ul className="divide-y divide-ink/[0.06]">
                  {orgs.map((o) => {
                    const paused = o.status === "paused";
                    return (
                    <li key={o.id} className="py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[14.5px] font-semibold text-ink">{o.display_name || o.name}</span>
                            {o.institution_type && <Chip tone="grey">{TYPE_LABEL[o.institution_type] ?? o.institution_type}</Chip>}
                            {paused ? (
                              <span className="rounded-full bg-coral-100 px-2 py-0.5 text-[11px] font-semibold text-coral-600">Paused</span>
                            ) : (
                              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${o.setup_complete ? "bg-good-100 text-good-600" : "bg-warn-100 text-warn-600"}`}>
                                {o.setup_complete ? "Active" : "Setup pending"}
                              </span>
                            )}
                            {o.patient_count != null && o.patient_count > 0 && (
                              <span className="text-[11.5px] font-medium text-sage-500">{o.patient_count} patient{o.patient_count > 1 ? "s" : ""}</span>
                            )}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            {o.pathways.length === 0 ? (
                              <span className="text-[11.5px] text-sage-400">No programmes assigned</span>
                            ) : (
                              o.pathways.map((k) => <Chip key={k} tone="sky">{k === "spine" ? "Spine" : k === "joint" ? "Joint" : "Neuro"}</Chip>)
                            )}
                          </div>
                          <div className="mt-1 text-[12px] text-sage-500">{o.admin_name ? `${o.admin_name} · ` : ""}{o.admin_email || "no admin"}</div>
                        </div>

                        {/* pause / resume — reversible; never deletes data */}
                        <div className="shrink-0">
                          {paused ? (
                            <button type="button" onClick={() => toggleStatus(o)} disabled={actingId === o.id} className="tap rounded-lg border border-line px-2.5 py-1 text-[12px] font-semibold text-sky-700 hover:bg-mist-100 disabled:opacity-60">
                              {actingId === o.id ? "…" : "Resume"}
                            </button>
                          ) : confirmPauseId === o.id ? (
                            <div className="flex items-center gap-1.5">
                              <button type="button" onClick={() => toggleStatus(o)} disabled={actingId === o.id} className="tap rounded-lg bg-coral-600 px-2.5 py-1 text-[12px] font-semibold text-white hover:bg-coral-500 disabled:opacity-60">
                                {actingId === o.id ? "…" : "Confirm pause"}
                              </button>
                              <button type="button" onClick={() => setConfirmPauseId(null)} className="tap rounded-lg px-2 py-1 text-[12px] font-semibold text-sage-600 hover:text-ink">Cancel</button>
                            </div>
                          ) : (
                            <button type="button" onClick={() => setConfirmPauseId(o.id)} className="tap rounded-lg border border-line px-2.5 py-1 text-[12px] font-semibold text-sage-600 hover:bg-mist-100 hover:text-ink">Pause</button>
                          )}
                        </div>
                      </div>
                    </li>
                    );
                  })}
                  </ul>
                </>
              )}
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
}
