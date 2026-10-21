# Progress

Features built so far. Append one line per feature: `- [TNN] what was built (how to see/try it)`.
Ticket status is in `tickets/`; this file records what actually works.

## Log

- [plan] PLAN.md, tickets T00–T14, CLAUDE.md written
- [T00] Vite+React+TS+Tailwind+shadcn web app and FastAPI server with `/health` (`cd web && npm run dev`; `cd server && .venv/bin/uvicorn main:app --port 8000`; tests: `npm test`, `pytest`)
- [T01] Domain contract (`web/src/domain/types.ts`), `expandSessions`, eligibility helpers, solvable sample college (3 depts, 9 sections, 25 teachers, 210 sessions) + golden sessions file (`cd web && npm test`; regenerate golden with `npm run gen:golden`)
- [T02] Validator (`validate`: H1–H8 + locks/duplicates/unknown ids, readable messages, `missing` for unplaced), scorer (`score`: S1–S4) and `buildGrid` byTeacher/bySection/byRoom lookups in `web/src/domain/`; tiny test college in `tinyCollege.ts` (`cd web && npm test`)
- [T04] CP-SAT solver service: `POST /solve` places all 210 sample sessions, optimal (score 18) in ~10 s; models H1–H8 + all soft rules S1–S4, locks, infeasible/error messages (`cd server && .venv/bin/uvicorn main:app --port 8000`, then `curl -X POST localhost:8000/solve -H 'content-type: application/json' --data @../shared/fixtures/sample-college.json`; tests: `.venv/bin/pytest`)

## Known issues / cuts

- [T04] CP-SAT needs ~2 s before its first solution on the sample; `timeLimitSec` < 3 may return `error` (client then falls back to heuristic). Empty `lunchCandidates` disables H8.
