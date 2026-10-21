# Progress

Features built so far. Append one line per feature: `- [TNN] what was built (how to see/try it)`.
Ticket status is in `tickets/`; this file records what actually works.

## Log

- [plan] PLAN.md, tickets T00–T14, CLAUDE.md written
- [T00] Vite+React+TS+Tailwind+shadcn web app and FastAPI server with `/health` (`cd web && npm run dev`; `cd server && .venv/bin/uvicorn main:app --port 8000`; tests: `npm test`, `pytest`)
- [T01] Domain contract (`web/src/domain/types.ts`), `expandSessions`, eligibility helpers, solvable sample college (3 depts, 9 sections, 25 teachers, 210 sessions) + golden sessions file (`cd web && npm test`; regenerate golden with `npm run gen:golden`)
- [T05] App shell with 4-step stepper (Back/Next, hints), zustand store persisted to localStorage `timetable-v1` (`loadSample`, `reset`), Step ① Setup: day chips, editable periods table + "Generate periods" helper, lunch candidates, inline validation (`cd web && npm run dev`; edit settings and reload; tests in `src/features/setup/periods.test.ts`)
- [T08] Step ④ timetable grid: Section/Teacher/Room switcher, searchable grouped picker + prev/next, labs span columns, parallel batch labs stacked, colour per subject, hover tooltip, click → details dialog, empty state (step ④ → "Mock result (dev)" until T07 lands)

## Known issues / cuts

- [T05] Steps ②–④ are placeholders in `web/src/App.tsx` until T06/T07/T08 swap in their components. Any settings edit clears `result` and `locks` (placements point at day/period indexes).
- [T08] `web/src/features/view/mockResult.ts` (+ test) and the dev-only "Mock result" button in `ViewStep.tsx` are temporary; delete them during T07 integration.
