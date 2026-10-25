import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Membership } from "@/features/account/institutes";
import { DbFailure } from "@/features/account/institutesApi";
import { useInstitutes } from "@/features/account/useInstitutes";
import { useAppStore, type OnlineLink } from "@/store/useAppStore";
import { docHash, isDirty, toDoc } from "./online";
import { HandleRequired, NotEditable, SaveConflict, type OnlineApi } from "./onlineApi";
import {
  createOnline,
  currentPublishState,
  deleteOnline,
  openOnline,
  pointLink,
  publishVersion,
  refreshLinked,
  renameOnline,
  saveAndPublish,
  saveOnline,
  saveVersion,
  startPublish,
  unlink,
  unpublishOnline,
  useOnline,
} from "./useOnline";

const notify = { info: vi.fn(), error: vi.fn() };

function fakeApi(overrides: Partial<OnlineApi> = {}) {
  return {
    list: vi.fn(async () => []),
    open: vi.fn(),
    create: vi.fn(async () => ({ timetableId: "t1", version: 1 })),
    save: vi.fn(async (_id: string, _data: unknown, base: number) => base + 1),
    rename: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
    status: vi.fn(async () => ({ publicId: "k7f3q9xa2m", latestVersion: 3, liveVersion: 3 })),
    versions: vi.fn(async () => []),
    publish: vi.fn(async () => {}),
    unpublish: vi.fn(async () => {}),
    setHandle: vi.fn(async () => {}),
    ...overrides,
  } as unknown as OnlineApi & Record<keyof OnlineApi, ReturnType<typeof vi.fn>>;
}

const store = () => useAppStore.getState();
const hashNow = () => docHash(store());

function linkHere(extra: Partial<OnlineLink> = {}) {
  store().setOnline({ instituteId: "i1", instituteName: "GNDEC", timetableId: "t1", name: "CSE odd", version: 3, savedHash: hashNow(), ...extra });
}

beforeEach(() => {
  store().reset();
  store().loadSample();
  useOnline.setState({ dialog: null, saving: false, linked: null });
  useInstitutes.setState({ userId: "u1", memberships: [], loaded: true, rememberedId: null, admin: null, createOpen: false });
  notify.info.mockClear();
  notify.error.mockClear();
});

describe("saveVersion", () => {
  it("saves on the linked version by default, moves the link and returns the new version", async () => {
    linkHere();
    const api = fakeApi();
    expect(await saveVersion(api, store().online!)).toBe(4);
    expect(api.save).toHaveBeenCalledWith("t1", toDoc(store()), 3);
    expect(store().online).toMatchObject({ version: 4, savedHash: hashNow() });
  });

  it("throws a conflict without a dialog, a toast or a link change", async () => {
    linkHere();
    const api = fakeApi({ save: vi.fn(async () => Promise.reject(new SaveConflict(null))) });
    await expect(saveVersion(api, store().online!)).rejects.toBeInstanceOf(SaveConflict);
    expect(useOnline.getState().dialog).toBeNull();
    expect(store().online?.version).toBe(3);
  });

  it("leaves the link alone when the copy was linked elsewhere meanwhile", async () => {
    linkHere();
    const link = store().online!;
    linkHere({ timetableId: "t2" });
    await saveVersion(fakeApi(), link);
    expect(store().online).toMatchObject({ timetableId: "t2", version: 3 });
  });
});

describe("pointLink", () => {
  it("publishes the version and reloads the linked status", async () => {
    linkHere();
    const api = fakeApi();
    await pointLink(api, "t1", 2);
    expect(api.publish).toHaveBeenCalledWith("t1", 2);
    expect(useOnline.getState().linked).toMatchObject({ timetableId: "t1", liveVersion: 3 });
  });

  it("throws a refusal, without a dialog", async () => {
    const api = fakeApi({ publish: vi.fn(async () => Promise.reject(new HandleRequired("Set the link name first."))) });
    await expect(pointLink(api, "t1", 2)).rejects.toBeInstanceOf(HandleRequired);
    expect(useOnline.getState().dialog).toBeNull();
  });
});

