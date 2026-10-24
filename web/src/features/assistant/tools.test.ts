import { describe, expect, it } from "vitest";
import timetableJson from "../../../../shared/fixtures/sample-timetable.json";
import { buildGrid } from "@/domain/grid";
import { sampleCollege } from "@/domain/sampleCollege";
import { score } from "@/domain/score";
import { expandSessions } from "@/domain/sessions";
import type { SolveInput, SolveResult } from "@/domain/types";
import type { RunOutcome } from "@/features/generate/generate";
import { HELP_ANCHORS } from "@/help/anchors.gen";
import { teacherCodes } from "./mask";
import { FIND_LIMIT, RESULT_LIMIT, runTool, TOOL_DEFINITIONS, type ToolData, type ToolName } from "./tools";

const timetable = timetableJson as SolveResult;
const college = (): SolveInput => structuredClone(sampleCollege);
const base: ToolData = { ...college(), result: timetable };
const codes = teacherCodes(sampleCollege.teachers);
const code = (id: string) => codes.get(id)!;

const run = (name: string, input: unknown = {}, data: ToolData = base) => JSON.parse(runTool(name, input, data).content);

/** CSE A's week as course subjects per cell (sorted), from the tool or from buildGrid. */
const subjects = (cell: unknown): string[] => {
  if (cell === null) return [];
  return (Array.isArray(cell) ? cell : [cell]).map((e: { course: string }) => e.course).sort();
};
const subjectOf = (courseId: string) => sampleCollege.courses.find((c) => c.id === courseId)!.subject;

// A partial timetable: two classes taken out, one unplaced with a cause, one with only the solver's words.
const [dropA, dropB] = ["cse-a-ds:L1", "cse-a-os:L1"];
const partialResult: SolveResult = {
  ...timetable,
  status: "partial",
  placements: timetable.placements.filter((p) => p.sessionId !== dropA && p.sessionId !== dropB),
  unplaced: [
    { sessionId: dropA, reason: "teacher busy", cause: "teacher" },
    { sessionId: dropB, reason: "Dr. Anita Sharma (t-c1) had no free slot" },
  ],
};
const partial: ToolData = { ...college(), result: partialResult };

// Can't be built: CSE A needs far too many periods, and the solver says one class has no room.
const overloaded = (): SolveInput => {
  const input = college();
  input.courses = input.courses.map((c) => (c.id === "cse-a-ds" ? { ...c, lecturesPerWeek: 40 } : c));
  return input;
};
const cantBuild: RunOutcome = {
  showFailure: true,
  failed: {
    input: overloaded(),
    failure: { kind: "infeasible", message: "No timetable exists.", diagnosis: [{ kind: "noSlot", ids: ["cse-a-ds:L1"], detail: "noRoom" }] },
  },
};
const impossible: ToolData = { ...overloaded(), result: null, outcome: cantBuild };
const couldntFinish: ToolData = {
  ...base,
  outcome: { showFailure: true, failed: { input: college(), failure: { kind: "timeout", message: "The exact solver did not answer within 25 s." } } },
};

describe("overview", () => {
  it("counts the college and matches score.ts", () => {
    const s = score(sampleCollege, timetable.placements);
    expect(run("overview")).toMatchObject({
      counts: { sections: 9, teachers: 25, rooms: 18, courses: sampleCollege.courses.length, classes: expandSessions(sampleCollege).length },
      status: "built",
      score: { total: s.total, S1: s.breakdown.subjectRepeat, S2: s.breakdown.teacherOverload, S3: s.breakdown.sectionGaps, S4: s.breakdown.batchIdle },
      placed: timetable.placements.length,
      locks: 0,
      week: { days: ["Mon", "Tue", "Wed", "Thu", "Fri"], teachingPeriods: 8, lunchCandidates: ["P4", "P5", "P6"] },
    });
  });

  it("says when nothing is generated, partial, can't be built or couldn't finish", () => {
    const none = run("overview", {}, { ...base, result: null });
    expect(none.status).toBe("not generated");
    expect(none).not.toHaveProperty("score");
    expect(run("overview", {}, partial)).toMatchObject({ status: "partial", unplaced: 2 });
    expect(run("overview", {}, impossible)).toMatchObject({ status: "can't be built", timetableKept: false });
    expect(run("overview", {}, couldntFinish)).toMatchObject({ status: "couldn't finish", timetableKept: true });
  });

  it("goes back to the stored timetable when the failure isn't on screen", () => {
    const outcome = { ...cantBuild, showFailure: false };
    expect(run("overview", {}, { ...base, outcome }).status).toBe("built");
  });

  it("counts locks", () => {
    expect(run("overview", {}, { ...base, locks: timetable.placements.slice(0, 3) }).locks).toBe(3);
  });
});

