# T11 — Print CSS / PDF export
**Status:** DONE
**Lane:** D · **Prereqs:** T08 · **Branch:** t11-print

## Goal
Notice-board ready output via browser "Print → Save as PDF".

## Scope / files
- `@media print` styles: hide header/stepper/buttons, A4 landscape, one timetable per page,
  title "CSE-2A — Timetable" + college/semester line, keep subject colours (`print-color-adjust: exact`).
- Buttons: "Print this timetable" and "Print all sections" (renders every section grid with page breaks).
- Optional if time: "Download CSV" of all placements.

## Done when
- [x] Print preview looks clean for one and all sections
- [x] Committed: `T11: print export`
