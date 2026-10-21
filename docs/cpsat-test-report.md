# CP-SAT solver test report

How the CP-SAT engine (`server/solver.py`) was tested, what passed, and the three bugs the tests found.

**Run on** 2026-10-22 · Python 3.12.14 · OR-Tools 9.15.6755 · 12 CPU cores · Linux
**Result:** 431 passed · 3 expected failures (known bugs, below) · 0 failures · 46 s for the whole server suite

```bash
cd server && uv run pytest                                  # everything (≈ 46 s)
uv run pytest tests/test_solver_edge_cases.py               # targeted edge cases (≈ 6 s)
uv run pytest tests/test_solver_bruteforce.py               # 300 random colleges vs brute force (≈ 35 s)
uv run pytest --runxfail -k "duplicate_course or break_period_lunch or feasible_result"   # see the 3 bugs fail
```

## Summary

| Suite | File | Tests | Result |
|---|---|---:|---|
| Brute-force cross-check (new) | `tests/test_solver_bruteforce.py` | 301 | ✅ all pass |
| Edge cases (new) | `tests/test_solver_edge_cases.py` | 97 | ✅ 94 pass · ⚠️ 3 xfail (bugs) |
| Solver basics (existing) | `tests/test_solver.py` | 29 | ✅ all pass |
| API (existing) | `tests/test_api.py` | 5 | ✅ all pass |
| Session expansion vs golden file (existing) | `tests/test_sessions.py` | 1 | ✅ pass |
| Health (existing) | `tests/test_health.py` | 1 | ✅ pass |

Supporting code (new): `tests/reference.py`, an independent scorer and brute-force optimiser.

## How the solver is checked

A solver test can pass while the solver is wrong if the test trusts the solver's own numbers. So every check here
re-derives the answer independently:

1. **Independent hard-rule checker** (`tests/helpers.py: hard_violations`, existing). It re-checks H1–H8 on the
   placements without sharing code with the solver.
2. **Independent scorer** (`tests/reference.py: reference_score`, new). It recomputes S1–S4 from the placements
   the same way the web app does (`web/src/domain/score.ts`). Every feasible result in the edge-case suite must report
   exactly this score.
3. **Brute force** (`tests/reference.py: brute_force`, new). It tries every placement of every session on tiny
   colleges, so it knows the true optimum, or that no timetable exists.
4. **Mutation testing** (one-off). The solver was broken on purpose in 18 ways to check that the tests notice.
5. **Cross-check with the web app** (one-off). CP-SAT results were fed to the real TypeScript `validate()` and
   `score()`.

A test marked xfail documents a bug. It is *strict*: once the bug is fixed the test starts to pass, pytest reports
that as a failure, and the marker must be removed.

## Bugs found

### 1. The score of a non-optimal result is overstated (API only)

When CP-SAT stops before proving optimality (status `feasible`, e.g. a short time limit), the reported `score` is
higher than the placements actually earn. On the sample college, stopped at the first solution with 5 different
seeds:

| Seed | Reported total | True total of the same placements |
|---:|---:|---:|
| 1 | 342 | 107 |
| 2 | 390 | 146 |
| 3 | 411 | 159 |
| 4 | 4014 | 978 |
| 5 | 358 | 122 |

With a 3 s limit (no stopping trick) it reported 345 against a true 126. When the result is `optimal` the two agree.

- **Cause:** the penalty variables for S2–S4 are only bounded from below (`pen >= …`). Minimisation pushes them down
  only once the search finishes. A mid-search solution can leave them at 1 where nothing is wrong, and the solver
  reads the score back from these variables.
- **Impact:** low in the app. The web client re-scores every result with `score()`, so the UI shows the right
  number. Any other caller of `/solve` gets an inflated score.
- **Fix:** compute the returned score from the placements, by porting `reference_score` into the solver, instead of
  reading the penalty variables. Alternatively, make the penalty variables exact (two-sided constraints).