describe("schedule", () => {
  const grid = buildGrid(sampleCollege, timetable.placements);
  const matchesGrid = (kind: "section" | "teacher" | "room", id: string, timeline = grid.bySection.get(id)!) => {
    const out = run("schedule", { kind, id: kind === "teacher" ? code(id) : id });
    expect(out.days).toHaveLength(5);
    out.days.forEach((day: { cells: unknown[] }, d: number) => {
      day.cells.forEach((cell, p) => expect(subjects(cell)).toEqual(timeline[d][p].map((e) => subjectOf(e.session.courseId)).sort()));
    });
    return out;
  };

  it("matches buildGrid for a section, a teacher and a room", () => {
    matchesGrid("section", "cse-a");
    matchesGrid("teacher", "t-c1", grid.byTeacher.get("t-c1")!);
    matchesGrid("room", "lab-cse1", grid.byRoom.get("lab-cse1")!);
  });

  it("marks breaks and lunch candidates, and leaves out the field the view is about", () => {
    const out = run("schedule", { kind: "section", id: "cse-a" });
    expect(out.periods[2]).toEqual({ p: "Break", time: "10:40–11:00", break: true });
    expect(out.periods[4]).toMatchObject({ p: "P4", lunch: true });
    for (const day of out.days) expect(day.cells[2]).toBeNull();
    const first = out.days.flatMap((d: { cells: unknown[] }) => d.cells).find((c: unknown) => c && !Array.isArray(c));
    expect(first).not.toHaveProperty("section");
    expect(first.teacher).toMatch(/^T-/);
    const room = run("schedule", { kind: "room", id: "sh-1" }).days.flatMap((d: { cells: unknown[] }) => d.cells).find(Boolean);
    expect(room).toHaveProperty("section");
    expect(room).not.toHaveProperty("room");
  });

  it("flags locked classes and batch labs", () => {
    const lock = timetable.placements.find((p) => p.sessionId === "cse-a-ds:P1:B1")!;
    const out = run("schedule", { kind: "section", id: "cse-a" }, { ...base, locks: [lock] });
    const entries = out.days[lock.day].cells[lock.period];
    expect([entries].flat()).toContainEqual(expect.objectContaining({ course: "Data Structures", batch: 1, lab: true, locked: true }));
  });

  it("finds sections and rooms by name too, but teachers only by code", () => {
    expect(run("schedule", { kind: "section", id: "cse a" }).id).toBe("cse-a");
    expect(run("schedule", { kind: "teacher", id: "t-c1" }).error).toMatch(/No teacher with id t-c1\. Use find/);
    expect(run("schedule", { kind: "teacher", id: "Dr. Anita Sharma" }).error).toBeDefined();
  });

  it("errors on an unknown id or when there is no timetable", () => {
    expect(runTool("schedule", { kind: "room", id: "nope" }, base)).toEqual({
      content: JSON.stringify({ error: "No room with id nope. Use find to look it up." }),
      isError: true,
    });
    expect(run("schedule", { kind: "section", id: "cse-a" }, { ...base, result: null }).error).toMatch(/no timetable yet/);
  });
});

