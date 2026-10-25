# T53 — S5 and the switches in both engines
**Status:** IN PROGRESS
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
- [ ] Both engines respect the switches and S5
- [ ] Measurement table in this ticket; S5's default set from it
- [ ] Tests above pass; full suite and `npx tsc -b` green
- [ ] PROGRESS.md line (with the measurement's headline numbers)
- [ ] Committed: `T53: S5 and switches in both engines`
