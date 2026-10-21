import { describe, expect, it } from "vitest";
import { sampleCollege } from "@/domain/sampleCollege";
import { useAppStore } from "@/store/useAppStore";
import { defaultLunchCandidates, generatePeriods, settingsErrors, toggleDay, withPeriods } from "./periods";

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

describe("store", () => {
  it("loadSample fills every table and reset clears them", () => {
    useAppStore.getState().loadSample();
    const s = useAppStore.getState();
    expect(s.courses).toHaveLength(sampleCollege.courses.length);
    expect(s.sections).toHaveLength(sampleCollege.sections.length);
    s.reset();
    expect(useAppStore.getState().courses).toEqual([]);
    expect(useAppStore.getState().settings).toEqual(settings);
  });
});
