import { describe, expect, it } from "vitest";
import { tinyCollege } from "@/domain/tinyCollege";
import type { Diagnosis, SolveInput } from "@/domain/types";
import { checkData, type DataReport } from "@/features/data/dataChecks";
import { explainInfeasible, GENERAL_SUGGESTIONS, preflightWarnings, topCauses, type Cause } from "./causes";

const emptyReport = (over: Partial<DataReport> = {}): DataReport => ({
  errors: [],
  warnings: [],
  sections: [],
  teachers: [],
  rooms: [],
  lunchReserved: true,
  ...over,
});

const explain = (diagnosis: Diagnosis[] | undefined, report = emptyReport(), input: SolveInput = tinyCollege) =>
  explainInfeasible(input, diagnosis, report);

describe("explainInfeasible: the solver's diagnosis", () => {
  it("noSlot noRoom names the classes and links to Rooms", () => {
    const [c] = explain([{ kind: "noSlot", detail: "noRoom", ids: ["a-ds:P1:B1", "a-ds:P1:B2"] }]);
    expect(c).toEqual({
      kind: "noSlot",
      detail: "noRoom",
      text: "No room may host 2 classes: CSE-2A DS Lab (B1) and CSE-2A DS Lab (B2).",
      fix: "Add a room they may use, or share one",
      link: { step: 2, tab: "rooms" },
      proven: true,
      over: 0,
    });
  });

  it("noSlot noStart links to the section's courses when all are from one section", () => {
    const [one] = explain([{ kind: "noSlot", detail: "noStart", ids: ["b-ph:P1"] }]);
    expect(one.text).toBe("A lab is longer than any run of teaching periods without a break: ECE-2B Physics Lab.");
    expect(one.link).toEqual({ step: 2, tab: "courses", sectionId: "b" });
    expect(one.detail).toBe("noStart");
    const [two] = explain([{ kind: "noSlot", detail: "noStart", ids: ["b-ph:P1", "a-ds:P1:B1"] }]);
    expect(two.text).toMatch(/^2 labs are longer/);
    expect(two.link).toEqual({ step: 2, tab: "courses" });
  });

  it("noSlot without a known detail still explains", () => {
    const [c] = explain([{ kind: "noSlot", ids: ["a-m:L1"] }]);
    expect(c.text).toBe("1 class can't be placed anywhere: CSE-2A Maths.");
    expect(c.link).toEqual({ step: 2, tab: "courses", sectionId: "a" });
  });

  it("badLock names the locked slot and links to clearing locks", () => {
    const input = { ...tinyCollege, locks: [{ sessionId: "a-m:L1", day: 1, period: 4, roomId: "cr1" }] };
    const [c] = explain([{ kind: "badLock", ids: ["a-m:L1"] }], emptyReport(), input);
    expect(c.text).toBe("A locked class is in a slot it can't use: CSE-2A Maths at Tue Break.");
    expect(c.link).toEqual({ step: 4, action: "clearLocks" });
    expect(c.proven).toBe(true);
  });

  it("locks is proven, locksLikely is not", () => {
    const [locks, likely] = explain([
      { kind: "locks", ids: ["a-m:L1", "b-m:L1"] },
      { kind: "locksLikely", ids: ["a-m:L1"] },
    ]);
    expect(locks).toMatchObject({ kind: "locks", proven: true, fix: "Clear all locks", link: { step: 4, action: "clearLocks" } });
    expect(locks.text).toBe("Your 2 locked classes make it impossible; without locks the timetable can be built.");
    expect(likely).toMatchObject({ kind: "locksLikely", proven: false, link: { step: 4, action: "clearLocks" } });
    expect(likely.text).toBe("Your locked class may be the cause; the check without locks ran out of time.");
  });

  it("lists at most 3 names, then how many more", () => {
    const ids = ["a-ds:L1", "a-ds:L2", "a-m:L1", "b-ph:L1", "b-ph:L2"];
    const [c] = explain([{ kind: "noSlot", detail: "noRoom", ids }]);
    expect(c.text).toBe("No room may host 5 classes: CSE-2A DS, CSE-2A DS, CSE-2A Maths and 2 more.");
  });

  it("an unknown session id shows as the id instead of crashing", () => {
    const [c] = explain([{ kind: "noSlot", detail: "noRoom", ids: ["gone:L1"] }]);
    expect(c.text).toBe("No room may host 1 class: gone:L1.");
    expect(c.link).toEqual({ step: 2, tab: "rooms" });
  });

  it("no diagnosis and no overloads → no causes", () => {
    expect(explain(undefined)).toEqual([]);
    expect(explain([])).toEqual([]);
    expect(explain([{ kind: "locks", ids: [] }])).toEqual([]);
  });
});

