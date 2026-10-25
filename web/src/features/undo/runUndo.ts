import { toast } from "sonner";
import type { UndoEntry } from "@/store/undo";
import { useAppStore } from "@/store/useAppStore";

/** Undo the newest change and say what it was. */
export function runUndo() {
  const label = useAppStore.getState().undo();
  if (label) toast(`Undone: ${label}`);
}

export function runRedo() {
  const label = useAppStore.getState().redo();
  if (label) toast(`Redone: ${label}`);
}

/**
 * A toast's Undo: undoes its own change only while it is still the newest, so an old toast never undoes a later
 * change by mistake.
 */
export function undoIfNewest(entry: UndoEntry) {
  const { undo } = useAppStore.getState().history;
  if (undo.at(-1) === entry) runUndo();
  else if (undo.includes(entry)) toast.info("There are newer changes. Use Undo at the top of the page to go back step by step.");
  else toast.info("Already undone.");
}