- **Test:** `TestRunOptions::test_feasible_result_reports_the_true_score`.

### 2. A lunch candidate that is a break makes lunch (H8) stricter than the validator

With periods `[P0 teaching, P1 break]` and lunch candidates `[P0, P1]`, the web validator treats the break as a free
lunch period, so a lecture at P0 is fine. The solver drops the break from the candidates, keeps only P0, and then
forbids every class at P0. It answers "No clash-free timetable exists" for data that has one.

- **Impact:** low. Step ① only offers teaching periods as lunch candidates, but the `/solve` contract allows this
  input and the two engines disagree on it.
- **Fix:** if any lunch candidate is a break, H8 is always satisfied, so skip the lunch constraints. That is how
  `validator.ts` behaves.
- **Test:** `TestLunch::test_break_period_lunch_candidate_counts_as_free`.

### 3. Duplicate course ids give a misleading "infeasible"

Two courses with the same id both expand to session `c1:L1`. Their solver variables collide, and the result is
`infeasible` with the generic "check teacher/section/room loads" message, although the real problem is the
duplicate id.

- **Impact:** low. The web app generates unique ids on import. A hand-written `/solve` request could hit it.
- **Fix:** reject duplicate session ids up front with `status: "error"` and a message naming them.
- **Test:** `TestInputShape::test_duplicate_course_ids_are_reported_as_such`.

## Brute-force cross-check (300 random colleges)

Each random college has up to 6 sessions, 1–2 days and 2–5 periods. Each one includes some mix of breaks, split
sections, labs (some with a fixed room), department-owned and shared rooms, lunch candidates and a random lock,
which may be invalid. Per-section load is capped at the free periods, so infeasible cases come from the rules
interacting, not just from counting. For **every** instance:

- CP-SAT and brute force agree on whether a timetable exists.
- If one exists, CP-SAT says `optimal`, its score equals the brute-force optimum, it breaks no hard rule, it keeps
  every lock, and each component of its reported score breakdown matches the reference scorer.

| Instance mix | Count |
|---|---:|
| Infeasible (CP-SAT must say so) | 91 |
| Optimum is 0 | 111 |
| Optimum > 0 (soft rules must trade off correctly) | 98 |
| …optimum includes S1 / S2 / S4 penalties | 79 / 12 / 16 |
| With a lock | 66 |
| With a split section (batches) | 123 |
| With lunch candidates | 152 |
| With labs / a fixed lab room | 156 / 53 |
| With a break period | 161 |

Brute force scored 561,511 complete clash-free timetables in total. Every instance is reproducible from its seed;
a failure is reported as `test_cpsat_matches_brute_force[<seed>]`.

S3 (gaps) never appears in a brute-force optimum, because gaps are always avoidable at this size. It is covered by
the edge cases with locks that force gaps, and by the reported-vs-reference score check.

## Mutation testing

Each change below was applied to a copy of `solver.py` (never the real one), one at a time, and each suite was run
against it. ✅ = the suite failed, i.e. it caught the broken solver. The xfail tests were excluded so they couldn't
count as catches.

| Broken on purpose | Existing tests | New edge cases | New brute force |
|---|:-:|:-:|:-:|
| H1 teacher clash constraint removed | ✅ | ✅ | ✅ |
| H3 room clash constraint removed | ✅ | ✅ | ✅ |
| H2 batch lab may overlap a whole-section class | ✅ | ✅¹ | ✅ |
| H2 clash rule removed for unsplit sections | ✅ | ✅ | ✅ |
| H8 teacher lunch removed | ❌ | ✅ | ✅ |
| H8 section lunch removed | ✅ | ✅ | ✅ |
| H8 off by one (every candidate may be busy) | ✅ | ✅ | ✅ |
| H6/H7 labs may span a break | ✅ | ✅ | ✅ |
| H4 department room ownership ignored | ✅ | ✅ | ✅ |
| H4 fixed lab room ignored | ✅ | ✅ | ✅ |
| Locks ignored | ✅ | ✅ | ✅ |
| Symmetry breaking also applied to locked sessions | ✅ | ✅ | ✅ |
| Symmetry breaking treats B1/B2 labs as copies | ❌ | ✅¹ | ❌ |
| S1 off by one | ✅ | ✅ | ✅ |
| S2 allows 4 periods in a row | ✅ | ✅ | ✅ |
| S3 counts lunch candidates as gaps | ✅ | ✅ | ✅ |
| S4 weight 3 → 2 | ✅ | ✅ | ✅ |
| S4 ignores whole-section classes | ❌ | ❌ | ❌ |

