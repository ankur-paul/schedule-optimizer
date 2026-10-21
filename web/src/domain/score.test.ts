import { describe, expect, it } from "vitest";
import { score } from "./score";
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
