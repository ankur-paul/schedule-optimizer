import { beforeEach, describe, expect, it, vi } from "vitest";
import timetableJson from "../../../../shared/fixtures/sample-timetable.json";
import { sampleCollege } from "@/domain/sampleCollege";
import type { SolveResult } from "@/domain/types";
import type { RunEnd } from "@/features/generate/useGenerate";
import { applyCard, type ApplyDeps } from "./applyCard";
import { proposalOutcome, type Card } from "./chat";
import { dryRun, type ChangeContext, type ChangeData, type OnlineChange, type OnlineRun } from "./changes";
import { teacherCodes } from "./mask";
import { findCard, newChat, resetAssistant, useAssistant } from "./useAssistant";

const college = (): ChangeData => {
  const { settings, departments, teachers, rooms, sections, courses } = structuredClone(sampleCollege);
  return { settings, departments, teachers, rooms, sections, courses, result: structuredClone(timetableJson as SolveResult), locks: [] };
};
const teacher = sampleCollege.teachers[0];
const code = teacherCodes(sampleCollege.teachers).get(teacher.id)!;

const MOVE = { op: "move", sessionId: "cse-a-ds:L1", day: "Tue", period: "P1", roomId: "" };
const ADD_ROOM = { op: "add_room", id: "lh-5", name: "LH-5", type: "classroom", departmentId: "" };
const SAVE = { op: "save_online" };
const RENAME = { op: "rename_online", name: "CSE odd v2" };

/** A fake store, solver and online API that log what happens, in order. */
function world(opts: { regenerate?: RunEnd; online?: (change: OnlineChange) => OnlineRun } = {}) {
  let data = college();
  const log: string[] = [];
  const newResult: SolveResult = { ...data.result!, score: { ...data.result!.score, total: data.result!.score.total - 4 } };
  const deps: ApplyDeps = {
    data: () => data,
    setData: (next) => {
      log.push("set data");
      data = next;
    },
    pushUndo: (label) => log.push(`undo: ${label}`),
    regenerate: vi.fn(async () => {
      log.push("regenerate");
      const end = opts.regenerate === undefined ? { kind: "done" as const } : opts.regenerate;
      if (end?.kind === "done") data = { ...data, result: newResult };
      return end;
    }),
    runOnline: vi.fn(async (change: OnlineChange): Promise<OnlineRun> => {
      log.push(change.op);
      return opts.online?.(change) ?? { ok: true };
    }),
  };
  return { deps, log, data: () => data, edit: (fn: (d: ChangeData) => ChangeData) => (data = fn(data)), newResult };
}

/** Show a card for `changes`, dry-run on `data` as the loop does. Online changes pass the order check only. */
function show(changes: unknown[], data: ChangeData, ctx: ChangeContext = { hasUnsavedWork: false }): Card {
  const s = useAssistant.getState();
  const n = s.cards + 1;
  const input = { summary: "Test", changes };
  const { card } = proposalOutcome(dryRun(input, data, ctx), n, input);
  if (!card) throw new Error("the proposal didn't pass");
  useAssistant.setState({ cards: n, items: [...s.items, { kind: "card", card }] });
  return card;
}

const card = (n: number) => findCard(n)!;
const outcomes = () => useAssistant.getState().outcomes;

beforeEach(() => resetAssistant());

