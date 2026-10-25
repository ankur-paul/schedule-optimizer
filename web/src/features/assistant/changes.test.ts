import { describe, expect, it } from "vitest";
import timetableJson from "../../../../shared/fixtures/sample-timetable.json";
import { sampleCollege } from "@/domain/sampleCollege";
import type { Placement, SolveResult } from "@/domain/types";
import { applyChanges, CHANGE_TOOL, dryRun, MAX_CHANGES, SCHEMA_OPS, STEP_OPS, type ChangeData, type DryRun, type Schema } from "./changes";
import { teacherCodes } from "@/domain/teacherCodes";
import { unmaskText } from "./mask";
import { runTool } from "./tools";

const timetable = timetableJson as SolveResult;
const college = (): ChangeData => {
  const { settings, departments, teachers, rooms, sections, courses } = structuredClone(sampleCollege);
  return { settings, departments, teachers, rooms, sections, courses, result: structuredClone(timetable), locks: [] };
};
const base = college();
const codes = teacherCodes(sampleCollege.teachers);
const code = (id: string) => codes.get(id)!;
const ANITA = code("t-c1"); // Dr. Anita Sharma: CSE A and CSE C Data Structures

const run = (changes: unknown[], data: ChangeData = base, hasUnsavedWork = false): DryRun => dryRun({ summary: "Test", changes }, data, { hasUnsavedWork });

function passed(result: DryRun) {
  if (!result.ok) throw new Error(`expected the proposal to pass: ${result.errors.join(" ")}`);
  return result;
}
function failed(result: DryRun): string {
  if (result.ok) throw new Error(`expected the proposal to fail: ${result.lines.map((l) => l.text).join("; ")}`);
  expect(result.errors).toHaveLength(1);
  return result.errors[0];
}
const lineOf = (changes: unknown[], data?: ChangeData) => passed(run(changes, data)).lines[0];
const dataOf = (changes: unknown[], data?: ChangeData) => passed(run(changes, data)).data;
const placement = (d: ChangeData, id: string) => d.result!.placements.find((p) => p.sessionId === id);
const at = (sessionId: string, day: number, period: number, roomId: string): Placement => ({ sessionId, day, period, roomId });

