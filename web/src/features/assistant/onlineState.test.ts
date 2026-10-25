import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Membership, Role } from "@/features/account/institutes";
import { DbFailure } from "@/features/account/institutesApi";
import { useInstitutes } from "@/features/account/useInstitutes";
import { docHash } from "@/features/online/online";
import type { OnlineApi } from "@/features/online/onlineApi";
import { useAppStore } from "@/store/useAppStore";
import { loadOnlineSnapshot, saveAsInstitute, saverOf } from "./onlineState";
import { runTool } from "./tools";

const membership = (instituteId: string, role: Role, handle: string | null = null): Membership => ({ instituteId, name: instituteId.toUpperCase(), role, handle });

/** An online API whose linked timetable "t1" has three versions, saved by the user, by Meera and by a deleted profile. */
function namedSaversApi(overrides: Partial<OnlineApi> = {}) {
  return {
    list: vi.fn(async () => [
      { id: "t1", name: "CSE odd", latestVersion: 3, live: true, savedBy: "Meera Kaur", savedAt: "2026-10-24T10:00:00Z" },
      { id: "t2", name: "ME even", latestVersion: 1, live: false, savedBy: "meera@gndec.ac.in", savedAt: "2026-10-20T10:00:00Z" },
    ]),
    status: vi.fn(async () => ({ publicId: "k7f3q9xa2m", latestVersion: 3, liveVersion: 2 })),
    versions: vi.fn(async () => [
      { version: 3, savedBy: "Meera Kaur", savedById: "u2", savedAt: "2026-10-24T10:00:00Z" },
      { version: 2, savedBy: "Ankur Paul", savedById: "u1", savedAt: "2026-10-23T10:00:00Z" },
      { version: 1, savedBy: null, savedById: null, savedAt: "2026-10-22T10:00:00Z" },
    ]),
    ...overrides,
  } as unknown as OnlineApi & Record<keyof OnlineApi, ReturnType<typeof vi.fn>>;
}

const store = () => useAppStore.getState();

function signIn(memberships: Membership[], rememberedId: string | null = memberships[0]?.instituteId ?? null) {
  useInstitutes.setState({ userId: "u1", memberships, loaded: true, rememberedId, admin: { name: "Meera Kaur", email: "meera@gndec.ac.in" }, createOpen: false });
}

beforeEach(() => {
  store().reset();
  store().loadSample();
  useInstitutes.setState({ userId: null, memberships: [], loaded: false, rememberedId: null, admin: null, createOpen: false });
});

describe("saveAsInstitute", () => {
  const list = [membership("i1", "viewer"), membership("i2", "editor"), membership("i3", "admin")];

  it("prefers the linked institute, then the active one, then the first the user may save in", () => {
    expect(saveAsInstitute(list, "i3", "i2")?.instituteId).toBe("i3");
    expect(saveAsInstitute(list, "i1", "i3")?.instituteId).toBe("i3");
    expect(saveAsInstitute(list, null, "i1")?.instituteId).toBe("i2");
  });

  it("is null for a viewer everywhere", () => {
    expect(saveAsInstitute([membership("i1", "viewer")], "i1", "i1")).toBeNull();
    expect(saveAsInstitute([], null, null)).toBeNull();
  });
});

describe("saverOf", () => {
  it("says you, another member or unknown, never a name", () => {
    expect(saverOf("u1", "u1")).toBe("you");
    expect(saverOf("u2", "u1")).toBe("another member");
    expect(saverOf(null, "u1")).toBe("unknown");
  });
});

describe("loadOnlineSnapshot", () => {
  it("signed out: reads nothing online", async () => {
    const api = namedSaversApi();
    store().setOnline({ instituteId: "i1", instituteName: "I1", timetableId: "t1", name: "CSE odd", version: 3, savedHash: docHash(store()) });
    const snap = await loadOnlineSnapshot(api);
    expect(snap).toMatchObject({ signedIn: false, role: null, timetable: null, active: null, saveAsInto: null, problems: [] });
    expect(api.status).not.toHaveBeenCalled();
    expect(api.list).not.toHaveBeenCalled();
  });

  it("not linked: lists the active institute's timetables", async () => {
    signIn([membership("i1", "editor", "gndec")]);
    const api = namedSaversApi();
    const snap = await loadOnlineSnapshot(api);
    expect(snap).toMatchObject({ signedIn: true, link: null, dirty: false, timetable: null, saveAsInto: { instituteId: "i1", role: "editor", handle: "gndec" } });
    expect(snap.active?.timetables).toEqual([
      { id: "t1", name: "CSE odd", latestVersion: 3, published: true },
      { id: "t2", name: "ME even", latestVersion: 1, published: false },
    ]);
    expect(api.status).not.toHaveBeenCalled();
  });

  it("linked: the role, unsaved changes and the versions with you or another member", async () => {
    signIn([membership("i1", "viewer", "gndec")]);
    store().setOnline({ instituteId: "i1", instituteName: "I1", timetableId: "t1", name: "CSE odd", version: 3, savedHash: docHash(store()) });
    store().setPrintHeading("Changed");
    const snap = await loadOnlineSnapshot(namedSaversApi());
    expect(snap).toMatchObject({ role: "viewer", dirty: true, linkedInstitute: { instituteId: "i1", handle: "gndec" }, saveAsInto: null });
    expect(snap.timetable).toEqual({
      latestVersion: 3,
      liveVersion: 2,
      versions: [
        { version: 3, savedAt: "2026-10-24T10:00:00Z", savedBy: "another member" },
        { version: 2, savedAt: "2026-10-23T10:00:00Z", savedBy: "you" },
        { version: 1, savedAt: "2026-10-22T10:00:00Z", savedBy: "unknown" },
      ],
    });
    expect(JSON.stringify(snap)).not.toMatch(/Meera|meera@|Ankur/);
  });

  it("says what couldn't be read, without throwing", async () => {
    signIn([membership("i1", "editor")]);
    store().setOnline({ instituteId: "i1", instituteName: "I1", timetableId: "t1", name: "CSE odd", version: 3, savedHash: "" });
    const offline = () => Promise.reject(new DbFailure("Couldn't reach the server. Check your connection and try again."));
    const snap = await loadOnlineSnapshot(namedSaversApi({ status: vi.fn(offline), list: vi.fn(offline) }));
    expect(snap.timetable).toBeNull();
    expect(snap.problems).toEqual([
      "Couldn't read the linked timetable: Couldn't reach the server. Check your connection and try again.",
      "Couldn't list I1's timetables: Couldn't reach the server. Check your connection and try again.",
    ]);
    const gone = await loadOnlineSnapshot(namedSaversApi({ status: vi.fn(async () => null) }));
    expect(gone.problems).toEqual(["The linked timetable was deleted online, or the user can no longer open it."]);
  });

  it("feeds online_status, which names no member", async () => {
    signIn([membership("i1", "admin", "gndec")]);
    store().setOnline({ instituteId: "i1", instituteName: "I1", timetableId: "t1", name: "CSE odd", version: 3, savedHash: docHash(store()) });
    const onlineSnapshot = await loadOnlineSnapshot(namedSaversApi());
    const out = runTool("online_status", {}, { ...store(), onlineSnapshot });
    expect(out.isError).toBe(false);
    expect(out.content).not.toMatch(/Meera|meera@|Ankur|gndec\.ac\.in|u1|u2/);
    expect(JSON.parse(out.content)).toMatchObject({ timetable: "CSE odd", role: "admin", liveVersion: 2, versions: [{ savedBy: "another member" }, { savedBy: "you", live: true }, { savedBy: "unknown" }] });
  });
});
