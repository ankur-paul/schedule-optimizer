import { describe, expect, it } from "vitest";
import { sampleCollege } from "@/domain/sampleCollege";
import { DEFAULT_SOFT_RULES } from "@/domain/score";
import type { Membership } from "@/features/account/institutes";
import { initialData, type OnlineLink, type WorkingCopy } from "@/store/useAppStore";
import {
  canEdit,
  conflictText,
  defaultInstitute,
  defaultName,
  docHash,
  editableInstitutes,
  formatWhen,
  fromDoc,
  hashText,
  hasUnsavedWork,
  isDirty,
  onlineMenu,
  parseConflict,
  roleIn,
  stableStringify,
  statusNote,
  statusText,
  toDoc,
  whenPhrase,
} from "./online";

const sample = (): WorkingCopy => {
  const { settings, departments, teachers, rooms, sections, courses } = structuredClone(sampleCollege);
  return { settings, departments, teachers, rooms, sections, courses, locks: [], result: null, printHeading: "GNDEC · Semester 5", softRules: { ...DEFAULT_SOFT_RULES, s5: true } };
};

const link: OnlineLink = {
  instituteId: "i1",
  instituteName: "GNDEC",
  timetableId: "t1",
  name: "CSE odd sem 2026",
  version: 3,
  savedHash: "abc",
};

/** Rebuilds every object with its keys in reverse order, as `jsonb` might hand them back. */
function reverseKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).reverse().map((k) => [k, reverseKeys((value as Record<string, unknown>)[k])]));
  }
  return value;
}

