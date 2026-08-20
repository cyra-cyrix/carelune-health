import { describe, expect, it, vi } from "vitest";
import {
  createAuthFetch,
  isSessionExpired,
  requestUrl,
  SESSION_EXPIRED_MESSAGE,
  shouldRetryWithFreshToken,
  withBearer,
} from "./authFetch";

const REST = "https://project.supabase.co/rest/v1/patients";
const FN = "https://project.supabase.co/functions/v1/admin-users";
const TOKEN_ENDPOINT = "https://project.supabase.co/auth/v1/token?grant_type=refresh_token";

/** The stale credential supabase-js falls back to when the session is momentarily null. */
const PUBLISHABLE = "sb_publishable_stale";
const FRESH_JWT = "fresh.jwt.value";

const res = (status: number) => new Response(status === 200 ? "{}" : "", { status });

/** The Authorization header, whether the caller passed init.headers or a Request. */
function authOf(input: RequestInfo | URL, init?: RequestInit): string | null {
  if (init?.headers) {
    const fromInit = new Headers(init.headers).get("Authorization");
    if (fromInit) return fromInit;
  }
  if (typeof input === "object" && "headers" in input) return input.headers.get("Authorization");
  return null;
}

/** A baseFetch that 401s until a request arrives carrying the fresh token. */
function gatedFetch() {
  const calls: Array<{ url: string; auth: string | null }> = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const auth = authOf(input, init);
    calls.push({ url: requestUrl(input), auth });
    return res(auth === `Bearer ${FRESH_JWT}` ? 200 : 401);
  });
  return { fetchImpl, calls };
}

describe("shouldRetryWithFreshToken", () => {
  it("retries an unauthenticated rejection", () => {
    expect(shouldRetryWithFreshToken(401, REST)).toBe(true);
    expect(shouldRetryWithFreshToken(401, FN)).toBe(true);
  });

  it("never retries the auth endpoint itself (would recurse)", () => {
    expect(shouldRetryWithFreshToken(401, TOKEN_ENDPOINT)).toBe(false);
  });

  it("leaves every other status alone — 403/409/5xx are real answers", () => {
    for (const status of [200, 400, 403, 409, 422, 500, 503]) {
      expect(shouldRetryWithFreshToken(status, REST)).toBe(false);
    }
  });
});

describe("isSessionExpired", () => {
  it("recognises the gateway's 401 rejection", () => {
    expect(isSessionExpired({ status: 401 })).toBe(true);
  });

  it("recognises PostgREST's expired/invalid-JWT codes", () => {
    expect(isSessionExpired({ code: "PGRST301" })).toBe(true);
    expect(isSessionExpired({ code: "PGRST302" })).toBe(true);
  });

  it("recognises the message forms", () => {
    expect(isSessionExpired({ message: "JWT expired" })).toBe(true);
    expect(isSessionExpired({ message: "Missing authorization header" })).toBe(true);
  });

  it("does NOT claim a genuine permission denial is an expired session", () => {
    // An RLS refusal must keep its own message — mislabelling it would send the
    // user to sign in again for something signing in cannot fix.
    expect(isSessionExpired({ code: "42501", message: "new row violates row-level security policy" })).toBe(false);
    expect(isSessionExpired({ status: 403 })).toBe(false);
    expect(isSessionExpired({ code: "23505", message: "duplicate key value" })).toBe(false);
    expect(isSessionExpired(null)).toBe(false);
    expect(isSessionExpired({})).toBe(false);
  });

  it("offers a message that tells the user what to do", () => {
    expect(SESSION_EXPIRED_MESSAGE).toMatch(/sign in again/i);
  });
});

describe("withBearer", () => {
  it("replaces a stale bearer token and preserves other headers", () => {
    const headers = withBearer({ Authorization: `Bearer ${PUBLISHABLE}`, apikey: "k" }, FRESH_JWT);
    expect(headers.get("Authorization")).toBe(`Bearer ${FRESH_JWT}`);
    expect(headers.get("apikey")).toBe("k");
  });
});

describe("createAuthFetch", () => {
  it("recovers the failing first write: refreshes once, retries once, succeeds", async () => {
    const { fetchImpl, calls } = gatedFetch();
    const refresh = vi.fn(async () => FRESH_JWT);
    const authFetch = createAuthFetch({ baseFetch: fetchImpl, refresh });

    const out = await authFetch(FN, {
      method: "POST",
      headers: { Authorization: `Bearer ${PUBLISHABLE}` },
      body: JSON.stringify({ action: "create" }),
    });

    expect(out.status).toBe(200);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(2);
    expect(calls[0].auth).toBe(`Bearer ${PUBLISHABLE}`);
    expect(calls[1].auth).toBe(`Bearer ${FRESH_JWT}`);
  });

  it("preserves method and body on the retry (the write must still happen)", async () => {
    const { fetchImpl } = gatedFetch();
    const authFetch = createAuthFetch({ baseFetch: fetchImpl, refresh: async () => FRESH_JWT });
    const body = JSON.stringify({ action: "create-org", org_name: "Test" });

    await authFetch(FN, { method: "POST", headers: {}, body });

    const retry = fetchImpl.mock.calls[1][1]!;
    expect(retry.method).toBe("POST");
    expect(retry.body).toBe(body);
  });

  it("does not retry a successful request", async () => {
    const fetchImpl = vi.fn(async () => res(200));
    const refresh = vi.fn(async () => FRESH_JWT);
    await createAuthFetch({ baseFetch: fetchImpl, refresh })(REST);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("does not retry a 403 — an authorisation denial is the real answer", async () => {
    const fetchImpl = vi.fn(async () => res(403));
    const refresh = vi.fn(async () => FRESH_JWT);
    const out = await createAuthFetch({ baseFetch: fetchImpl, refresh })(REST);

    expect(out.status).toBe(403);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("retries at most once — no infinite loop when the token stays bad", async () => {
    const fetchImpl = vi.fn(async () => res(401));
    const refresh = vi.fn(async () => "still-bad");
    const out = await createAuthFetch({ baseFetch: fetchImpl, refresh })(REST);

    expect(out.status).toBe(401);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("surfaces the original 401 when the session cannot be recovered", async () => {
    const fetchImpl = vi.fn(async () => res(401));
    const out = await createAuthFetch({ baseFetch: fetchImpl, refresh: async () => null })(REST);

    expect(out.status).toBe(401);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("surfaces the original 401 when refreshing itself throws", async () => {
    const fetchImpl = vi.fn(async () => res(401));
    const refresh = vi.fn(async () => { throw new Error("network down"); });
    const out = await createAuthFetch({ baseFetch: fetchImpl, refresh })(REST);

    expect(out.status).toBe(401);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("never refreshes on a 401 from the token endpoint (recursion guard)", async () => {
    const fetchImpl = vi.fn(async () => res(401));
    const refresh = vi.fn(async () => FRESH_JWT);
    await createAuthFetch({ baseFetch: fetchImpl, refresh })(TOKEN_ENDPOINT, { method: "POST" });

    expect(refresh).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("replays a Request object with the fresh token", async () => {
    const { fetchImpl, calls } = gatedFetch();
    const authFetch = createAuthFetch({ baseFetch: fetchImpl, refresh: async () => FRESH_JWT });

    const out = await authFetch(
      new Request(REST, { method: "POST", headers: { Authorization: `Bearer ${PUBLISHABLE}` }, body: "{}" }),
    );

    expect(out.status).toBe(200);
    expect(calls).toHaveLength(2);
  });
});
