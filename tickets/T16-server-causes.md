# T16 — Server infeasibility causes + locks probe
**Status:** DONE
**Lane:** B · **Prereqs:** T15 · **Branch:** t16-server-causes

## Goal
When the exact solver proves a timetable impossible, it says **why** as structured data the UI can explain and
link to fixes, instead of one generic sentence. Fills the `diagnosis` field T15 added. Part of the exact-first
redesign (T15 → T16 / T17 → T18; PLAN.md §1 "Engines" / "Infeasible input"); runs in parallel with T17.

## Scope / files
- `server/solver.py`:
  - Pre-solve `no_slot` check → `diagnosis: [{ kind: "noSlot", ids, detail: "noRoom" | "noStart" }]` (one entry
    per detail value), all sessions listed, not just the first 5.
  - Bad locks → `[{ kind: "badLock", ids }]`.
  - CP-SAT `INFEASIBLE` with locks present → **locks probe**: rebuild the model without locks, feasibility only
    (no objective), `max_time_in_seconds = 5`. Feasible → `{ kind: "locks", ids: locked session ids }`;
    probe UNKNOWN → `locksLikely`; probe infeasible → no locks entry (the locks are not the cause).
  - No locks, or nothing found → `diagnosis: []` (the client shows "no single cause found").
  - Keep `message` as today (human fallback), but list counts, not ids.
- `server/main.py`: no change expected beyond the model.

## Details
- Factor model building into a function that takes `use_locks` (and later `objective`), so the probe reuses it
  rather than duplicating constraints.
- The probe's 5 s is on top of the main time limit; the client's request timeout (`SOLVE_GRACE_MS`) must cover it.
  Raise the grace to 10 s in `solveClient.ts` when locks are sent (or always; note which in the ticket).
  **Done: always 10 s** (`SOLVE_GRACE_MS`), so the timeout message has one number whether or not locks were sent.
- Done as built: `noSlot` and `badLock` are checked together before solving, so one result can carry both. A session
  with neither a room nor a start is listed under both `noRoom` and `noStart`; zero days counts as `noStart`.
- Sessions are named by id here; the client (T17) turns ids into "Data Structures lab, CSE-A B2" etc.

## Tests
- `test_solver.py` / edge cases: `noSlot` with `noRoom` and `noStart` (ids complete, > 5 sessions);
  `badLock`; a lock that makes an otherwise solvable college infeasible → `locks` with that lock's id;
  infeasible without any locks → `diagnosis == []`; infeasible with an innocent lock → no `locks` entry.
- Probe timeout path → `locksLikely` (mock/patch the probe's status rather than building a slow case).
- `test_api.py`: infeasible response JSON has camelCase `diagnosis`.

## Done when
- [x] Server fills `diagnosis` for every `infeasible` path; tests above green
- [x] Committed: `T16: structured infeasibility causes + locks probe`
