import { useEffect, useState } from "react";
import { LoopMark, Icon } from "../../components/ui";
import { useAuth } from "../../auth/AuthProvider";
import { listOrgs, createOrg, type OrgSummary, type NewOrg } from "../../lib/db";
import { credentialsText, shareOnWhatsApp, generatePassword } from "../../lib/share";

const FIELD =
  "w-full rounded-xl bg-white px-3 py-2 text-[14px] text-ink ring-1 ring-line focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400";

const freshDraft = (): NewOrg => ({ org_name: "", admin_name: "", admin_email: "", admin_password: generatePassword() });

/**
 * Carelune platform console (super admin). Create an organisation and its admin
 * account in one step; the admin gets a temporary password to reset on first
 * login, shareable over WhatsApp. Lists all organisations on the platform.
 */
export default function SuperAdmin() {
  const { signOut } = useAuth();
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [draft, setDraft] = useState<NewOrg>(freshDraft);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState<NewOrg | null>(null);

  const load = async () => {
    try {
      setOrgs(await listOrgs());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load organisations.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const submit = async () => {
    setBusy(true);
    setFormError(null);
    try {
      await createOrg(draft);
      setCreated(draft);
      setDraft(freshDraft());
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Could not create the organisation.");
    } finally {
      setBusy(false);
    }
  };

  const shareCreated = () => {
    if (!created) return;
    shareOnWhatsApp(
      credentialsText({
        platformName: created.org_name,
        loginUrl: window.location.origin,
        email: created.admin_email,
        password: created.admin_password,
        roleLabel: "Admin",
      }),
    );
  };

  return (
    <div className="min-h-screen bg-mist">
      <header className="sticky top-0 z-50 flex min-h-[3rem] items-center justify-between gap-3 border-b border-line bg-white px-4 py-2 sm:px-6">
        <div className="flex items-center gap-2 text-brand-600">
          <LoopMark size={20} />
          <span className="flex flex-col leading-none">
            <span className="text-[14px] font-semibold tracking-tight text-ink">Carelune</span>
            <span className="mt-[3px] text-[9.5px] font-medium uppercase tracking-[0.12em] text-sage-500">Platform</span>
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[12px] text-sage-600">Super Admin</span>
          <button
            type="button"
            onClick={() => void signOut()}
            className="tap rounded-md border border-line px-2.5 py-1 text-[12px] font-medium text-sage-600 hover:bg-mist-100 hover:text-ink"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-[1100px] px-5 py-6 lg:px-8">
        <h1 className="font-display text-2xl font-semibold text-ink">Organisations</h1>
        <p className="mt-0.5 text-[14px] text-sage-500">
          Create an organisation and its admin. The admin names their platform and builds their team.
        </p>

        <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1.1fr]">
          {/* Create org */}
          <section className="rounded-2xl bg-white p-5 shadow-lift ring-1 ring-ink/[0.05]">
            <h2 className="font-display text-[15px] font-semibold text-ink">New organisation</h2>
            <div className="mt-3 space-y-3">
              <label className="block">
                <span className="mb-1 block text-[12px] font-semibold text-sage-600">Organisation name</span>
                <input value={draft.org_name} onChange={(e) => setDraft({ ...draft, org_name: e.target.value })} placeholder="e.g. Punarvaas Rehabilitation" className={FIELD} />
              </label>
              <div className="h-px bg-line" />
              <p className="text-[12px] font-semibold text-sage-600">Admin account</p>
              <label className="block">
                <span className="mb-1 block text-[12px] font-semibold text-sage-600">Admin full name</span>
                <input value={draft.admin_name} onChange={(e) => setDraft({ ...draft, admin_name: e.target.value })} placeholder="e.g. Dr. Vivek" className={FIELD} />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-[12px] font-semibold text-sage-600">Admin email</span>
                  <input value={draft.admin_email} onChange={(e) => setDraft({ ...draft, admin_email: e.target.value })} type="email" placeholder="vivek@org.in" className={FIELD} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[12px] font-semibold text-sage-600">Temporary password</span>
                  <div className="flex items-center gap-1.5">
                    <input value={draft.admin_password} readOnly className={`${FIELD} font-mono`} />
                    <button
                      type="button"
                      onClick={() => setDraft({ ...draft, admin_password: generatePassword() })}
                      title="Generate a new password"
                      className="tap shrink-0 rounded-lg border border-line px-2.5 py-2 text-[13px] font-semibold text-sage-600 hover:bg-mist-100 hover:text-ink"
                    >
                      ↻
                    </button>
                  </div>
                </label>
              </div>

              {formError && <p className="text-[13px] text-coral-600">{formError}</p>}

              <button
                type="button"
                onClick={submit}
                disabled={busy || !draft.org_name || !draft.admin_email || !draft.admin_password}
                className="tap w-full rounded-xl bg-brand-600 py-2.5 text-[15px] font-semibold text-white hover:bg-brand-500 disabled:opacity-60"
              >
                {busy ? "Creating…" : "Create organisation"}
              </button>
            </div>

            {created && (
              <div className="mt-4 rounded-2xl bg-good-100 p-4 ring-1 ring-good-500/20">
                <p className="text-[13px] font-semibold text-ink">{created.org_name} created.</p>
                <p className="mt-1 text-[12px] text-sage-600">
                  Admin: {created.admin_email} · temporary password{" "}
                  <span className="font-semibold text-ink">{created.admin_password}</span>
                </p>
                <button
                  type="button"
                  onClick={shareCreated}
                  className="tap mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-3.5 py-1.5 text-[13px] font-semibold text-white hover:bg-brand-500"
                >
                  <Icon.Phone width={14} height={14} /> Share on WhatsApp
                </button>
              </div>
            )}
          </section>

          {/* List */}
          <section className="rounded-2xl bg-white p-5 shadow-lift ring-1 ring-ink/[0.05]">
            <h2 className="font-display text-[15px] font-semibold text-ink">All organisations</h2>
            {loading ? (
              <div className="mt-3 space-y-2">
                {[0, 1].map((i) => (
                  <div key={i} className="h-14 animate-pulse rounded-xl bg-mist" />
                ))}
              </div>
            ) : error ? (
              <div className="mt-3 rounded-xl bg-mist p-3 text-[13px] text-sage-600">
                {error}
                <p className="mt-1 text-[12px] text-sage-500">If this is the first time, deploy the platform-admin function first.</p>
              </div>
            ) : orgs.length === 0 ? (
              <p className="mt-3 text-[13px] text-sage-500">No organisations yet.</p>
            ) : (
              <ul className="mt-3 divide-y divide-ink/[0.05]">
                {orgs.map((o) => (
                  <li key={o.id} className="py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-semibold text-ink">{o.display_name || o.name}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${o.setup_complete ? "bg-good-100 text-good-600" : "bg-warn-100 text-warn-600"}`}>
                        {o.setup_complete ? "Active" : "Setup pending"}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[12px] text-sage-500">
                      {o.admin_name ? `${o.admin_name} · ` : ""}
                      {o.admin_email || "no admin"}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
