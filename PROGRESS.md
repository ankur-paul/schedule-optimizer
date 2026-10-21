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

## Known issues / cuts

- [T03] Heuristic runs until its time limit unless it hits score 0 (the sample levels off at 18, all batch-idle), so `timeMs` ≈ the limit. Results depend on timing, so they aren't exactly reproducible for a given seed.
- [T04] CP-SAT needs ~2 s before its first solution on the sample; `timeLimitSec` < 3 may return `error` (client then falls back to heuristic). Empty `lunchCandidates` disables H8.
- [T05] Steps ②–④ are placeholders in `web/src/App.tsx` until T06/T07/T08 swap in their components. Any settings edit clears `result` and `locks` (placements point at day/period indexes).