describe("applyCard", () => {
  it("makes the working-copy changes, then regenerates, then the online changes, in order", async () => {
    const w = world();
    show([ADD_ROOM, MOVE, { op: "regenerate" }, SAVE, RENAME], w.data());
    await applyCard(1, w.deps);
    expect(w.log).toEqual(["undo: assistant changes #1", "set data", "regenerate", "save_online", "rename_online"]);
    expect(w.data().rooms.some((r) => r.id === "lh-5")).toBe(true);
    expect(card(1)).toMatchObject({ status: "applied", steps: ["done", "done", "done", "done", "done"] });
    expect(outcomes()).toEqual(["Applied changes #1"]);
    expect(useAssistant.getState().applying).toBeNull();
  });

  it("takes the undo snapshot before the first change, on the working copy as it was", async () => {
    const w = world();
    const before = w.data();
    let snapshotOf: ChangeData | null = null;
    w.deps.pushUndo = () => (snapshotOf = w.data());
    show([MOVE], w.data());
    await applyCard(1, w.deps);
    expect(snapshotOf).toBe(before);
    expect(w.data()).not.toBe(before);
    expect(w.data().locks).toEqual([expect.objectContaining({ sessionId: "cse-a-ds:L1", period: 0 })]);
  });

  it("shows the score before the card and after its regenerate", async () => {
    const w = world();
    const before = w.data().result!.score.total;
    show([{ op: "regenerate" }], w.data());
    await applyCard(1, w.deps);
    expect(card(1).after).toEqual({ text: `Score ${before} → ${before - 4} · 0 unplaced`, failed: false });
  });

  it("compares with the timetable before the card, not the one its moves left", async () => {
    const w = world();
    const before = w.data().result!.score.total;
    show([MOVE, { op: "regenerate" }], w.data());
    await applyCard(1, w.deps);
    expect(card(1).after!.text).toBe(`Score ${before} → ${w.newResult.score.total} · 0 unplaced`);
  });

  it("stops at a failed regenerate: the data changes stay, the online changes don't run", async () => {
    const w = world({ regenerate: { kind: "failed", failure: { kind: "infeasible", message: "No timetable exists.", diagnosis: [] } } });
    show([ADD_ROOM, { op: "regenerate" }, SAVE], w.data());
    await applyCard(1, w.deps);
    expect(w.log).toEqual(["undo: assistant changes #1", "set data", "regenerate"]);
    expect(w.data().rooms.some((r) => r.id === "lh-5")).toBe(true);
    expect(card(1)).toMatchObject({
      status: "stopped",
      steps: ["done", "failed", "pending"],
      failure: { step: 1, reason: "This timetable can't be built." },
      after: { text: "This timetable can't be built.", failed: true },
    });
    expect(outcomes()).toEqual(["Applied changes #1 up to step 2: This timetable can't be built."]);
  });

  it("stops when Generate is cancelled or already running, without a score line", async () => {
    for (const end of [{ kind: "cancelled" as const }, null]) {
      resetAssistant();
      const w = world({ regenerate: end });
      show([{ op: "regenerate" }], w.data());
      await applyCard(1, w.deps);
      expect(card(1).status).toBe("stopped");
      expect(card(1).after).toBeUndefined();
      expect(card(1).failure!.reason).toMatch(end ? /cancelled/ : /Another Generate is running/);
    }
  });

  it("stops at the first failed online change and runs none after it", async () => {
    const w = world({ online: (c) => (c.op === "save_online" ? { ok: false, reason: "Someone saved this timetable online since it was opened. Save by hand.", conflict: true } : { ok: true }) });
    show([MOVE, SAVE, RENAME], w.data());
    await applyCard(1, w.deps);
    expect(w.log).toEqual(["undo: assistant changes #1", "set data", "save_online"]);
    expect(card(1)).toMatchObject({ status: "stopped", steps: ["done", "failed", "pending"], failure: { step: 1, conflict: true } });
    expect(outcomes()).toEqual(["Applied changes #1 up to step 2: save conflict"]);
  });

  it("masks a teacher's name in a failure's reason", async () => {
    const w = world({ online: () => ({ ok: false, reason: `Refused for ${teacher.name}.` }) });
    show([SAVE], w.data());
    await applyCard(1, w.deps);
    expect(card(1).failure!.reason).toBe(`Refused for ${code}.`);
    expect(outcomes()).toEqual([`Applied changes #1 up to step 1: Refused for ${code}.`]);
  });

  it("takes no undo snapshot for a card of online changes that leave the working copy alone", async () => {
    const w = world();
    show([SAVE, RENAME], w.data());
    await applyCard(1, w.deps);
    expect(w.log).toEqual(["save_online", "rename_online"]);
  });

  it("takes one before opening a timetable, which replaces the working copy", async () => {
    const w = world();
    show([{ op: "open_online", timetableId: "t2", version: 0 }], w.data());
    await applyCard(1, w.deps);
    expect(w.log).toEqual(["undo: assistant changes #1", "open_online"]);
  });

  it("marks a card out of date when the working copy changed under it, and changes nothing", async () => {
    const w = world();
    show([MOVE, SAVE], w.data());
    w.edit((d) => ({ ...d, courses: d.courses.filter((c) => c.id !== "cse-a-ds") }));
    const before = w.data();
    await applyCard(1, w.deps);
    expect(w.log).toEqual([]);
    expect(w.data()).toBe(before);
    expect(card(1)).toMatchObject({ status: "outOfDate", steps: ["pending", "pending"] });
    expect(outcomes()).toEqual(["Changes #1 are out of date and weren't applied"]);
  });

  it("still applies an older card that passes on the working copy as it is now", async () => {
    const w = world();
    show([{ op: "lock", sessionId: "cse-b-ds:L1" }], w.data());
    show([MOVE], w.data());
    await applyCard(2, w.deps);
    await applyCard(1, w.deps);
    expect(card(1).status).toBe("applied");
    expect(card(2).status).toBe("applied");
    expect(w.data().locks.map((l) => l.sessionId).sort()).toEqual(["cse-a-ds:L1", "cse-b-ds:L1"]);
  });

  it("applies a card once", async () => {
    const w = world();
    show([MOVE], w.data());
    await Promise.all([applyCard(1, w.deps), applyCard(1, w.deps)]);
    await applyCard(1, w.deps);
    expect(w.log).toEqual(["undo: assistant changes #1", "set data"]);
    expect(outcomes()).toEqual(["Applied changes #1"]);
  });

  it("applies one card at a time, and none while a question runs", async () => {
    const w = world();
    show([MOVE], w.data());
    show([{ op: "lock", sessionId: "cse-b-ds:L1" }], w.data());
    let finish: (end: RunEnd) => void = () => {};
    w.deps.regenerate = () => new Promise((resolve) => (finish = resolve));
    show([{ op: "regenerate" }], w.data());
    const running = applyCard(3, w.deps);
    await applyCard(1, w.deps);
    expect(card(1).status).toBe("proposed");
    finish({ kind: "cancelled" });
    await running;

    useAssistant.setState({ busy: { tools: [] } });
    await applyCard(1, w.deps);
    expect(card(1).status).toBe("proposed");
  });

  it("doesn't apply a discarded card", async () => {
    const w = world();
    show([MOVE], w.data());
    useAssistant.setState((s) => ({ items: s.items.map((i) => (i.kind === "card" ? { ...i, card: { ...i.card, status: "discarded" as const } } : i)) }));
    await applyCard(1, w.deps);
    expect(w.log).toEqual([]);
  });

  it("finishes after New chat without touching the new chat", async () => {
    const w = world();
    let finish: (end: RunEnd) => void = () => {};
    w.deps.regenerate = () => new Promise((resolve) => (finish = resolve));
    show([{ op: "regenerate" }], w.data());
    const running = applyCard(1, w.deps);
    newChat();
    show([MOVE], w.data());
    finish({ kind: "done" });
    await running;
    expect(card(1).status).toBe("proposed");
    expect(outcomes()).toEqual([]);
    expect(useAssistant.getState().applying).toBeNull();
  });
});
