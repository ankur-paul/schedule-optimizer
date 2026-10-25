import { describe, expect, it } from "vitest";
import { sampleCollege } from "@/domain/sampleCollege";
import type { Placement } from "@/domain/types";
import type { AppData } from "@/store/useAppStore";
import type { SolveFailure } from "@/engine/solveClient";
import {
  badgeText,
  buildSolveInput,
  couldntFinishText,
  engineLabel,
  generateBlockers,
  generateFooterNote,
  generateView,
  newSeed,
  nextTimeLimit,
  partialHow,
  regenerateFailedText,
  regenerateSummary,
  rememberLimit,
  TIME_LIMIT,
  unplacedGroups,
  type GenerateViewInput,
} from "./generate";

const lock: Placement = { sessionId: "cse-a-ds:L1", day: 0, period: 0, roomId: "cr-cse-a" };
const data: AppData = {
  ...structuredClone(sampleCollege),
  result: null,
  locks: [lock],
  step: 2,
  printHeading: "",
  softRules: { s1: true, s2: false, s3: true, s4: true, s5: true },
};

describe("buildSolveInput", () => {
  it("passes the college data, locks, options and soft-rule switches through, and nothing else", () => {
    const input = buildSolveInput(data, { timeLimitSec: 15, seed: 3 });
    expect(input.locks).toEqual([lock]);
    expect(input.softRules).toEqual(data.softRules);
    expect(input.options).toEqual({ timeLimitSec: 15, seed: 3 });
    expect(input.courses).toBe(data.courses);
    expect(Object.keys(input).sort()).toEqual(
      ["courses", "departments", "locks", "options", "rooms", "sections", "settings", "softRules", "teachers"].sort(),
    );
  });
});

describe("generateBlockers", () => {
  it("is empty for the sample college", () => {
    expect(generateBlockers(data)).toEqual([]);
  });

  it("asks for courses, rooms and teachers in that order", () => {
    expect(generateBlockers({ ...data, courses: [] })[0]).toMatch(/courses/);
    expect(generateBlockers({ ...data, rooms: [] })[0]).toMatch(/room/);
    expect(generateBlockers({ ...data, teachers: [] })[0]).toMatch(/teachers/);
  });

  it("flags a week with no days or no teaching periods", () => {
    expect(generateBlockers({ ...data, settings: { ...data.settings, days: [] } })[0]).toMatch(/step ①/);
    const breaksOnly = data.settings.periods.map((p) => ({ ...p, kind: "break" as const }));
    expect(generateBlockers({ ...data, settings: { ...data.settings, periods: breaksOnly } })[0]).toMatch(/step ①/);
  });
});

describe("badgeText", () => {
  const ok = { ok: true, violations: [], missing: [] };
  it("matches the PLAN wording for a complete and a partial timetable", () => {
    expect(badgeText({ unplaced: [] }, ok)).toBe("✓ Timetable ready · 0 clashes (independently checked)");
    expect(badgeText({ unplaced: [{ sessionId: "x", reason: "r" }, { sessionId: "y", reason: "r" }] }, ok)).toBe(
      "Partial: 2 classes not placed · 0 clashes among placed classes",
    );
    expect(badgeText({ unplaced: [{ sessionId: "x", reason: "r" }] }, ok)).toMatch(/^Partial: 1 class not placed/);
  });

  it("counts violations with correct plurals", () => {
    const v = { rule: "H1" as const, message: "x", sessionIds: [] };
    expect(badgeText({ unplaced: [] }, { ok: false, violations: [v], missing: [] })).toBe("✗ 1 rule violation found");
    expect(badgeText({ unplaced: [] }, { ok: false, violations: [v, v], missing: [] })).toBe("✗ 2 rule violations found");
  });
});

describe("engineLabel / newSeed", () => {
  it("names engines in the coordinator's words", () => {
    expect(engineLabel({ engine: "cpsat" })).toBe("Exact solver");
    expect(engineLabel({ engine: "heuristic" })).toBe("Quick draft");
  });

  it("returns a non-negative int32", () => {
    for (let i = 0; i < 100; i++) {
      const s = newSeed();
      expect(Number.isInteger(s) && s >= 0 && s < 2 ** 31).toBe(true);
    }
  });
});

describe("nextTimeLimit", () => {
  it("doubles up to 120 s, then there is no next", () => {
    expect(nextTimeLimit(20)).toBe(40);
    expect(nextTimeLimit(5)).toBe(10);
    expect(nextTimeLimit(80)).toBe(120);
    expect(nextTimeLimit(120)).toBeNull();
  });
});

