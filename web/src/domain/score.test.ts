import { describe, expect, it } from "vitest";
import scoreCases from "../../../shared/fixtures/sample-scores.json";
import timetableJson from "../../../shared/fixtures/sample-timetable.json";
import { sampleCollege } from "./sampleCollege";
import { DEFAULT_SOFT_RULES, fillSoftRules, lateFinishPeriods, penalties, RULE_SWITCH, score, type Penalty } from "./score";
import { scoreCases as makeScoreCases } from "./scoreCases";
import type { ScoreBreakdown, SoftRules, SolveInput, SolveResult } from "./types";
import { MON, TUE, at, tinyCollege, tinyValid } from "./tinyCollege";

/** S5 is off by default (T53), so the S5 tests below and the timetables with every rule's points switch it on. */
const tiny = { ...tinyCollege, softRules: { s5: true } };
const sample = { ...sampleCollege, softRules: { s5: true } };
/** The S1–S4 tests below leave S5 off, so their breakdowns read as before S5 existed. */
const noS5 = { ...tinyCollege, softRules: { s5: false } };
const breakdown = (placements: Parameters<typeof score>[1]) => score(noS5, placements).breakdown;

describe("score", () => {
  it("scores the valid tiny timetable (batch labs run one at a time)", () => {
    // S5: ECE-2B and t1 free at P1–P2 on Tue, t2 free at P2 on Mon, t3 free at P1, P3 (P4 lunch excused) on Mon.
    expect(score(tiny, tinyValid)).toEqual({
      total: 19,
      breakdown: { subjectRepeat: 0, teacherOverload: 0, sectionGaps: 0, batchIdle: 12, lateFinish: 7 },
    });
  });

  it("S1: two lectures of one course on the same day", () => {
    expect(breakdown([at("a-ds:L1", MON, 0, "cr1"), at("a-ds:L2", MON, 1, "cr1")])).toEqual({
      subjectRepeat: 10, teacherOverload: 0, sectionGaps: 0, batchIdle: 0, lateFinish: null,
    });
  });

  it("S2: teacher busy 4 periods in a row", () => {
    const placements = [at("a-ds:P1:B1", MON, 0, "lab1"), at("a-ds:L1", MON, 2, "cr1"), at("a-ds:L2", MON, 3, "cr1")];
    expect(breakdown(placements).teacherOverload).toBe(5);
  });

  it("S2: a break ends the run", () => {
    const placements = [at("b-ph:L1", MON, 1, "cr2"), at("b-ph:P1", MON, 2, "lab1"), at("b-ph:L2", MON, 5, "cr2")];
    expect(breakdown(placements).teacherOverload).toBe(0);
  });

  it("S3: section gaps don't count lunch candidates", () => {
    // ECE-2B busy P1 and P5: idle P2, P3 (gaps), P4 (lunch), Break (not teaching).
    expect(breakdown([at("b-m:L1", MON, 0, "cr2"), at("b-ph:L1", MON, 5, "cr2")])).toEqual({
      subjectRepeat: 0, teacherOverload: 0, sectionGaps: 4, batchIdle: 0, lateFinish: null,
    });
  });

  it("S4: one batch idle during the other's lab, none when labs run in parallel", () => {
    expect(breakdown([at("a-ds:P1:B1", MON, 0, "lab1")]).batchIdle).toBe(6);
    expect(breakdown([at("a-ds:P1:B1", MON, 0, "lab1"), at("a-ds:P1:B2", MON, 0, "lab2")]).batchIdle).toBe(0);
  });
});

/** tinyCollege's sections, teachers and courses on a one-day week: `pattern` has T (teaching) or B (break) per period. */
function day(pattern: string, lunchCandidates: number[]): SolveInput {
  const periods = [...pattern].map((c, id) => ({ id, label: `P${id + 1}`, start: "09:00", end: "10:00", kind: c === "T" ? ("teaching" as const) : ("break" as const) }));
  return { ...tiny, settings: { days: ["Mon"], periods, lunchCandidates } };
}

/** S5 periods per section and teacher that has any. */
const lateBy = (input: SolveInput, placements: Parameters<typeof score>[1]) =>
  Object.fromEntries(penalties(input, placements).filter((p) => p.rule === "S5").map((p) => [p.sectionId ?? p.teacherId, p.periods]));

