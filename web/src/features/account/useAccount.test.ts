import type { AuthChangeEvent, Session, SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PENDING_CONSENT_KEY } from "./consent";
import { signOut, syncAccount, useAccount } from "./useAccount";

const session = { access_token: "t", user: { id: "u1", email: "a@b.in" } } as unknown as Session;

/** A stand-in for `supabase.auth` that lets a test fire auth events and pick what `initialize` returns. */
function fakeClient(opts: { stored?: Session | null; initError?: object } = {}) {
  let listener: ((event: AuthChangeEvent, s: Session | null) => void) | null = null;
  const unsubscribe = vi.fn();
  const auth = {
    onAuthStateChange: (cb: typeof listener) => {
      listener = cb;
      return { data: { subscription: { unsubscribe } } };
    },
    initialize: async () => ({ error: opts.initError ?? null }),
    getSession: async () => ({ data: { session: opts.stored ?? null }, error: null }),
  };
  return {
    client: { auth } as unknown as Pick<SupabaseClient, "auth">,
    fire: (event: AuthChangeEvent, s: Session | null) => listener?.(event, s),
    unsubscribe,
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => vi.unstubAllGlobals());

describe("syncAccount", () => {
  beforeEach(() => useAccount.setState({ session: null, ready: false }));

  it("starts not ready, then reads the stored session (a reload keeps you signed in)", async () => {
    const { client } = fakeClient({ stored: session });
    syncAccount(client, () => {});
    expect(useAccount.getState().ready).toBe(false);
    await flush();
    expect(useAccount.getState()).toEqual({ session, ready: true });
  });

  it("is ready and signed out with nothing stored", async () => {
    syncAccount(fakeClient().client, () => {});
    await flush();
    expect(useAccount.getState()).toEqual({ session: null, ready: true });
  });

  it("follows sign-in and sign-out events", async () => {
    const fake = fakeClient();
    syncAccount(fake.client, () => {});
    await flush();
    fake.fire("SIGNED_IN", session);
    expect(useAccount.getState().session).toBe(session);
    fake.fire("SIGNED_OUT", null);
    expect(useAccount.getState().session).toBeNull();
  });

  it("drops the consent tick on sign-out, not on sign-in", async () => {
    const store = new Map([[PENDING_CONSENT_KEY, '{"version":1}']]);
    vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) });
    const fake = fakeClient();
    syncAccount(fake.client, () => {});
    await flush();
    fake.fire("INITIAL_SESSION", null);
    fake.fire("SIGNED_IN", session);
    expect(store.has(PENDING_CONSENT_KEY)).toBe(true);
    fake.fire("SIGNED_OUT", null);
    expect(store.has(PENDING_CONSENT_KEY)).toBe(false);
  });

  it("reports a failed redirect in plain words, using the code in details", async () => {
    const onError = vi.fn();
    const initError = { message: "Email link is invalid or has expired", status: 500, details: { code: "otp_expired" } };
    syncAccount(fakeClient({ initError }).client, onError);
    await flush();
    expect(onError).toHaveBeenCalledWith(expect.stringMatching(/expired or was already used/));
    expect(useAccount.getState().ready).toBe(true);
  });

  it("stops listening after cleanup", async () => {
    const fake = fakeClient({ stored: session });
    const stop = syncAccount(fake.client, () => {});
    stop();
    await flush();
    fake.fire("SIGNED_IN", session);
    expect(fake.unsubscribe).toHaveBeenCalled();
    expect(useAccount.getState()).toEqual({ session: null, ready: false });
  });
});

describe("signOut", () => {
  function client(error: { message: string } | null, dropsSession: boolean) {
    const auth = {
      signOut: async () => {
        if (dropsSession) useAccount.setState({ session: null });
        return { error };
      },
    };
    return { auth } as unknown as Pick<SupabaseClient, "auth">;
  }

  beforeEach(() => useAccount.setState({ session, ready: true }));

  it("is quiet on success", async () => {
    expect(await signOut(client(null, true))).toBeNull();
  });

  it("is quiet when the server can't be reached but the local session went", async () => {
    expect(await signOut(client({ message: "Failed to fetch" }, true))).toBeNull();
  });

  it("reports a failure that kept the session", async () => {
    expect(await signOut(client({ message: "boom" }, false))).toBe("Couldn't sign out: boom");
  });
});
