import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import timetableJson from "../../../shared/fixtures/sample-timetable.json";
import type { SolveResult } from "@/domain/types";
import { DEFAULT_SOFT_RULES } from "@/domain/score";
import { sampleCollege } from "@/domain/sampleCollege";
import { migrateState, PERSIST_VERSION, rescored, softRulesPatch, useAppStore } from "./useAppStore";

const sampleResult = timetableJson as unknown as SolveResult;

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

describe("softRules", () => {
  beforeEach(() => {
    useAppStore.getState().reset();
    useAppStore.setState({ history: { undo: [], redo: [] } });
  });
  afterEach(() => vi.unstubAllGlobals());

  const lock = { sessionId: "s1", day: 1, period: 2, roomId: "r1" };
  const result = { engine: "cpsat", status: "feasible", placements: [lock], unplaced: [], score: { total: 0 }, timeMs: 1 } as unknown as SolveResult;

  it("starts with the defaults; a switch keeps the timetable and locks and re-scores it", () => {
    const s = useAppStore.getState();
    expect(s.softRules).toEqual(DEFAULT_SOFT_RULES);
    s.loadSample();
    s.setResult(sampleResult);
    const sampleLock = sampleResult.placements[0];
    s.setLocks([sampleLock]);
    s.setSoftRules({ ...DEFAULT_SOFT_RULES, s5: false });
    const after = useAppStore.getState();
    expect(after.softRules.s5).toBe(false);
    expect(after.result!.placements).toBe(sampleResult.placements);
    expect(after.locks).toEqual([sampleLock]);
    expect(after.result!.score.breakdown.lateFinish).toBeNull();
    expect(after.result!.score.total).toBe(sampleResult.score.total - sampleResult.score.breakdown.lateFinish!);
  });

  it("remembers the switches the timetable was made with, from the first flip or the last run", () => {
    const s = useAppStore.getState();
    s.loadSample();
    s.setResult(sampleResult);
    expect(useAppStore.getState().rulesAtRun).toBeNull();
    s.setSoftRules({ ...DEFAULT_SOFT_RULES, s5: false });
    s.setSoftRules({ ...DEFAULT_SOFT_RULES, s5: false, s1: false });
    expect(useAppStore.getState().rulesAtRun).toEqual(DEFAULT_SOFT_RULES);
    s.setRunResult(sampleResult, { ...DEFAULT_SOFT_RULES, s5: false, s1: false });
    expect(useAppStore.getState().rulesAtRun).toEqual({ ...DEFAULT_SOFT_RULES, s5: false, s1: false });
    expect(useAppStore.getState().result).toBe(sampleResult);
  });

  it("forgets the run's switches on Start over and when a version is opened", () => {
    const s = useAppStore.getState();
    s.setRunResult(sampleResult, DEFAULT_SOFT_RULES);
    s.reset();
    expect(useAppStore.getState().rulesAtRun).toBeNull();
    s.setRunResult(sampleResult, DEFAULT_SOFT_RULES);
    const { step: _, ...copy } = useAppStore.getState();
    s.loadOnline(copy, { instituteId: "i", instituteName: "I", timetableId: "t", name: "T", version: 1, savedHash: "h" });
    expect(useAppStore.getState().rulesAtRun).toBeNull();
  });

  it("survives loading the sample, and Start over brings back the defaults", () => {
    useAppStore.getState().setSoftRules({ ...DEFAULT_SOFT_RULES, s1: false });
    useAppStore.getState().loadSample();
    expect(useAppStore.getState().softRules.s1).toBe(false);
    useAppStore.getState().reset();
    expect(useAppStore.getState().softRules).toEqual(DEFAULT_SOFT_RULES);
  });

  it("is persisted and rehydrated", async () => {
    useAppStore.getState().setSoftRules({ ...DEFAULT_SOFT_RULES, s3: false });
    const persisted = useAppStore.persist.getOptions().partialize!(useAppStore.getState()) as Record<string, unknown>;
    expect(persisted.softRules).toEqual({ ...DEFAULT_SOFT_RULES, s3: false });

    useAppStore.getState().reset();
    const saved = JSON.stringify({ state: persisted, version: PERSIST_VERSION });
    vi.stubGlobal("localStorage", { getItem: () => saved, setItem: () => {}, removeItem: () => {} });
    await useAppStore.persist.rehydrate();
    expect(useAppStore.getState().softRules).toEqual({ ...DEFAULT_SOFT_RULES, s3: false });
  });

  it("leaves the run's switches and the time limit out of the persisted state", () => {
    useAppStore.getState().setRunResult(result, DEFAULT_SOFT_RULES);
    const persisted = useAppStore.persist.getOptions().partialize!(useAppStore.getState()) as Record<string, unknown>;
    expect(persisted).not.toHaveProperty("rulesAtRun");
    expect(persisted).not.toHaveProperty("timeLimitSec");
  });

  it("is part of an undo snapshot", () => {
    useAppStore.getState().pushUndo("switch");
    useAppStore.getState().setSoftRules({ ...DEFAULT_SOFT_RULES, s2: false });
    useAppStore.getState().undo();
    expect(useAppStore.getState().softRules).toEqual(DEFAULT_SOFT_RULES);
  });
});