describe("rememberLimit", () => {
  it("keeps a retry's longer limit once it finishes with a timetable", () => {
    expect(rememberLimit(TIME_LIMIT.default, 40, true)).toBe(40);
    expect(rememberLimit(40, 80, true)).toBe(80);
  });

  it("keeps the old limit after a timeout or another failure", () => {
    expect(rememberLimit(TIME_LIMIT.default, 40, false)).toBe(20);
    expect(rememberLimit(40, 80, false)).toBe(40);
  });

  it("keeps it after a plain Generate, which has no retry limit", () => {
    expect(rememberLimit(40, undefined, true)).toBe(40);
    expect(rememberLimit(20, undefined, false)).toBe(20);
  });
});

describe("generateView", () => {
  const placed = { sessionId: "p", day: 0, period: 0, roomId: "r" };
  const complete = { engine: "cpsat" as const, status: "optimal" as const, placements: [placed], unplaced: [] };
  const partial = { engine: "heuristic" as const, status: "partial" as const, placements: [placed, placed], unplaced: [{ sessionId: "u", reason: "r" }] };
  const input = (timeLimitSec: number) => ({ ...buildSolveInput(data, { timeLimitSec }) });
  const failed = (kind: SolveFailure["kind"], limit = 20) => ({ failure: { kind, message: "m" }, input: input(limit) });
  const base: GenerateViewInput = { server: "online", running: null, outcome: { showFailure: false }, result: null, timeLimitSec: 20 };
  const view = (patch: Partial<GenerateViewInput>) => generateView({ ...base, ...patch });

  it("idle, online: the Generate button", () => {
    expect(view({})).toEqual({ state: "idle", offline: false, button: "generate" });
    expect(view({ server: "checking" })).toMatchObject({ offline: false, button: "generate" });
  });

  it("idle, offline: a banner and the quick draft button", () => {
    expect(view({ server: "offline" })).toEqual({ state: "idle", offline: true, button: "draft" });
  });

  it("running: exact or draft", () => {
    expect(view({ running: "exact", result: complete })).toMatchObject({ state: "running", draft: false });
    expect(view({ running: "draft" })).toMatchObject({ state: "running", draft: true });
  });

  it("ready, optimal: best possible, nothing to try", () => {
    expect(view({ result: complete, outcome: { showFailure: false, limitSec: 20 } })).toMatchObject({ state: "ready", quality: "optimal", tryLonger: null });
  });

  it("ready, feasible: best found in the run's limit, try longer with double", () => {
    const v = view({ result: { ...complete, status: "feasible" }, outcome: { showFailure: false, limitSec: 30 }, timeLimitSec: 45 });
    expect(v).toMatchObject({ state: "ready", quality: "feasible", limitSec: 30, tryLonger: 60 });
    expect(view({ result: { ...complete, status: "feasible" }, outcome: { showFailure: false, limitSec: 120 } })).toMatchObject({ tryLonger: null });
  });

  it("ready, feasible after a reload falls back to the current limit setting", () => {
    expect(view({ result: { ...complete, status: "feasible" }, timeLimitSec: 40 })).toMatchObject({ limitSec: 40, tryLonger: 80 });
  });

  it("ready, a complete quick draft: no special label, no try longer", () => {
    expect(view({ result: { ...complete, engine: "heuristic", status: "feasible" } })).toMatchObject({ state: "ready", quality: "draft", tryLonger: null });
  });

  it("impossible, with or without an older timetable kept", () => {
    expect(view({ outcome: { failed: failed("infeasible"), showFailure: true } })).toMatchObject({ state: "impossible", hasTimetable: false });
    expect(view({ result: complete, outcome: { failed: failed("infeasible"), showFailure: true } })).toMatchObject({ state: "impossible", hasTimetable: true });
  });

  it("couldn't finish: timeout offers double the run's limit, hidden at 120 s", () => {
    expect(view({ outcome: { failed: failed("timeout", 20), showFailure: true } })).toMatchObject({ state: "couldntFinish", kind: "timeout", limitSec: 20, retryWith: 40 });
    expect(view({ outcome: { failed: failed("timeout", 120), showFailure: true } })).toMatchObject({ retryWith: null });
  });

  it("couldn't finish: server errors have no longer limit to try", () => {
    expect(view({ outcome: { failed: failed("serverError"), showFailure: true } })).toMatchObject({ state: "couldntFinish", kind: "serverError", retryWith: null });
    expect(view({ result: complete, outcome: { failed: failed("unreachable"), showFailure: true } })).toMatchObject({ kind: "unreachable", hasTimetable: true });
  });

  it("a failure is offline-aware too: the button turns into a quick draft", () => {
    expect(view({ server: "offline", outcome: { failed: failed("unreachable"), showFailure: true } })).toMatchObject({ state: "couldntFinish", button: "draft" });
  });

  it("partial from impossible: counts and a way back to the reasons", () => {
    const v = view({ result: partial, outcome: { failed: failed("infeasible"), showFailure: false, draft: "impossible" } });
    expect(v).toEqual({ state: "partial", unplaced: 1, total: 3, from: "impossible", backToReasons: true, offline: false, button: "generate" });
  });

  it("partial from offline: no way back", () => {
    expect(view({ server: "offline", result: partial, outcome: { showFailure: false, draft: "offline" } })).toMatchObject({ state: "partial", from: "offline", backToReasons: false });
  });

  it("partial after a reload: how it was made is unknown", () => {
    expect(view({ result: partial })).toMatchObject({ state: "partial", from: null, backToReasons: false });
  });

  it("back to the reasons shows the failure again over the partial timetable", () => {
    expect(view({ result: partial, outcome: { failed: failed("infeasible"), showFailure: true, draft: "impossible" } })).toMatchObject({ state: "impossible" });
  });
});

