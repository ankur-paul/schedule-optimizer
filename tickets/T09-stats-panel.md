# T09 — Stats: score breakdown, teacher load, room utilisation
**Status:** DONE
**Lane:** any · **Prereqs:** T02, T08 · **Branch:** t09-stats

## Goal
Show *why* this timetable is good — answers "uneven teaching loads" and "rooms that sit empty" from the brief.

## Scope / files
- `web/src/features/view/StatsPanel.tsx`, `web/src/domain/stats.ts` (pure).
- Score card: total penalty + 4 rows (S1–S4) with plain-English labels and ⓘ tooltips.
- Teacher load table: teacher, department, periods/week, per-day mini bars; highlight max/min; sortable.
- Room utilisation: % of teaching slots used per room; highlight shared rooms; headline stat
  "Shared room utilisation: 72%".

## Tests (keep light)
- `stats.test.ts`: load and utilisation numbers for the tiny T02 fixture.

## Done when
- [x] Panel visible in step ④ beside/below the grid
- [x] Committed: `T09: stats panel`
