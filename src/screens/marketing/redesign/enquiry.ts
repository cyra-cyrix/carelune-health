/* ============================================================================
   Enquiry-form logic for the marketing site, kept pure so it can be unit-tested
   in a node environment (this repo's jsdom + React render tests are unreliable).
   The form submits to Netlify Forms via a same-origin URL-encoded POST — no
   email client, no Supabase, no patient fields, and submitted values are never
   logged.
   ========================================================================== */

export const FORM_NAME = "carelune-enquiry";

export type Route = "doctor" | "org";

/** The complete set of field names Netlify must know about (union of both routes
 *  + the honeypot). The static hidden form in marketing.html declares exactly
 *  these so Netlify detects and stores them. */
export const ALL_FIELDS = [
  "form-name", "bot-field", "route", "consent",
  "name", "email", "mobile", "city", "volume", "purpose",
  "mrn", "speciality", // individual doctor
  "org", "role",        // clinic / hospital
] as const;

export type EnquiryValues = Partial<Record<string, string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Validate a submission. Returns field-keyed error messages ({} when valid). */
export function validateEnquiry(v: EnquiryValues, route: Route, consent: boolean): { ok: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  if (!v.name?.trim()) errors.name = "Please enter your full name.";
  if (!v.email?.trim()) errors.email = "Please enter your work email.";
  else if (!EMAIL_RE.test(v.email.trim())) errors.email = "Please enter a valid email address.";
  if (!v.mobile?.trim()) errors.mobile = "Please enter your mobile number.";
  if (route === "doctor" && !v.mrn?.trim()) errors.mrn = "Please enter your medical registration number.";
  if (route === "org" && !v.org?.trim()) errors.org = "Please enter your organisation.";
  if (!consent) errors.consent = "Please confirm you agree to be contacted.";
  return { ok: Object.keys(errors).length === 0, errors };
}

/** URL-encode a flat data object for `application/x-www-form-urlencoded`. */
export function encodeForm(data: Record<string, string>): string {
  return Object.keys(data)
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(data[k])}`)
    .join("&");
}

/** Build the POST body: the Netlify form name + the route + the entered values. */
export function buildBody(values: EnquiryValues, route: Route): Record<string, string> {
  const out: Record<string, string> = { "form-name": FORM_NAME, route };
  for (const k of ALL_FIELDS) {
    if (k === "form-name" || k === "route") continue;
    const val = values[k];
    if (val != null) out[k] = String(val);
  }
  return out;
}

/**
 * Submit to Netlify Forms with a same-origin URL-encoded POST. Resolves on a
 * confirmed successful response and throws otherwise (so the UI can show the
 * failure message and keep the entered data). `fetchImpl` is injectable for tests.
 */
export async function submitEnquiry(
  body: Record<string, string>,
  fetchImpl: typeof fetch = fetch,
): Promise<"success"> {
  const res = await fetchImpl("/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: encodeForm(body),
  });
  if (!res.ok) throw new Error("enquiry-submit-failed");
  return "success";
}

export type SubmitStatus = "idle" | "loading" | "error";

/** Duplicate-submission guard: block while a request is in flight. */
export const canSubmit = (status: SubmitStatus): boolean => status !== "loading";