describe("migrateState", () => {
  it("drops engineMode from state saved before version 1, keeping the rest", () => {
    const old = { engineMode: "auto", printHeading: "X" };
    expect(migrateState(old, 0)).toEqual({ printHeading: "X", online: null, softRules: DEFAULT_SOFT_RULES });
    expect(old).toHaveProperty("engineMode"); // input not mutated
  });

  it("adds an empty online link to state saved by version 1", () => {
    expect(migrateState({ printHeading: "X" }, 1)).toEqual({ printHeading: "X", online: null, softRules: DEFAULT_SOFT_RULES });
  });

  it("gives state saved by version 2 the default soft-rule switches", () => {
    expect(migrateState({ printHeading: "X", online: null }, 2)).toEqual({ printHeading: "X", online: null, softRules: DEFAULT_SOFT_RULES });
  });

  it("drops the old slider's time limit from state saved by version 3 and earlier", () => {
    const softRules = { ...DEFAULT_SOFT_RULES, s2: false };
    expect(migrateState({ timeLimitSec: 90, printHeading: "X", online: null, softRules }, 3)).toEqual({ printHeading: "X", online: null, softRules });
    expect(migrateState({ timeLimitSec: 90 }, 1)).not.toHaveProperty("timeLimitSec");
  });

  it("leaves current state alone", () => {
    expect(migrateState({ printHeading: "X" }, PERSIST_VERSION)).toEqual({ printHeading: "X" });
  });

  it("keeps a persisted old limit from coming back on rehydrate", async () => {
    useAppStore.getState().reset();
    const saved = JSON.stringify({ state: { printHeading: "Old", timeLimitSec: 90 }, version: 3 });
    vi.stubGlobal("localStorage", { getItem: () => saved, setItem: () => {}, removeItem: () => {} });
    await useAppStore.persist.rehydrate();
    vi.unstubAllGlobals();
    expect(useAppStore.getState().printHeading).toBe("Old");
    expect(useAppStore.getState().timeLimitSec).toBe(20);
  });

  it("has no engineMode in a fresh store", () => {
    useAppStore.getState().reset();
    expect(useAppStore.getState()).not.toHaveProperty("engineMode");
  });
});

