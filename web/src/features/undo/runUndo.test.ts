import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "@/store/useAppStore";
import { runRedo, runUndo, undoIfNewest } from "./runUndo";

const { toast } = vi.hoisted(() => {
  const toast = Object.assign(vi.fn(), { info: vi.fn() });
  return { toast };
});
vi.mock("sonner", () => ({ toast }));

const lock = (period: number) => ({ sessionId: `s${period}`, day: 0, period, roomId: "r" });

beforeEach(() => {
  useAppStore.getState().reset();
  useAppStore.setState({ history: { undo: [], redo: [] } });
  toast.mockClear();
  toast.info.mockClear();
});

describe("runUndo and runRedo", () => {
  it("say what was undone and redone", () => {
    useAppStore.getState().pushUndo("move CSE-2A DS to Tue P3");
    useAppStore.getState().setLocks([lock(1)]);
    runUndo();
    expect(toast).toHaveBeenLastCalledWith("Undone: move CSE-2A DS to Tue P3");
    expect(useAppStore.getState().locks).toEqual([]);
    runRedo();
    expect(toast).toHaveBeenLastCalledWith("Redone: move CSE-2A DS to Tue P3");
    expect(useAppStore.getState().locks).toEqual([lock(1)]);
  });

  it("stay quiet with nothing to undo or redo", () => {
    runUndo();
    runRedo();
    expect(toast).not.toHaveBeenCalled();
  });
});

describe("undoIfNewest", () => {
  it("undoes its own change while it is the newest", () => {
    const entry = useAppStore.getState().pushUndo("a");
    useAppStore.getState().setLocks([lock(1)]);
    undoIfNewest(entry);
    expect(useAppStore.getState().locks).toEqual([]);
    expect(toast).toHaveBeenCalledWith("Undone: a");
  });

  it("leaves a later change alone and points to the header", () => {
    const first = useAppStore.getState().pushUndo("a");
    useAppStore.getState().setLocks([lock(1)]);
    useAppStore.getState().pushUndo("b");
    useAppStore.getState().setLocks([lock(1), lock(2)]);
    undoIfNewest(first);
    expect(useAppStore.getState().locks).toHaveLength(2);
    expect(toast.info).toHaveBeenCalledWith(expect.stringContaining("newer changes"));
  });

  it("does nothing twice", () => {
    const entry = useAppStore.getState().pushUndo("a");
    useAppStore.getState().setLocks([lock(1)]);
    undoIfNewest(entry);
    undoIfNewest(entry);
    expect(useAppStore.getState().locks).toEqual([]);
    expect(useAppStore.getState().history.redo).toHaveLength(1);
    expect(toast.info).toHaveBeenCalledWith("Already undone.");
  });
});
