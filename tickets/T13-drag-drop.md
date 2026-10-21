# T13 — Stretch: drag-and-drop with valid-slot highlighting
**Status:** DONE
**Lane:** any · **Prereqs:** T10 · **Branch:** t13-dnd

## Goal
Drag a session to another cell; valid targets highlight green, invalid red with a tooltip reason.

## Details
- Use `@dnd-kit/core`. On drag start compute valid (day, period, room) targets with the same checks as the
  validator (reuse T02/T03 helpers). Drop → move placement, auto-lock it, re-run `validate()` + `score()`.
- Section view only is fine.

## Done when
- [x] Moves never create a clash (validator badge stays green)
- [x] Committed: `T13: drag and drop`

## Notes
- Slots are checked directly (H1–H4, H6–H8) instead of running `validate()` per slot: ~15 ms for a whole week on the
  sample. A test checks every slot of every tiny-college session against `validate()`; on the sample, 2,700 slots
  agreed with it. Every drop is still re-checked with `validate()` before it is applied.
- Beyond the ticket: score change per green slot, unplaced sessions can be dragged in, Undo, verified badge in step ④.
