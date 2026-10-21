# T03 — Heuristic engine + improvement pass + Web Worker
**Status:** TODO
**Lane:** C · **Prereqs:** T01, T02 · **Branch:** t03-heuristic

## Goal
Browser-side fallback engine that always returns a clash-free (possibly partial) timetable with reasons.

## Scope / files
- `web/src/engine/heuristic.ts`: `solveHeuristic(input, { timeLimitMs, seed }): SolveResult` (`engine: "heuristic"`).
- `web/src/engine/heuristic.worker.ts` + `web/src/engine/runHeuristic.ts` (Promise wrapper around the worker).

## Details
1. Expand sessions; pre-place `locks`.
2. **Construct:** repeatedly pick the unplaced session with the fewest valid (day, start, room) options
   (labs naturally first). Among its options pick by lowest added soft penalty, random tie-break (seeded RNG).
   Every option is checked against H1–H4, H6–H8 using an occupancy grid → output is clash-free by construction.
   H8 lunch check: placing must not take the last free lunch candidate of that section/teacher/day.
3. **Restarts:** repeat construct with different seeds for ~40% of the time budget; keep best by
   `(unplaced count, score.total)`.
4. **Improve:** for the rest of the budget, random move (one session to another valid slot/room) or swap
   (two sessions of the same length); accept if penalty doesn't increase; never touch locks.
5. **Unplaced reasons:** for each unplaced session, tally why each candidate failed (teacher busy, section busy,
   no eligible room free, no consecutive window, lunch) and report the dominant one, e.g.
   `"CSE-2A Physics Lab (B1): no 2 consecutive periods where teacher R. Gupta and Physics Lab are both free"`.
6. `status`: `feasible` if all placed, else `partial`. Score via T02 `score()`.

## Tests (keep light)
- Sample college solves with 0 unplaced and `validate().ok === true` within 3 s.
- Locks are respected (lock 2 sessions, they appear unchanged).
- Overloaded tiny case (teacher with more periods than slots) → `partial` with a non-empty reason.

## Done when
- [ ] Tests pass
- [ ] Worker wrapper usable from React: `await runHeuristic(input, opts)`
- [ ] Committed: `T03: heuristic engine + worker`
