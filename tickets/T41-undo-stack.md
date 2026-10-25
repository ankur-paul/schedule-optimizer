# T41 — Undo stack
**Status:** DONE
**Lane:** A · **Prereqs:** — · **Branch:** t41-undo-stack

## Goal
One undo history for whole changes to the working copy: header Undo and Redo, keyboard shortcuts, and drag-and-drop
moves on the same stack. The assistant's change cards (T44) push to it. Plan:
[`docs/discussions/2026-10-25-agent-write-actions.md`](../docs/discussions/2026-10-25-agent-write-actions.md) (Undo
and Redo, Q3, Q15).

## Scope / files
- `web/src/store/useAppStore.ts`: the stack and its actions; not persisted.
- `web/src/store/undo.ts` (or similar): the pure stack logic, with Vitest.
- The header: Undo and Redo buttons with tooltips; Ctrl+Z and Ctrl+Shift+Z.
- `web/src/features/view/MoveDnd.tsx`: `commitMove` pushes a snapshot and its toast *Undo* calls the store's undo.
- Help (`web/src/help/timetable.md`, near drag and drop), FEATURES.md, PROGRESS.md.

## Details
- **Snapshot:** settings, departments, teachers, rooms, sections, courses, result and locks, plus a label. Not the
  step, the online link or UI state.
- **Actions:** `pushUndo(label)` takes a snapshot of the current state before a change; `undo()` and `redo()` swap
  the current state with the top of the matching stack. At most 20; the oldest drops. A new push clears Redo.
- **Memory only.** The stack is excluded from `persist`, so a reload clears it. Snapshots share unchanged arrays
  with the store (no deep copy), so 20 cost little.
- **Header:** the buttons show only when there is something to undo or redo. Tooltip: "Undo: move Database Systems
  to Tue P4". After an undo, a toast says what was undone.
- **Shortcuts:** Ctrl+Z and Ctrl+Shift+Z (Cmd on a Mac), ignored when focus is in a text field, so the tables keep
  the browser's own text undo.
- **Not on the stack:** hand edits in the step ② tables, settings edits in step ①, Generate. (T44 adds a snapshot
  before an assistant card, including its regenerate.)
- **Online:** undo restores the working copy only, which may make it differ from the saved version. The existing
  unsaved-changes line shows that; nothing else changes.

## Tests
- Vitest for the stack: push, undo, redo; the 20 cap; push clears Redo; undo with an empty stack does nothing; the
  restored state equals the snapshot; the label of the next undo and redo.
- The store: `pushUndo` then a change then `undo` brings back result and locks; the stack is not in the persisted
  state.
- The drag move: its snapshot label from `moveSummary`.
- Click through: drag a class, Undo from the header and from the toast, Redo, Ctrl+Z in and out of a text field,
  reload clears the buttons.

## Done when
- [x] Undo stack, header buttons and shortcuts work as above; drag moves use it
- [x] Tests above pass; full suite and `npx tsc -b` green
- [x] Help section, FEATURES.md bullet, PROGRESS.md line
- [x] Committed: `T41: undo stack`
