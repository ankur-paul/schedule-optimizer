import { describe, expect, it } from "vitest";
import { sampleCollege } from "@/domain/sampleCollege";
import { useAppStore } from "@/store/useAppStore";
import type { Period } from "@/domain/types";
import {
  defaultLunchCandidates,
  fromMinutes,
  generatePeriods,
  periodErrors,
  settingsErrors,
  toMinutes,
  toggleDay,
  withPeriods,
} from "./periods";

const settings = sampleCollege.settings;

describe("setup helpers", () => {
  it("keeps days in Mon–Sun order", () => {
    expect(toggleDay(["Tue", "Thu"], "Mon")).toEqual(["Mon", "Tue", "Thu"]);
    expect(toggleDay(["Mon", "Tue"], "Mon")).toEqual(["Tue"]);
  });

  it("lunch candidates follow their period when rows move or are removed", () => {
    // remove P1 (id 0): P4/P5/P6 (ids 4,5,6) become ids 3,4,5
    const next = withPeriods(settings, settings.periods.slice(1));
    expect(next.periods.map((p) => p.id)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(next.lunchCandidates).toEqual([3, 4, 5]);
    // turning a candidate into a break drops it
    const asBreak = withPeriods(settings, settings.periods.map((p) => (p.id === 5 ? { ...p, kind: "break" as const } : p)));
    expect(asBreak.lunchCandidates).toEqual([4, 6]);
  });

  it("generates the sample bell schedule", () => {
    const periods = generatePeriods({ start: "09:00", lengthMin: 50, count: 8, breakAfter: 2, breakMin: 20 });
    expect(periods).toEqual(settings.periods);
    expect(defaultLunchCandidates(periods)).toEqual(settings.lunchCandidates);
  });

  it("flags invalid settings", () => {
    expect(settingsErrors(settings)).toEqual([]);
    expect(settingsErrors({ ...settings, days: [], lunchCandidates: [] })).toHaveLength(2);
    const badTime = withPeriods(settings, settings.periods.map((p) => (p.id === 0 ? { ...p, end: "08:00" } : p)));
    expect(settingsErrors(badTime)).toEqual(["Fix the highlighted periods."]);
  });
});

describe("setup helper edge cases", () => {
  const p = (id: number, label: string, start: string, end: string, kind: Period["kind"] = "teaching"): Period => ({ id, label, start, end, kind });

  it("converts times both ways and rejects junk", () => {
    expect(toMinutes("09:05")).toBe(545);
    expect(toMinutes("9:05")).toBe(545);
    expect(toMinutes("")).toBeNaN();
    expect(toMinutes("9am")).toBeNaN();
    expect(fromMinutes(545)).toBe("09:05");
    expect(fromMinutes(0)).toBe("00:00");
  });

  it("puts unknown day names after Sun and adding an existing day removes it", () => {
    expect(toggleDay(["Day 1"], "Mon")).toEqual(["Mon", "Day 1"]);
    expect(toggleDay(["Sun", "Sat"], "Sun")).toEqual(["Sat"]);
    expect(toggleDay([], "Wed")).toEqual(["Wed"]);
  });

  it("swapping two rows renumbers ids and keeps the lunch candidate on its period", () => {
    const s = { days: ["Mon"], periods: [p(0, "A", "09:00", "10:00"), p(1, "B", "10:00", "11:00")], lunchCandidates: [1] };
    const swapped = withPeriods(s, [s.periods[1], s.periods[0]]);
    expect(swapped.periods.map((x) => [x.id, x.label])).toEqual([[0, "B"], [1, "A"]]);
    expect(swapped.lunchCandidates).toEqual([0]);
  });

  it("new rows (id -1) never become lunch candidates", () => {
    const s = { days: ["Mon"], periods: [p(0, "A", "09:00", "10:00")], lunchCandidates: [0] };
    const added = withPeriods(s, [...s.periods, p(-1, "B", "10:00", "11:00")]);
    expect(added.periods.map((x) => x.id)).toEqual([0, 1]);
    expect(added.lunchCandidates).toEqual([0]);
  });

  it("generates without a break when breakAfter is 0, past the last period, or breakMin is 0", () => {
    for (const [breakAfter, breakMin] of [[0, 20], [5, 20], [2, 0]]) {
      const periods = generatePeriods({ start: "08:30", lengthMin: 45, count: 3, breakAfter, breakMin });
      expect(periods.map((x) => x.kind)).toEqual(["teaching", "teaching", "teaching"]);
    }
    const periods = generatePeriods({ start: "08:30", lengthMin: 45, count: 3, breakAfter: 3, breakMin: 15 });
    expect(periods.at(-1)).toEqual(p(3, "Break", "10:45", "11:00", "break"));
  });

  it("default lunch window ignores breaks and periods outside 11:30–14:00", () => {
    const periods = [
      p(0, "P1", "11:00", "11:30"),
      p(1, "P2", "11:30", "12:00"),
      p(2, "Lunch", "12:00", "12:30", "break"),
      p(3, "P3", "13:59", "14:30"),
      p(4, "P4", "14:00", "15:00"),
    ];
    expect(defaultLunchCandidates(periods)).toEqual([1, 3]);
  });

  it("reports one problem per bad period", () => {
    const errors = periodErrors([
      p(0, " ", "09:00", "10:00"),
      p(1, "P2", "", "11:00"),
      p(2, "P3", "11:00", "11:00"),
      p(3, "P4", "12:00", "13:00"),
      p(4, "P5", "12:30", "13:30"),
      p(5, "P6", "13:30", "14:30"),
    ]);
    expect(Object.fromEntries(errors)).toEqual({
      0: "Label is empty",
      1: "Start and end time are required",
      2: "End must be after start",
      4: "Starts before P4 ends",
    });
  });

  it("needs a teaching period, not just breaks", () => {
    const s = { days: ["Mon"], periods: [p(0, "Break", "10:00", "10:20", "break")], lunchCandidates: [] };
    expect(settingsErrors(s)).toEqual(["Add at least one teaching period.", "Pick at least one lunch candidate period."]);
  });
});

describe("store", () => {
  const placement = { sessionId: "c1:L1", day: 0, period: 0, roomId: "r1" };
  const result = {
    engine: "heuristic" as const,
    status: "feasible" as const,
    placements: [placement],
    unplaced: [],
    score: { total: 0, breakdown: { subjectRepeat: 0, teacherOverload: 0, sectionGaps: 0, batchIdle: 0 } },
    timeMs: 1,
  };

  it("changing settings drops the result and locks, other setters keep them", () => {
    const s = useAppStore.getState();
    s.setResult(result);
    s.setLocks([placement]);
    s.setCourses([]);
    expect(useAppStore.getState().result).toEqual(result);
    expect(useAppStore.getState().locks).toEqual([placement]);
    s.setSettings({ ...settings, days: ["Mon"] });
    expect(useAppStore.getState().result).toBeNull();
    expect(useAppStore.getState().locks).toEqual([]);
    s.reset();
  });

  it("loadSample keeps the step, clears the result and does not share objects with the fixture", () => {
    const s = useAppStore.getState();
    s.setStep(1);
    s.setResult(result);
    s.loadSample();
    const after = useAppStore.getState();
    expect(after.step).toBe(1);
    expect(after.result).toBeNull();
    expect(after.settings).not.toBe(sampleCollege.settings);
    after.settings.days.push("Sat");
    expect(sampleCollege.settings.days).not.toContain("Sat");
    after.reset();
    expect(useAppStore.getState().step).toBe(0);
  });

  it("loadSample fills every table and reset clears them", () => {
    useAppStore.getState().loadSample();
    const s = useAppStore.getState();
    expect(s.courses).toHaveLength(sampleCollege.courses.length);
    expect(s.sections).toHaveLength(sampleCollege.sections.length);
    s.reset();
    expect(useAppStore.getState().courses).toEqual([]);
    expect(useAppStore.getState().settings).toEqual({ days: ["Mon", "Tue", "Wed", "Thu", "Fri"], periods: [], lunchCandidates: [] });
  });
});