describe("S5 late finish", () => {
  // ECE-2B (section b): Maths b-m by t3, Physics b-ph by t2. CSE-2A (section a): DS lab a-ds:P1:B1 by t1.
  it("excuses a free lunch candidate before the last class", () => {
    expect(lateBy(day("TTTTTT", [1]), [at("b-m:L1", MON, 0, "cr2"), at("b-ph:L1", MON, 2, "cr2")])).toEqual({ t2: [0] });
  });

  it("counts every free period before the last class when none is a lunch candidate", () => {
    const placements = [at("b-m:L1", MON, 0, "cr2"), at("b-ph:L1", MON, 4, "cr2")];
    expect(lateBy(day("TTTTT", []), placements)).toEqual({ b: [1, 2, 3], t2: [0, 1, 2, 3] });
    expect(score(day("TTTTT", []), placements).breakdown.lateFinish).toBe(7);
  });

  it("counts a late start", () => {
    expect(lateBy(day("TTTT", []), [at("b-m:L1", MON, 2, "cr2"), at("b-ph:L1", MON, 3, "cr2")])).toEqual({
      b: [0, 1],
      t3: [0, 1],
      t2: [0, 1, 2],
    });
  });

  it("one class in the last period: 5, or 4 with a lunch candidate before it", () => {
    expect(lateBy(day("TTTTTT", []), [at("b-m:L1", MON, 5, "cr2")])).toEqual({ b: [0, 1, 2, 3, 4], t3: [0, 1, 2, 3, 4] });
    expect(lateBy(day("TTTTTT", [3]), [at("b-m:L1", MON, 5, "cr2")])).toEqual({ b: [0, 1, 2, 4], t3: [0, 1, 2, 4] });
  });

  it("excuses only one lunch candidate, the first free one", () => {
    expect(lateBy(day("TTTTT", [1, 2]), [at("b-m:L1", MON, 4, "cr2")])).toEqual({ b: [0, 2, 3], t3: [0, 2, 3] });
  });

  it("a batch in class makes the section busy", () => {
    expect(lateBy(day("TTTT", []), [at("a-ds:P1:B1", MON, 2, "lab1")])).toEqual({ a: [0, 1], t1: [0, 1] });
  });

  it("never counts a break, and a day with no classes costs nothing", () => {
    // tinyCollege: P1–P4, Break, P5, lunch candidates P4 and P5. Tuesday is empty.
    expect(lateBy(tiny, [at("b-m:L1", MON, 5, "cr2")])).toEqual({ b: [0, 1, 2], t3: [0, 1, 2] });
    expect(penalties(tiny, [at("b-m:L1", MON, 5, "cr2")]).every((p) => p.day === MON)).toBe(true);
    expect(score(tiny, []).breakdown.lateFinish).toBe(0);
  });

  it("lateFinishPeriods: nothing when there is no class", () => {
    expect(lateFinishPeriods([false, false], [true, true], new Set())).toEqual([]);
    expect(lateFinishPeriods([true, false, true], [true, true, true], new Set([1]))).toEqual([]);
  });
});

describe("soft-rule switches", () => {
  // A random sample-college timetable: every rule has points, so switching any one off changes the total.
  const [first] = makeScoreCases(sampleCollege, [1]);
  const all = score(sample, first.placements);
  const keys = Object.keys(RULE_SWITCH) as (keyof ScoreBreakdown)[];

  it("has points for every rule on the random timetable", () => {
    for (const key of keys) expect(all.breakdown[key]).toBeGreaterThan(0);
  });

  it.each(keys)("switching %s's rule off removes exactly it from the total", (key) => {
    const softRules = { s5: true, [RULE_SWITCH[key]]: false };
    const off = score({ ...sampleCollege, softRules }, first.placements);
    expect(off.breakdown).toEqual({ ...all.breakdown, [key]: null });
    expect(off.total).toBe(all.total - all.breakdown[key]!);
    expect(penalties({ ...sampleCollege, softRules }, first.placements).some((p) => p.key === key)).toBe(false);
  });

  it("all off gives 0 with every rule null", () => {
    const softRules = { s1: false, s2: false, s3: false, s4: false, s5: false };
    expect(score({ ...sampleCollege, softRules }, first.placements)).toEqual({
      total: 0,
      breakdown: { subjectRepeat: null, teacherOverload: null, sectionGaps: null, batchIdle: null, lateFinish: null },
    });
    expect(penalties({ ...sampleCollege, softRules }, first.placements)).toEqual([]);
  });

  it("missing softRules, or a missing key, means the defaults: all on but S5", () => {
    expect(DEFAULT_SOFT_RULES).toEqual({ s1: true, s2: true, s3: true, s4: true, s5: false });
    const defaults = { total: all.total - all.breakdown.lateFinish!, breakdown: { ...all.breakdown, lateFinish: null } };
    expect(score({ ...sampleCollege, softRules: DEFAULT_SOFT_RULES }, first.placements)).toEqual(defaults);
    expect(score({ ...sampleCollege, softRules: {} }, first.placements)).toEqual(defaults);
    expect(score(sampleCollege, first.placements)).toEqual(defaults);
  });

  it("fillSoftRules fills missing keys and ignores anything that isn't a boolean", () => {
    expect(fillSoftRules()).toEqual(DEFAULT_SOFT_RULES);
    expect(fillSoftRules(null)).toEqual(DEFAULT_SOFT_RULES);
    expect(fillSoftRules({ s2: false })).toEqual({ ...DEFAULT_SOFT_RULES, s2: false });
    expect(fillSoftRules({ s3: "no" } as unknown as Partial<SoftRules>)).toEqual(DEFAULT_SOFT_RULES);
  });
});