describe("data operations", () => {
  it("add, change and remove a department", () => {
    expect(lineOf([{ op: "add_department", id: "civil", name: "Civil Engineering" }]).text).toBe("Add department Civil Engineering");
    expect(dataOf([{ op: "add_department", id: "civil", name: " Civil " }]).departments.at(-1)).toEqual({ id: "civil", name: "Civil" });

    const update = [{ op: "update_department", id: "me", set: [{ field: "name", value: "Mechanical" }] }];
    expect(lineOf(update).text).toBe("Change department Mechanical Engineering: name Mechanical Engineering → Mechanical");
    expect(dataOf(update).departments.find((d) => d.id === "me")!.name).toBe("Mechanical");

    const added = [{ op: "add_department", id: "civil", name: "Civil" }, { op: "remove_department", id: "civil" }];
    expect(passed(run(added)).lines[1].text).toBe("Remove department Civil");
    expect(dataOf(added).departments).toEqual(base.departments);
  });

  it("refuses to remove a department that still has teachers, rooms or sections", () => {
    expect(failed(run([{ op: "remove_department", id: "me" }]))).toMatch(/^Change 1: department me still has \d+ teachers, \d+ rooms, \d+ sections\. Move or remove them first\.$/);
  });

  it("add a teacher, who gets a code, and give them a course in the same proposal", () => {
    const result = passed(
      run([
        { op: "add_teacher", id: "new-1", name: "Ravi Sharma", departmentId: "cse" },
        { op: "add_course", id: "cse-a-ml", sectionId: "cse-a", subject: "Machine Learning", teacherId: "new-1", lecturesPerWeek: 2, labSessionsPerWeek: 0, labLength: 0, labRoomId: "", batchTeacherIds: [] },
      ]),
    );
    const teacher = result.data.teachers.at(-1)!;
    expect(teacher).toEqual({ id: "teacher-2", name: "Ravi Sharma", departmentId: "cse" });
    expect(result.data.courses.at(-1)).toMatchObject({ id: "cse-a-ml", teacherId: "teacher-2", labRoomId: null, batchTeacherIds: null });
    const newCode = teacherCodes(result.data.teachers).get("teacher-2")!;
    expect(result.lines.map((l) => l.text)).toEqual([
      `Add teacher ${newCode} (Computer Science & Engineering)`,
      `Add course Machine Learning to CSE A: 2 lectures a week, taught by ${newCode}`,
    ]);
    // The panel unmasks the codes for display.
    expect(unmaskText(result.lines[0].text, result.data.teachers)).toBe("Add teacher Ravi Sharma (Computer Science & Engineering)");
  });

  it("refuses a new teacher id that is already a teacher's code", () => {
    expect(failed(run([{ op: "add_teacher", id: ANITA, name: "X", departmentId: "cse" }]))).toBe(`Change 1: ${ANITA} is already a teacher's code or id. Pick a new id.`);
  });

  it("changes a teacher by code, without the old name on the card", () => {
    const update = [{ op: "update_teacher", id: ANITA, set: [{ field: "name", value: "Dr. Anita S." }, { field: "departmentId", value: "ece" }] }];
    const line = lineOf(update);
    expect(line.text).toBe(`Change teacher ${ANITA}: name → "Dr. Anita S.", department Computer Science & Engineering → Electronics & Communication`);
    expect(line.text).not.toContain("Anita Sharma");
    expect(dataOf(update).teachers.find((t) => t.id === "t-c1")).toEqual({ id: "t-c1", name: "Dr. Anita S.", departmentId: "ece" });
  });

  it("refuses to remove a teacher who still teaches, naming the courses", () => {
    const error = failed(run([{ op: "remove_teacher", id: ANITA }]));
    expect(error).toMatch(new RegExp(`^Change 1: teacher ${ANITA} still teaches CSE A Data Structures, .+\\. Give those courses another teacher first\\.$`));
    expect(error).not.toContain("Anita");
  });

  it("removes a teacher once their courses have another teacher", () => {
    const free = college();
    free.courses = free.courses.map((c) => (c.teacherId === "t-c1" || c.batchTeacherIds?.includes("t-c1") ? { ...c, teacherId: "t-c2", batchTeacherIds: null } : c));
    const result = passed(run([{ op: "remove_teacher", id: ANITA }], free));
    expect(result.lines[0].text).toBe(`Remove teacher ${ANITA}`);
    expect(result.data.teachers.some((t) => t.id === "t-c1")).toBe(false);
  });

  it("add, change and remove a room", () => {
    expect(lineOf([{ op: "add_room", id: "lh-5", name: "LH-5", type: "classroom", departmentId: "" }]).text).toBe("Add classroom LH-5 (shared)");
    expect(dataOf([{ op: "add_room", id: "lab-x", name: "Lab X", type: "lab", departmentId: "cse" }]).rooms.at(-1)).toEqual({ id: "lab-x", name: "Lab X", type: "lab", departmentId: "cse" });

    const update = [{ op: "update_room", id: "sh-1", set: [{ field: "type", value: "lab" }, { field: "departmentId", value: "ece" }, { field: "name", value: "Shared 1" }] }];
    expect(lineOf(update).text).toMatch(/^Change room .+: type classroom → lab, department shared → Electronics & Communication, name .+ → Shared 1$/);
    expect(dataOf(update).rooms.find((r) => r.id === "sh-1")).toEqual({ id: "sh-1", name: "Shared 1", type: "lab", departmentId: "ece" });
    expect(failed(run([{ op: "update_room", id: "sh-1", set: [{ field: "type", value: "hall" }] }]))).toBe('Change 1: type must be classroom or lab, not "hall".');
  });

  it("removes a room, warning when classes are placed in it", () => {
    const line = lineOf([{ op: "remove_room", id: "sh-1" }]);
    expect(line.text).toMatch(/^Remove room /);
    expect(line.warning).toMatch(/^\d+ classes are placed in this room; regenerate to move them\.$/);
    expect(dataOf([{ op: "remove_room", id: "sh-1" }]).rooms.some((r) => r.id === "sh-1")).toBe(false);
    expect(lineOf([{ op: "add_room", id: "x", name: "X", type: "lab", departmentId: "" }, { op: "remove_room", id: "x" }]).warning).toBeUndefined();
  });

  it("refuses to remove a lab a course requires", () => {
    const pinned = college();
    pinned.courses = pinned.courses.map((c) => (c.id === "cse-a-ds" ? { ...c, labRoomId: "lab-cse1" } : c));
    expect(failed(run([{ op: "remove_room", id: "lab-cse1" }], pinned))).toBe("Change 1: room lab-cse1 is the required lab of CSE A Data Structures. Change their lab room first.");
  });

  it("add, change and remove a section", () => {
    expect(lineOf([{ op: "add_section", id: "cse-d", name: "CSE D", departmentId: "cse", batches: 2 }]).text).toBe("Add section CSE D (Computer Science & Engineering, 2 lab batches)");
    const update = [{ op: "update_section", id: "cse-c", set: [{ field: "batches", value: "2" }, { field: "name", value: "CSE C1" }] }];
    expect(lineOf(update).text).toBe("Change section CSE C: lab batches 1 → 2, name CSE C → CSE C1");
    expect(dataOf(update).sections.find((s) => s.id === "cse-c")).toMatchObject({ name: "CSE C1", batches: 2 });
    expect(failed(run([{ op: "update_section", id: "cse-c", set: [{ field: "batches", value: "two" }] }]))).toBe('Change 1: batches must be a whole number, like "3", not "two".');
    const removed = [{ op: "add_section", id: "cse-d", name: "CSE D", departmentId: "cse", batches: 1 }, { op: "remove_section", id: "cse-d" }];
    expect(passed(run(removed)).lines[1].text).toBe("Remove section CSE D");
  });

  it("refuses to remove a section with courses", () => {
    expect(failed(run([{ op: "remove_section", id: "cse-a" }]))).toMatch(/^Change 1: section cse-a still has \d+ courses \(CSE A Data Structures, CSE A Database Systems, CSE A Operating Systems and \d+ more\)\. Remove them first\.$/);
  });

  it("add a course with labs and batch teachers", () => {
    const change = {
      op: "add_course", id: "cse-a-ml", sectionId: "cse-a", subject: "Machine Learning", teacherId: ANITA,
      lecturesPerWeek: 3, labSessionsPerWeek: 1, labLength: 2, labRoomId: "lab-cse1", batchTeacherIds: [ANITA, code("t-c2")],
    };
    expect(lineOf([change]).text).toBe(`Add course Machine Learning to CSE A: 3 lectures and 1 2-period lab a week, taught by ${ANITA}`);
    expect(dataOf([change]).courses.at(-1)).toEqual({
      id: "cse-a-ml", sectionId: "cse-a", subject: "Machine Learning", teacherId: "t-c1",
      lecturesPerWeek: 3, labSessionsPerWeek: 1, labLength: 2, labRoomId: "lab-cse1", batchTeacherIds: ["t-c1", "t-c2"],
    });
  });

  it("changes a course field by field", () => {
    const set = [
      { field: "lecturesPerWeek", value: "4" },
      { field: "teacherId", value: code("t-c2") },
      { field: "labRoomId", value: "lab-cse2" },
      { field: "batchTeacherIds", value: `${code("t-c2")}, ${ANITA}` },
      { field: "subject", value: "DSA" },
    ];
    const line = lineOf([{ op: "update_course", id: "cse-a-ds", set }]);
    expect(line.text).toBe(
      `Change CSE A Data Structures: lectures a week 3 → 4, teacher ${ANITA} → ${code("t-c2")}, lab room any lab → CSE Lab 2, batch teachers ${ANITA}, ${code("t-c2")} → ${code("t-c2")}, ${ANITA}, subject Data Structures → DSA`,
    );
    expect(dataOf([{ op: "update_course", id: "cse-a-ds", set }]).courses.find((c) => c.id === "cse-a-ds")).toMatchObject({
      subject: "DSA", teacherId: "t-c2", lecturesPerWeek: 4, labRoomId: "lab-cse2", batchTeacherIds: ["t-c2", "t-c1"],
    });
    const cleared = dataOf([{ op: "update_course", id: "cse-a-ds", set: [{ field: "batchTeacherIds", value: "" }, { field: "labRoomId", value: "" }] }]);
    expect(cleared.courses.find((c) => c.id === "cse-a-ds")).toMatchObject({ batchTeacherIds: null, labRoomId: null });
  });

  it("removes a course", () => {
    expect(lineOf([{ op: "remove_course", id: "cse-a-os" }]).text).toBe("Remove course CSE A Operating Systems");
    expect(dataOf([{ op: "remove_course", id: "cse-a-os" }]).courses.some((c) => c.id === "cse-a-os")).toBe(false);
  });

  it("keeps the timetable and locks on data changes, as the tables do", () => {
    const locked = { ...college(), locks: [timetable.placements[0]] };
    const after = dataOf([{ op: "update_room", id: "sh-1", set: [{ field: "name", value: "S1" }] }], locked);
    expect(after.result).toEqual(locked.result);
    expect(after.locks).toEqual(locked.locks);
  });
});

