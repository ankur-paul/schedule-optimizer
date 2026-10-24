import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PENDING_CONSENT_KEY, pendingConsentValue } from "./consent";
import { DbFailure } from "./institutesApi";
import {
  acceptConsent,
  clearPendingConsent,
  consented,
  resetConsent,
  savePendingConsent,
  startConsent,
  supabaseConsentApi,
  useConsent,
  type ConsentApi,
} from "./useConsent";

/** An in-memory `ConsentApi`: `accepted` is what the database holds for the user. */
function fakeApi(opts: { accepted?: number | null; readFails?: boolean; recordFails?: boolean } = {}) {
  const api = {
    acceptedMax: vi.fn(async () => {
      if (opts.readFails) throw new DbFailure("Couldn't reach the server. Check your connection and try again.");
      return opts.accepted ?? null;
    }),
    record: vi.fn(async () => {
      if (opts.recordFails) throw new DbFailure("Couldn't reach the server. Check your connection and try again.");
    }),
  };
  return api as typeof api & ConsentApi;
}

const store = new Map<string, string>();
const notify = { info: vi.fn(), error: vi.fn() };

beforeEach(() => {
  store.clear();
  vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) });
  notify.info.mockClear();
  notify.error.mockClear();
  resetConsent();
});

afterEach(() => vi.unstubAllGlobals());

describe("startConsent", () => {
  it("lets through a user who accepted the current version, without recording again", async () => {
    const api = fakeApi({ accepted: 2 });
    await startConsent(api, "u1", notify, 2);
    expect(useConsent.getState()).toEqual({ userId: "u1", status: "ok", acceptedMax: 2 });
    expect(api.record).not.toHaveBeenCalled();
  });

  it("records the box ticked before the redirect and clears it", async () => {
    store.set(PENDING_CONSENT_KEY, pendingConsentValue(2));
    const api = fakeApi();
    await startConsent(api, "u1", notify, 2);
    expect(api.record).toHaveBeenCalledWith(2);
    expect(useConsent.getState().status).toBe("ok");
    expect(store.has(PENDING_CONSENT_KEY)).toBe(false);
  });

  it("asks a user with nothing ticked here, e.g. an email link opened on another device", async () => {
    const api = fakeApi();
    await startConsent(api, "u1", notify, 1);
    expect(useConsent.getState()).toEqual({ userId: "u1", status: "ask", acceptedMax: null });
    expect(api.record).not.toHaveBeenCalled();
  });

  it("asks after a version bump, even with a tick for the old version", async () => {
    store.set(PENDING_CONSENT_KEY, pendingConsentValue(1));
    const api = fakeApi({ accepted: 1 });
    await startConsent(api, "u1", notify, 2);
    expect(useConsent.getState()).toEqual({ userId: "u1", status: "ask", acceptedMax: 1 });
    expect(api.record).not.toHaveBeenCalled();
  });

  it("ignores a malformed tick", async () => {
    store.set(PENDING_CONSENT_KEY, "garbage");
    await startConsent(fakeApi(), "u1", notify, 1);
    expect(useConsent.getState().status).toBe("ask");
  });

  it("clears a stale tick once the user is through", async () => {
    store.set(PENDING_CONSENT_KEY, pendingConsentValue(1));
    await startConsent(fakeApi({ accepted: 2 }), "u1", notify, 2);
    expect(store.has(PENDING_CONSENT_KEY)).toBe(false);
  });

  it("asks and says why when the record fails, keeping the tick", async () => {
    store.set(PENDING_CONSENT_KEY, pendingConsentValue(1));
    await startConsent(fakeApi({ recordFails: true }), "u1", notify, 1);
    expect(useConsent.getState().status).toBe("ask");
    expect(notify.error).toHaveBeenCalledWith(expect.stringContaining("Couldn't record your acceptance"));
    expect(store.has(PENDING_CONSENT_KEY)).toBe(true);
  });

  it("asks and says why when the read fails", async () => {
    await startConsent(fakeApi({ readFails: true }), "u1", notify, 1);
    expect(useConsent.getState().status).toBe("ask");
    expect(notify.error).toHaveBeenCalledWith(expect.stringContaining("Couldn't check which Terms you accepted"));
  });

  it("still records a fresh tick when the read fails", async () => {
    store.set(PENDING_CONSENT_KEY, pendingConsentValue(1));
    const api = fakeApi({ readFails: true });
    await startConsent(api, "u1", notify, 1);
    expect(api.record).toHaveBeenCalledWith(1);
    expect(useConsent.getState().status).toBe("ok");
  });

  it("is checking until the read comes back", async () => {
    let resolve: (v: number | null) => void = () => {};
    const api = { acceptedMax: () => new Promise<number | null>((r) => (resolve = r)), record: vi.fn() };
    const done = startConsent(api, "u1", notify, 1);
    expect(useConsent.getState()).toEqual({ userId: "u1", status: "checking", acceptedMax: null });
    resolve(1);
    await done;
    expect(useConsent.getState().status).toBe("ok");
  });

  it("drops a late answer once the user signed out", async () => {
    let resolve: (v: number | null) => void = () => {};
    const api = { acceptedMax: () => new Promise<number | null>((r) => (resolve = r)), record: vi.fn() };
    const done = startConsent(api, "u1", notify, 1);
    resetConsent();
    resolve(1);
    await done;
    expect(useConsent.getState()).toEqual({ userId: null, status: "checking", acceptedMax: null });
  });
});

