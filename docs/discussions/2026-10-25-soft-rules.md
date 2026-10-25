# Soft-rule switches and an early finish (discussion, 25 Oct 2026)

Roadmap idea #9, raised on 25 Oct before the deploy tickets started: "try to complete the classes as soon as
possible for both sections and teachers", and can users choose which soft rules apply. Two rounds of questions after
an analysis. The plan below is what came out of them; the grilling notes at the end record the reasons.

## Plan

### What changes for the user

- **A new soft rule, S5 Late finish.** For each section and each teacher, on each day: every free teaching period
  before their last class costs **1**. One free lunch-candidate period is excused (H8 requires it).
  - The number of classes in a week is fixed, so "end every day as early as possible" adds up to "no free periods
    before the last class": start at the first period and leave no gaps.
  - For sections it overlaps S3: a gap costs 2 (S3) + 1 (S5) = 3 while both are on. For teachers, who have no gap
    rule, it is the only pull towards compact days.
  - At 1 it never outweighs S1 (10), S2 (5) or S4 (3); it decides where they are tied.
- **Every soft rule has an on/off switch.** No weights. Hard rules H1–H8 stay fixed.
- **Defaults: all five on.** S5 starts off instead only if the measurement (below) shows it makes S1–S4 worse on the
  sample within 20 s at 2 vCPUs, which is what Lambda gives until the memory increase is approved. Data without the
  field gets the defaults; nothing is migrated (everything is still in testing).
- **"What to aim for" card in step ③**, above *Generate*, one switch per rule, phrased as an aim:

  | ID | Switch | Score breakdown name |
  |---|---|---|
  | S1 | Spread each subject across the week | Same subject twice in a day |
  | S2 | At most 3 periods in a row for a teacher | Teachers with long runs |
  | S3 | No free periods between a section's classes | Free periods between classes |
  | S4 | Keep a section's batches busy at the same time | Batches waiting during labs |
  | S5 | Finish each day as early as possible | Late finish |

  The S-IDs stay in PLAN.md and the code, not the UI.
- **The switches are part of the working copy**, saved with the data in the browser and in online versions, so a
  saved version regenerates the same way for another editor.
- **Flipping a switch keeps the timetable and locks.** The score is recomputed at once and *Generate* shows
  "Preferences changed: regenerate to use them". (Changing the week settings still clears the timetable, since old
  placements may not fit; a preference can't make a timetable invalid.)
- **The score:** a rule that's off shows "Off" in the breakdown, not 0, and isn't in the total. The total's tooltip
  lists the rules counted. The assistant's "Score 34 → 28" line compares under the same switches; a card that
  changes a switch says so on that line.
- **The assistant:** a new `set_soft_rules` change on its cards (undoable like any card), and `score_details` says
  which rules are on. "Make the days finish earlier" gets a card turning S5 on and regenerating.
- **The time-limit slider goes.** *Generate* always uses 20 s; a run that times out offers *Try again with 40 s*
  (doubling up to 120 s), as today. A longer limit that worked is kept in memory for later *Generate*s until a
  reload. The server's 120 s cap (T45) stays.

### How it's built

- **Contract:** `SolveInput` gains `softRules: { s1, s2, s3, s4, s5: boolean }`, optional (missing = defaults) in
  both `types.ts` and `models.py`. `ScoreBreakdown` gains `lateFinish`, and a rule that's off is marked off rather
  than 0 (exact shape decided in T52). This bumps T45's contract version to 2: whichever of T45 and T52 merges
  second does the bump.
- **The TS scorer stays the source of truth** (`web/src/domain/score.ts`); the Python scorer in `server/solver.py`
  matches it.
- **CP-SAT:** per section-day and teacher-day, a variable for the last busy teaching period; S5's cost is free
  periods before it, less one excused lunch candidate. Terms for rules that are off are left out of the model.
- **The heuristic's incremental cost** (`localCost` in `web/src/engine/heuristic.ts`) learns S5 and the switches.
- The public timetable page shows no score and doesn't change.

### Testing

- The TS and Python scorers agree on S5 and on every on/off combination (the existing cross-check, extended).
- The brute-force solver tests (`test_solver_bruteforce.py`) cover S5 on tiny cases.
- The heuristic's incremental cost equals a full re-score with S5 on and with rules off.
- Golden files and the sample timetable regenerated (`npm run gen:golden`, `npm run gen:timetable`).
- **Measurement:** the sample college pinned to 2 and 4 threads, S5 off and on, two seeds: time, score and per-rule
  breakdown. Recorded in the T53 ticket; it sets S5's default.
- `agent_eval.py`: one more question, "make the days finish earlier".

### Tickets

Alongside the deploy tickets (T45–T51); none of them touches scoring.

- **T52 Soft-rule switches and S5 in the scorers** (—): contract field, both scorers, `ScoreBreakdown`, defaults,
  golden files.
- **T53 S5 and the switches in both engines** (T52): CP-SAT objective, heuristic incremental cost, the measurement
  and the default it sets.
- **T54 "What to aim for" and no time-limit slider** (T52): the card, re-score on flip, the remembered retry limit,
  the score panel, help, the assistant's `set_soft_rules` and `score_details`, FEATURES.md.

### Not in this pass

- Weights or levels per rule (decided: on/off only).
- Switching hard rules off.
- "End the week early" (a free Friday) and "every class as early as possible" (readings B and C).

## Grilling notes

- **Reading A, end each day early,** for sections and teachers (the request said "sections and students": sections
  are the students; teachers were meant). Rejected: B, the sum of every class's period (weaker at freeing
  afternoons, prefers spreading load evenly across days); C, end the week early (clashes with S1).
- **On/off per rule,** not Off/Low/Normal/High.
- **Q1 Free periods before the last class, one lunch excused, weight 1.** Rejected: sections counting only periods
  before their first class (no overlap with S3, same total, harder to explain as one rule).
- **Q2 Switches in the working copy, a card in step ③.** Rejected: under *Advanced* with the time limit (lost when a
  timetable is opened from the institute).
- **Q3 Defaults:** "everything is still in testing, choose the best option": all on, unless the measurement says S5
  hurts; no compatibility handling beyond missing = defaults.
- **Q4 A switch re-scores and keeps the timetable.**
- **Q5 "Off" in the breakdown; the total counts rules that are on.**
- **Q6 The assistant can switch rules on a card.**
- **Time-limit slider removed** (raised by the user: why would a user need it?). The timeout card's retry already
  covers a college that needs longer. **Q7** remembers a longer limit that worked, in memory, so a large college
  doesn't time out on every regenerate first.
- **Q8 Switches phrased as aims;** breakdown keeps the penalty names.
- **Q9 Testing as above,** the measurement deciding S5's default.
- **Q10 Three tickets, T52–T54,** in parallel with the deploy; the contract bump goes to whichever of T45 and T52
  merges second.
