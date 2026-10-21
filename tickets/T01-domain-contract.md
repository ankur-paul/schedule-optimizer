# T01 — Domain types, sessions, sample college, golden file
**Status:** TODO
**Lane:** main · **Prereqs:** T00 · **Branch:** main

## Goal
Freeze the shared contract so lanes A–D can work in parallel without merge pain.

## Scope / files
- `web/src/domain/types.ts`: exactly the types in PLAN.md §3 (incl. `Session`).
- `web/src/domain/sessions.ts`: `expandSessions(input)` per PLAN.md §3 rules.
- `web/src/domain/eligibility.ts`:
  - `teachingPeriods(settings)`, `validStarts(settings, length): number[]` (start period ids where `length`
    consecutive teaching periods fit — H6/H7)
  - `eligibleRooms(input, session): Room[]` (H4)
  - `occupiedPeriods(placement, session): number[]`
- `shared/fixtures/sample-college.json` — a realistic, **solvable** `SolveInput`:
  - Settings: Mon–Fri; P1 09:00–09:50, P2 09:50–10:40, Break 10:40–11:00, P3–P8 50 min each until 16:00;
    lunchCandidates = P4, P5, P6.
  - 3 departments (CSE, ECE, ME); 9 sections (3 each), 3–4 of them with `batches: 2`.
  - ~25 teachers; rooms: 1 owned classroom per section + 2 shared seminar halls; labs: CSE Lab 1/2 (CSE),
    Electronics Lab (ECE), Workshop (ME), shared Physics Lab, Chemistry Lab, Computer Centre.
  - ~6 courses per section, 22–28 teaching periods per section per week; some labs need a shared lab
    so shared-room contention is visible; at least one course with `batchTeacherIds`.
  - Keep it comfortably under capacity (heuristic must solve it with 0 unplaced).
- `shared/fixtures/sample-sessions.json`: output of `expandSessions(sample)` written by
  `npm run gen:golden` (`web/scripts/gen-golden.ts`, run with `tsx`).
- Copy (or import) the sample into the web app as `web/src/domain/sampleCollege.ts`.

## Tests (keep light)
- `sessions.test.ts`: expansion of sample equals golden; a 2-batch lab course yields `P1:B1`, `P1:B2` with
  the right batch teachers.
- `eligibility.test.ts`: `validStarts` for length 2 excludes the start right before the break and the last period.

## Done when
- [ ] Types match PLAN.md §3 exactly
- [ ] Golden file generated and committed
- [ ] Tests pass
- [ ] Committed: `T01: domain contract + sample college`
