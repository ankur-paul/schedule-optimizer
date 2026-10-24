import { beforeEach, describe, expect, it, vi } from "vitest";
import { DbFailure } from "@/features/account/institutesApi";
import { useAppStore, type OnlineLink } from "@/store/useAppStore";
import { docHash, isDirty, toDoc } from "./online";
import { NotEditable, SaveConflict, type OnlineApi } from "./onlineApi";
import { createOnline, deleteOnline, openOnline, renameOnline, saveOnline, unlink, useOnline } from "./useOnline";

const notify = { info: vi.fn(), error: vi.fn() };

function fakeApi(overrides: Partial<OnlineApi> = {}) {
  return {
    list: vi.fn(async () => []),
    open: vi.fn(),
    create: vi.fn(async () => ({ timetableId: "t1", version: 1 })),
    save: vi.fn(async (_id: string, _data: unknown, base: number) => base + 1),
    rename: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
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
  useOnline.setState({ dialog: null, saving: false });
  notify.info.mockClear();
  notify.error.mockClear();
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
    const api = fakeApi({ open: vi.fn(async () => ({ instituteId: "i1", name: "CSE odd", version: 7, data })) });
    await openOnline(api, "t1", "GNDEC");
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
    const api = fakeApi({ open: vi.fn(async () => ({ instituteId: "i1", name: "X", version: 1, data: "junk" })) });
    await expect(openOnline(api, "t1", "GNDEC")).rejects.toThrow(/couldn't be read/);
    expect(hashNow()).toBe(before);
    expect(store().online).toBeNull();
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
