import { beforeEach, describe, expect, it } from "vitest";
import { migrateState, PERSIST_VERSION, useAppStore } from "./useAppStore";

describe("initial state", () => {
  beforeEach(() => useAppStore.getState().reset());

  it("starts with Mon–Fri picked and no periods, not the sample", () => {
    expect(useAppStore.getState().settings).toEqual({ days: ["Mon", "Tue", "Wed", "Thu", "Fri"], periods: [], lunchCandidates: [] });
    expect(useAppStore.getState().step).toBe(0);
  });
});

describe("printHeading", () => {
  beforeEach(() => useAppStore.getState().reset());

  it("starts empty and can be set", () => {
    expect(useAppStore.getState().printHeading).toBe("");
    useAppStore.getState().setPrintHeading("GNDEC · Semester 5");
    expect(useAppStore.getState().printHeading).toBe("GNDEC · Semester 5");
  });

  it("survives loading the sample and settings edits, but not Start over", () => {
    const s = useAppStore.getState();
    s.setPrintHeading("My College");
    s.loadSample();
    s.setSettings({ ...useAppStore.getState().settings, days: ["Mon"] });
    expect(useAppStore.getState().printHeading).toBe("My College");
    useAppStore.getState().reset();
    expect(useAppStore.getState().printHeading).toBe("");
  });
});

describe("migrateState", () => {
  it("drops engineMode from state saved before version 1, keeping the rest", () => {
    const old = { engineMode: "auto", timeLimitSec: 30, printHeading: "X" };
    expect(migrateState(old, 0)).toEqual({ timeLimitSec: 30, printHeading: "X" });
    expect(old).toHaveProperty("engineMode"); // input not mutated
  });

  it("leaves current state alone", () => {
    expect(migrateState({ timeLimitSec: 20 }, PERSIST_VERSION)).toEqual({ timeLimitSec: 20 });
  });

  it("has no engineMode in a fresh store", () => {
    useAppStore.getState().reset();
    expect(useAppStore.getState()).not.toHaveProperty("engineMode");
  });
});