describe("undo stack", () => {
  beforeEach(() => {
    useAppStore.getState().reset();
    useAppStore.setState({ history: { undo: [], redo: [] } });
  });

  const lock = { sessionId: "s1", day: 1, period: 2, roomId: "r1" };

  it("pushUndo, a change, then undo brings back the result and locks; redo brings the change back", () => {
    const s = useAppStore.getState();
    s.loadSample();
    const before = useAppStore.getState();
    s.pushUndo("move DS to Tue P3");
    const result: SolveResult = {
      engine: "cpsat",
      status: "feasible",
      placements: [lock],
      unplaced: [],
      score: { total: 4, breakdown: { subjectRepeat: 0, teacherOverload: 0, sectionGaps: 4, batchIdle: 0, lateFinish: 0 } },
      timeMs: 1,
    };
    s.setResult(result);
    s.setLocks([lock]);
    expect(useAppStore.getState().history.undo.map((e) => e.label)).toEqual(["move DS to Tue P3"]);

    expect(useAppStore.getState().undo()).toBe("move DS to Tue P3");
    expect(useAppStore.getState().result).toBe(before.result);
    expect(useAppStore.getState().locks).toBe(before.locks);
    expect(useAppStore.getState().teachers).toBe(before.teachers);

    expect(useAppStore.getState().redo()).toBe("move DS to Tue P3");
    expect(useAppStore.getState().result).toBe(result);
    expect(useAppStore.getState().locks).toEqual([lock]);
  });

  it("undo and redo with nothing on the stack change nothing", () => {
    const before = useAppStore.getState();
    expect(before.undo()).toBeNull();
    expect(before.redo()).toBeNull();
    expect(useAppStore.getState().settings).toBe(before.settings);
  });

  it("leaves the step, the online link and the print heading alone", () => {
    const s = useAppStore.getState();
    s.pushUndo("x");
    s.setStep(3);
    s.setPrintHeading("Sem 5");
    s.setLocks([lock]);
    useAppStore.getState().undo();
    const after = useAppStore.getState();
    expect(after.locks).toEqual([]);
    expect(after.step).toBe(3);
    expect(after.printHeading).toBe("Sem 5");
  });

  it("is not in the persisted state", () => {
    useAppStore.getState().pushUndo("x");
    const persisted = useAppStore.persist.getOptions().partialize!(useAppStore.getState()) as Record<string, unknown>;
    expect(persisted).not.toHaveProperty("history");
    expect(persisted).toHaveProperty("locks");
    expect(persisted).toHaveProperty("online");
  });
});

describe("softRulesPatch and rescored", () => {
  const college = { ...sampleCollege, result: sampleResult };

  it("scores the stored timetable under the new switches, and keeps its placements", () => {
    const off = { ...DEFAULT_SOFT_RULES, s4: false };
    const out = softRulesPatch({ ...college, softRules: DEFAULT_SOFT_RULES, rulesAtRun: null }, off);
    expect(out.softRules).toBe(off);
    expect(out.result!.placements).toBe(sampleResult.placements);
    expect(out.result!.score.breakdown.batchIdle).toBeNull();
    expect(out.result!.score.breakdown.lateFinish).toBe(sampleResult.score.breakdown.lateFinish);
  });

  it("sets the baseline to the switches before the first flip, then keeps it", () => {
    const first = softRulesPatch({ ...college, softRules: DEFAULT_SOFT_RULES, rulesAtRun: null }, { ...DEFAULT_SOFT_RULES, s1: false });
    expect(first.rulesAtRun).toBe(DEFAULT_SOFT_RULES);
    const run = { ...DEFAULT_SOFT_RULES, s3: false };
    expect(softRulesPatch({ ...college, softRules: run, rulesAtRun: run }, DEFAULT_SOFT_RULES).rulesAtRun).toBe(run);
  });

  it("has nothing to score without a timetable", () => {
    expect(rescored({ ...college, result: null }, DEFAULT_SOFT_RULES)).toBeNull();
  });

  it("keeps the old score when the data can't be scored", () => {
    const broken = { ...college, settings: undefined as never };
    expect(rescored(broken, DEFAULT_SOFT_RULES)).toBe(sampleResult);
  });
});
