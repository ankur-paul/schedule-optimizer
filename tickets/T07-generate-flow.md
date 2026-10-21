# T07 — Step ③ Generate: engine selection, fallback, verify badge
**Status:** DONE
**Lane:** main (integration) · **Prereqs:** T02, T03, T05 (T04 optional) · **Branch:** t07-generate

## Goal
One big "Generate timetable" button that always produces a verified result.

## Scope / files
- `web/src/engine/solveClient.ts`: `generate(input, mode: "auto" | "cpsat" | "heuristic")`
  - `auto`: `GET /health` (1 s timeout) → `POST /solve` (timeout = timeLimitSec + 5 s); on network error/timeout
    → heuristic. If CP-SAT returns `infeasible` → run heuristic for a partial result + reasons, keep CP-SAT's message.
  - Always re-score with T02 `score()` and run `validate()`.
- `web/src/features/generate/GenerateStep.tsx`:
  - Engine select (Auto (recommended) / Exact – CP-SAT / Fast – in-browser) with ⓘ tooltip; time limit slider.
  - Progress state with elapsed seconds; server status dot ("Solver server: online/offline").
  - Result card: **badge** `✓ Verified: 0 clashes · engine: CP-SAT (optimal)` (red with violation list if any),
    score breakdown, **unplaced list** with reasons, "View timetable →".
- Merge all lane branches into main before/while doing this.

## Tests (keep light)
- `solveClient.test.ts`: with `fetch` mocked to fail → falls back to heuristic and returns `engine: "heuristic"`.
- Manual: run sample with server on and off.

## Done when
- [x] Works with server on (CP-SAT) and off (heuristic)
- [x] Committed: `T07: generate flow with fallback + verification`