describe("saveOnline", () => {
  it("opens the create dialog without a link", async () => {
    const api = fakeApi();
    await saveOnline(api, notify);
    expect(useOnline.getState().dialog).toEqual({ kind: "create" });
    expect(api.save).not.toHaveBeenCalled();
  });

  it("saves on the linked version and records the new version and hash", async () => {
    linkHere();
    store().setPrintHeading("Changed");
    expect(isDirty(store().online, hashNow())).toBe(true);
    const api = fakeApi();
    await saveOnline(api, notify);
    expect(api.save).toHaveBeenCalledWith("t1", toDoc(store()), 3);
    expect(store().online).toMatchObject({ version: 4, savedHash: hashNow() });
    expect(isDirty(store().online, hashNow())).toBe(false);
    expect(notify.info).toHaveBeenCalledWith("Saved CSE odd online (version 4).");
  });

  it("records the hash of what was sent, so an edit during the save stays unsaved", async () => {
    linkHere();
    const api = fakeApi({
      save: vi.fn(async () => {
        store().setPrintHeading("Edited while saving");
        return 4;
      }),
    });
    await saveOnline(api, notify);
    expect(isDirty(store().online, hashNow())).toBe(true);
  });

  it("opens the conflict dialog on a stale base and leaves the link alone", async () => {
    linkHere();
    const before = store().online;
    const conflict = { latestVersion: 5, savedByName: "Meera", savedAt: null };
    const api = fakeApi({ save: vi.fn(async () => Promise.reject(new SaveConflict(conflict))) });
    await saveOnline(api, notify);
    expect(useOnline.getState().dialog).toEqual({ kind: "conflict", conflict });
    expect(store().online).toEqual(before);
  });

  it("overwrites by saving on the reported version", async () => {
    linkHere();
    const api = fakeApi();
    await saveOnline(api, notify, 5);
    expect(api.save).toHaveBeenCalledWith("t1", expect.anything(), 5);
    expect(store().online?.version).toBe(6);
  });

  it("offers Save as new when the timetable is gone", async () => {
    linkHere();
    const api = fakeApi({ save: vi.fn(async () => Promise.reject(new NotEditable("gone"))) });
    await saveOnline(api, notify);
    expect(useOnline.getState().dialog).toEqual({ kind: "gone", message: "gone" });
  });

  it("toasts a network error and keeps the link and data", async () => {
    linkHere();
    store().setPrintHeading("Unsaved");
    const before = { online: store().online, hash: hashNow() };
    const api = fakeApi({ save: vi.fn(async () => Promise.reject(new DbFailure("Couldn't reach the server."))) });
    await saveOnline(api, notify);
    expect(notify.error).toHaveBeenCalledWith("Couldn't save online: Couldn't reach the server.");
    expect(store().online).toEqual(before.online);
    expect(hashNow()).toBe(before.hash);
    expect(useOnline.getState().saving).toBe(false);
  });

  it("doesn't relink if the working copy was linked elsewhere during the save", async () => {
    linkHere();
    const api = fakeApi({
      save: vi.fn(async () => {
        store().setOnline(null);
        return 4;
      }),
    });
    await saveOnline(api, notify);
    expect(store().online).toBeNull();
  });
});

describe("createOnline", () => {
  it("creates version 1 and links to it, clean", async () => {
    const api = fakeApi();
    await createOnline(api, { instituteId: "i2", name: "PEC" }, " CSE odd ");
    expect(api.create).toHaveBeenCalledWith("i2", " CSE odd ", toDoc(store()));
    expect(store().online).toEqual({ instituteId: "i2", instituteName: "PEC", timetableId: "t1", name: "CSE odd", version: 1, savedHash: hashNow() });
  });

  it("throws on refusal and leaves no link", async () => {
    const api = fakeApi({ create: vi.fn(async () => Promise.reject(new DbFailure("This institute already has a timetable with that name."))) });
    await expect(createOnline(api, { instituteId: "i2", name: "PEC" }, "CSE")).rejects.toThrow(/already has/);
    expect(store().online).toBeNull();
  });
});