describe("cross-check with the server's scorer", () => {
  it("matches the score the server saved with the sample timetable", () => {
    const timetable = timetableJson as SolveResult;
    expect(score(sampleCollege, timetable.placements)).toEqual(timetable.score);
  });

  it("the golden score file is current (else run npm run gen:golden)", () => {
    expect(makeScoreCases(sampleCollege)).toEqual(scoreCases);
  });
});

describe("penalties", () => {
  const sums = (list: Penalty[]) => {
    const out: Record<keyof ScoreBreakdown, number> = { subjectRepeat: 0, teacherOverload: 0, sectionGaps: 0, batchIdle: 0, lateFinish: 0 };
    for (const p of list) out[p.key] += p.points;
    return out;
  };

  it("adds up to the score on the tiny and the sample timetable", () => {
    expect(sums(penalties(tiny, tinyValid))).toEqual(score(tiny, tinyValid).breakdown);
    const { placements } = timetableJson as SolveResult;
    const list = penalties(sample, placements);
    expect(list.length).toBeGreaterThan(0);
    expect(sums(list)).toEqual(score(sample, placements).breakdown);
  });

  it("is empty for an empty timetable", () => {
    expect(penalties(tinyCollege, [])).toEqual([]);
  });

  it("S1: names the course, its section and the lecture periods", () => {
    expect(penalties(noS5, [at("a-ds:L1", MON, 1, "cr1"), at("a-ds:L2", MON, 0, "cr1")])).toEqual([
      { rule: "S1", key: "subjectRepeat", points: 10, day: MON, periods: [0, 1], sectionId: "a", courseId: "a-ds" },
    ]);
  });

  it("S2: the teacher and the periods beyond 3", () => {
    const placements = [at("a-ds:P1:B1", MON, 0, "lab1"), at("a-ds:L1", MON, 2, "cr1"), at("a-ds:L2", MON, 3, "cr1")];
    const s2 = penalties(noS5, placements).filter((p) => p.rule === "S2");
    expect(s2).toEqual([{ rule: "S2", key: "teacherOverload", points: 5, day: MON, periods: [3], teacherId: "t1" }]);
  });

  it("S3: the section's idle periods, lunch left out", () => {
    expect(penalties(noS5, [at("b-m:L1", MON, 0, "cr2"), at("b-ph:L1", MON, 5, "cr2")])).toEqual([
      { rule: "S3", key: "sectionGaps", points: 4, day: MON, periods: [1, 2], sectionId: "b" },
    ]);
  });

  it("S4: the idle batch and its periods", () => {
    expect(penalties(noS5, [at("a-ds:P1:B1", MON, 0, "lab1")])).toEqual([
      { rule: "S4", key: "batchIdle", points: 6, day: MON, periods: [0, 1], sectionId: "a", batch: 2 },
    ]);
  });

  it("S5: the section or teacher and their free periods", () => {
    expect(penalties(tiny, [at("b-ph:L2", TUE, 2, "cr2")])).toEqual([
      { rule: "S5", key: "lateFinish", points: 2, day: TUE, periods: [0, 1], sectionId: "b" },
      { rule: "S5", key: "lateFinish", points: 2, day: TUE, periods: [0, 1], teacherId: "t2" },
    ]);
  });
});