describe("load causes", () => {
  it("section and teacher overruns link to the filtered Courses tab", () => {
    const report = emptyReport({
      sections: [{ id: "a", name: "CSE-2A", required: 40, available: 35 }],
      teachers: [{ id: "t1", name: "Prof. R. Verma", required: 34, available: 30 }],
    });
    expect(explain([], report)).toEqual([
      {
        kind: "section",
        text: "CSE-2A needs 40 periods a week; only 35 are free after one lunch period a day.",
        fix: "Cut 5 periods of its lectures or labs",
        link: { step: 2, tab: "courses", sectionId: "a" },
        proven: true,
        over: 5,
      },
      {
        kind: "teacher",
        text: "Prof. R. Verma teaches 34 periods a week; only 30 are free after one lunch period a day.",
        fix: "Move 4 periods to another teacher",
        link: { step: 2, tab: "courses", teacherId: "t1" },
        proven: true,
        over: 4,
      },
    ]);
  });

  it("drops the lunch phrase when no lunch period is reserved, and skips loads that fit", () => {
    const report = emptyReport({
      lunchReserved: false,
      teachers: [
        { id: "t1", name: "A", required: 41, available: 40 },
        { id: "t2", name: "B", required: 40, available: 40 },
      ],
    });
    const causes = explain([], report);
    expect(causes.map((c) => c.text)).toEqual(["A teaches 41 periods a week; only 40 are free."]);
    expect(causes[0].fix).toBe("Move 1 period to another teacher");
  });

  it("room overruns: required lab, department pool and college total", () => {
    const report = emptyReport({
      rooms: [
        { scope: "labRoom", id: "lab1", name: "Electronics Lab", roomType: "lab", rooms: 1, required: 44, available: 40 },
        { scope: "department", id: "cse:lab", name: "CSE", departmentId: "cse", roomType: "lab", rooms: 2, required: 90, available: 80 },
        { scope: "college", id: "all:classroom", name: "All classrooms", roomType: "classroom", rooms: 5, required: 241, available: 200 },
      ],
    });
    expect(explain([], report).map(({ text, fix, link, over }) => ({ text, fix, link, over }))).toEqual([
      {
        text: "All sections need 241 classroom periods a week; the 5 classrooms have only 200.",
        fix: "Add 2 more classrooms",
        link: { step: 2, tab: "rooms" },
        over: 41,
      },
      {
        text: "CSE sections need 90 lab periods a week; the 2 labs they may use have only 80.",
        fix: "Add 1 more lab for CSE, or share one",
        link: { step: 2, tab: "rooms" },
        over: 10,
      },
      {
        text: "Electronics Lab is required for 44 lab periods a week; it has only 40.",
        fix: "Let 4 lab periods use any eligible lab",
        link: { step: 2, tab: "courses" },
        over: 4,
      },
    ]);
  });

  it("works on a real checkData report", () => {
    const input: SolveInput = { ...tinyCollege, courses: tinyCollege.courses.map((c) => (c.id === "a-m" ? { ...c, lecturesPerWeek: 9 } : c)) };
    const report = checkData(input, input.settings); // 2 days × (5 − 1 lunch) = 8 free
    const texts = explain([], report, input).map((c) => c.text);
    expect(texts).toEqual([
      "CSE-2A needs 13 periods a week; only 8 are free after one lunch period a day.", // 2 DS + 9 Maths + one 2-period batch lab
      "S. Rao teaches 10 periods a week; only 8 are free after one lunch period a day.",
    ]);
  });
});

describe("ordering", () => {
  const report = emptyReport({
    sections: [{ id: "a", name: "Small", required: 36, available: 35 }],
    teachers: [{ id: "t1", name: "Big", required: 45, available: 35 }],
  });

  it("proven diagnosis first, then loads by overrun (largest first), then locksLikely", () => {
    const causes = explain(
      [
        { kind: "locksLikely", ids: ["a-m:L1"] },
        { kind: "noSlot", detail: "noRoom", ids: ["a-m:L1"] },
        { kind: "badLock", ids: ["a-m:L1"] },
      ],
      report,
    );
    expect(causes.map((c) => [c.kind, c.over])).toEqual([
      ["noSlot", 0],
      ["badLock", 0],
      ["teacher", 10],
      ["section", 1],
      ["locksLikely", 0],
    ]);
  });

  it("preflightWarnings is the load part alone, in the same order", () => {
    expect(preflightWarnings(report).map((c) => c.kind)).toEqual(["teacher", "section"]);
    expect(preflightWarnings(emptyReport())).toEqual([]);
  });
});

describe("topCauses", () => {
  const causes = Array.from({ length: 7 }, (_, i): Cause => ({ kind: "teacher", text: `#${i}`, fix: "", link: { step: 2, tab: "courses" }, proven: true, over: 7 - i }));

  it("shows the first 5 and counts the rest", () => {
    const { shown, more } = topCauses(causes);
    expect(shown.map((c) => c.text)).toEqual(["#0", "#1", "#2", "#3", "#4"]);
    expect(more).toBe(2);
  });

  it("no more when everything fits; empty stays empty", () => {
    expect(topCauses(causes.slice(0, 5))).toEqual({ shown: causes.slice(0, 5), more: 0 });
    expect(topCauses([], 3)).toEqual({ shown: [], more: 0 });
  });
});

it("has the three general suggestions T18 shows when no cause is found", () => {
  expect(GENERAL_SUGGESTIONS).toHaveLength(3);
});
