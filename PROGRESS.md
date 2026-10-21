# Progress

Features built so far. Append one line per feature: `- [TNN] what was built (how to see/try it)`.
Ticket status is in `tickets/`; this file records what actually works.

## Log

- [plan] PLAN.md, tickets T00–T14, CLAUDE.md written
- [T00] Vite+React+TS+Tailwind+shadcn web app and FastAPI server with `/health` (`cd web && npm run dev`; `cd server && .venv/bin/uvicorn main:app --port 8000`; tests: `npm test`, `pytest`)
- [T01] Domain contract (`web/src/domain/types.ts`), `expandSessions`, eligibility helpers, solvable sample college (3 depts, 9 sections, 25 teachers, 210 sessions) + golden sessions file (`cd web && npm test`; regenerate golden with `npm run gen:golden`)
- [T02] Validator (`validate`: H1–H8 + locks/duplicates/unknown ids, readable messages, `missing` for unplaced), scorer (`score`: S1–S4) and `buildGrid` byTeacher/bySection/byRoom lookups in `web/src/domain/`; tiny test college in `tinyCollege.ts` (`cd web && npm test`)
- [T03] Heuristic engine `solveHeuristic` (most-constrained-first greedy + seeded restarts + move/swap local search, clash-free by construction, unplaced reasons) and Web Worker wrapper `await runHeuristic(input, opts)`; sample college: all 210 sessions placed, score 18 in 1.5 s (`cd web && npm test`)
- [T04] CP-SAT solver service: `POST /solve` places all 210 sample sessions, optimal (score 18) in ~10 s; models H1–H8 + all soft rules S1–S4, locks, infeasible/error messages (`cd server && .venv/bin/uvicorn main:app --port 8000`, then `curl -X POST localhost:8000/solve -H 'content-type: application/json' --data @../shared/fixtures/sample-college.json`; tests: `.venv/bin/pytest`)
- [T05] App shell with 4-step stepper (Back/Next, hints), zustand store persisted to localStorage `timetable-v1` (`loadSample`, `reset`), Step ① Setup: day chips, editable periods table + "Generate periods" helper, lunch candidates, inline validation (`cd web && npm run dev`; edit settings and reload; tests in `src/features/setup/periods.test.ts`)
- [T07] Solver server CORS allows any `localhost`/`127.0.0.1` port, so a dev server that moved off 5173 can still reach CP-SAT (`server/tests/test_api.py`)
- [T07] Step ③ Generate: engine choice (Auto / Exact CP-SAT / Fast in-browser), time-limit slider, solver server status dot, elapsed timer; `generate()` (`web/src/engine/solveClient.ts`) falls back to the heuristic when the server is offline, times out, errors or says infeasible; every result is re-scored and re-validated → badge `✓ Verified: 0 clashes · engine: …`, score breakdown, unplaced list (start server + `npm run dev`, step ③ → Load sample college → Generate; stop the server and Generate again to see the fallback)
- [T08] Step ④ timetable grid: Section/Teacher/Room switcher, searchable grouped picker + prev/next, labs span columns, parallel batch labs stacked, colour per subject, hover tooltip, click → details dialog, empty state (step ④ → "Mock result (dev)" until T07 lands)
- [T09] Stats panel under the step ④ grid: quality score with S1–S4 rows + ⓘ tips, room utilisation bars with shared-room headline, sortable teacher load table with per-day bars and Highest/Lowest badges; pure logic in `domain/stats.ts` (step ④ → "Mock result (dev)" or a generated timetable; `cd web && npm test`)
- [T11] Print / PDF export: "Print this timetable" (any view) and "Print all sections" (one A4 landscape page each, subject colours kept, app chrome hidden), "Heading on printouts" line (college · semester, persisted), "CSV" download of all placements (step ④ → buttons top right; browser Print → Save as PDF)
- [T06] Excel template/import/export logic (`web/src/features/data/excel.ts`: all-or-nothing parse with row-level errors, CSV per sheet) and data checks (`dataChecks.ts`: dangling refs, no eligible room, lab too long, section/teacher load vs free periods) (`cd web && npx vitest run src/features/data`)
- [T06] Step ② Data UI: Load sample (toast), Download template / Export current data (.xlsx), Upload .xlsx or per-sheet CSVs with row-level errors and an Import confirm, summary (counts, busiest-section load bars, blocking problems + over-capacity warnings), editable tabs for Courses/Sections/Teachers/Rooms/Departments; Next blocked while data has errors (`cd web && npm run dev` → step 2)

## Known issues / cuts

- [T03] Heuristic runs until its time limit unless it hits score 0 (the sample levels off at 18, all batch-idle), so `timeMs` ≈ the limit. Results depend on timing, so they aren't exactly reproducible for a given seed.
- [T04] CP-SAT needs ~2 s before its first solution on the sample; `timeLimitSec` < 3 may return `error` (client then falls back to heuristic). Empty `lunchCandidates` disables H8.
- [T05] Steps ②–④ are placeholders in `web/src/App.tsx` until T06/T07/T08 swap in their components. Any settings edit clears `result` and `locks` (placements point at day/period indexes).
- [T07] Exact – CP-SAT with the server off shows an error and keeps the previous result (no fallback, by design; Auto falls back). The infeasible → partial-heuristic path is unit-tested but not clicked through (needs T06 edit tables).
- [T08] `web/src/features/view/mockResult.ts` (+ test) and the dev-only "Mock result" button in `ViewStep.tsx` are temporary; delete them during T07 integration.
- [T06] Importing or loading the sample replaces all data tables (after a confirm). Inline table edits do not clear an existing timetable; T07's validator re-checks it. A course with an error is left out of the load numbers until fixed.
