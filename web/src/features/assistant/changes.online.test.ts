import { beforeEach, describe, expect, it, vi } from "vitest";
import timetableJson from "../../../../shared/fixtures/sample-timetable.json";
import { sampleCollege } from "@/domain/sampleCollege";
import type { SolveResult } from "@/domain/types";
import type { Membership, Role } from "@/features/account/institutes";
import { DbFailure } from "@/features/account/institutesApi";
import { useInstitutes } from "@/features/account/useInstitutes";
import { docHash, toDoc } from "@/features/online/online";
import { SaveConflict, type OnlineApi } from "@/features/online/onlineApi";
import { useOnline } from "@/features/online/useOnline";
import { useAppStore, type OnlineLink } from "@/store/useAppStore";
import { applyChanges, dryRun, KEPT_VERSIONS, runOnline, type ChangeData, type DryRun, type OnlineChange } from "./changes";
import type { OnlineSnapshot } from "./onlineState";

const college = (): ChangeData => {
  const { settings, departments, teachers, rooms, sections, courses } = structuredClone(sampleCollege);
  return { settings, departments, teachers, rooms, sections, courses, result: structuredClone(timetableJson as SolveResult), locks: [] };
};
const base = college();

const LINK: OnlineLink = { instituteId: "i1", instituteName: "GNDEC", timetableId: "t1", name: "CSE odd", version: 7, savedHash: "h" };
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

/** An editor linked to "CSE odd" version 7 of 7, unpublished, in GNDEC with the link name set. */
function snap(opts: { role?: Role | null; kept?: number[]; latest?: number; live?: number | null; handle?: string | null } & Partial<OnlineSnapshot> = {}): OnlineSnapshot {
  const { role = "editor", kept = range(1, 7), latest = Math.max(...kept), live = null, handle = "gndec", ...rest } = opts;
  const institute = { instituteId: "i1", name: "GNDEC", handle };
  return {
    signedIn: true,
    link: { ...LINK, version: latest },
    role,
    linkedInstitute: role ? institute : null,
    dirty: false,
    timetable: { latestVersion: latest, liveVersion: live, versions: kept.map((version) => ({ version, savedAt: "2026-10-24T10:00:00Z", savedBy: "you" })) },
    saveAsInto: role === "admin" || role === "editor" ? { ...institute, role } : null,
    active: { ...institute, role: role ?? "viewer", timetables: [{ id: "t1", name: "CSE odd", latestVersion: latest, published: live !== null }, { id: "t2", name: "ME even", latestVersion: 3, published: false }] },
    problems: [],
    ...rest,
  };
}

const run = (changes: unknown[], online: OnlineSnapshot = snap(), hasUnsavedWork = false): DryRun => dryRun({ summary: "Test", changes }, base, { hasUnsavedWork, online });

function passed(result: DryRun) {
  if (!result.ok) throw new Error(`expected the proposal to pass: ${result.errors.join(" ")}`);
  return result;
}
function failed(result: DryRun): string {
  if (result.ok) throw new Error(`expected the proposal to fail: ${result.lines.map((l) => l.text).join("; ")}`);
  return result.errors[0];
}
const lines = (changes: unknown[], online?: OnlineSnapshot) => passed(run(changes, online)).lines.map((l) => l.text);

const SAVE = { op: "save_online" };
const MOVE = { op: "move", sessionId: "cse-a-ds:L1", day: "Tue", period: "P1", roomId: "" };

