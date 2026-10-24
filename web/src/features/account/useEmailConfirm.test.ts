import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pendingKey } from "./emailConfirm";
import { DbFailure, EmailConfirmationNeeded, type InstitutesApi } from "./institutesApi";
import { useAccount } from "./useAccount";
import { cancelPending, checkPending, finishPending, requestAction, runAction, sendConfirmLink, useEmailConfirm } from "./useEmailConfirm";

/** An unsigned JWT with these claims, base64url-encoded (UTF-8) like Supabase's. */
function jwt(claims: object): string {
  return `eyJhbGciOiJIUzI1NiJ9.${base64url(JSON.stringify(claims))}.signature`;
}

function base64url(text: string): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(text))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const NOW = 1_792_843_332_000;
const handover = { kind: "make_admin", instituteId: "i1", instituteName: "GNDEC", userId: "u2", userLabel: "Bela" } as const;

function signIn(amr: object[], id = "u1") {
  const session = { access_token: jwt({ sub: id, amr }), user: { id, email: `${id}@gndec.ac.in` } } as unknown as Session;
  useAccount.setState({ session, ready: true });
}
const freshEmail = () => signIn([{ method: "otp", timestamp: NOW / 1000 - 60 }]);
const google = () => signIn([{ method: "oauth", timestamp: NOW / 1000 - 60 }]);

function fakeApi(makeAdmin: () => Promise<void> = async () => {}) {
  const api = { makeAdmin: vi.fn(makeAdmin), leave: vi.fn(async () => {}), memberships: vi.fn(async () => []), admin: vi.fn(async () => null) };
  return api as typeof api & InstitutesApi;
}

const store = new Map<string, string>();
const notify = { info: vi.fn(), error: vi.fn() };

beforeEach(() => {
  store.clear();
  vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) });
  notify.info.mockClear();
  notify.error.mockClear();
  useEmailConfirm.setState({ asking: null, sentTo: null, finishing: null });
});

afterEach(() => vi.unstubAllGlobals());

describe("requestAction", () => {
  it("runs at once after a recent email sign-in", async () => {
    freshEmail();
    const api = fakeApi();
    expect(await requestAction(api, handover, notify, NOW)).toBe("done");
    expect(api.makeAdmin).toHaveBeenCalledWith("i1", "u2");
    expect(notify.info).toHaveBeenCalledWith("Bela is now the admin. You're an editor.");
  });

  it("asks for the email link otherwise, without calling the database", async () => {
    google();
    const api = fakeApi();
    expect(await requestAction(api, { kind: "leave", instituteId: "i1", instituteName: "GNDEC" }, notify, NOW)).toBe("email");
    expect(api.leave).not.toHaveBeenCalled();
    expect(useEmailConfirm.getState().asking).toEqual({ kind: "leave", instituteId: "i1", instituteName: "GNDEC", by: "u1", at: NOW });
  });

  it("does nothing signed out", async () => {
    useAccount.setState({ session: null, ready: true });
    expect(await requestAction(fakeApi(), handover, notify, NOW)).toBeNull();
  });
});

describe("runAction", () => {
  const action = { ...handover, by: "u1", at: NOW };

  it("asks for the link again when the database says the email sign-in is too old", async () => {
    const api = fakeApi(async () => {
      throw new EmailConfirmationNeeded("Confirm from your email first.");
    });
    expect(await runAction(api, action, notify)).toBe("email");
    expect(useEmailConfirm.getState().asking).toMatchObject(handover);
    expect(notify.error).not.toHaveBeenCalled();
  });

  it("toasts any other refusal", async () => {
    const api = fakeApi(async () => {
      throw new DbFailure("Only the admin can hand over the admin role.");
    });
    expect(await runAction(api, action, notify)).toBe("failed");
    expect(notify.error).toHaveBeenCalledWith("Only the admin can hand over the admin role.");
  });
});

describe("sendConfirmLink", () => {
  const client = (error: object | null = null) => {
    const signInWithOtp = vi.fn(async (_args: unknown) => ({ data: {}, error }));
    return { client: { auth: { signInWithOtp } } as unknown as Pick<SupabaseClient, "auth">, signInWithOtp };
  };

  it("emails your own address without making accounts, and remembers the action", async () => {
    google();
    await requestAction(fakeApi(), handover, notify, NOW);
    const { client: c, signInWithOtp } = client();
    expect(await sendConfirmLink(c, { origin: "http://localhost:5173" })).toBeNull();
    expect(signInWithOtp).toHaveBeenCalledWith({ email: "u1@gndec.ac.in", options: { shouldCreateUser: false, emailRedirectTo: "http://localhost:5173/" } });
    expect(useEmailConfirm.getState().sentTo).toBe("u1@gndec.ac.in");
    expect(JSON.parse(store.get(pendingKey("u1"))!)).toMatchObject({ ...handover, by: "u1" });
  });

  it("reports a failed send in words and remembers nothing", async () => {
    google();
    await requestAction(fakeApi(), handover, notify, NOW);
    expect(await sendConfirmLink(client({ status: 429 }).client, { origin: "http://x" })).toMatch(/Too many emails/);
    expect(store.size).toBe(0);
  });
});

describe("checkPending and finishPending", () => {
  async function sendAsGoogle() {
    google();
    await requestAction(fakeApi(), handover, notify, NOW);
    const signInWithOtp = async () => ({ data: {}, error: null });
    await sendConfirmLink({ auth: { signInWithOtp } } as unknown as Pick<SupabaseClient, "auth">, { origin: "http://x" });
  }

  it("offers to finish once the link signs you in with a fresh email sign-in", async () => {
    await sendAsGoogle();
    checkPending(NOW);
    expect(useEmailConfirm.getState().finishing).toBeNull(); // still the Google session
    freshEmail();
    checkPending(NOW + 5000);
    expect(useEmailConfirm.getState()).toMatchObject({ finishing: { ...handover, by: "u1" }, asking: null });
  });

  it("never offers another account's action", async () => {
    await sendAsGoogle();
    signIn([{ method: "otp", timestamp: NOW / 1000 }], "u9");
    checkPending(NOW);
    expect(useEmailConfirm.getState().finishing).toBeNull();
  });

  it("finishes once: the stored action is cleared before running", async () => {
    await sendAsGoogle();
    freshEmail();
    checkPending(NOW);
    const api = fakeApi();
    expect(await finishPending(api, notify)).toBe("done");
    expect(store.has(pendingKey("u1"))).toBe(false);
    expect(await finishPending(api, notify)).toBeNull();
    expect(api.makeAdmin).toHaveBeenCalledOnce();
  });

  it("cancel forgets the action", async () => {
    await sendAsGoogle();
    cancelPending();
    expect(store.size).toBe(0);
    expect(useEmailConfirm.getState()).toEqual({ asking: null, sentTo: null, finishing: null });
  });
});
