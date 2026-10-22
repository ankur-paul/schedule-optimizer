# T15 — Solve contract: diagnosis + unplaced cause
**Status:** DONE
**Lane:** main · **Prereqs:** T04 · **Branch:** t15-contract

## Goal
Widen the shared `SolveResult` so the exact solver can say **why** a timetable is impossible and the quick draft
can say why each session stayed unplaced, as structured data. Small and first, so T16 (server) and T17 (client)
can run in parallel against it. Part of the exact-first redesign (T15 → T16 / T17 → T18; PLAN.md §1 "Engines" /
"Infeasible input").

## Scope / files
- `web/src/domain/types.ts`: `UnplacedCause`, `Diagnosis`, `SolveResult.diagnosis`, `unplaced[].cause`,
  exactly as PLAN.md §3.
- `server/models.py`: Pydantic mirrors (camelCase JSON like the rest).
- All new fields optional: no engine fills them yet, and existing code, fixtures and tests keep working.

## Tests
- Pytest: a `SolveResult` with `diagnosis` and an unplaced `cause` serialises to camelCase and parses back.
- `npx tsc -b` and both suites green.

## Done when
- [x] Types and models match PLAN.md §3
- [x] Committed: `T15: diagnosis and unplaced cause in the solve contract`
