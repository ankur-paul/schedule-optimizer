import { describe, expect, it } from "vitest";
import { sampleCollege } from "@/domain/sampleCollege";
import { score } from "@/domain/score";
import { expandSessions } from "@/domain/sessions";
import { tinyCollege } from "@/domain/tinyCollege";
import { rng } from "@/domain/rng";
import type { Placement, Session, SoftRules, SolveInput } from "@/domain/types";
import { validate } from "@/domain/validator";
import { solveHeuristic, Solver } from "./heuristic";
import { runHeuristic } from "./runHeuristic";

/** Solver internals the tests reach into. */
type Internals = {
  sessions: Session[];
  D: number;
  starts: number[][];
  locked: boolean[];
  day: Int32Array;
  start: Int32Array;
  room: Int32Array;
  construct(): void;
  improve(deadline: number): void;
  totalCost(): number;
  localCost(is: number[], ds: number[]): number;
  blocker(i: number, d: number, st: number): string | null;
  freeRooms(i: number, d: number, st: number): number[];
  place(i: number, d: number, st: number, r: number): void;
  unplace(i: number): void;
  placements(): Placement[];
};

/** All on, all off, S5 alone off and on, and a mix. */
const SWITCHES: Partial<SoftRules>[] = [
  {},
  { s1: false, s2: false, s3: false, s4: false, s5: false },
  { s5: false },
  { s1: false, s2: false, s3: false, s4: false },
  { s1: false, s3: false },
];

const withCourse = (id: string, patch: Partial<SolveInput["courses"][number]>): SolveInput => ({
  ...tinyCollege,
  courses: tinyCollege.courses.map((c) => (c.id === id ? { ...c, ...patch } : c)),
});