describe("acceptConsent", () => {
  it("records the current version and lets the user through", async () => {
    await startConsent(fakeApi({ accepted: 1 }), "u1", notify, 2);
    const api = fakeApi();
    await acceptConsent(api, notify, 2);
    expect(api.record).toHaveBeenCalledWith(2);
    expect(useConsent.getState()).toEqual({ userId: "u1", status: "ok", acceptedMax: 2 });
  });

  it("clears a leftover tick", async () => {
    store.set(PENDING_CONSENT_KEY, pendingConsentValue(1));
    await startConsent(fakeApi({ accepted: 1 }), "u1", notify, 2);
    await acceptConsent(fakeApi(), notify, 2);
    expect(store.has(PENDING_CONSENT_KEY)).toBe(false);
  });

  it("keeps the dialog and says why when the record fails", async () => {
    await startConsent(fakeApi(), "u1", notify, 1);
    await acceptConsent(fakeApi({ recordFails: true }), notify, 1);
    expect(useConsent.getState().status).toBe("ask");
    expect(notify.error).toHaveBeenCalledWith(expect.stringContaining("Couldn't record your acceptance"));
  });

  it("does nothing when signed out", async () => {
    const api = fakeApi();
    await acceptConsent(api, notify, 1);
    expect(api.record).not.toHaveBeenCalled();
  });
});

describe("consented", () => {
  it("is true only for an ok decision about this user", async () => {
    await startConsent(fakeApi({ accepted: 1 }), "u1", notify, 1);
    expect(consented(useConsent.getState(), "u1")).toBe(true);
    expect(consented(useConsent.getState(), "u2")).toBe(false);
    resetConsent();
    expect(consented(useConsent.getState(), "u1")).toBe(false);
  });
});

describe("pending consent", () => {
  it("saves the current version and clears it", () => {
    savePendingConsent(3);
    expect(store.get(PENDING_CONSENT_KEY)).toBe('{"version":3}');
    clearPendingConsent();
    expect(store.has(PENDING_CONSENT_KEY)).toBe(false);
  });
});

describe("supabaseConsentApi", () => {
  function fakeClient(result: { data: unknown; error: object | null }) {
    const query = { select: vi.fn(() => query), eq: vi.fn(async () => result) };
    const client = { from: vi.fn(() => query), rpc: vi.fn(async () => result) };
    return { client: client as unknown as SupabaseClient, query, raw: client };
  }

  it("reads the user's highest accepted version", async () => {
    const { client, query, raw } = fakeClient({ data: [{ version: 1 }, { version: 2 }], error: null });
    expect(await supabaseConsentApi(client).acceptedMax("u1")).toBe(2);
    expect(raw.from).toHaveBeenCalledWith("consents");
    expect(query.eq).toHaveBeenCalledWith("user_id", "u1");
  });

  it("is null with no rows", async () => {
    const { client } = fakeClient({ data: [], error: null });
    expect(await supabaseConsentApi(client).acceptedMax("u1")).toBeNull();
  });

  it("records through record_consent", async () => {
    const { client, raw } = fakeClient({ data: null, error: null });
    await supabaseConsentApi(client).record(2);
    expect(raw.rpc).toHaveBeenCalledWith("record_consent", { version: 2 });
  });

  it("throws a plain-words DbFailure on error", async () => {
    const { client } = fakeClient({ data: null, error: { message: "Failed to fetch" } });
    await expect(supabaseConsentApi(client).record(1)).rejects.toThrow("Couldn't reach the server");
  });
});
