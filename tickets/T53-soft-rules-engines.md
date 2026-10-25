# T53 — S5 and the switches in both engines
**Status:** DONE
**Lane:** B · **Prereqs:** T52 · **Branch:** t53-soft-rules-engines

## Goal
The exact solver and the quick draft optimise only the soft rules that are on, S5 included, and a measurement on
the sample college decides whether S5 starts on. Plan, *How it's built* and *Testing*:
[`docs/discussions/2026-10-25-soft-rules.md`](../docs/discussions/2026-10-25-soft-rules.md).

## Scope / files
- `server/solver.py`: the objective.
- `web/src/engine/heuristic.ts`: `localCost` and anything else that scores.
- `DEFAULT_SOFT_RULES` on both sides, if the measurement turns S5 off; then the golden files again.
- Tests in `server/tests/` and next to `heuristic.ts`.

## Details
- **CP-SAT:** a rule that's off adds no variables or terms. For S5, per section-day and teacher-day: a busy flag per
  teaching period (sections: the section or any batch, as H2/H8 already build), the last busy period as an integer
  variable, and the cost = teaching periods up to it that are free, less one if a free lunch candidate is among
  them. Reuse the S3 and H8 machinery where it fits. Keep the cost tight (bounded from below is fine; the score is
  re-computed from placements, as the comment at `solve()` says).
- **Locks probe** (`objective=False`) is unchanged.
- **Heuristic:** `localCost` adds S5 for the sections and teachers a move touches, and skips rules that are off.
  The improvement pass must still converge within its 5 s cap.
- **Measurement:** the sample college, CP-SAT pinned with `taskset` to 2 and 4 threads, 20 s limit, seeds 1 and 2,
  S5 off and on: time to finish, `status`, total and per-rule breakdown. Record the table in this ticket.
  - **S5 starts on** if, with S5 on, every session is still placed and S1–S4's combined penalty is no worse than with
    S5 off by more than a few points (say what threshold you used).
  - Otherwise set `s5: false` in both defaults, regenerate the golden files, and say why in the table's notes.
- Also time the quick draft on the sample with S5 on and off.

## Tests
- Brute-force tests on tiny cases: CP-SAT's optimum with S5 on equals the best score over all valid timetables, as
  the existing brute-force tests do for S1–S4; one case where S5 changes the optimal timetable.
- Each switch off: CP-SAT's result on a case built to trigger only that rule has that rule's penalty free to rise
  (e.g. S1 off allows two lectures on a day when that is otherwise cheaper).
- Heuristic: `localCost` deltas equal full re-score differences with S5 on and with rules off, over random moves.
- The sample still places every session with the chosen defaults.

## Done when
- [x] Both engines respect the switches and S5
- [x] Measurement table in this ticket; S5's default set from it
- [x] Tests above pass; full suite and `npx tsc -b` green
- [x] PROGRESS.md line (with the measurement's headline numbers)
- [x] Committed: `T53: S5 and switches in both engines`

## Measurement (25 Oct 2026)

The sample college (210 sessions), CP-SAT with `SOLVER_WORKERS` 2 or 4 under `taskset` on as many cores, 20 s limit.
Points per rule are counted with every rule on, so S5 shows even when the solver ignored it. Times are wall clock
for `solve()`, model building included.

| Threads | Seed | S5 | Status | Time | S1 | S2 | S3 | S4 | **S1–S4** | S5 |
|---|---|---|---|---|---|---|---|---|---|---|
| 2 | 1 | off | feasible | 21.2 s | 30 | 0 | 8 | 18 | **56** | 390 |
| 2 | 1 | on | feasible | 21.1 s | 180 | 0 | 12 | 48 | **240** | 226 |
| 2 | 2 | off | feasible | 21.4 s | 90 | 0 | 0 | 18 | **108** | 368 |
| 2 | 2 | on | feasible | 21.1 s | 210 | 0 | 20 | 30 | **260** | 243 |
| 4 | 1 | off | feasible | 21.9 s | 0 | 0 | 32 | 30 | **62** | 387 |
| 4 | 1 | on | feasible | 21.7 s | 0 | 0 | 16 | 54 | **70** | 267 |
| 4 | 2 | off | feasible | 21.7 s | 0 | 5 | 14 | 18 | **37** | 380 |
| 4 | 2 | on | feasible | 21.3 s | 0 | 0 | 12 | 54 | **66** | 256 |

Quick draft (heuristic, 5 s, this laptop): seeds 1 and 2, S5 off: S1–S4 18 and 18, S5 396 and 421; S5 on: S1–S4 18
and 18, S5 107 and 100. Every run placed all 210 sessions and stopped at its 5.0 s limit.

**Threshold:** S5 on may cost S1–S4 at most 10 points (one extra same-day lecture) in every run.
**Result: S5 starts off.** With S5 on, S1–S4 got worse by 184 and 152 at 2 threads and by 8 and 29 at 4 threads.

Notes:
- No run finished early: every one stopped at the 20 s limit as `feasible`. Even with S5 off, 2 threads leave S1
  at 30–90 (the optimum is 18 in all, all S4); before T53 the objective was the same as S5 off here.
- The first S5 encoding (an "after" flag and a "late" flag per teaching period, as S3 builds) was worse: S1–S4 397,
  420, 128 and 411 with S5 on, and model building pushed the runs to 24–27 s. The kept encoding has one integer per
  section-day and teacher-day ("teaching periods up to the last class") and one flag per lunch candidate.
- The quick draft reaches S1–S4 = 18 with S5 on or off and cuts S5 by three quarters, so the heuristic would gain
  from S5 on. The default is shared, so it follows CP-SAT. Seeding CP-SAT with the quick draft's timetable (a
  solution hint) might let S5 start on later.
- Fixtures: `sample-scores.json` regenerated, with an "S5 alone on" setting added, since `{}` (the defaults) no longer
  means all on. `sample-timetable.json` kept its placements and only its score was recomputed (417 → 18). With S5
  off the objective is what it was before T53, and the assistant tests and help screenshots rely on those placements.
  A fresh `gen:timetable` run gives an equally optimal timetable (score 18) with other placements.