describe("free_periods", () => {
  it("is the complement of schedule, without breaks", () => {
    for (const [kind, id] of [["section", "cse-a"], ["teacher", code("t-c2")], ["room", "cr-cse-a"]]) {
      const week = run("schedule", { kind, id });
      const free = run("free_periods", { kind, id });
      week.days.forEach((day: { cells: unknown[] }, d: number) => {
        const expected = week.periods.filter((p: { break?: boolean }, i: number) => !p.break && day.cells[i] === null).map((p: { p: string }) => p.p);
        expect(free.days[d].free.map((f: { p: string }) => f.p)).toEqual(expected);
      });
    }
  });

  it("marks lunch candidates and narrows to one day by name", () => {
    for (const day of ["Tue", "tue", "Tuesday"]) {
      const out = run("free_periods", { kind: "section", id: "cse-a", day });
      expect(out.days.map((d: { day: string }) => d.day)).toEqual(["Tue"]);
    }
    const tue = run("free_periods", { kind: "section", id: "cse-a", day: "Tue" }).days[0].free;
    expect(tue.filter((f: { lunch?: boolean }) => f.lunch).map((f: { p: string }) => f.p)).toEqual(
      tue.map((f: { p: string }) => f.p).filter((p: string) => ["P4", "P5", "P6"].includes(p)),
    );
  });

  it("errors on an unknown day, id or a missing timetable", () => {
    expect(run("free_periods", { kind: "section", id: "cse-a", day: "Sunday" }).error).toBe("No day called Sunday. The days are Mon, Tue, Wed, Thu, Fri.");
    expect(run("free_periods", { kind: "section", id: "cse-a", day: "T" }).error).toBeDefined();
    expect(run("free_periods", { kind: "section", id: "zzz" }).error).toMatch(/No section/);
    expect(run("free_periods", { kind: "section", id: "cse-a" }, { ...base, result: null }).error).toMatch(/no timetable/);
  });

  it("notes that teachers have no availability data", () => {
    expect(run("free_periods", { kind: "teacher", id: code("t-c1") }).note).toMatch(/availability/);
  });
});

describe("problems", () => {
  it("is clean on the sample college", () => {
    expect(run("problems")).toEqual({ dataChecks: { errors: [], warnings: [], help: "/help/data#data-checks" } });
  });

  it("groups unplaced classes by cause with help links, masking the solver's words", () => {
    const out = run("problems", {}, partial);
    expect(out.unplaced).toEqual([
      { cause: "Teacher already busy", help: "/help/generate#teacher-busy", classes: ["CSE A Data Structures"] },
      { cause: "Other reasons", help: "/help/generate#other-reasons", classes: [`CSE A Operating Systems: ${code("t-c1")} (${code("t-c1")}) had no free slot`] },
    ]);
  });

  it("lists the can't-be-built causes with fixes and help links", () => {
    const out = run("problems", {}, impossible);
    expect(out.cantBeBuilt.onScreen).toBe(true);
    const [first, ...rest] = out.cantBeBuilt.causes;
    expect(first).toMatchObject({ text: expect.stringMatching(/^No room may host 1 class/), proven: true, help: "/help/generate#no-room" });
    expect(rest.map((c: { help: string }) => c.help)).toContain("/help/generate#section-load");
    const teacher = rest.find((c: { help: string }) => c.help === "/help/generate#teacher-load");
    expect(teacher.text).toMatch(new RegExp(`^${code("t-c1")} teaches`));
    expect(out.dataChecks.warnings.length).toBeGreaterThan(0);
  });

  it("gives the general suggestions when nothing specific explains it", () => {
    const outcome: RunOutcome = { showFailure: true, failed: { input: college(), failure: { kind: "infeasible", message: "No timetable exists." } } };
    const out = run("problems", {}, { ...base, outcome });
    expect(out.cantBeBuilt).toMatchObject({ causes: [], help: "/help/generate#no-single-cause" });
    expect(out.cantBeBuilt.noSingleCause.length).toBeGreaterThan(0);
  });

  it("says when the solver couldn't finish", () => {
    expect(run("problems", {}, couldntFinish).couldntFinish).toEqual({
      onScreen: true,
      message: "The exact solver did not answer within 25 s.",
      help: "/help/generate#couldnt-finish",
    });
  });

  it("reports rule violations in the stored timetable", () => {
    const [a, b] = timetable.placements;
    const clash = { ...timetable, placements: [{ ...a }, { ...b, day: a.day, period: a.period, roomId: a.roomId }, ...timetable.placements.slice(2)] };
    expect(run("problems", {}, { ...base, result: clash }).ruleViolations).toContainEqual(expect.objectContaining({ rule: "H3" }));
  });
});