describe("openOnline", () => {
  it("replaces the working copy, keeps the step, and links clean", async () => {
    store().setStep(3);
    store().setTimeLimitSec(45);
    const data = { settings: { days: ["Mon"], periods: [], lunchCandidates: [] }, printHeading: "Opened" };
    const api = fakeApi({ open: vi.fn(async () => ({ instituteId: "i1", name: "CSE odd", version: 7, opened: 7, data })) });
    expect(await openOnline(api, "t1", "GNDEC")).toBe(7);
    const s = store();
    expect(s.printHeading).toBe("Opened");
    expect(s.teachers).toEqual([]);
    expect(s.step).toBe(3);
    expect(s.timeLimitSec).toBe(45);
    expect(s.online).toMatchObject({ instituteId: "i1", instituteName: "GNDEC", timetableId: "t1", name: "CSE odd", version: 7 });
    expect(isDirty(s.online, hashNow())).toBe(false);
  });

  it("leaves everything alone for unreadable data", async () => {
    const before = hashNow();
    const api = fakeApi({ open: vi.fn(async () => ({ instituteId: "i1", name: "X", version: 1, opened: 1, data: "junk" })) });
    await expect(openOnline(api, "t1", "GNDEC")).rejects.toThrow(/couldn't be read/);
    expect(hashNow()).toBe(before);
    expect(store().online).toBeNull();
  });
});

describe("opening an older version (restore)", () => {
  it("links to the latest version with unsaved changes, so Save online restores it as a new version", async () => {
    const data = { settings: { days: ["Mon"], periods: [], lunchCandidates: [] }, printHeading: "Version 5" };
    const api = fakeApi({ open: vi.fn(async () => ({ instituteId: "i1", name: "CSE odd", version: 7, opened: 5, data })) });
    expect(await openOnline(api, "t1", "GNDEC", 5)).toBe(5);
    expect(api.open).toHaveBeenCalledWith("t1", 5);
    expect(store().printHeading).toBe("Version 5");
    expect(store().online?.version).toBe(7);
    expect(isDirty(store().online, hashNow())).toBe(true);

    expect(await saveOnline(api, notify)).toBe(true);
    expect(api.save).toHaveBeenCalledWith("t1", toDoc(store()), 7);
    expect(store().online?.version).toBe(8);
    expect(isDirty(store().online, hashNow())).toBe(false);
  });
});

const gndec = (handle: string | null, role: Membership["role"] = "editor"): Membership => ({ instituteId: "i1", name: "GNDEC", role, handle });

function withInstitute(membership: Membership, admin: { name: string | null; email: string | null } | null = null) {
  useInstitutes.setState({ memberships: [membership], rememberedId: membership.instituteId, admin });
}

/** Linked, clean, with a result in the working copy. */
function linkWithResult() {
  store().setResult({ placements: [], unplaced: [], score: { total: 0, breakdown: { S1: 0, S2: 0, S3: 0, S4: 0 } }, engine: "exact" } as never);
  linkHere();
}

describe("currentPublishState", () => {
  it("reads the result, unsaved changes, role, handle and the active institute's admin", () => {
    expect(currentPublishState()).toBeNull();
    linkHere();
    withInstitute(gndec("gndec"));
    expect(currentPublishState()?.kind).toBe("noResult");
    linkWithResult();
    expect(currentPublishState()).toEqual({ kind: "ready" });
    withInstitute(gndec(null), { name: "Meera", email: "m@x.in" });
    expect(currentPublishState()).toEqual({ kind: "askAdmin", message: "Ask your admin (Meera) to set the institute's link name." });
    withInstitute(gndec(null, "admin"));
    expect(currentPublishState()).toEqual({ kind: "needsHandle" });
    store().setPrintHeading("Edited");
    expect(currentPublishState()).toEqual({ kind: "dirty" });
  });
});

describe("startPublish", () => {
  it("publishes the linked version and shows the link", async () => {
    linkWithResult();
    withInstitute(gndec("gndec"));
    const api = fakeApi();
    await startPublish(api, notify);
    expect(api.publish).toHaveBeenCalledWith("t1", 3);
    expect(useOnline.getState().dialog).toEqual({ kind: "published", url: "/gndec/k7f3q9xa2m", version: 3 });
    expect(useOnline.getState().linked).toMatchObject({ timetableId: "t1", liveVersion: 3 });
  });

  it("asks to save first with unsaved changes; Save and publish saves, then publishes the new version", async () => {
    linkWithResult();
    withInstitute(gndec("gndec"));
    store().setPrintHeading("Edited");
    const api = fakeApi();
    await startPublish(api, notify);
    expect(useOnline.getState().dialog).toEqual({ kind: "saveFirst" });
    expect(api.publish).not.toHaveBeenCalled();

    await saveAndPublish(api, notify);
    expect(api.save).toHaveBeenCalled();
    expect(api.publish).toHaveBeenCalledWith("t1", 4);
    expect(useOnline.getState().dialog).toMatchObject({ kind: "published", version: 4 });
  });

  it("doesn't publish when the save hits a conflict", async () => {
    linkWithResult();
    withInstitute(gndec("gndec"));
    store().setPrintHeading("Edited");
    const api = fakeApi({ save: vi.fn(async () => Promise.reject(new SaveConflict(null))) });
    await saveAndPublish(api, notify);
    expect(api.publish).not.toHaveBeenCalled();
    expect(useOnline.getState().dialog).toEqual({ kind: "conflict", conflict: null });
  });

  it("opens the handle dialog for the admin, carrying the publish on", async () => {
    linkWithResult();
    withInstitute(gndec(null, "admin"));
    const api = fakeApi();
    await startPublish(api, notify);
    expect(useOnline.getState().dialog).toEqual({ kind: "handle", instituteId: "i1", then: { timetableId: "t1", instituteId: "i1", version: 3, mode: "publish" } });
    expect(api.publish).not.toHaveBeenCalled();
  });

  it("tells an editor to ask the admin", async () => {
    linkWithResult();
    withInstitute(gndec(null), { name: null, email: "admin@gndec.ac.in" });
    await startPublish(fakeApi(), notify);
    expect(useOnline.getState().dialog).toEqual({ kind: "askAdmin", message: "Ask your admin (admin@gndec.ac.in) to set the institute's link name." });
  });

  it("does nothing without a result", async () => {
    linkHere();
    withInstitute(gndec("gndec"));
    const api = fakeApi();
    await startPublish(api, notify);
    expect(api.publish).not.toHaveBeenCalled();
    expect(useOnline.getState().dialog).toBeNull();
  });
});

describe("publishVersion", () => {
  const target = { timetableId: "t1", instituteId: "i1", version: 2, mode: "makeLive" as const };

  it("Make live toasts the version", async () => {
    linkHere();
    withInstitute(gndec("gndec"));
    const api = fakeApi();
    expect(await publishVersion(api, notify, target)).toBe(true);
    expect(api.publish).toHaveBeenCalledWith("t1", 2);
    expect(notify.info).toHaveBeenCalledWith("The public link now shows version 2.");
  });

  it("answers a stale handle refusal by role", async () => {
    const api = fakeApi({ publish: vi.fn(async () => Promise.reject(new HandleRequired("Ask the admin."))) });
    withInstitute(gndec("stale", "admin"));
    expect(await publishVersion(api, notify, target)).toBe(false);
    expect(useOnline.getState().dialog).toEqual({ kind: "handle", instituteId: "i1", then: target });
    withInstitute(gndec("stale", "editor"));
    await publishVersion(api, notify, target);
    expect(useOnline.getState().dialog).toEqual({ kind: "askAdmin", message: "Ask the admin." });
  });

  it("toasts other refusals", async () => {
    const api = fakeApi({ publish: vi.fn(async () => Promise.reject(new DbFailure("That version is no longer kept."))) });
    expect(await publishVersion(api, notify, target)).toBe(false);
    expect(notify.error).toHaveBeenCalledWith("Couldn't publish: That version is no longer kept.");
  });
});

describe("refreshLinked and unpublish", () => {
  it("tracks the linked timetable's live version", async () => {
    linkHere();
    const api = fakeApi();
    await refreshLinked(api);
    expect(useOnline.getState().linked).toEqual({ timetableId: "t1", publicId: "k7f3q9xa2m", latestVersion: 3, liveVersion: 3 });
    api.status.mockResolvedValue({ publicId: "k7f3q9xa2m", latestVersion: 3, liveVersion: null });
    await unpublishOnline(api, "t1");
    expect(api.unpublish).toHaveBeenCalledWith("t1");
    expect(useOnline.getState().linked?.liveVersion).toBeNull();
  });

  it("clears without a link, and keeps the old status on a failure", async () => {
    useOnline.setState({ linked: { timetableId: "t1", publicId: "x", latestVersion: 1, liveVersion: 1 } });
    await refreshLinked(fakeApi());
    expect(useOnline.getState().linked).toBeNull();
    linkHere();
    useOnline.setState({ linked: { timetableId: "t1", publicId: "x", latestVersion: 1, liveVersion: 1 } });
    await refreshLinked(fakeApi({ status: vi.fn(async () => Promise.reject(new DbFailure("offline"))) }));
    expect(useOnline.getState().linked?.liveVersion).toBe(1);
  });
});

describe("rename, delete and unlink", () => {
  it("renames the linked timetable in the link too", async () => {
    linkHere();
    await renameOnline(fakeApi(), "t1", " New name ");
    expect(store().online?.name).toBe("New name");
  });

  it("deleting the linked timetable drops the link, not the data", async () => {
    linkHere();
    const before = hashNow();
    await deleteOnline(fakeApi(), "t1");
    expect(store().online).toBeNull();
    expect(hashNow()).toBe(before);
  });

  it("deleting another timetable keeps the link", async () => {
    linkHere();
    await deleteOnline(fakeApi(), "t2");
    expect(store().online?.timetableId).toBe("t1");
  });

  it("Work on this device only keeps the data", () => {
    linkHere();
    const before = hashNow();
    unlink();
    expect(store().online).toBeNull();
    expect(hashNow()).toBe(before);
  });

  it("Start over drops the link; other edits only change the hash", () => {
    linkHere();
    store().setPrintHeading("x");
    store().loadSample();
    expect(store().online).not.toBeNull();
    store().reset();
    expect(store().online).toBeNull();
  });
});
