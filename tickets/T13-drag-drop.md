# T13 — Stretch: drag-and-drop with valid-slot highlighting
**Status:** TODO
**Lane:** any · **Prereqs:** T10 · **Branch:** t13-dnd

## Goal
Drag a session to another cell; valid targets highlight green, invalid red with a tooltip reason.

## Details
- Use `@dnd-kit/core`. On drag start compute valid (day, period, room) targets with the same checks as the
  validator (reuse T02/T03 helpers). Drop → move placement, auto-lock it, re-run `validate()` + `score()`.
- Section view only is fine.

## Done when
- [ ] Moves never create a clash (validator badge stays green)
- [ ] Committed: `T13: drag and drop`
