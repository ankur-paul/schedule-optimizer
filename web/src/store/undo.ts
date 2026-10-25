import type { AppData } from "./useAppStore";

/** What Undo brings back: the working copy's data, settings, result and locks. Not the step, the online link or UI state. */
export type Snapshot = Pick<AppData, "settings" | "departments" | "teachers" | "rooms" | "sections" | "courses" | "result" | "locks">;

/** One whole change: the state before it (or after it, on the Redo stack) and what it was, e.g. "move CSE B DS to Tue P4". */
export interface UndoEntry {
  label: string;
  snapshot: Snapshot;
}

/** Oldest first; the top is the last entry. */
export interface UndoStacks {
  undo: UndoEntry[];
  redo: UndoEntry[];
}

export const UNDO_LIMIT = 20;

export const emptyStacks = (): UndoStacks => ({ undo: [], redo: [] });

/** The snapshot fields of a state. Arrays are shared, not copied: the store replaces them on every change. */
export function takeSnapshot(state: Snapshot): Snapshot {
  const { settings, departments, teachers, rooms, sections, courses, result, locks } = state;
  return { settings, departments, teachers, rooms, sections, courses, result, locks };
}

/** Add an entry before a change; the oldest drops past the limit, and Redo is cleared. */
export function pushEntry(stacks: UndoStacks, entry: UndoEntry): UndoStacks {
  return { undo: [...stacks.undo, entry].slice(-UNDO_LIMIT), redo: [] };
}

/**
 * Take the top of one stack and put the current state, under the same label, on the other. `null` when there is
 * nothing to take. The caller restores `restore.snapshot`.
 */
function swap(from: UndoEntry[], to: UndoEntry[], current: Snapshot): { from: UndoEntry[]; to: UndoEntry[]; restore: UndoEntry } | null {
  const restore = from.at(-1);
  if (!restore) return null;
  return { from: from.slice(0, -1), to: [...to, { label: restore.label, snapshot: takeSnapshot(current) }].slice(-UNDO_LIMIT), restore };
}

export function undoEntry(stacks: UndoStacks, current: Snapshot): { stacks: UndoStacks; restore: UndoEntry } | null {
  const s = swap(stacks.undo, stacks.redo, current);
  return s && { stacks: { undo: s.from, redo: s.to }, restore: s.restore };
}

export function redoEntry(stacks: UndoStacks, current: Snapshot): { stacks: UndoStacks; restore: UndoEntry } | null {
  const s = swap(stacks.redo, stacks.undo, current);
  return s && { stacks: { undo: s.to, redo: s.from }, restore: s.restore };
}

/** What Undo and Redo would act on next, for the header tooltips; `null` hides the button. */
export const nextUndoLabel = (stacks: UndoStacks): string | null => stacks.undo.at(-1)?.label ?? null;
export const nextRedoLabel = (stacks: UndoStacks): string | null => stacks.redo.at(-1)?.label ?? null;