describe("step ③ copy", () => {
  it("says how a partial timetable was made", () => {
    expect(partialHow("impossible")).toMatch(/quick draft.*can't be built/);
    expect(partialHow("offline")).toMatch(/offline/);
    expect(partialHow("couldntFinish")).toMatch(/couldn't finish/);
    expect(partialHow(null)).toBe("Made as a quick draft in your browser.");
  });

  it("explains each couldn't-finish kind without engine jargon", () => {
    expect(couldntFinishText("timeout", 20).body).toMatch(/within 20 s/);
    for (const k of ["timeout", "unreachable", "serverError"] as const) expect(JSON.stringify(couldntFinishText(k, 20))).not.toMatch(/CP-SAT/);
  });

  it("toasts a failed Regenerate by kind, mentioning locks only when there are some", () => {
    const f = (kind: SolveFailure["kind"]) => ({ kind, message: "m" });
    expect(regenerateFailedText(f("infeasible"), 2)).toBe("Can't be built with these locks.");
    expect(regenerateFailedText(f("infeasible"), 0)).toBe("This timetable can't be built.");
    expect(regenerateFailedText(f("timeout"), 2)).toBe("Couldn't finish in time.");
    expect(regenerateFailedText(f("unreachable"), 0)).toBe("Couldn't reach the exact solver.");
  });
});

describe("unplacedGroups", () => {
  it("groups by cause, biggest group first, with no cause as Other", () => {
    const u = (id: string, cause?: "teacher" | "noRoom") => ({ sessionId: id, reason: id, cause });
    const groups = unplacedGroups([u("a", "noRoom"), u("b", "teacher"), u("c"), u("d", "teacher")]);
    expect(groups.map((g) => [g.cause, g.items.map((i) => i.sessionId)])).toEqual([
      ["teacher", ["b", "d"]],
      ["noRoom", ["a"]],
      ["other", ["c"]],
    ]);
    expect(groups[0].label).toBe("Teacher already busy");
  });

  it("is empty for no unplaced classes", () => {
    expect(unplacedGroups([])).toEqual([]);
  });
});

describe("regenerateSummary", () => {
  const score = { total: 18, breakdown: { subjectRepeat: 0, teacherOverload: 0, sectionGaps: 0, batchIdle: 18, lateFinish: 0 } };
  it("counts placed sessions and the score", () => {
    expect(regenerateSummary({ placements: [lock, lock], unplaced: [], score })).toBe("New timetable: 2 sessions placed · score 18");
  });

  it("mentions unplaced sessions only when there are some", () => {
    expect(regenerateSummary({ placements: [lock], unplaced: [{ sessionId: "x", reason: "r" }], score })).toBe(
      "New timetable: 1 session placed · 1 unplaced · score 18",
    );
  });
});

describe("generateFooterNote", () => {
  it("hints (not errors) that Next waits for a timetable", () => {
    expect(generateFooterNote(null)).toEqual({ text: "Generate a timetable to continue.", tone: "hint" });
  });

  it("says nothing once there is a result", () => {
    const result = { engine: "heuristic" as const, status: "feasible" as const, placements: [lock], unplaced: [], score: { total: 0, breakdown: { subjectRepeat: 0, teacherOverload: 0, sectionGaps: 0, batchIdle: 0, lateFinish: 0 } }, timeMs: 1 };
    expect(generateFooterNote(result)).toBeNull();
  });
});