describe("settings", () => {
  const week = {
    op: "set_settings",
    days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    periods: [
      { label: "P1", start: "09:00", end: "10:00", kind: "teaching" },
      { label: "P2", start: "10:00", end: "11:00", kind: "teaching" },
      { label: "Lunch", start: "11:00", end: "11:30", kind: "break" },
      { label: "P3", start: "11:30", end: "12:30", kind: "teaching" },
      { label: "P4", start: "12:30", end: "13:30", kind: "teaching" },
    ],
    lunchCandidates: ["p4", "P3"],
  };

  it("replaces the week, warning that the timetable and locks are cleared, and clears them", () => {
    const locked = { ...college(), locks: [timetable.placements[0]] };
    const result = passed(run([week], locked));
    expect(result.lines[0]).toEqual({
      op: "set_settings",
      text: "Change the week to Mon, Tue, Wed, Thu, Fri, Sat with 4 teaching periods, 09:00–13:30, lunch in P3, P4",
      warning: "Clears the timetable and all locks.",
    });
    expect(result.data.settings).toEqual({
      days: week.days,
      periods: week.periods.map((p, id) => ({ id, ...p })),
      lunchCandidates: [3, 4],
    });
    expect(result.data.result).toBeNull();
    expect(result.data.locks).toEqual([]);
  });

  it("refuses a week that step 1 wouldn't accept", () => {
    expect(failed(run([{ ...week, lunchCandidates: ["Lunch"] }]))).toBe("Change 1: Lunch is a break; lunch candidates must be teaching periods.");
    expect(failed(run([{ ...week, lunchCandidates: ["P9"] }]))).toBe("Change 1: no period called P9. Periods: P1, P2, Lunch, P3, P4.");
    expect(failed(run([{ ...week, days: ["Mon", "mon"] }]))).toBe("Change 1: a day is listed twice.");
    const backwards = { ...week, periods: week.periods.map((p, i) => (i === 1 ? { ...p, end: "09:30" } : p)) };
    expect(failed(run([backwards]))).toBe("Change 1: the week isn't valid: P2: end must be after start");
    expect(failed(run([{ ...week, lunchCandidates: [] }]))).toBe("Change 1: the week isn't valid: Pick at least one lunch candidate period.");
  });

  it("moves after a settings change fail: there is no timetable any more", () => {
    expect(failed(run([week, { op: "move", sessionId: "cse-a-ds:L1", day: "Tue", period: "P1", roomId: "" }]))).toBe(
      "Change 2: there is no timetable yet. Propose regenerate on its own first; moves, swaps and locks can follow once it has run.",
    );
  });
});

