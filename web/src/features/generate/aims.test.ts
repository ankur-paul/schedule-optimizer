import { describe, expect, it } from "vitest";
import { DEFAULT_SOFT_RULES } from "@/domain/score";
import { AIMS, aimLabel, aimRows, aimsSummary, preferencesChanged, sameRules, scoreName } from "./aims";

const allOn = { ...DEFAULT_SOFT_RULES, s5: true };
const s5Off = { ...allOn, s5: false };

describe("AIMS", () => {
  it("lists the five rules in S1–S5 order, phrased as aims", () => {
    expect(AIMS.map((a) => a.key)).toEqual(["s1", "s2", "s3", "s4", "s5"]);
    expect(AIMS.map((a) => a.label)).toEqual([
      "Spread each subject across the week",
      "At most 3 periods in a row for a teacher",
      "No free periods between a section's classes",
      "Keep a section's batches busy at the same time",
      "Finish each day as early as possible",
    ]);
  });

  it("gives each aim's penalty and its name in the score in the ⓘ", () => {
    expect(AIMS[0].tip).toMatch(/^10 points for each extra lecture/);
    expect(AIMS[0].tip).toMatch(/In the score: Same subject twice in a day\.$/);
    expect(AIMS[4].tip).toMatch(/^1 point per free period/);
    expect(AIMS[4].tip).toMatch(/In the score: Late finish\.$/);
  });

  it("names each switch as an aim and as a score row", () => {
    expect(aimLabel("s5")).toBe("Finish each day as early as possible");
    expect(scoreName("s5")).toBe("Late finish");
    expect(scoreName("s4")).toBe("Batches waiting during labs");
  });
});

describe("aimRows", () => {
  it("pairs every aim with its switch", () => {
    expect(aimRows(s5Off).map((r) => [r.key, r.on])).toEqual([
      ["s1", true],
      ["s2", true],
      ["s3", true],
      ["s4", true],
      ["s5", false],
    ]);
  });

  it("fills missing switches with the defaults", () => {
    expect(aimRows({ s2: false }).map((r) => r.on)).toEqual([true, false, true, true, DEFAULT_SOFT_RULES.s5]);
  });
});

describe("aimsSummary", () => {
  it("says how many aims count", () => {
    expect(aimsSummary(allOn)).toMatch(/^All five count/);
    expect(aimsSummary(s5Off)).toMatch(/^4 of 5 count/);
    expect(aimsSummary({ s1: false, s2: false, s3: false, s4: false, s5: false })).toMatch(/^None count: Generate only follows the hard rules/);
  });

  it("names the aims that are off, in S1–S5 order", () => {
    expect(aimsSummary(s5Off)).toMatch(/Off: Finish each day as early as possible\.$/);
    expect(aimsSummary({ ...allOn, s4: false, s1: false })).toMatch(
      /^3 of 5 count .* Off: Spread each subject across the week, Keep a section's batches busy at the same time\.$/,
    );
    expect(aimsSummary(allOn)).not.toMatch(/Off:/);
    expect(aimsSummary({})).toMatch(/Off: Finish each day/); // a missing switch is its default, and S5 starts off
  });
});

describe("sameRules", () => {
  it("compares every switch, a missing one as its default", () => {
    expect(sameRules(allOn, { ...allOn })).toBe(true);
    expect(sameRules(allOn, s5Off)).toBe(false);
    expect(sameRules({}, DEFAULT_SOFT_RULES)).toBe(true);
  });
});

describe("preferencesChanged", () => {
  it("is set once the switches differ from the ones the timetable was made with", () => {
    expect(preferencesChanged(allOn, s5Off, true)).toBe(true);
  });

  it("clears when the switches match again: after a run, or flipped back", () => {
    expect(preferencesChanged(s5Off, s5Off, true)).toBe(false);
    expect(preferencesChanged(allOn, { ...allOn }, true)).toBe(false);
  });

  it("is never set without a timetable or before any run or flip", () => {
    expect(preferencesChanged(allOn, s5Off, false)).toBe(false);
    expect(preferencesChanged(null, s5Off, true)).toBe(false);
  });
});
