import { describe, expect, it } from "vitest";
import timetableJson from "../../../shared/fixtures/sample-timetable.json";
import { sampleCollege } from "./sampleCollege";
import { penalties, score, type Penalty } from "./score";
import type { ScoreBreakdown, SolveResult } from "./types";
import { MON, at, tinyCollege, tinyValid } from "./tinyCollege";

const breakdown = (placements: Parameters<typeof score>[1]) => score(tinyCollege, placements).breakdown;

describe("score", () => {
  it("scores the valid tiny timetable (batch labs run one at a time)", () => {
    expect(score(tinyCollege, tinyValid)).toEqual({
      total: 12,
      breakdown: { subjectRepeat: 0, teacherOverload: 0, sectionGaps: 0, batchIdle: 12 },
    });
  });

  it("S1: two lectures of one course on the same day", () => {
    expect(breakdown([at("a-ds:L1", MON, 0, "cr1"), at("a-ds:L2", MON, 1, "cr1")])).toEqual({
      subjectRepeat: 10, teacherOverload: 0, sectionGaps: 0, batchIdle: 0,
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
      subjectRepeat: 0, teacherOverload: 0, sectionGaps: 4, batchIdle: 0,
    });
  });

  it("S4: one batch idle during the other's lab, none when labs run in parallel", () => {
    expect(breakdown([at("a-ds:P1:B1", MON, 0, "lab1")]).batchIdle).toBe(6);
    expect(breakdown([at("a-ds:P1:B1", MON, 0, "lab1"), at("a-ds:P1:B2", MON, 0, "lab2")]).batchIdle).toBe(0);
  });
});

describe("penalties", () => {
  const sums = (list: Penalty[]) => {
    const out: ScoreBreakdown = { subjectRepeat: 0, teacherOverload: 0, sectionGaps: 0, batchIdle: 0 };
    for (const p of list) out[p.key] += p.points;
    return out;
  };

  it("adds up to the score on the tiny and the sample timetable", () => {
    expect(sums(penalties(tinyCollege, tinyValid))).toEqual(score(tinyCollege, tinyValid).breakdown);
    const { placements } = timetableJson as SolveResult;
    const list = penalties(sampleCollege, placements);
    expect(list.length).toBeGreaterThan(0);
    expect(sums(list)).toEqual(score(sampleCollege, placements).breakdown);
  });

  it("is empty for an empty timetable", () => {
    expect(penalties(tinyCollege, [])).toEqual([]);
  });

  it("S1: names the course, its section and the lecture periods", () => {
    expect(penalties(tinyCollege, [at("a-ds:L1", MON, 1, "cr1"), at("a-ds:L2", MON, 0, "cr1")])).toEqual([
      { rule: "S1", key: "subjectRepeat", points: 10, day: MON, periods: [0, 1], sectionId: "a", courseId: "a-ds" },
    ]);
  });

  it("S2: the teacher and the periods beyond 3", () => {
    const placements = [at("a-ds:P1:B1", MON, 0, "lab1"), at("a-ds:L1", MON, 2, "cr1"), at("a-ds:L2", MON, 3, "cr1")];
    const s2 = penalties(tinyCollege, placements).filter((p) => p.rule === "S2");
    expect(s2).toEqual([{ rule: "S2", key: "teacherOverload", points: 5, day: MON, periods: [3], teacherId: "t1" }]);
  });

  it("S3: the section's idle periods, lunch left out", () => {
    expect(penalties(tinyCollege, [at("b-m:L1", MON, 0, "cr2"), at("b-ph:L1", MON, 5, "cr2")])).toEqual([
      { rule: "S3", key: "sectionGaps", points: 4, day: MON, periods: [1, 2], sectionId: "b" },
    ]);
  });

  it("S4: the idle batch and its periods", () => {
    expect(penalties(tinyCollege, [at("a-ds:P1:B1", MON, 0, "lab1")])).toEqual([
      { rule: "S4", key: "batchIdle", points: 6, day: MON, periods: [0, 1], sectionId: "a", batch: 2 },
    ]);
  });
});