describe("solveHeuristic", () => {
  it("solves the sample college completely and clash-free within 3 s", () => {
    const result = solveHeuristic(sampleCollege, { timeLimitMs: 1500, seed: 42 });
    expect(result).toMatchObject({ engine: "heuristic", status: "feasible", unplaced: [] });
    expect(result.timeMs).toBeLessThan(3000);
    expect(validate(sampleCollege, result.placements)).toEqual({ ok: true, violations: [], missing: [] });
  });

  it("reports the score of what it returns", () => {
    const result = solveHeuristic(sampleCollege, { timeLimitMs: 300, seed: 7 });
    expect(result.score).toEqual(score(sampleCollege, result.placements));
  });

  it("its internal cost model agrees with score(), whichever rules are on", () => {
    for (const softRules of SWITCHES) {
      for (const input of [sampleCollege, tinyCollege].map((c) => ({ ...c, softRules }))) {
        const solver = new Solver(input, 5);
        const t0 = performance.now();
        const result = solver.solve(t0 + 100, t0);
        expect((solver as unknown as Internals).totalCost(), JSON.stringify(softRules)).toBe(result.score.total);
      }
    }
  });

  it("its incremental cost of a move equals the change in score(), over random moves", () => {
    for (const softRules of SWITCHES) {
      const input = { ...sampleCollege, softRules };
      const solver = new Solver(input, 3) as unknown as Internals;
      solver.construct();
      const random = rng(17);
      let total = score(input, solver.placements()).total;
      let moves = 0;
      for (let k = 0; moves < 60 && k < 5000; k++) {
        const i = Math.floor(random() * solver.sessions.length);
        const [od, ost, or] = [solver.day[i], solver.start[i], solver.room[i]];
        if (solver.locked[i] || od < 0) continue;
        const d = Math.floor(random() * solver.D);
        const st = solver.starts[i][Math.floor(random() * solver.starts[i].length)];
        const before = solver.localCost([i, i], [od, d]);
        solver.unplace(i);
        const r = solver.blocker(i, d, st) === null ? solver.freeRooms(i, d, st)[0] : undefined;
        if (r === undefined) {
          solver.place(i, od, ost, or);
          continue;
        }
        solver.place(i, d, st, r);
        const next = score(input, solver.placements()).total;
        expect(solver.localCost([i, i], [od, d]) - before, JSON.stringify(softRules)).toBe(next - total);
        total = next;
        moves++;
      }
      expect(moves).toBe(60);
      expect(solver.totalCost()).toBe(total);
    }
  }, 15_000);

  it("finishes the sample within its time limit with S5 on and off", () => {
    for (const s5 of [true, false]) {
      const result = solveHeuristic({ ...sampleCollege, softRules: { s5 } }, { timeLimitMs: 1000, seed: 2 });
      expect(result.status).toBe("feasible");
      expect(result.timeMs).toBeLessThan(1500);
    }
  });

  it("local search never makes the timetable worse", () => {
    const solver = new Solver(sampleCollege, 11) as unknown as Internals;
    solver.construct();
    const constructed = solver.totalCost();
    solver.improve(performance.now() + 300);
    expect(solver.totalCost()).toBeLessThanOrEqual(constructed);
  });

  it("solves the tiny college", () => {
    const result = solveHeuristic(tinyCollege, { timeLimitMs: 200, seed: 1 });
    expect(result.status).toBe("feasible");
    expect(validate(tinyCollege, result.placements).ok).toBe(true);
  });

  it("keeps locks unchanged", () => {
    const first = solveHeuristic(sampleCollege, { timeLimitMs: 300, seed: 1 });
    const locks = [first.placements[0], first.placements.find((p) => p.sessionId.includes(":P"))!];
    const input = { ...sampleCollege, locks };
    const result = solveHeuristic(input, { timeLimitMs: 500, seed: 99 });
    for (const lock of locks) expect(result.placements).toContainEqual(lock);
    expect(result.placements.filter((p) => p.sessionId === locks[0].sessionId)).toHaveLength(1);
    expect(validate(input, result.placements)).toMatchObject({ ok: true, missing: [] });
  });

  it("returns a clash-free partial result with reasons when a teacher is overloaded", () => {
    const input = withCourse("b-m", { lecturesPerWeek: 12 }); // S. Rao: 13 lectures, only 8 non-lunch slots
    const result = solveHeuristic(input, { timeLimitMs: 200, seed: 1 });
    expect(result.status).toBe("partial");
    // ECE-2B itself is overfull too, so which sessions drop out varies; some Maths lecture must.
    const maths = result.unplaced.find((u) => u.sessionId.startsWith("b-m:"));
    expect(maths?.reason).toMatch(/^ECE-2B Maths: no period where teacher S\. Rao, ECE-2B and an eligible classroom are all free/);
    expect(maths?.cause).toMatch(/^(teacher|section)$/);
    for (const u of result.unplaced) {
      expect(u.reason).not.toBe("");
      expect(["teacher", "section", "room", "lunch"]).toContain(u.cause);
    }
    const check = validate(input, result.placements);
    expect(check.ok).toBe(true);
    expect(check.missing.sort()).toEqual(result.unplaced.map((u) => u.sessionId).sort());
  });

  it("explains a lab with no usable room", () => {
    const result = solveHeuristic(withCourse("b-ph", { labRoomId: "nope" }), { timeLimitMs: 100 });
    expect(result.unplaced).toEqual([
      {
        sessionId: "b-ph:P1",
        reason: "ECE-2B Physics Lab: no lab room it may use (required room nope missing or not allowed)",
        cause: "noRoom",
      },
    ]);
  });

  it("explains a lab longer than any run of teaching periods", () => {
    const result = solveHeuristic(withCourse("b-ph", { labLength: 5 }), { timeLimitMs: 100 });
    expect(result.unplaced).toEqual([
      { sessionId: "b-ph:P1", reason: "ECE-2B Physics Lab: no day has 5 consecutive teaching periods", cause: "noStart" },
    ]);
  });

  it("returns status error on bad data instead of throwing", () => {
    const input = { ...tinyCollege, courses: [{ ...tinyCollege.courses[0], sectionId: "ghost" }] };
    expect(solveHeuristic(input, { timeLimitMs: 100 })).toMatchObject({ status: "error", message: expect.stringContaining("ghost") });
  });

  it("handles an input with no courses", () => {
    expect(solveHeuristic({ ...tinyCollege, courses: [] }, { timeLimitMs: 100 })).toMatchObject({
      status: "feasible", placements: [], unplaced: [], score: { total: 0 },
    });
  });

  it("places every session exactly once", () => {
    const result = solveHeuristic(sampleCollege, { timeLimitMs: 300, seed: 3 });
    const ids = result.placements.map((p) => p.sessionId).sort();
    expect(ids).toEqual(expandSessions(sampleCollege).map((s) => s.id).sort());
  });
});

describe("runHeuristic", () => {
  it("runs on the main thread when Worker is unavailable (Node)", async () => {
    const result = await runHeuristic(tinyCollege, { timeLimitMs: 100, seed: 1 });
    expect(result).toMatchObject({ engine: "heuristic", status: "feasible" });
  });
});
