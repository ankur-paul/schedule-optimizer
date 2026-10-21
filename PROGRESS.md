# Progress

Features built so far. Append one line per feature: `- [TNN] what was built (how to see/try it)`.
Ticket status is in `tickets/`; this file records what actually works.

## Log

- [plan] PLAN.md, tickets T00–T14, CLAUDE.md written
- [T00] Vite+React+TS+Tailwind+shadcn web app and FastAPI server with `/health` (`cd web && npm run dev`; `cd server && .venv/bin/uvicorn main:app --port 8000`; tests: `npm test`, `pytest`)
- [T01] Domain contract (`web/src/domain/types.ts`), `expandSessions`, eligibility helpers, solvable sample college (3 depts, 9 sections, 25 teachers, 210 sessions) + golden sessions file (`cd web && npm test`; regenerate golden with `npm run gen:golden`)

## Known issues / cuts

- (none yet)
