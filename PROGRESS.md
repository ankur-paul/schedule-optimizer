# Progress

Features built so far. Append one line per feature: `- [TNN] what was built (how to see/try it)`.
Ticket status is in `tickets/`; this file records what actually works.

## Log

- [plan] PLAN.md, tickets T00–T14, CLAUDE.md written
- [T00] Vite+React+TS+Tailwind+shadcn web app and FastAPI server with `/health` (`cd web && npm run dev`; `cd server && .venv/bin/uvicorn main:app --port 8000`; tests: `npm test`, `pytest`)
- [T01] Domain contract (`web/src/domain/types.ts`), `expandSessions`, eligibility helpers, solvable sample college (3 depts, 9 sections, 25 teachers, 210 sessions) + golden sessions file (`cd web && npm test`; regenerate golden with `npm run gen:golden`)
- [T02] Validator (`validate`: H1–H8 + locks/duplicates/unknown ids, readable messages, `missing` for unplaced), scorer (`score`: S1–S4) and `buildGrid` byTeacher/bySection/byRoom lookups in `web/src/domain/`; tiny test college in `tinyCollege.ts` (`cd web && npm test`)
- [T03] Heuristic engine `solveHeuristic` (most-constrained-first greedy + seeded restarts + move/swap local search, clash-free by construction, unplaced reasons) and Web Worker wrapper `await runHeuristic(input, opts)`; sample college: all 210 sessions placed, score 18 in 1.5 s (`cd web && npm test`)

## Known issues / cuts

- [T03] Heuristic runs until its time limit unless it hits score 0 (the sample levels off at 18, all batch-idle), so `timeMs` ≈ the limit. Results depend on timing, so they aren't exactly reproducible for a given seed.
