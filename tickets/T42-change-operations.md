# T42 — Working-copy change operations
**Status:** IN PROGRESS
**Lane:** C · **Prereqs:** T40 · **Branch:** t42-change-operations

## Goal
The operations the assistant can propose on the working copy, as pure TypeScript: a schema, a dry run that checks a
whole change set, and an apply. Nothing here touches the UI or the network; T44 wires it to the panel. Plan:
[`docs/discussions/2026-10-25-agent-write-actions.md`](../docs/discussions/2026-10-25-agent-write-actions.md) (How
it's built, Q7, Q8, Q16, Q17, Q18).

## Scope / files
- `shared/agent-change-tool.json`: the `propose_changes` tool definition (strict, `additionalProperties: false`),
  with the working-copy operations. It moves into `shared/agent-tools.json` in T44: the server sends that file to
  Claude as it is, and the panel can't handle the tool before T44.
- `web/src/features/assistant/changes.ts`: `dryRun(changes, data, ctx) → { ok, lines, warnings } | { ok: false,
  errors }` and `applyChanges(changes, data) → data`.
- Tests next to it.

## Details
- **Input:** `{ summary, changes: Change[] }`, at most 100 changes. Each change has an `op` and its fields. Teachers
  are referred to by their masked code (T37) and unmasked before the dry run.
- **Operations:**
  - `add_*`, `update_*`, `remove_*` for departments, teachers, rooms, sections and courses. An update names only the
    fields it changes. A remove of something still referred to (a teacher on a course) fails with what refers to it.
  - `set_settings`: the card line warns that the timetable and locks are cleared.
  - `move { sessionId, day, period, roomId? }` and `swap { a, b }`: moved classes are locked there, as
    drag-and-drop does. Reuse `applyMove` and `checkMove` from `features/view/moves.ts`.
  - `lock` and `unlock` on placed sessions.
  - `regenerate`: no change to the data in the dry run; marks that T44 runs Generate on *Apply*.
  - `load_sample`: replaces the working copy; the line carries the unsaved-work warning when `hasUnsavedWork`.
- **Dry run:** applies the changes in order to a copy, so later changes see earlier ones (add a room, then move a
  lab into it).
  - **Moves, swaps and locks** must keep H1–H8. A break fails the set and names the rule and the change.
  - **Data and settings changes** run `checkData`; the result lists the checks that are new compared with before.
    They don't fail the set.
  - **Unknown ids, a bad field, more than 100 changes:** fail with a short message the model can act on ("Change 4:
    no room with id LH5. Use find."). Never throws.
- **Lines for the card:** one readable line per change, with names the user knows (section and course names,
  `slotLabel`), and teacher codes, unmasked for display by T44.
- **Apply:** the same steps as the dry run on the real data, returning the new working copy for the store.

## Tests
- Every operation on the sample college: its line and its effect.
- Failures: an H1, H3, H6 and H7 break on a move; a swap that breaks H2; remove of a referenced teacher; an unknown
  id; a schema mismatch; 101 changes. Each with the message, and none throws.
- New data checks listed after an edit that causes one; checks that existed before aren't repeated.
- Order: add a room then move into it passes; the reverse order fails.
- A moved class ends up locked; `set_settings` clears result and locks; `load_sample` warns with unsaved work.
- `applyChanges` equals the dry run's copy.
- The tool definition is strict, and every `op` in it has a handler and every handler an `op`.

## Done when
- [ ] Schema, `dryRun` and `applyChanges` for every working-copy operation above
- [ ] Tests above pass; full suite and `npx tsc -b` green
- [ ] PROGRESS.md line
- [ ] Committed: `T42: working-copy change operations`