**Caught: 17 of 17 changes that alter behaviour.** The last row is an *equivalent mutant*. H2 already forbids a
whole-section class during a batch session, so the removed term is always 0 and no test can tell the difference.

¹ Missed by the first draft of the edge cases. Two tests were added
(`test_lecture_and_batch_labs_cannot_share_the_only_period`,
`test_same_teacher_batch_labs_are_not_treated_as_interchangeable`) and the edge suite then caught both.

## Cross-check with the web validator and scorer

CP-SAT results for the sample college (15 s, optimal, score 18) and for all 209 feasible random colleges were
loaded into a temporary Vitest test that ran the web app's own `validate()` and `score()`:

| Check | Result |
|---|---|
| `validate()` violations or missing sessions | 0 in 210 results |
| `score()` vs the Python reference scorer, per component | identical in 210 results |
| `score()` vs the score CP-SAT reported | identical in 210 results |

So the Python reference really is the same scorer the UI uses, and the brute-force optimum is the optimum the
user sees.

## Behaviour worth knowing (tested, not bugs)

- **Time limits.** On the sample, CP-SAT needs about 2–3 s for a first solution. A limit of 0.3–2 s returns
  `status: "error"` with "CP-SAT found no solution in 0.3s (UNKNOWN)", and the web client falls back to the
  heuristic. Building the model takes about 0.7 s on top of the limit. 5 s gives `feasible` with score 18; 8 s
  proves it `optimal`.
- **`timeLimitSec: 0` means the default of 30 s**, not "no time" (`or 30` in the solver).
- **CP-SAT is all-or-nothing:** it never returns `partial` or `unplaced`. Partial timetables come from the web
  heuristic.
- **Input the web app blocks, but `/solve` accepts:** `batches: 0` silently drops a course's labs and still says
  `optimal`. Negative counts give no sessions. `labLength: 0` reports "no 0 consecutive teaching periods". These
  are pinned by tests so a change in behaviour is noticed.
- **Teacher ids missing from `teachers`** are still kept clash-free and get a lunch period. The web validator only
  checks lunch for listed teachers, so the solver is the stricter of the two here.
