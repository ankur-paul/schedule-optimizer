import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Joined, Membership } from "./institutes";
import { DbFailure, type InstitutesApi } from "./institutesApi";
import {
  createAndSwitch,
  currentInstitute,
  dismissCreate,
  failureMessage,
  refreshInstitutes,
  resetInstitutes,
  startInstitutes,
  switchInstitute,
  useInstitutes,
} from "./useInstitutes";

const gndec: Membership = { instituteId: "i1", name: "GNDEC Ludhiana", role: "editor", handle: null };
const pec: Membership = { instituteId: "i2", name: "PEC Chandigarh", role: "admin", handle: null };
const meera = { name: "Dr. Meera Iyer", email: "meera@gndec.ac.in" };

/** An in-memory `InstitutesApi`: `memberships` is what the database holds for the user. */
function fakeApi(opts: { memberships?: Membership[]; joined?: Joined[]; acceptFails?: boolean } = {}) {
  let memberships = opts.memberships ?? [];
  const api = {
    acceptInvites: vi.fn(async () => {
      if (opts.acceptFails) throw new DbFailure("Couldn't reach the server. Check your connection and try again.");
      return opts.joined ?? [];
    }),
    memberships: vi.fn(async () => memberships),
    admin: vi.fn(async (id: string) => (id === "i1" ? meera : { name: null, email: "me@x.in" })),
    createInstitute: vi.fn(async (name: string) => {
      memberships = [...memberships, { instituteId: "new", name, role: "admin" as const, handle: null }];
      return "new";
    }),
  };
  return { api: api as unknown as InstitutesApi, calls: api, setMemberships: (m: Membership[]) => (memberships = m) };
}

function fakeStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

let storage: ReturnType<typeof fakeStorage>;
const notify = { info: vi.fn(), error: vi.fn() };

beforeEach(() => {
  storage = fakeStorage();
  vi.stubGlobal("localStorage", storage);
  notify.info.mockClear();
  notify.error.mockClear();
  resetInstitutes();
});

afterEach(() => vi.unstubAllGlobals());

describe("startInstitutes", () => {
  it("accepts invites, toasts what was joined, then loads memberships and the admin", async () => {
    const { api, calls } = fakeApi({ memberships: [gndec], joined: [{ name: "GNDEC Ludhiana", role: "editor" }] });
    await startInstitutes(api, "u1", notify);
    expect(calls.acceptInvites).toHaveBeenCalledOnce();
    expect(notify.info).toHaveBeenCalledWith("You joined GNDEC Ludhiana as editor");
    const state = useInstitutes.getState();
    expect(state).toMatchObject({ userId: "u1", memberships: [gndec], loaded: true, admin: meera, createOpen: false });
  });

  it("opens the create dialog with no institute and no invite", async () => {
    await startInstitutes(fakeApi().api, "u1", notify);
    expect(useInstitutes.getState().createOpen).toBe(true);
    expect(notify.info).not.toHaveBeenCalled();
  });

  it("doesn't open it again after Not now, for that user only", async () => {
    const { api } = fakeApi();
    await startInstitutes(api, "u1", notify);
    dismissCreate();
    expect(useInstitutes.getState().createOpen).toBe(false);
    await startInstitutes(api, "u1", notify);
    expect(useInstitutes.getState().createOpen).toBe(false);
    await startInstitutes(api, "u2", notify);
    expect(useInstitutes.getState().createOpen).toBe(true);
  });

  it("still loads memberships when checking invites fails, and says so in words", async () => {
    const { api } = fakeApi({ memberships: [gndec], acceptFails: true });
    await startInstitutes(api, "u1", notify);
    expect(notify.error).toHaveBeenCalledWith(expect.stringMatching(/^Couldn't check for invites: Couldn't reach the server/));
    expect(useInstitutes.getState().memberships).toEqual([gndec]);
  });

  it("restores the remembered institute for this user", async () => {
    storage.setItem("lattice-active-institute:u1", "i2");
    await startInstitutes(fakeApi({ memberships: [gndec, pec] }).api, "u1", notify);
    expect(currentInstitute(useInstitutes.getState())).toEqual(pec);
  });

  it("drops a result that arrives after the user changed", async () => {
    const { api } = fakeApi({ memberships: [gndec] });
    const first = startInstitutes(api, "u1", notify);
    resetInstitutes();
    await first;
    expect(useInstitutes.getState()).toMatchObject({ userId: null, memberships: [], loaded: false });
  });
});

describe("switchInstitute", () => {
  it("remembers the choice per user and loads that institute's admin", async () => {
    const { api } = fakeApi({ memberships: [gndec, pec] });
    await startInstitutes(api, "u1", notify);
    await switchInstitute(api, "i2", notify);
    expect(storage.data.get("lattice-active-institute:u1")).toBe("i2");
    expect(currentInstitute(useInstitutes.getState())).toEqual(pec);
    expect(useInstitutes.getState().admin).toEqual({ name: null, email: "me@x.in" });
  });
});

describe("refreshInstitutes", () => {
  it("falls back to the first membership once the active one is gone", async () => {
    const fake = fakeApi({ memberships: [gndec, pec] });
    await startInstitutes(fake.api, "u1", notify);
    await switchInstitute(fake.api, "i2", notify);
    fake.setMemberships([gndec]);
    await refreshInstitutes(fake.api, notify);
    expect(currentInstitute(useInstitutes.getState())).toEqual(gndec);
    expect(useInstitutes.getState().admin).toEqual(meera);
  });

  it("does nothing signed out", async () => {
    const { api, calls } = fakeApi();
    await refreshInstitutes(api, notify);
    expect(calls.memberships).not.toHaveBeenCalled();
  });
});

describe("createAndSwitch", () => {
  it("creates the institute and makes it active", async () => {
    const { api, calls } = fakeApi({ memberships: [gndec] });
    await startInstitutes(api, "u1", notify);
    await createAndSwitch(api, "New College", notify);
    expect(calls.createInstitute).toHaveBeenCalledWith("New College");
    expect(currentInstitute(useInstitutes.getState())).toEqual({ instituteId: "new", name: "New College", role: "admin", handle: null });
  });
});

describe("failureMessage", () => {
  it("keeps a DbFailure's words and hides anything else", () => {
    expect(failureMessage(new DbFailure("Only the admin can do that."))).toBe("Only the admin can do that.");
    expect(failureMessage(new TypeError("x is undefined"))).toBe("Something went wrong. Try again.");
  });
});