describe("toDoc / fromDoc", () => {
  it("round-trips the sample college, through JSON too", () => {
    const state = sample();
    state.locks = [{ sessionId: "s1", day: 0, period: 1, roomId: "r1" }] as WorkingCopy["locks"];
    expect(fromDoc(toDoc(state))).toEqual(state);
    expect(fromDoc(JSON.parse(JSON.stringify(toDoc(state))))).toEqual(state);
  });

  it("leaves the step and time limit on the device", () => {
    const doc = toDoc({ ...initialData(), step: 3, timeLimitSec: 60 } as WorkingCopy);
    expect(doc).not.toHaveProperty("step");
    expect(doc).not.toHaveProperty("timeLimitSec");
  });

  it("fills in missing tables, locks, result, heading and soft-rule switches", () => {
    const settings = { days: ["Mon"], periods: [] };
    expect(fromDoc({ settings })).toEqual({
      settings: { ...settings, lunchCandidates: [] },
      departments: [],
      teachers: [],
      rooms: [],
      sections: [],
      courses: [],
      locks: [],
      result: null,
      printHeading: "",
      softRules: DEFAULT_SOFT_RULES,
    });
  });

  it("fills the soft-rule switches a document leaves out, and ignores ones that aren't switches", () => {
    const settings = { days: ["Mon"], periods: [] };
    expect(fromDoc({ settings, softRules: { s2: false } }).softRules).toEqual({ ...DEFAULT_SOFT_RULES, s2: false });
    expect(fromDoc({ settings, softRules: { s2: "off", s9: false } }).softRules).toEqual(DEFAULT_SOFT_RULES);
    expect(fromDoc({ settings, softRules: [false] }).softRules).toEqual(DEFAULT_SOFT_RULES);
  });

  it("a switch change is an unsaved change", () => {
    const state = sample();
    expect(docHash({ ...state, softRules: { ...state.softRules, s1: false } })).not.toBe(docHash(state));
  });

  it("refuses something that isn't a timetable", () => {
    for (const bad of [null, "x", [], {}, { settings: null }, { settings: { days: "Mon", periods: [] } }]) {
      expect(() => fromDoc(bad)).toThrow(/couldn't be read/);
    }
  });
});

describe("stableStringify", () => {
  it("sorts keys at every depth and drops undefined fields like JSON does", () => {
    expect(stableStringify({ b: 1, a: { d: [1, { z: 1, y: 2 }], c: undefined } })).toBe('{"a":{"d":[1,{"y":2,"z":1}]},"b":1}');
    expect(stableStringify([undefined, null, "x"])).toBe('[null,null,"x"]');
  });
});

describe("docHash", () => {
  it("is stable, and ignores key order, the step and the time limit", () => {
    const state = sample();
    const hash = docHash(state);
    expect(docHash(sample())).toBe(hash);
    expect(docHash(reverseKeys(state) as WorkingCopy)).toBe(hash);
    expect(docHash({ ...state, step: 2, timeLimitSec: 99 } as WorkingCopy)).toBe(hash);
  });

  it("changes with any data", () => {
    const state = sample();
    const hash = docHash(state);
    expect(docHash({ ...state, printHeading: "Other" })).not.toBe(hash);
    const teachers = state.teachers.map((t, i) => (i === 0 ? { ...t, name: `${t.name}.` } : t));
    expect(docHash({ ...state, teachers })).not.toBe(hash);
  });

  it("hashes text to 14 hex digits", () => {
    expect(hashText("")).toMatch(/^[0-9a-f]{14}$/);
    expect(hashText("a")).not.toBe(hashText("b"));
  });
});

describe("dirty detection", () => {
  it("is dirty only when linked and the hash moved", () => {
    expect(isDirty(null, "x")).toBe(false);
    expect(isDirty(link, "abc")).toBe(false);
    expect(isDirty(link, "xyz")).toBe(true);
  });

  it("counts an unlinked copy as unsaved work unless it is a fresh start", () => {
    const empty = docHash(initialData());
    expect(hasUnsavedWork(null, empty, empty)).toBe(false);
    expect(hasUnsavedWork(null, docHash(sample()), empty)).toBe(true);
    expect(hasUnsavedWork(link, "abc", empty)).toBe(false);
    expect(hasUnsavedWork(link, "xyz", empty)).toBe(true);
  });
});

describe("statusText", () => {
  it("covers no link, clean, dirty, signed out and viewer", () => {
    expect(statusText(null, { dirty: false, role: null, instituteName: null })).toBe("On this device only");
    expect(statusText(link, { dirty: false, role: "editor", instituteName: "GNDEC Ludhiana" })).toBe("CSE odd sem 2026 · GNDEC Ludhiana");
    expect(statusText(link, { dirty: true, role: "admin", instituteName: "GNDEC Ludhiana" })).toBe("CSE odd sem 2026 · GNDEC Ludhiana · unsaved changes");
    // Signed out: no memberships, so the name kept in the link.
    expect(statusText(link, { dirty: true, role: null, instituteName: null })).toBe("CSE odd sem 2026 · GNDEC · unsaved changes");
    expect(statusText(link, { dirty: true, role: "viewer", instituteName: "GNDEC" })).toBe("CSE odd sem 2026 · GNDEC · view only");
  });

  it("says published before the note", () => {
    expect(statusText(link, { dirty: false, role: "editor", instituteName: "GNDEC", published: true })).toBe("CSE odd sem 2026 · GNDEC · published");
    expect(statusText(link, { dirty: true, role: "editor", instituteName: "GNDEC", published: true })).toBe("CSE odd sem 2026 · GNDEC · published · unsaved changes");
    expect(statusText(null, { dirty: false, role: null, instituteName: null, published: true })).toBe("On this device only");
  });
});

describe("statusNote", () => {
  it("puts view only before unsaved changes", () => {
    expect(statusNote({ dirty: false, role: "editor" })).toBeNull();
    expect(statusNote({ dirty: true, role: null })).toBe("unsaved changes");
    expect(statusNote({ dirty: true, role: "viewer" })).toBe("view only");
  });
});

describe("onlineMenu", () => {
  const base = { link: null, account: "ready" as const, role: null, canCreate: true, hasActive: true };

  it("signed out: only says to sign in, plus dropping a link", () => {
    expect(onlineMenu({ ...base, account: "signedOut" })).toEqual(["signInToSave"]);
    expect(onlineMenu({ ...base, account: "signedOut", link })).toEqual(["signInToSave", "unlink"]);
  });

  it("while the account loads: no online actions", () => {
    expect(onlineMenu({ ...base, account: "loading", link })).toEqual(["unlink"]);
  });

  it("no link: the first save and open", () => {
    expect(onlineMenu(base)).toEqual(["save", "open"]);
    expect(onlineMenu({ ...base, canCreate: false, hasActive: false })).toEqual([]);
  });

  it("linked editor and admin", () => {
    expect(onlineMenu({ ...base, link, role: "editor" })).toEqual(["save", "saveAs", "publish", "versions", "open", "rename", "unlink"]);
    expect(onlineMenu({ ...base, link, role: "admin" })).toEqual(["save", "saveAs", "publish", "versions", "open", "rename", "delete", "unlink"]);
  });

  it("linked viewer: no writes to that timetable", () => {
    expect(onlineMenu({ ...base, link, role: "viewer", canCreate: false })).toEqual(["versions", "open", "unlink"]);
    // An editor elsewhere may still save a copy there.
    expect(onlineMenu({ ...base, link, role: "viewer" })).toEqual(["saveAs", "versions", "open", "unlink"]);
  });

  it("linked without access: Save is offered and the server says why it can't", () => {
    expect(onlineMenu({ ...base, link, role: null })).toEqual(["save", "saveAs", "open", "unlink"]);
  });
});

describe("names and institutes", () => {
  const gndec: Membership = { instituteId: "i1", name: "GNDEC", role: "viewer", handle: null };
  const pec: Membership = { instituteId: "i2", name: "PEC", role: "editor", handle: null };
  const iit: Membership = { instituteId: "i3", name: "IIT", role: "admin", handle: null };

  it("defaults the name to the print heading, else Timetable, else a copy of the linked one", () => {
    expect(defaultName("  GNDEC · Sem 5 ")).toBe("GNDEC · Sem 5");
    expect(defaultName("   ")).toBe("Timetable");
    expect(defaultName("GNDEC", "CSE odd sem")).toBe("CSE odd sem (copy)");
    expect(defaultName("x".repeat(200))).toHaveLength(120);
  });

  it("finds roles and the institutes one may save into", () => {
    expect(roleIn([gndec, pec], "i2")).toBe("editor");
    expect(roleIn([gndec], "i9")).toBeNull();
    expect(canEdit("viewer")).toBe(false);
    expect(canEdit(null)).toBe(false);
    expect(editableInstitutes([gndec, pec, iit])).toEqual([pec, iit]);
  });

  it("starts the save dialog on the active institute when allowed there", () => {
    expect(defaultInstitute([pec, iit], "i3")).toBe("i3");
    expect(defaultInstitute([pec, iit], "i1")).toBe("i2");
    expect(defaultInstitute([], "i1")).toBeNull();
  });
});

describe("conflict detail", () => {
  const detail = JSON.stringify({ latest_version: 4, saved_by: "u2", saved_by_name: "Meera", saved_at: "2026-10-24T10:42:00+05:30" });

  it("parses a good detail", () => {
    expect(parseConflict(detail)).toEqual({ latestVersion: 4, savedByName: "Meera", savedAt: "2026-10-24T10:42:00+05:30" });
  });

  it("keeps the version when the name or time is missing", () => {
    expect(parseConflict(JSON.stringify({ latest_version: 2, saved_by_name: null, saved_at: "not a date" }))).toEqual({
      latestVersion: 2,
      savedByName: null,
      savedAt: null,
    });
  });

  it("gives null for a missing or malformed detail", () => {
    for (const bad of [undefined, null, "", "{", "[]", JSON.stringify({ latest_version: "4" }), JSON.stringify({ latest_version: 0 }), JSON.stringify({})]) {
      expect(parseConflict(bad)).toBeNull();
    }
  });

  it("says who changed it and when", () => {
    const now = new Date(2026, 9, 24, 12, 0);
    const today = new Date(2026, 9, 24, 10, 42).toISOString();
    const earlier = new Date(2026, 9, 23, 9, 5).toISOString();
    expect(conflictText({ latestVersion: 4, savedByName: "Meera", savedAt: today }, now)).toBe("Changed online by Meera at 10:42 since you opened it.");
    expect(conflictText({ latestVersion: 4, savedByName: null, savedAt: earlier }, now)).toBe("Changed online by someone on 23 Oct, 09:05 since you opened it.");
    expect(conflictText({ latestVersion: 4, savedByName: "Meera", savedAt: null }, now)).toBe("Changed online by Meera since you opened it.");
    expect(conflictText(null, now)).toBe("Someone saved this timetable online since you opened it.");
  });

  it("phrases a time for a sentence", () => {
    const now = new Date(2026, 9, 24, 12, 0);
    expect(whenPhrase(new Date(2026, 9, 24, 10, 42).toISOString(), now)).toBe("at 10:42");
    expect(whenPhrase(new Date(2026, 9, 2, 7, 0).toISOString(), now)).toBe("on 2 Oct, 07:00");
  });

  it("formats an older year with the year and no time", () => {
    expect(formatWhen(new Date(2025, 0, 3, 8, 0).toISOString(), new Date(2026, 9, 24))).toBe("3 Jan 2025");
  });
});