- **Invalid locks** (unknown session, day or room, a break, a lab that would cross a break, the wrong room type,
  another department's room) give `infeasible` with a message starting "Locked cell(s) are not valid placements".
  Two different locks for one session give the generic infeasible message.
- **The solver crashing** (any exception) becomes a 200 response with `status: "error"`, so the client falls back
  instead of seeing a 500.

## Not covered

- Performance on colleges much larger than the sample (210 sessions); only the sample's timing is measured.
- Period ids that aren't `0..n-1` in order. The contract says `id` is the index, and both engines assume it.
- Running several solves at once on the server.

## Edge-case results

All 97 tests in `tests/test_solver_edge_cases.py`, grouped as in the file. The slowest are the sample-college
time-limit test (0.7 s) and the first-solution score test (2.1 s); the rest take under 0.05 s each.


### TestInputShape

| Test | Result |
|---|---|
| `test_no_courses_is_optimal_and_empty` | ✅ pass |
| `test_courses_with_zero_sessions_are_ignored` | ✅ pass |
| `test_zero_days_with_sessions_is_infeasible` | ✅ pass |
| `test_zero_days_and_no_sessions_is_optimal` | ✅ pass |
| `test_only_break_periods_says_why` | ✅ pass |
| `test_no_periods_at_all` | ✅ pass |
| `test_no_rooms_at_all` | ✅ pass |
| `test_no_slot_message_lists_at_most_five_sessions` | ✅ pass |
| `test_unknown_section_is_an_error_not_a_crash` | ✅ pass |
| `test_teacher_missing_from_teacher_list_is_still_kept_clash_free` | ✅ pass |
| `test_section_with_no_courses_gets_no_penalties` | ✅ pass |
| `test_placements_follow_session_order` | ✅ pass |
| `test_every_day_of_a_five_day_week_is_used` | ✅ pass |
| `test_negative_counts_produce_no_sessions` | ✅ pass |
| `test_zero_batches_silently_drops_labs` | ✅ pass |
| `test_zero_lab_length_is_reported_as_unplaceable` | ✅ pass |
| `test_duplicate_course_ids_are_reported_as_such` | ⚠️ xfail (known bug) |

### TestPeriodsAndLabs

| Test | Result |
|---|---|
| `test_valid_starts_edge_lengths` | ✅ pass |
| `test_teaching_runs_with_leading_trailing_and_double_breaks` | ✅ pass |
| `test_lab_exactly_fills_the_day` | ✅ pass |
| `test_lab_fits_only_at_the_end_of_the_day` | ✅ pass |
| `test_lab_never_runs_off_the_end_of_the_day` | ✅ pass |
| `test_one_period_lab` | ✅ pass |
| `test_lab_blocks_every_period_it_covers` | ✅ pass |
| `test_whole_section_lab_uses_lab_rooms_only` | ✅ pass |
| `test_lecture_with_only_labs_available_is_unplaceable` | ✅ pass |

### TestRooms

| Test | Result |
|---|---|
| `test_fixed_lab_room_that_does_not_exist` | ✅ pass |
| `test_fixed_lab_room_that_is_a_classroom` | ✅ pass |
| `test_fixed_lab_owned_by_another_department` | ✅ pass |
| `test_fixed_lab_room_is_used_even_when_others_are_free` | ✅ pass |
| `test_two_courses_competing_for_one_fixed_lab_are_serialised` | ✅ pass |
| `test_shared_room_is_used_by_two_departments` | ✅ pass |
| `test_owned_room_is_never_lent_out` | ✅ pass |
| `test_room_shortage_across_sections_is_infeasible` | ✅ pass |
| `test_room_clash_blocks_overlapping_labs_but_not_adjacent_ones` | ✅ pass |

### TestClashes

| Test | Result |
|---|---|
| `test_teacher_across_three_sections_needs_three_slots` | ✅ pass |
| `test_batch_teacher_ids_shorter_than_batches_fall_back_to_course_teacher` | ✅ pass |
| `test_same_teacher_for_both_batches_serialises_their_labs` | ✅ pass |
| `test_three_batches_in_parallel` | ✅ pass |
| `test_different_labs_for_different_batches_run_side_by_side` | ✅ pass |
| `test_whole_section_lecture_cannot_overlap_any_batch` | ✅ pass |
| `test_lecture_and_batch_labs_cannot_share_the_only_period` | ✅ pass |
| `test_two_sections_sharing_a_teacher_and_a_room` | ✅ pass |

### TestLunch

| Test | Result |
|---|---|
| `test_single_lunch_candidate_is_always_free` | ✅ pass |
| `test_one_of_several_candidates_may_be_used` | ✅ pass |
| `test_lunch_applies_every_day_separately` | ✅ pass |
| `test_lunch_candidate_out_of_range_is_ignored` | ✅ pass |
| `test_duplicate_lunch_candidates_behave_like_one` | ✅ pass |
| `test_lab_over_every_candidate_is_rejected` | ✅ pass |
| `test_teacher_lunch_across_sections` | ✅ pass |
| `test_break_period_lunch_candidate_counts_as_free` | ⚠️ xfail (known bug) |

### TestLocks

| Test | Result |
|---|---|
| `test_lock_on_later_copy_at_earliest_slot` | ✅ pass |
| `test_locks_on_every_copy_in_reverse_order` | ✅ pass |
| `test_lock_with_unknown_day` | ✅ pass |
| `test_lock_with_negative_period` | ✅ pass |
| `test_lock_in_wrong_room_type` | ✅ pass |
| `test_lock_in_another_departments_room` | ✅ pass |
| `test_lock_of_lab_that_would_cross_a_break` | ✅ pass |
| `test_lock_of_lab_mid_run_start` | ✅ pass |
| `test_same_lock_twice_is_harmless` | ✅ pass |
| `test_two_different_locks_for_one_session_are_infeasible` | ✅ pass |
| `test_lock_that_starves_another_session_is_infeasible` | ✅ pass |
| `test_lock_breaking_lunch_is_infeasible` | ✅ pass |
| `test_lock_that_forces_a_penalty_is_still_optimal` | ✅ pass |
| `test_locked_batch_lab_keeps_its_batch_partner_parallel` | ✅ pass |

### TestSoftRules

| Test | Result |
|---|---|
| `test_s1_counts_every_extra_lecture` | ✅ pass |
| `test_s1_ignores_labs` | ✅ pass |
| `test_s1_spreads_when_possible_even_with_other_courses` | ✅ pass |
| `test_s2_long_lab_counts_toward_a_teachers_run` | ✅ pass |
| `test_s2_counts_each_period_beyond_three` | ✅ pass |
| `test_s2_a_free_period_resets_the_run` | ✅ pass |
| `test_s3_counts_multiple_gaps` | ✅ pass |
| `test_s3_break_periods_are_not_gaps` | ✅ pass |
| `test_s3_free_periods_before_first_and_after_last_class_are_not_gaps` | ✅ pass |
| `test_s3_counts_per_day` | ✅ pass |
| `test_s3_lab_closes_a_gap` | ✅ pass |
| `test_s4_counts_per_idle_batch_per_period` | ✅ pass |
| `test_s4_two_period_lab_counts_both_periods` | ✅ pass |
| `test_s4_is_zero_for_unsplit_sections` | ✅ pass |
| `test_weights_add_up_in_the_total` | ✅ pass |
| `test_unavoidable_penalty_does_not_bring_avoidable_ones` | ✅ pass |

### TestSymmetryBreaking

| Test | Result |
|---|---|
| `test_copies_are_placed_in_increasing_slot_order` | ✅ pass |
| `test_batch_labs_of_different_batches_are_not_ordered_against_each_other` | ✅ pass |
| `test_same_teacher_batch_labs_are_not_treated_as_interchangeable` | ✅ pass |
| `test_tight_instance_still_finds_the_only_arrangement` | ✅ pass |

### TestRunOptions

| Test | Result |
|---|---|
| `test_too_short_time_limit_on_the_sample_is_an_error_with_a_message` | ✅ pass |
| `test_zero_time_limit_means_the_default` | ✅ pass |
| `test_same_seed_gives_the_same_optimal_score` | ✅ pass |
| `test_time_ms_is_reported` | ✅ pass |
| `test_result_is_never_partial_and_never_lists_unplaced` | ✅ pass |
| `test_feasible_result_reports_the_true_score` | ⚠️ xfail (known bug) |

### TestApi

| Test | Result |
|---|---|
| `test_locks_and_options_are_optional` | ✅ pass |
| `test_unknown_fields_are_ignored` | ✅ pass |
| `test_bad_enum_value_is_a_422` | ✅ pass |
| `test_unknown_section_is_a_200_error_result` | ✅ pass |
| `test_solver_crash_becomes_an_error_result` | ✅ pass |
| `test_result_round_trips_into_the_web_contract` | ✅ pass |
