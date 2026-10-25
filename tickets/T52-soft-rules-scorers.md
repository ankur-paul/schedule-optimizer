# T52 — Soft-rule switches and S5 in the scorers
**Status:** TODO
**Lane:** C · **Prereqs:** — · **Branch:** t52-soft-rules-scorers

## Goal
The data contract carries an on/off switch per soft rule, a new rule S5 *Late finish* exists, and both scorers (TS,
the source of truth, and the server's Python copy) count only the rules that are on. Engines (T53) and the UI (T54)
build on this. Plan: [`docs/discussions/2026-10-25-soft-rules.md`](../docs/discussions/2026-10-25-soft-rules.md).

## Scope / files
This ticket may change the data contract.
- `web/src/domain/types.ts` and `server/models.py`: `softRules` and the new `ScoreBreakdown`.
- `web/src/domain/score.ts`, `web/src/domain/stats.ts` (if it reads the breakdown), `web/src/domain/tinyCollege.ts`.
- `server/solver.py`: the Python scorer only (the objective is T53).
- The working copy (`web/src/store/useAppStore.ts`, `WorkingCopy`): `softRules` saved with the data; online
  documents opened without it get the defaults (`web/src/features/online/online.ts`).
- `shared/fixtures/*`, `npm run gen:golden`, `npm run gen:timetable`.
- PLAN.md §2 and §3, the soft-rule table in `CLAUDE.md`.
- `shared/contract.json`: version 2 if T45 is already merged; otherwise T45 does the bump (see its ticket).

## Details
- **`softRules`:** `{ s1: boolean; s2: boolean; s3: boolean; s4: boolean; s5: boolean }` on `SolveInput`, optional;
  missing or partial means the defaults for the missing keys. Default all `true` for now; T53's measurement may set
  `s5` to `false`. One `DEFAULT_SOFT_RULES` constant on each side, and a helper that fills defaults.
- **S5 Late finish:** for each section and each teacher, on each working day they have at least one class: count the
  free teaching periods before their last class; if one or more of those free periods is a lunch candidate, subtract
  one. 1 per period. A section is busy in a period if it or any of its batches is busy (as in H8). Breaks are never
  counted (they aren't teaching periods). Check the definition against hand-worked examples in the test before
  coding the Python side.
- **`ScoreBreakdown`:** add `lateFinish`. A rule that's off must be distinguishable from 0: either `null` for off
  rules, or a separate `rulesOn` list next to the numbers. Pick one, apply it in both languages and in PLAN.md §3, and
  note the reason in the ticket.
- **`total`** sums the rules that are on.
- **Not here:** the CP-SAT objective, the heuristic (T53), any UI beyond what keeps compiling (T54). Until T54, the
  UI keeps showing the four old numbers; the score panel may show `lateFinish` plainly if that's simpler than hiding
  it.

## Tests
- S5 hand-worked cases: a section with classes at P1, P3 (lunch candidate free at P2: 0), P1 and P5 with P2–P4 free
  and none a lunch candidate (3), late start only (P3, P4: 2), a teacher with one class at P6 (5 or 4, depending on
  lunch candidates), batches (a batch busy counts the section busy), a day with no classes (0).
- Each switch off removes exactly that rule from the total; all off gives 0; missing `softRules` equals the defaults.
- The TS and Python scorers agree on the sample timetable and on random timetables (the existing cross-check in
  `server/tests/reference.py` or `test_solver_bruteforce.py`), for several switch combinations.
- `models.py` accepts a body without `softRules` and with a partial one.
- Golden files regenerated; the store round-trips `softRules`; an online document without it opens with defaults.

## Done when
- [ ] Contract, both scorers, defaults and golden files as above
- [ ] PLAN.md §2 and §3, CLAUDE.md's table updated; contract version bumped if T45 is merged
- [ ] Tests above pass; full suite and `npx tsc -b` green
- [ ] PROGRESS.md line
- [ ] Committed: `T52: soft-rule switches and S5 in the scorers`
