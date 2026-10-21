# T08 — Step ④ Timetable grid with Section/Teacher/Room views
**Status:** TODO
**Lane:** D · **Prereqs:** T01, T05 · **Branch:** t08-views

## Goal
Timetables that are easy to read — this is what judges look at most.

## Scope / files
- `web/src/features/view/TimetableGrid.tsx`, `ViewStep.tsx`, `colors.ts`.
- Until T07 lands, develop against a hand-made `web/src/features/view/mockResult.ts` (a few placements for the
  sample college) — delete it after integration.
- View switcher: segmented control **Section / Teacher / Room** + searchable select of the entity
  (grouped by department). Also "Prev/Next" arrows to flip quickly.
- Grid: columns = periods (with times; break columns narrow and hatched; lunch candidate headers marked 🍽),
  rows = days. Lab sessions span multiple columns.
- Cell content: subject (bold), then teacher / room / section depending on view; batch label `B1` chip.
  Split-section cells show batch sessions stacked in the same cell.
- **Colour per subject** (stable hash → palette of ~12 soft colours, readable text contrast).
- Hover tooltip on cell: full details (subject, section+batch, teacher, room, time).
- Click cell → side panel/dialog with details (T10 adds the Lock button here).
- Empty state when no result: "Generate a timetable first" with button to step ③.

## Tests (keep light)
- None (visual). Check manually with sample at 1280px and phone width (horizontal scroll inside grid only).

## Done when
- [ ] All three views render correctly for the sample
- [ ] Committed: `T08: timetable grid views`
