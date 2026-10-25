import { beforeEach, describe, expect, it } from "vitest";
import type { SolveResult } from "@/domain/types";
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
    expect(migrateState(old, 0)).toEqual({ timeLimitSec: 30, printHeading: "X", online: null });
    expect(old).toHaveProperty("engineMode"); // input not mutated
  });

  it("adds an empty online link to state saved by version 1", () => {
    expect(migrateState({ timeLimitSec: 30, printHeading: "X" }, 1)).toEqual({ timeLimitSec: 30, printHeading: "X", online: null });
  });

  it("leaves current state alone", () => {
    expect(migrateState({ timeLimitSec: 20 }, PERSIST_VERSION)).toEqual({ timeLimitSec: 20 });
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
      score: { total: 4, breakdown: { subjectRepeat: 0, teacherOverload: 0, sectionGaps: 4, batchIdle: 0 } },
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