describe("score_details", () => {
  it("sums to the score, in total and per rule", () => {
    const s = score(sampleCollege, timetable.placements);
    const out = run("score_details");
    expect(out.total).toBe(s.total);
    expect(out.penalties.reduce((n: number, p: { points: number }) => n + p.points, 0)).toBe(s.total);
    for (const rule of ["S1", "S2", "S3", "S4"]) {
      const one = run("score_details", { rule });
      expect(one.rules).toHaveLength(1);
      expect(one.penalties.every((p: { rule: string }) => p.rule === rule)).toBe(true);
      expect(one.penalties.reduce((n: number, p: { points: number }) => n + p.points, 0)).toBe(one.rules[0].points);
    }
  });

  it("names where each penalty is, biggest first", () => {
    const out = run("score_details", { rule: "S4" });
    expect(out.penalties[0]).toMatchObject({ rule: "S4", day: expect.any(String), periods: expect.any(Array), section: expect.any(String), batch: expect.any(Number) });
    const points = out.penalties.map((p: { points: number }) => p.points);
    expect(points).toEqual([...points].sort((a, b) => b - a));
  });

  it("shows teacher runs by code", () => {
    // Four of t-c1's lectures back to back on Monday, P3–P6 (after the break): one period beyond 3.
    const ids = ["cse-a-ds:L1", "cse-a-ds:L2", "cse-a-ds:L3", "cse-b-ds:L1"];
    const placements = [...timetable.placements.filter((p) => !ids.includes(p.sessionId)), ...ids.map((sessionId, i) => ({ sessionId, day: 0, period: 3 + i, roomId: "sh-2" }))];
    const s2 = run("score_details", { rule: "S2" }, { ...base, result: { ...timetable, placements } }).penalties;
    expect(s2).toContainEqual(expect.objectContaining({ rule: "S2", teacher: code("t-c1"), day: "Mon" }));
  });

  it("errors without a timetable", () => {
    expect(run("score_details", {}, { ...base, result: null }).error).toMatch(/no timetable/);
  });
});

describe("find", () => {
  it("finds by name or id, ignoring case", () => {
    expect(run("find", { text: "data struct" }).matches).toContainEqual({ kind: "course", id: "cse-a-ds", name: "Data Structures (CSE A)" });
    expect(run("find", { text: "CSE LAB" }).matches).toEqual([
      { kind: "room", id: "lab-cse1", name: "CSE Lab 1", type: "lab" },
      { kind: "room", id: "lab-cse2", name: "CSE Lab 2", type: "lab" },
    ]);
    expect(run("find", { text: "cse-c" }).matches[0]).toEqual({ kind: "section", id: "cse-c", name: "CSE C" });
  });

  it("finds teachers by code only, never by name", () => {
    expect(run("find", { text: code("t-c1").toLowerCase() }).matches).toEqual([{ kind: "teacher", id: code("t-c1") }]);
    const byName = run("find", { text: "Anita" });
    expect(byName.matches).toEqual([]);
    expect(byName.note).toMatch(/code/);
  });

  it("returns at most 20 and says how many more", () => {
    const out = run("find", { text: "-" });
    expect(out.matches).toHaveLength(FIND_LIMIT);
    expect(out.more).toBeGreaterThan(0);
  });

  it("errors on empty text", () => {
    expect(run("find", { text: "  " }).error).toBeDefined();
  });
});

