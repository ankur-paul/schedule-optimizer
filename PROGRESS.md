# Progress

Features built so far. Append one line per feature: `- [TNN] what was built (how to see/try it)`.
Ticket status is in `tickets/`; this file records what actually works.

## Log

- [plan] PLAN.md, tickets T00–T14, CLAUDE.md written
- [T00] Vite+React+TS+Tailwind+shadcn web app and FastAPI server with `/health` (`cd web && npm run dev`; `cd server && .venv/bin/uvicorn main:app --port 8000`; tests: `npm test`, `pytest`)
- [T01] Domain contract (`web/src/domain/types.ts`), `expandSessions`, eligibility helpers, solvable sample college (3 depts, 9 sections, 25 teachers, 210 sessions) + golden sessions file (`cd web && npm test`; regenerate golden with `npm run gen:golden`)
- [T05] App shell with 4-step stepper (Back/Next, hints), zustand store persisted to localStorage `timetable-v1` (`loadSample`, `reset`), Step ① Setup: day chips, editable periods table + "Generate periods" helper, lunch candidates, inline validation (`cd web && npm run dev`; edit settings and reload; tests in `src/features/setup/periods.test.ts`)
- [T06] Excel template/import/export logic (`web/src/features/data/excel.ts`: all-or-nothing parse with row-level errors, CSV per sheet) and data checks (`dataChecks.ts`: dangling refs, no eligible room, lab too long, section/teacher load vs free periods) (`cd web && npx vitest run src/features/data`)
- [T06] Step ② Data UI: Load sample (toast), Download template / Export current data (.xlsx), Upload .xlsx or per-sheet CSVs with row-level errors and an Import confirm, summary (counts, busiest-section load bars, blocking problems + over-capacity warnings), editable tabs for Courses/Sections/Teachers/Rooms/Departments; Next blocked while data has errors (`cd web && npm run dev` → step 2)

## Known issues / cuts

- [T05] Steps ②–④ are placeholders in `web/src/App.tsx` until T06/T07/T08 swap in their components. Any settings edit clears `result` and `locks` (placements point at day/period indexes).
- [T06] Importing or loading the sample replaces all data tables (after a confirm). Inline table edits do not clear an existing timetable; T07's validator re-checks it. A course with an error is left out of the load numbers until fixed.
