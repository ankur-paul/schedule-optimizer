import { describe, expect, it } from "vitest";
import { sampleCollege } from "@/domain/sampleCollege";
import type { Placement } from "@/domain/types";
import type { AppData } from "@/store/useAppStore";
import { badgeText, buildSolveInput, engineLabel, generateBlockers, hasTimetable, newSeed } from "./generate";

const lock: Placement = { sessionId: "cse-a-ds:L1", day: 0, period: 0, roomId: "cr-cse-a" };
const data: AppData = {
  ...structuredClone(sampleCollege),
  result: null,
  locks: [lock],
  step: 2,
  engineMode: "auto",
  timeLimitSec: 20,
};

describe("buildSolveInput", () => {
  it("passes the college data, locks and options through, and nothing else", () => {
    const input = buildSolveInput(data, { timeLimitSec: 15, seed: 3 });
    expect(input.locks).toEqual([lock]);
    expect(input.options).toEqual({ timeLimitSec: 15, seed: 3 });
    expect(input.courses).toBe(data.courses);
    expect(Object.keys(input).sort()).toEqual(
      ["courses", "departments", "locks", "options", "rooms", "sections", "settings", "teachers"].sort(),
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
  it("matches the PLAN wording for a clean result", () => {
    expect(badgeText({ engine: "cpsat", status: "optimal" }, ok)).toBe("✓ Verified: 0 clashes · engine: CP-SAT (optimal)");
    expect(badgeText({ engine: "heuristic", status: "partial" }, ok)).toBe(
      "✓ Verified: 0 clashes · engine: in-browser heuristic (partial)",
    );
  });

  it("counts violations with correct plurals", () => {
    const v = { rule: "H1" as const, message: "x", sessionIds: [] };
    expect(badgeText({ engine: "cpsat", status: "feasible" }, { ok: false, violations: [v], missing: [] })).toMatch(
      /^✗ 1 rule violation found/,
    );
    expect(badgeText({ engine: "cpsat", status: "feasible" }, { ok: false, violations: [v, v], missing: [] })).toMatch(
      /^✗ 2 rule violations found/,
    );
  });
});

describe("engineLabel / newSeed", () => {
  it("labels engines", () => {
    expect(engineLabel({ engine: "cpsat", status: "error" })).toBe("CP-SAT (error)");
  });

  it("returns a non-negative int32", () => {
    for (let i = 0; i < 100; i++) {
      const s = newSeed();
      expect(Number.isInteger(s) && s >= 0 && s < 2 ** 31).toBe(true);
    }
  });
});

describe("hasTimetable", () => {
  it("is false only for an error with no placements", () => {
    expect(hasTimetable({ status: "error", placements: [] })).toBe(false);
    expect(hasTimetable({ status: "error", placements: [lock] })).toBe(true);
    expect(hasTimetable({ status: "infeasible", placements: [] })).toBe(true);
    expect(hasTimetable({ status: "partial", placements: [] })).toBe(true);
  });
});