describe("online changes by role", () => {
  const changes: Record<string, unknown> = {
    save_online: SAVE,
    save_as_new: { op: "save_as_new", name: "CSE odd v2" },
    rename_online: { op: "rename_online", name: "CSE odd final" },
    publish: { op: "publish", version: 0 },
    make_live: { op: "make_live", version: 5 },
    open_online: { op: "open_online", timetableId: "t2", version: 0 },
  };
  const online = (op: string, role: Role) => snap({ role, live: op === "make_live" ? 7 : null });

  for (const role of ["admin", "editor"] as const) {
    it(`an ${role} may make every online change`, () => {
      for (const [op, change] of Object.entries(changes)) expect(run([change], online(op, role)).ok, op).toBe(true);
    });
  }

  it("a viewer can't save, rename or publish, and is told to ask an editor", () => {
    for (const op of ["save_online", "rename_online", "publish", "make_live"]) {
      expect(failed(run([changes[op]], online(op, "viewer")))).toMatch(/^Change 1: the user is a viewer in GNDEC: their role can't .+, ask an editor\.$/);
    }
    expect(failed(run([changes.save_as_new], online("save_as_new", "viewer")))).toBe(
      "Change 1: the user is a viewer in every institute they belong to: their role can't save a new timetable, ask an editor.",
    );
  });

  it("a viewer may open a timetable, which only changes their own working copy", () => {
    expect(lines([changes.open_online], snap({ role: "viewer" }))).toEqual(["Open “ME even” from GNDEC"]);
  });

  it("a user who left the institute can't change its timetable", () => {
    expect(failed(run([SAVE], snap({ role: null })))).toBe("Change 1: the user is no longer a member of GNDEC, so you can't save online.");
  });

  it("signed out, nothing online can be proposed", () => {
    for (const change of Object.values(changes)) {
      expect(failed(run([change], snap({ signedIn: false })))).toMatch(/^Change 1: the user is signed out, so you can't .+\. They sign in with the account button\.$/);
    }
  });
});

describe("the 20-version rule", () => {
  it(`blocks a save at exactly ${KEPT_VERSIONS} kept versions, which would delete the oldest`, () => {
    expect(failed(run([SAVE], snap({ kept: range(1, 20) })))).toBe("Change 1: this save would delete version 1. Save by hand.");
  });

  it("allows it when the oldest is the live one, which the server keeps", () => {
    expect(lines([SAVE], snap({ kept: range(1, 20), live: 1 }))).toEqual(["Save online as version 21 of “CSE odd”"]);
  });

  it("blocks it when the live one is among the 20 but isn't the oldest", () => {
    expect(failed(run([SAVE], snap({ kept: range(1, 20), live: 9 })))).toBe("Change 1: this save would delete version 1. Save by hand.");
  });

  it(`allows a save at ${KEPT_VERSIONS - 1} kept versions, or with gaps from versions already deleted`, () => {
    expect(run([SAVE], snap({ kept: range(1, 19) })).ok).toBe(true);
    expect(run([SAVE], snap({ kept: [1, ...range(13, 31)], latest: 31, live: 1 })).ok).toBe(true);
  });

  it("counts the saves earlier in the same proposal", () => {
    expect(lines([SAVE, SAVE], snap({ kept: range(1, 18) }))).toEqual(["Save online as version 19 of “CSE odd”", "Save online as version 20 of “CSE odd”"]);
    expect(failed(run([SAVE, SAVE, SAVE], snap({ kept: range(1, 18) })))).toBe("Change 3: this save would delete version 1. Save by hand.");
    expect(failed(run([SAVE, SAVE], snap({ kept: range(1, 20), live: 1 })))).toBe("Change 2: this save would delete version 2. Save by hand.");
  });

  it("names every version a save would delete", () => {
    expect(failed(run([SAVE], snap({ kept: [1, 2, ...range(4, 21)], latest: 21 })))).toBe("Change 1: this save would delete versions 1, 2. Save by hand.");
  });

  it("never blocks save_as_new, which starts a new timetable", () => {
    expect(lines([{ op: "save_as_new", name: "CSE copy" }, SAVE], snap({ kept: range(1, 20) }))).toEqual([
      "Save as a new timetable “CSE copy” in GNDEC",
      "Save online as version 2 of “CSE copy”",
    ]);
  });

  it("refuses a save when the versions couldn't be read", () => {
    expect(failed(run([SAVE], snap({ timetable: null, problems: ["Couldn't read the linked timetable: no connection."] })))).toBe(
      "Change 1: the linked timetable's versions couldn't be read (Couldn't read the linked timetable: no connection.). Ask again in a moment.",
    );
  });

  it("refuses a save that would conflict with a newer version online", () => {
    expect(failed(run([SAVE], snap({ link: { ...LINK, version: 6 } })))).toBe("Change 1: version 7 was saved online after this copy's version 6, so saving would conflict. Save by hand.");
  });
});

describe("save, save as new and rename", () => {
  it("save_online when not linked points to save_as_new", () => {
    expect(failed(run([SAVE], snap({ link: null, timetable: null, linkedInstitute: null, role: null })))).toBe(
      "Change 1: this working copy isn't saved online yet. Use save_as_new to save it as a new timetable.",
    );
  });

  it("save_as_new saves where the user may, and later changes refer to the new timetable", () => {
    const unlinked = snap({ link: null, timetable: null, linkedInstitute: null, role: null, saveAsInto: { instituteId: "i1", name: "GNDEC", handle: "gndec", role: "editor" } });
    expect(lines([{ op: "save_as_new", name: " CSE odd " }, { op: "rename_online", name: "CSE final" }, { op: "publish", version: 0 }], unlinked)).toEqual([
      "Save as a new timetable “CSE odd” in GNDEC",
      "Rename “CSE odd” to “CSE final” online",
      "Publish version 1 of “CSE final”: the public link shows it",
    ]);
  });

  it("checks the name", () => {
    expect(failed(run([{ op: "rename_online", name: "  " }]))).toBe("Change 1: give the timetable a name.");
    expect(failed(run([{ op: "save_as_new", name: "x".repeat(121) }]))).toBe("Change 1: the name is 121 characters long; at most 120.");
  });

  it("rename_online needs a linked timetable", () => {
    expect(failed(run([{ op: "rename_online", name: "X" }], snap({ link: null, timetable: null })))).toBe(
      "Change 1: this working copy isn't saved online yet. Use save_as_new with the name instead.",
    );
  });
});

describe("publish and make_live", () => {
  it("publish shows the newest version by default, or a kept one", () => {
    expect(lines([{ op: "publish", version: 0 }])).toEqual(["Publish version 7 of “CSE odd”: the public link shows it"]);
    expect(lines([{ op: "publish", version: 3 }])).toEqual(["Publish version 3 of “CSE odd”: the public link shows it"]);
  });

  it("publish after a save in the same proposal shows the saved version", () => {
    expect(lines([MOVE, SAVE, { op: "publish", version: 0 }])[2]).toBe("Publish version 8 of “CSE odd”: the public link shows it");
  });

  it("warns when unsaved changes aren't in the version published", () => {
    expect(passed(run([{ op: "publish", version: 0 }], snap({ dirty: true }))).lines[0].warning).toBe("Unsaved changes aren't in version 7: save online before this to include them.");
    expect(passed(run([MOVE, { op: "publish", version: 0 }])).lines[1].warning).toMatch(/^Unsaved changes/);
    expect(passed(run([MOVE, SAVE, { op: "publish", version: 0 }])).lines[2].warning).toBeUndefined();
    expect(passed(run([{ op: "publish", version: 3 }], snap({ dirty: true }))).lines[0].warning).toBeUndefined();
  });

  it("refuses a version that isn't kept", () => {
    expect(failed(run([{ op: "publish", version: 9 }], snap({ kept: [2, 5, 7] })))).toBe("Change 1: version 9 isn't kept online. Kept versions: 7, 5, 2.");
  });

  it("publish is for an unpublished timetable, make_live for a published one", () => {
    expect(failed(run([{ op: "publish", version: 0 }], snap({ live: 5 })))).toBe("Change 1: it's already published, showing version 5. Use make_live to show another version.");
    expect(failed(run([{ op: "make_live", version: 5 }]))).toBe("Change 1: it isn't published yet. Use publish.");
    expect(failed(run([{ op: "make_live", version: 5 }], snap({ live: 5 })))).toBe("Change 1: version 5 is already live.");
    expect(lines([{ op: "make_live", version: 3 }], snap({ live: 5 }))).toEqual(["Make version 3 of “CSE odd” live on the public link"]);
    expect(lines([{ op: "publish", version: 0 }, { op: "make_live", version: 3 }])).toHaveLength(2);
  });

  it("needs the institute's link name: the admin sets it by hand, an editor asks the admin", () => {
    expect(failed(run([{ op: "publish", version: 0 }], snap({ role: "admin", handle: null })))).toMatch(/no link name yet.*The user sets it by hand: Publish in the status menu asks for it\.$/);
    expect(failed(run([{ op: "publish", version: 0 }], snap({ role: "editor", handle: null })))).toMatch(/no link name yet.*Only the admin can set it, so ask the admin\.$/);
  });
});

describe("open_online", () => {
  it("opens a timetable of the active institute, warning about unsaved work", () => {
    const result = passed(run([{ op: "open_online", timetableId: "t2", version: 2 }], snap(), true));
    expect(result.lines).toEqual([{ op: "open_online", text: "Open “ME even” (version 2) from GNDEC", warning: "Your unsaved changes will be lost: the opened timetable replaces the data, locks and timetable." }]);
    expect(result.data).toEqual(base);
    expect(result.online).toEqual([{ op: "open_online", timetableId: "t2", version: 2 }]);
  });

  it("goes on its own", () => {
    for (const changes of [[MOVE, { op: "open_online", timetableId: "t2", version: 0 }], [{ op: "open_online", timetableId: "t2", version: 0 }, SAVE]]) {
      expect(failed(run(changes))).toMatch(/: open_online replaces the working copy with the opened timetable, so propose it on its own/);
    }
  });

  it("refuses an unknown timetable or version", () => {
    expect(failed(run([{ op: "open_online", timetableId: "t9", version: 0 }]))).toBe("Change 1: no timetable with id t9 in GNDEC. Use online_status to see them.");
    expect(failed(run([{ op: "open_online", timetableId: "t2", version: 4 }]))).toBe("Change 1: “ME even” has versions up to 3. Give one of those, or 0 for the latest.");
    expect(failed(run([{ op: "open_online", timetableId: "t2", version: 0 }], snap({ active: null })))).toBe("Change 1: the user has no institute to open from.");
  });
});

describe("order", () => {
  it("online changes come after every working-copy change", () => {
    expect(failed(run([SAVE, MOVE]))).toBe("Change 2: put online changes last: move comes after save_online, and online changes run once the working copy is done.");
    expect(failed(run([SAVE, { op: "regenerate" }]))).toMatch(/^Change 2: put online changes last: regenerate comes after save_online/);
  });

  it("they may follow regenerate, which runs before them", () => {
    const result = passed(run([MOVE, { op: "regenerate" }, SAVE, { op: "publish", version: 0 }]));
    expect(result.regenerate).toBe(true);
    expect(result.online).toEqual([SAVE, { op: "publish", version: 0 }]);
  });

  it("a proposal without online changes has none to run", () => {
    expect(passed(run([MOVE])).online).toEqual([]);
  });
});

describe("without an online snapshot", () => {
  it("checks only the order, and applyChanges leaves the online changes to runOnline", () => {
    const input = { summary: "x", changes: [MOVE, SAVE, { op: "publish", version: 0 }] };
    const result = passed(dryRun(input, base, { hasUnsavedWork: false }));
    expect(result.lines.slice(1).map((l) => l.text)).toEqual(["Save online", "Publish version latest"]);
    expect(applyChanges(input, base)).toEqual(result.data);
    expect(() => applyChanges({ summary: "x", changes: [SAVE, MOVE] }, base)).toThrow(/put online changes last/);
  });
});

// --- runOnline ------------------------------------------------------------------------------------------------

function fakeApi(overrides: Partial<OnlineApi> = {}) {
  return {
    list: vi.fn(async () => []),
    open: vi.fn(async () => ({ instituteId: "i1", name: "ME even", version: 3, opened: 3, data: toDoc(useAppStore.getState()) })),
    create: vi.fn(async () => ({ timetableId: "t9", version: 1 })),
    save: vi.fn(async (_id: string, _data: unknown, base: number) => base + 1),
    rename: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
    status: vi.fn(async () => ({ publicId: "k7f3q9xa2m", latestVersion: 8, liveVersion: 8 })),
    versions: vi.fn(async () => []),
    publish: vi.fn(async () => {}),
    unpublish: vi.fn(async () => {}),
    setHandle: vi.fn(async () => {}),
    ...overrides,
  } as unknown as OnlineApi & Record<keyof OnlineApi, ReturnType<typeof vi.fn>>;
}

const store = () => useAppStore.getState();
const membership = (role: Role, instituteId = "i1", name = "GNDEC"): Membership => ({ instituteId, name, role, handle: "gndec" });

describe("runOnline", () => {
  beforeEach(() => {
    store().reset();
    store().loadSample();
    store().setOnline({ ...LINK, savedHash: docHash(store()) });
    useOnline.setState({ dialog: null, saving: false, linked: null });
    useInstitutes.setState({ userId: "u1", memberships: [membership("editor")], loaded: true, rememberedId: "i1", admin: null, createOpen: false });
  });

  it("saves on the linked version and moves the link", async () => {
    const api = fakeApi();
    expect(await runOnline({ op: "save_online" }, api)).toEqual({ ok: true });
    expect(api.save).toHaveBeenCalledWith("t1", toDoc(store()), 7);
    expect(store().online).toMatchObject({ version: 8, savedHash: docHash(store()) });
    expect(useOnline.getState().saving).toBe(false);
  });

  it("returns a conflict and never overwrites", async () => {
    const api = fakeApi({ save: vi.fn(async () => Promise.reject(new SaveConflict({ latestVersion: 9, savedByName: "Meera", savedAt: null }))) });
    expect(await runOnline({ op: "save_online" }, api)).toEqual({ ok: false, reason: "Someone saved this timetable online since it was opened. Save by hand.", conflict: true });
    expect(api.save).toHaveBeenCalledTimes(1);
    expect(store().online?.version).toBe(7);
    expect(useOnline.getState().dialog).toBeNull();
  });

  it("passes an RLS refusal on in its own words", async () => {
    const api = fakeApi({ rename: vi.fn(async () => Promise.reject(new DbFailure("Only the admin can do that."))) });
    expect(await runOnline({ op: "rename_online", name: "X" }, api)).toEqual({ ok: false, reason: "Only the admin can do that." });
    expect(store().online?.name).toBe("CSE odd");
  });

  it("reports a network error without retrying", async () => {
    const offline = new DbFailure("Couldn't reach the server. Check your connection and try again.");
    const api = fakeApi({ publish: vi.fn(async () => Promise.reject(offline)) });
    expect(await runOnline({ op: "publish", version: 0 }, api)).toEqual({ ok: false, reason: offline.message });
    expect(api.publish).toHaveBeenCalledTimes(1);
    const crashed = fakeApi({ save: vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))) });
    expect(await runOnline({ op: "save_online" }, crashed)).toEqual({ ok: false, reason: "Something went wrong. Try again." });
    expect(useOnline.getState().saving).toBe(false);
  });

  it("publishes the version given, or the linked one after a save before it", async () => {
    const api = fakeApi();
    await runOnline({ op: "make_live", version: 5 }, api);
    expect(api.publish).toHaveBeenLastCalledWith("t1", 5);
    await runOnline({ op: "save_online" }, api);
    await runOnline({ op: "publish", version: 0 }, api);
    expect(api.publish).toHaveBeenLastCalledWith("t1", 8);
    expect(useOnline.getState().linked).toMatchObject({ timetableId: "t1", liveVersion: 8 });
  });

  it("saves as new where the user may save, and links to it", async () => {
    useInstitutes.setState({ memberships: [membership("viewer"), membership("admin", "i2", "PEC")] });
    const api = fakeApi();
    expect(await runOnline({ op: "save_as_new", name: " CSE copy " }, api)).toEqual({ ok: true });
    expect(api.create).toHaveBeenCalledWith("i2", "CSE copy", toDoc(store()));
    expect(store().online).toMatchObject({ instituteId: "i2", instituteName: "PEC", timetableId: "t9", name: "CSE copy", version: 1 });
  });

  it("renames and opens through the online functions", async () => {
    const api = fakeApi();
    await runOnline({ op: "rename_online", name: "CSE final" }, api);
    expect(api.rename).toHaveBeenCalledWith("t1", "CSE final");
    expect(store().online?.name).toBe("CSE final");
    expect(await runOnline({ op: "open_online", timetableId: "t2", version: 0 }, api)).toEqual({ ok: true });
    expect(api.open).toHaveBeenCalledWith("t2", undefined);
    expect(store().online).toMatchObject({ timetableId: "t2", name: "ME even", instituteName: "GNDEC", version: 3 });
    await runOnline({ op: "open_online", timetableId: "t2", version: 2 }, api);
    expect(api.open).toHaveBeenLastCalledWith("t2", 2);
  });

  it("refuses a linked change once the link is gone, or a save while another runs", async () => {
    const api = fakeApi();
    useOnline.setState({ saving: true });
    expect(await runOnline({ op: "save_online" }, api)).toEqual({ ok: false, reason: "Another save is running. Try again when it's done." });
    store().setOnline(null);
    for (const change of [{ op: "save_online" }, { op: "rename_online", name: "X" }, { op: "publish", version: 0 }] as OnlineChange[]) {
      expect(await runOnline(change, api)).toEqual({ ok: false, reason: "This working copy isn't linked to an online timetable any more." });
    }
    expect(api.save).not.toHaveBeenCalled();
  });
});
