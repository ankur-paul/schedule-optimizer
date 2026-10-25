import { describe, expect, it } from "vitest";
import type { Placement } from "@/domain/types";
import { emptyStacks, nextRedoLabel, nextUndoLabel, pushEntry, redoEntry, takeSnapshot, UNDO_LIMIT, undoEntry, type Snapshot, type UndoStacks } from "./undo";

/** A snapshot told apart by its locks: one lock per `n`. */
function snap(n: number): Snapshot {
  const locks: Placement[] = Array.from({ length: n }, (_, i) => ({ sessionId: `s${i}`, day: 0, period: i, roomId: "r" }));
  return { settings: { days: ["Mon"], periods: [], lunchCandidates: [] }, departments: [], teachers: [], rooms: [], sections: [], courses: [], result: null, locks, softRules: { s1: true, s2: true, s3: true, s4: true, s5: n % 2 === 0 } };
}

const entry = (label: string, n: number) => ({ label, snapshot: snap(n) });

describe("takeSnapshot", () => {
  it("keeps the working copy and drops everything else, sharing the arrays", () => {
    const s = snap(2);
    const state = { ...s, step: 3, online: null, timeLimitSec: 20, printHeading: "X" };
    const taken = takeSnapshot(state);
    expect(taken).toEqual(s);
    expect(taken).not.toHaveProperty("step");
    expect(taken).not.toHaveProperty("printHeading");
    expect(taken.locks).toBe(s.locks);
  });
});

describe("pushEntry", () => {
  it("adds to the top of Undo", () => {
    const stacks = pushEntry(pushEntry(emptyStacks(), entry("a", 1)), entry("b", 2));
    expect(stacks.undo.map((e) => e.label)).toEqual(["a", "b"]);
    expect(nextUndoLabel(stacks)).toBe("b");
  });

  it("keeps at most 20, dropping the oldest", () => {
    let stacks = emptyStacks();
    for (let i = 0; i < UNDO_LIMIT + 3; i++) stacks = pushEntry(stacks, entry(`m${i}`, i));
    expect(stacks.undo).toHaveLength(UNDO_LIMIT);
    expect(stacks.undo[0].label).toBe("m3");
    expect(nextUndoLabel(stacks)).toBe(`m${UNDO_LIMIT + 2}`);
  });

  it("clears Redo", () => {
    const undone = undoEntry(pushEntry(emptyStacks(), entry("a", 1)), snap(5))!.stacks;
    expect(undone.redo).toHaveLength(1);
    const pushed = pushEntry(undone, entry("b", 2));
    expect(pushed.redo).toEqual([]);
    expect(nextRedoLabel(pushed)).toBeNull();
  });

  it("does not change the stacks it was given", () => {
    const stacks = emptyStacks();
    pushEntry(stacks, entry("a", 1));
    expect(stacks).toEqual(emptyStacks());
  });
});

describe("undoEntry and redoEntry", () => {
  it("does nothing with an empty stack", () => {
    expect(undoEntry(emptyStacks(), snap(1))).toBeNull();
    expect(redoEntry(emptyStacks(), snap(1))).toBeNull();
  });

  it("undo restores the snapshot and moves the current state to Redo under the same label", () => {
    const before = snap(1);
    const now = snap(2);
    const out = undoEntry(pushEntry(emptyStacks(), { label: "move DS to Tue P4", snapshot: before }), now)!;
    expect(out.restore.snapshot).toBe(before);
    expect(out.restore.label).toBe("move DS to Tue P4");
    expect(out.stacks.undo).toEqual([]);
    expect(out.stacks.redo).toEqual([{ label: "move DS to Tue P4", snapshot: now }]);
    expect(nextUndoLabel(out.stacks)).toBeNull();
    expect(nextRedoLabel(out.stacks)).toBe("move DS to Tue P4");
  });

  it("redo brings back the undone state and puts the earlier one back on Undo", () => {
    const before = snap(1);
    const now = snap(2);
    const undone = undoEntry(pushEntry(emptyStacks(), entry("a", 1)), now)!;
    const redone = redoEntry(undone.stacks, before)!;
    expect(redone.restore.snapshot).toEqual(now);
    expect(redone.stacks.redo).toEqual([]);
    expect(redone.stacks.undo).toEqual([{ label: "a", snapshot: before }]);
  });

  it("walks back and forward through several changes in order", () => {
    // States 0 → 1 → 2, each change pushed before it happens.
    let stacks: UndoStacks = pushEntry(pushEntry(emptyStacks(), entry("one", 0)), entry("two", 1));
    let current = snap(2);
    const step = (fn: typeof undoEntry) => {
      const out = fn(stacks, current)!;
      stacks = out.stacks;
      current = out.restore.snapshot;
      return out.restore.label;
    };
    expect(step(undoEntry)).toBe("two");
    expect(current.locks).toHaveLength(1);
    expect(step(undoEntry)).toBe("one");
    expect(current.locks).toHaveLength(0);
    expect(undoEntry(stacks, current)).toBeNull();
    expect(nextRedoLabel(stacks)).toBe("one");
    expect(step(redoEntry)).toBe("one");
    expect(current.locks).toHaveLength(1);
    expect(step(redoEntry)).toBe("two");
    expect(current.locks).toHaveLength(2);
    expect(redoEntry(stacks, current)).toBeNull();
    expect(nextUndoLabel(stacks)).toBe("two");
  });
});