describe("runTool", () => {
  it("errors on an unknown tool", () => {
    const out = runTool("delete_everything", {}, base);
    expect(out.isError).toBe(true);
    expect(JSON.parse(out.content).error).toMatch(/^No tool named delete_everything\. The tools are overview, schedule/);
  });

  it("errors on input that doesn't match the schema", () => {
    const cases: [string, unknown, RegExp][] = [
      ["schedule", { kind: "section" }, /Missing field "id"/],
      ["schedule", { kind: "batch", id: "x" }, /"kind" must be one of section, teacher, room/],
      ["schedule", { kind: "section", id: 3 }, /"id" must be a string/],
      ["overview", { verbose: true }, /Unknown field "verbose"\. Fields: none/],
      ["score_details", { rule: "S9" }, /must be one of S1, S2, S3, S4/],
      ["find", null, /must be an object/],
      ["find", ["x"], /must be an object/],
    ];
    for (const [name, input, message] of cases) {
      const out = runTool(name, input, base);
      expect(out.isError).toBe(true);
      expect(JSON.parse(out.content).error).toMatch(message);
    }
  });

  it("turns a crash into an error result instead of throwing", () => {
    const broken = { ...base, settings: undefined } as unknown as ToolData;
    const out = runTool("overview", {}, broken);
    expect(out.isError).toBe(true);
    expect(JSON.parse(out.content).error).toMatch(/^The overview tool failed/);
  });

  it("copes with a course whose section is gone", () => {
    const data = { ...base, courses: [...base.courses, { ...base.courses[0], id: "orphan", sectionId: "gone" }] };
    expect(runTool("overview", {}, data).isError).toBe(false);
    expect(run("problems", {}, data).dataChecks.errors).toContainEqual(expect.stringMatching(/has no section/));
  });

  it("cuts an oversized result and says how to narrow it", () => {
    const teachers = Array.from({ length: 400 }, (_, i) => ({ id: `x-${i}`, name: `Extra Teacher ${i}`, departmentId: "nowhere" }));
    const out = runTool("problems", {}, { ...base, teachers: [...base.teachers, ...teachers] });
    expect(out.content.length).toBeLessThanOrEqual(RESULT_LIMIT);
    expect(out.content).toMatch(/\[Cut: the full result is \d+ characters, over the 8000 limit\. Fix the first problems/);
    expect(out.content).not.toContain("Extra Teacher");
    expect(out.isError).toBe(false);
  });
});

describe("shared/agent-tools.json", () => {
  const handled: ToolName[] = ["overview", "schedule", "free_periods", "problems", "score_details", "find"];

  it("has a handler for every tool and a definition for every handler", () => {
    expect(TOOL_DEFINITIONS.map((d) => d.name).sort()).toEqual([...handled].sort());
    for (const name of handled) expect(JSON.parse(runTool(name, {}, base).content).error ?? "").not.toMatch(/No tool named/);
  });

  it("makes every schema strict", () => {
    for (const d of TOOL_DEFINITIONS) {
      expect(d.strict).toBe(true);
      expect(d.description.length).toBeGreaterThan(20);
      expect(d.input_schema.type).toBe("object");
      expect(d.input_schema.additionalProperties).toBe(false);
      expect(Array.isArray(d.input_schema.required)).toBe(true);
      for (const key of d.input_schema.required) expect(d.input_schema.properties).toHaveProperty(key);
      for (const prop of Object.values(d.input_schema.properties)) expect(prop.type).toBe("string");
    }
  });
});

describe("no teacher names in results", () => {
  it("sends no teacher name or id from any tool on the sample college", () => {
    const outputs: string[] = [];
    for (const data of [base, partial, impossible, couldntFinish]) {
      const call = (name: string, input: unknown = {}) => outputs.push(runTool(name, input, data).content);
      call("overview");
      call("problems");
      call("score_details");
      for (const rule of ["S1", "S2", "S3", "S4"]) call("score_details", { rule });
      for (const text of ["a", "e", "t-", "dr", "lab"]) call("find", { text });
      for (const s of sampleCollege.sections) for (const tool of ["schedule", "free_periods"]) call(tool, { kind: "section", id: s.id });
      for (const r of sampleCollege.rooms) call("schedule", { kind: "room", id: r.id });
      for (const t of sampleCollege.teachers) for (const tool of ["schedule", "free_periods"]) call(tool, { kind: "teacher", id: code(t.id) });
    }
    const all = outputs.join("\n");
    for (const t of sampleCollege.teachers) {
      expect(all).not.toContain(t.name);
      expect(all).not.toMatch(new RegExp(`(?<![\\w-])${t.id}(?![\\w])`));
      // Surnames too, in case a message ever names a teacher by part of the name.
      expect(all).not.toContain(t.name.split(" ").at(-1)!);
    }
  });

  it("links only to help anchors that exist", () => {
    const hrefs = [base, partial, impossible, couldntFinish]
      .flatMap((data) => ["overview", "problems", "score_details"].map((name) => runTool(name, {}, data).content))
      .flatMap((text) => [...text.matchAll(/"(\/help[^"]*)"/g)].map((m) => m[1]));
    expect(hrefs.length).toBeGreaterThan(5);
    for (const href of hrefs) {
      const [, page = "index", anchor] = href.match(/^\/help(?:\/(\w+))?(?:#(.+))?$/)!;
      expect(HELP_ANCHORS).toHaveProperty(page);
      if (anchor) expect(HELP_ANCHORS[page as keyof typeof HELP_ANCHORS] as readonly string[]).toContain(anchor);
    }
  });
});