describe("moves", () => {
  // CSE A Data Structures lecture 1 is Mon P3 in CSE Room B; CSE A is free on Tue P1 and Tue P4.
  const move = (day: string, period: string, roomId = "", sessionId = "cse-a-ds:L1") => ({ op: "move", sessionId, day, period, roomId });

  it("moves a class, keeps its room when free, and locks it there", () => {
    const result = passed(run([move("tue", "p1")]));
    expect(result.lines[0].text).toBe("Move CSE A Data Structures from Mon P3 to Tue P1 · CSE Room B · locked");
    const moved = at("cse-a-ds:L1", 1, 0, "cr-cse-b");
    expect(placement(result.data, "cse-a-ds:L1")).toEqual(moved);
    expect(result.data.locks).toEqual([moved]);
    expect(result.data.result!.status).toBe("feasible"); // hand-edited: no longer known to be optimal
    expect(result.data.result!.score.total).not.toBeNaN();
  });

  it("places an unplaced class", () => {
    const partial = college();
    partial.result = { ...partial.result!, status: "partial", placements: partial.result!.placements.filter((p) => p.sessionId !== "cse-a-ds:L1"), unplaced: [{ sessionId: "cse-a-ds:L1", reason: "x" }] };
    const result = passed(run([move("Tue", "P1")], partial));
    expect(result.lines[0].text).toBe("Place CSE A Data Structures at Tue P1 · CSE Room A · locked"); // no room of its own: the first free one
    expect(result.data.result!.unplaced).toEqual([]);
    expect(result.data.result!.status).toBe("feasible");
  });

  it("H1: the teacher already teaches then, named by code", () => {
    const error = failed(run([move("Tue", "P5")]));
    expect(error).toBe(`Change 1: moving CSE A Data Structures to Tue P5 breaks H1: Teacher ${ANITA} double-booked Tue P5 (CSE A Data Structures, CSE C Data Structures)`);
  });

  it("H3: the room is taken", () => {
    expect(failed(run([move("Tue", "P4", "cr-cse-a")]))).toBe(
      "Change 1: moving CSE A Data Structures to Tue P4 breaks H3: Room CSE Room A double-booked Tue P4 (CSE A Data Structures, CSE C Discrete Mathematics)",
    );
  });

  it("H4: a room the class may not use", () => {
    expect(failed(run([move("Tue", "P1", "lab-cse1")]))).toMatch(/^Change 1: moving CSE A Data Structures to Tue P1 breaks H4: .+ can't use CSE Lab 1: needs a classroom$/);
  });

  it("H6: a lab that runs into the break", () => {
    expect(failed(run([move("Mon", "P2", "", "cse-a-ds:P1:B1")]))).toBe(
      "Change 1: moving CSE A Data Structures Lab (B1) to Mon P2 breaks H6: CSE A Data Structures Lab (B1) at Mon P2 needs 2 consecutive teaching periods",
    );
  });

  it("H7: a break", () => {
    expect(failed(run([move("Mon", "Break")]))).toBe("Change 1: moving CSE A Data Structures to Mon Break breaks H7: CSE A Data Structures placed in Mon Break, which is a break");
  });

  it("H2: the section already has a class then", () => {
    expect(failed(run([move("Tue", "P8")]))).toMatch(/^Change 1: moving CSE A Data Structures to Tue P8 breaks H2: Section CSE A double-booked Tue P8/);
  });

  it("names an unknown class, day, period or room", () => {
    expect(failed(run([move("Tue", "P1", "", "nope")]))).toBe("Change 1: no class with id nope. Use schedule to see a section's classes.");
    expect(failed(run([move("Sun", "P1")]))).toBe("Change 1: no day called Sun. Days: Mon, Tue, Wed, Thu, Fri.");
    expect(failed(run([move("Tue", "P9")]))).toBe("Change 1: no period called P9. Periods: P1, P2, Break, P3, P4, P5, P6, P7, P8.");
    expect(failed(run([move("Tue", "P1", "LH5")]))).toBe("Change 1: no room with id LH5. Use find.");
  });

  it("needs a timetable", () => {
    expect(failed(run([move("Tue", "P1")], { ...college(), result: null }))).toMatch(/^Change 1: there is no timetable yet\./);
  });

  it("sees earlier changes: add a room, then move into it; the other way round fails", () => {
    const room = { op: "add_room", id: "lh-5", name: "LH-5", type: "classroom", departmentId: "" };
    const result = passed(run([room, move("Tue", "P1", "lh-5")]));
    expect(result.lines.map((l) => l.text)).toEqual(["Add classroom LH-5 (shared)", "Move CSE A Data Structures from Mon P3 to Tue P1 · LH-5 · locked"]);
    expect(placement(result.data, "cse-a-ds:L1")!.roomId).toBe("lh-5");
    expect(failed(run([move("Tue", "P1", "lh-5"), room]))).toBe("Change 1: no room with id lh-5. Use find.");
  });

  it("takes the class ids the schedule tool shows", () => {
    const week = JSON.parse(runTool("schedule", { kind: "section", id: "cse-a" }, base).content);
    const cell = week.days[0].cells[3]; // Mon P3
    expect(cell).toMatchObject({ session: "cse-a-ds:L1", course: "Data Structures" });
    expect(passed(run([move("Tue", "P1", "", cell.session)])).lines[0].text).toMatch(/^Move CSE A Data Structures from Mon P3/);
  });

  it("a second move of the same class sees the first", () => {
    const result = passed(run([move("Tue", "P1"), move("Tue", "P4")]));
    // CSE Room B is busy on Tue P4, so it takes the next free room.
    expect(result.lines[1].text).toBe("Move CSE A Data Structures from Tue P1 to Tue P4 · CSE Room C · locked");
    expect(result.data.locks).toEqual([at("cse-a-ds:L1", 1, 4, "cr-cse-c")]);
  });
});

describe("swap", () => {
  it("swaps two classes and locks both", () => {
    const result = passed(run([{ op: "swap", a: "cse-a-ds:L1", b: "cse-a-os:L2" }]));
    expect(result.lines[0].text).toBe("Swap CSE A Data Structures (Mon P3) and CSE A Operating Systems (Wed P3) · both locked");
    const [ds, os] = [placement(base, "cse-a-ds:L1")!, placement(base, "cse-a-os:L2")!];
    expect(placement(result.data, "cse-a-ds:L1")).toMatchObject({ day: os.day, period: os.period });
    expect(placement(result.data, "cse-a-os:L2")).toMatchObject({ day: ds.day, period: ds.period });
    expect(result.data.locks.map((l) => l.sessionId).sort()).toEqual(["cse-a-ds:L1", "cse-a-os:L2"]);
  });

  it("H1: a teacher busy in the other slot", () => {
    expect(failed(run([{ op: "swap", a: "cse-a-dm:L1", b: "cse-a-dbms:L1" }]))).toMatch(/^Change 1: swapping CSE A Discrete Mathematics and CSE A Database Systems breaks H1: Teacher T-\w{5} double-booked Mon P2/);
  });

  it("H2: a lab swapped into a lecture's slot overlaps the next class", () => {
    expect(failed(run([{ op: "swap", a: "cse-a-ds:L1", b: "cse-a-ds:P1:B1" }]))).toBe(
      "Change 1: swapping CSE A Data Structures and CSE A Data Structures Lab (B1) breaks H2: Section CSE A double-booked Mon P5 (CSE A Data Structures, CSE A Engineering Physics Lab (B2))",
    );
  });

  it("refuses a class with itself or an unplaced class", () => {
    expect(failed(run([{ op: "swap", a: "cse-a-dm:L1", b: "cse-a-dm:L1" }]))).toBe("Change 1: a and b are the same class.");
    const partial = college();
    partial.result = { ...partial.result!, placements: partial.result!.placements.filter((p) => p.sessionId !== "cse-a-dm:L1") };
    expect(failed(run([{ op: "swap", a: "cse-a-dm:L1", b: "cse-a-dbms:L1" }], partial))).toBe("Change 1: CSE A Discrete Mathematics isn't placed; use move to place it.");
  });
});

describe("lock and unlock", () => {
  it("locks a placed class where it is, and unlocks it", () => {
    const result = passed(run([{ op: "lock", sessionId: "cse-a-ds:L1" }]));
    expect(result.lines[0].text).toBe("Lock CSE A Data Structures at Mon P3");
    expect(result.data.locks).toEqual([placement(base, "cse-a-ds:L1")]);
    const unlocked = passed(run([{ op: "unlock", sessionId: "cse-a-ds:L1" }], result.data));
    expect(unlocked.lines[0].text).toBe("Unlock CSE A Data Structures (Mon P3)");
    expect(unlocked.data.locks).toEqual([]);
  });

  it("refuses to lock twice, to lock an unplaced class, or to unlock one that isn't locked", () => {
    const locked = dataOf([{ op: "lock", sessionId: "cse-a-ds:L1" }]);
    expect(failed(run([{ op: "lock", sessionId: "cse-a-ds:L1" }], locked))).toBe("Change 1: CSE A Data Structures is already locked.");
    expect(failed(run([{ op: "unlock", sessionId: "cse-a-ds:L1" }]))).toBe("Change 1: CSE A Data Structures isn't locked.");
    const partial = college();
    partial.result = { ...partial.result!, placements: partial.result!.placements.filter((p) => p.sessionId !== "cse-a-ds:L1") };
    expect(failed(run([{ op: "lock", sessionId: "cse-a-ds:L1" }], partial))).toBe("Change 1: CSE A Data Structures isn't placed; use move to place it, which locks it too.");
  });

  it("refuses to lock a class that breaks a hard rule where it is", () => {
    const broken = college();
    // Put CSE A Data Structures on top of CSE A Database Systems (Mon P2).
    broken.result = { ...broken.result!, placements: broken.result!.placements.map((p) => (p.sessionId === "cse-a-ds:L1" ? { ...p, period: 1 } : p)) };
    expect(failed(run([{ op: "lock", sessionId: "cse-a-ds:L1" }], broken))).toMatch(/^Change 1: CSE A Data Structures can't be locked where it is: it breaks H\d: /);
  });
});

describe("regenerate and load_sample", () => {
  it("regenerate changes nothing and marks the run, naming the locks it keeps", () => {
    const result = passed(run([{ op: "lock", sessionId: "cse-a-ds:L1" }, { op: "regenerate" }]));
    expect(result.lines[1]).toEqual({ op: "regenerate", text: "Regenerate (keep 1 locked)" });
    expect(result.regenerate).toBe(true);
    expect(passed(run([{ op: "regenerate" }])).data).toEqual(base);
    expect(passed(run([{ op: "lock", sessionId: "cse-a-ds:L1" }])).regenerate).toBe(false);
  });

  it("regenerate goes last", () => {
    expect(failed(run([{ op: "regenerate" }, { op: "lock", sessionId: "cse-a-ds:L1" }]))).toBe(
      "Change 2: regenerate runs after the other working-copy changes are made, so put it after them; only online changes may follow it.",
    );
    expect(failed(run([{ op: "regenerate" }, { op: "regenerate" }]))).toMatch(/^Change 2: regenerate runs after/);
  });

  it("load_sample replaces the working copy, warning only when that loses work", () => {
    const empty: ChangeData = { ...college(), departments: [], teachers: [], rooms: [], sections: [], courses: [], result: null };
    const result = passed(run([{ op: "load_sample" }], empty, true));
    expect(result.lines[0]).toEqual({ op: "load_sample", text: "Load the sample college", warning: "Your unsaved changes will be lost: the sample college replaces the data, locks and timetable." });
    expect(result.data).toEqual({ ...college(), result: null });
    expect(passed(run([{ op: "load_sample" }], empty, false)).lines[0].warning).toBeUndefined();
  });

  it("changes after load_sample refer to the sample", () => {
    const empty: ChangeData = { ...college(), departments: [], teachers: [], rooms: [], sections: [], courses: [], result: null };
    const result = passed(run([{ op: "load_sample" }, { op: "update_course", id: "cse-a-ds", set: [{ field: "teacherId", value: code("t-c2") }] }], empty));
    expect(result.data.courses.find((c) => c.id === "cse-a-ds")!.teacherId).toBe("t-c2");
  });
});

describe("set_soft_rules", () => {
  const allOn = { s1: true, s2: true, s3: true, s4: true, s5: true };
  const s5Off: ChangeData = { ...college(), softRules: { ...allOn, s5: false } };

  it("turns rules on and off, naming them as aims; the switches it leaves out stay", () => {
    const result = passed(run([{ op: "set_soft_rules", set: [{ rule: "S5", on: true }, { rule: "S2", on: false }] }], s5Off));
    expect(result.lines[0]).toEqual({ op: "set_soft_rules", text: "Turn on: Finish each day as early as possible · Turn off: At most 3 periods in a row for a teacher" });
    expect(result.data.softRules).toEqual({ ...allOn, s2: false });
    expect(result.regenerate).toBe(false);
  });

  it("keeps the timetable and locks, re-scored under the new switches", () => {
    const locked = passed(run([{ op: "lock", sessionId: "cse-a-ds:L1" }], s5Off)).data;
    const data = dataOf([{ op: "set_soft_rules", set: [{ rule: "S5", on: true }] }], locked);
    expect(data.result!.placements).toBe(locked.result!.placements);
    expect(data.locks).toEqual(locked.locks);
    expect(data.result!.score).toEqual(timetable.score);
    const off = dataOf([{ op: "set_soft_rules", set: [{ rule: "S5", on: false }] }]);
    expect(off.result!.score.breakdown.lateFinish).toBeNull();
    expect(off.result!.score.total).toBe(timetable.score.total - timetable.score.breakdown.lateFinish!);
  });

  it("works without a timetable, and from data with no switches (the defaults)", () => {
    const data = dataOf([{ op: "set_soft_rules", set: [{ rule: "S1", on: false }] }], { ...college(), result: null });
    expect(data.softRules).toEqual({ ...allOn, s1: false });
    expect(data.result).toBeNull();
  });

  it("goes before regenerate, which then runs with the new switches", () => {
    const result = passed(run([{ op: "set_soft_rules", set: [{ rule: "S5", on: true }] }, { op: "regenerate" }], s5Off));
    expect(result.regenerate).toBe(true);
    expect(failed(run([{ op: "regenerate" }, { op: "set_soft_rules", set: [{ rule: "S5", on: true }] }], s5Off))).toMatch(/^Change 2: regenerate runs after/);
  });

  it("fails when nothing would change, so the model explains instead", () => {
    expect(failed(run([{ op: "set_soft_rules", set: [{ rule: "S5", on: true }] }]))).toBe("Change 1: nothing changes: S5 is already on.");
    expect(failed(run([{ op: "set_soft_rules", set: [{ rule: "S5", on: false }, { rule: "S1", on: true }] }], s5Off))).toBe(
      "Change 1: nothing changes: S5 is already off, S1 is already on.",
    );
  });

  it("checks the input against the definition", () => {
    expect(failed(run([{ op: "set_soft_rules", set: [{ rule: "S6", on: true }] }]))).toMatch(/"set\[0\]\.rule" must be one of S1, S2, S3, S4, S5/);
    expect(failed(run([{ op: "set_soft_rules", set: [{ rule: "S5", on: "yes" }] }]))).toMatch(/"set\[0\]\.on" must be true or false/);
    expect(failed(run([{ op: "set_soft_rules", set: [] }]))).toMatch(/"set" needs at least 1 item/);
  });

  it("load_sample keeps the switches, as the store does", () => {
    expect(dataOf([{ op: "load_sample" }], s5Off).softRules).toEqual(s5Off.softRules);
  });
});

describe("new data checks", () => {
  it("lists checks the changes cause, with teachers as codes", () => {
    const result = passed(run([{ op: "update_course", id: "cse-a-ds", set: [{ field: "lecturesPerWeek", value: "40" }, { field: "subject", value: "" }] }]));
    expect(result.warnings).toEqual([
      { level: "error", text: 'Course "(no subject)" (CSE A) has no subject.' },
    ]);
    const busy = passed(run([{ op: "update_course", id: "cse-a-ds", set: [{ field: "lecturesPerWeek", value: "40" }] }]));
    expect(busy.warnings.map((w) => w.level)).toEqual(["warning", "warning"]);
    expect(busy.warnings[0].text).toMatch(/^Section "CSE A" needs \d+ periods a week but only \d+ are free\.$/);
    expect(busy.warnings[1].text).toMatch(new RegExp(`^${ANITA} teaches \\d+ periods a week`));
  });

  it("doesn't repeat checks that were there before", () => {
    const overloaded = college();
    overloaded.courses = overloaded.courses.map((c) => (c.id === "cse-a-ds" ? { ...c, lecturesPerWeek: 40 } : c));
    expect(passed(run([{ op: "update_room", id: "sh-1", set: [{ field: "name", value: "S1" }] }], overloaded)).warnings).toEqual([]);
    // CSE A was already overloaded; only CSE B's new overload is listed.
    const more = passed(run([{ op: "update_course", id: "cse-b-ds", set: [{ field: "lecturesPerWeek", value: "40" }] }], overloaded));
    const sections = more.warnings.filter((w) => w.text.startsWith("Section"));
    expect(sections).toHaveLength(1);
    expect(sections[0].text).toMatch(/^Section "CSE B" needs/);
  });

  it("moves cause none", () => {
    expect(passed(run([{ op: "move", sessionId: "cse-a-ds:L1", day: "Tue", period: "P1", roomId: "" }])).warnings).toEqual([]);
  });
});

describe("bad input", () => {
  it("unknown ids, with a hint", () => {
    expect(failed(run([{ op: "update_room", id: "LH5", set: [{ field: "name", value: "x" }] }]))).toBe("Change 1: no room with id LH5. Use find.");
    expect(failed(run([{ op: "add_teacher", id: "n", name: "X", departmentId: "civil" }]))).toBe(
      "Change 1: no department with id civil. Departments: cse (Computer Science & Engineering), ece (Electronics & Communication), me (Mechanical Engineering).",
    );
    expect(failed(run([{ op: "update_course", id: "cse-a-ds", set: [{ field: "teacherId", value: "T-NOPE1" }] }]))).toBe("Change 1: no teacher with code T-NOPE1. Use find with the teacher's code.");
    // A real teacher id isn't accepted, and isn't echoed: imported ids are slugs of names.
    expect(failed(run([{ op: "update_course", id: "cse-a-ds", set: [{ field: "teacherId", value: "t-c1" }] }]))).toBe(`Change 1: no teacher with code ${ANITA}. Use find with the teacher's code.`);
    expect(failed(run([{ op: "add_room", id: "sh-1", name: "x", type: "lab", departmentId: "" }]))).toBe("Change 1: a room with id sh-1 already exists. Pick a new id.");
  });

  it("the failing change's number, after earlier ones that passed", () => {
    expect(failed(run([{ op: "lock", sessionId: "cse-a-ds:L1" }, { op: "remove_course", id: "nope" }]))).toBe("Change 2: no course with id nope. Use find.");
  });

  it("schema mismatches, each with the change and the field", () => {
    const result = run([
      { op: "move", sessionId: "cse-a-ds:L1", day: 2, period: "P1", roomId: "" },
      { op: "teleport" },
      { op: "lock" },
      { op: "lock", sessionId: "x", why: "y" },
      { op: "update_course", id: "cse-a-ds", set: [{ field: "colour", value: "red" }] },
      { op: "add_section", id: "x", name: "X", departmentId: "cse", batches: 1.5 },
      "move",
    ]);
    expect(result).toEqual({
      ok: false,
      errors: [
        'Change 1 (move): "day" must be a string.',
        `Change 2: unknown op "teleport". Ops: ${SCHEMA_OPS.join(", ")}.`,
        'Change 3 (lock): Missing field "sessionId".',
        'Change 4 (lock): An unknown field "why". Fields: op, sessionId.',
        'Change 5 (update_course): "set[0].field" must be one of sectionId, subject, teacherId, lecturesPerWeek, labSessionsPerWeek, labLength, labRoomId, batchTeacherIds.',
        'Change 6 (add_section): "batches" must be a whole number.',
        `Change 7: no "op". Ops: ${SCHEMA_OPS.join(", ")}.`,
      ],
    });
    expect(run([{ op: "update_room", id: "sh-1", set: [] }])).toEqual({ ok: false, errors: ['Change 1 (update_room): "set" needs at least 1 item.'] });
  });

  it("lists at most 10 schema problems", () => {
    const result = run(Array.from({ length: 12 }, () => ({ op: "lock" })));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.at(-1)).toBe("…and 2 more.");
    if (!result.ok) expect(result.errors).toHaveLength(11);
  });

  it(`more than ${MAX_CHANGES} changes, or none`, () => {
    const lock = { op: "lock", sessionId: "cse-a-ds:L1" };
    expect(run(Array.from({ length: 101 }, () => lock))).toEqual({ ok: false, errors: ["101 changes is too many: at most 100 per proposal. Propose the rest after these are applied."] });
    expect(run([])).toEqual({ ok: false, errors: ["Give at least one change."] });
  });

  it("never throws", () => {
    const inputs = [null, "x", 3, [], {}, { summary: "x" }, { summary: 1, changes: [] }, { summary: "x", changes: "all" }, { summary: "x", changes: [null] }, { summary: "x", changes: [], extra: 1 }];
    for (const input of inputs) expect(dryRun(input, base, { hasUnsavedWork: false }).ok).toBe(false);
    expect(dryRun(null, base, { hasUnsavedWork: false })).toEqual({ ok: false, errors: ["The input must be an object."] });
    expect(dryRun({ summary: "x" }, base, { hasUnsavedWork: false })).toEqual({ ok: false, errors: ['Missing field "changes".'] });
    // Broken data from the tables: a course whose section is gone.
    const broken = college();
    broken.courses = [...broken.courses, { ...broken.courses[0], id: "orphan", sectionId: "gone" }];
    expect(passed(run([{ op: "move", sessionId: "cse-a-ds:L1", day: "Tue", period: "P1", roomId: "" }], broken)).lines).toHaveLength(1);
    expect(() => run([{ op: "move", sessionId: "orphan:L1", day: "Tue", period: "P1", roomId: "" }], broken)).not.toThrow();
  });

  it("doesn't change the data it was given", () => {
    const data = college();
    const copy = structuredClone(data);
    run([{ op: "move", sessionId: "cse-a-ds:L1", day: "Tue", period: "P1", roomId: "" }, { op: "remove_course", id: "cse-a-os" }, { op: "load_sample" }], data);
    expect(data).toEqual(copy);
  });
});

describe("applyChanges", () => {
  it("gives the dry run's copy", () => {
    const input = {
      summary: "Room for Data Structures",
      changes: [
        { op: "add_room", id: "lh-5", name: "LH-5", type: "classroom", departmentId: "" },
        { op: "move", sessionId: "cse-a-ds:L1", day: "Tue", period: "P1", roomId: "lh-5" },
        { op: "update_course", id: "cse-a-os", set: [{ field: "lecturesPerWeek", value: "4" }] },
        { op: "regenerate" },
      ],
    };
    const result = passed(dryRun(input, base, { hasUnsavedWork: true }));
    expect(applyChanges(input, base)).toEqual(result.data);
  });

  it("throws on a proposal that no longer passes", () => {
    expect(() => applyChanges({ summary: "x", changes: [{ op: "remove_course", id: "nope" }] }, base)).toThrow("Change 1: no course with id nope. Use find.");
  });
});

describe("the tool definition", () => {
  const objects = (schema: Schema): Schema[] => [
    ...(schema.type === "object" ? [schema] : []),
    ...Object.values(schema.properties ?? {}).flatMap(objects),
    ...(schema.items ? objects(schema.items) : []),
    ...(schema.anyOf ?? []).flatMap(objects),
  ];

  it("is not strict, but closed with every field required, so parseProposal checks what strict mode would", () => {
    expect(CHANGE_TOOL.name).toBe("propose_changes");
    // Strict, the API refuses it: "The compiled grammar is too large" (T44). parseProposal enforces the schema instead.
    expect(CHANGE_TOOL.strict).toBe(false);
    for (const o of objects(CHANGE_TOOL.input_schema)) {
      expect(o.additionalProperties).toBe(false);
      expect([...(o.required ?? [])].sort()).toEqual(Object.keys(o.properties ?? {}).sort());
    }
  });

  it("every op has a step and every step an op", () => {
    expect([...SCHEMA_OPS].sort()).toEqual([...STEP_OPS].sort());
    expect(new Set(SCHEMA_OPS).size).toBe(SCHEMA_OPS.length);
  });

  it("uses only what strict mode supports", () => {
    const text = JSON.stringify(CHANGE_TOOL);
    for (const unsupported of ["minimum", "maximum", "maxItems", "minLength", "maxLength", "pattern", "$ref"]) expect(text).not.toContain(`"${unsupported}"`);
    expect(text.match(/"minItems":\s*(\d+)/g)?.every((m) => /[01]$/.test(m))).toBe(true);
  });
});
