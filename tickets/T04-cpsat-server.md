# T04 — FastAPI + CP-SAT solver
**Status:** DONE
**Lane:** B · **Prereqs:** T01 · **Branch:** t04-cpsat

## Goal
Primary engine: optimal/near-optimal timetables via OR-Tools CP-SAT behind `POST /solve`.

## Scope / files
- `server/models.py`: Pydantic mirrors of PLAN.md §3 (camelCase JSON, use `alias_generator=to_camel`
  or plain camelCase field names).
- `server/sessions.py`: `expand_sessions` — must match `shared/fixtures/sample-sessions.json` exactly.
- `server/solver.py`: `solve(input) -> SolveResult`.
- `server/main.py`: `POST /solve`, keep `/health`.

## Model
- Bool `x[s, d, p, r]` only for valid starts `p` (length fits in consecutive teaching periods) and eligible rooms `r` (H4).
- H5: `sum_{d,p,r} x[s,d,p,r] == 1` per session.
- Locks: fix the corresponding `x = 1`.
- Occupancy `occ(s, d, t)` = sum of `x` whose span covers period `t`.
- H1/H3: per teacher / room / (d, t): `sum occ <= 1`.
- H2: per section, per (d, t): for each batch b: `whole-section occ + batch-b occ <= 1`
  (no-batch sections: all sessions are whole-section).
- H8: per section and teacher, per day: bool `busy[t]` ≥ each covering occ; `sum_{t in lunch} (1 - busy[t]) >= 1`.
- Objective (weights as PLAN.md §2): S1 via per (course, day) lecture count excess; S2 via every window of 4
  consecutive teaching periods per teacher `pen >= sum busy - 3`. S3/S4 **optional** (skip if short on time —
  UI re-scores with the TS scorer anyway).
- `max_time_in_seconds = options.timeLimitSec` (default 30), `num_workers = 8`, `random_seed = seed`.
- Status map: OPTIMAL → `optimal`, FEASIBLE → `feasible`, INFEASIBLE → `infeasible` (empty placements,
  `message` explains), UNKNOWN (timeout, no solution) → `error` with message.

## Tests (keep light)
- `test_sessions.py`: parity with golden file.
- `test_solver.py`: sample college → status optimal/feasible, every session placed once, quick self-check of
  no teacher/section/room double booking; tiny over-constrained input → `infeasible`.
- `test_api.py`: `POST /solve` with sample returns 200.

## Done when
- [x] Tests pass; sample solves in < 30 s (optimal in ~10 s)
- [x] Committed: `T04: CP-SAT solver service`
