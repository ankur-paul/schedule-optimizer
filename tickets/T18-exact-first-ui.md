# T18 — Exact-first Generate UI
**Status:** DONE
**Lane:** main · **Prereqs:** T16, T17 · **Branch:** t18-exact-first

## Goal
Step ③ runs the exact solver only. When it can't produce a timetable, the user sees clearly why and what to
do, and gets the quick draft (heuristic) only by choosing it. Part 3 of the exact-first redesign
(T15 → T16 / T17 → T18; PLAN.md §1 "Engines" / "Infeasible input").

## Scope / files
- `engine/solveClient.ts`:
  - `generate(input, deps)` → exact solver only, **no automatic fallback**. Outcome carries
    `failure?: { kind: "infeasible" | "timeout" | "serverError" | "unreachable"; message; diagnosis? }`.
  - `makeDraft(input, deps)` → heuristic + `verify()`; used for the offline button and every opt-in.
  - `EngineMode` and the `auto` / `cpsat` / `heuristic` modes go away.
- `engine/heuristic.ts`: fill `unplaced[].cause` (`noRoom`, `noStart`, `teacher`, `section`, `room`, `lunch`)
  next to the existing reason string.
- `store/useAppStore.ts`: drop `engineMode` (bump the persist `version` with a migrate that deletes it).
  The last run's outcome lives in non-persisted shared state (next to `useRun`) so step ④ can link to it.
- `features/generate/generate.ts`: `TIME_LIMIT` max 120; `nextTimeLimit(t) = min(2t, 120)`; a pure
  `generateView(...)` that picks the step ③ state below (tested); copy for each state.
- `features/generate/GenerateStep.tsx`, states:
  - **Idle, online:** server line, "Before you start" panel (T17 `preflightWarnings`, never blocks),
    *Generate timetable*, `▸ Advanced: time limit`.
  - **Idle, offline:** amber banner "Exact solver is offline. A quick draft will be made in your browser instead;
    it may score worse." Start command only in dev builds (`import.meta.env.DEV`), else "The solver service is
    unavailable." Main button reads **Make a quick draft**. Re-check `/health` every 5 s; when it comes back the
    banner goes and the button returns to *Generate timetable*.
  - **Running:** *Generating…* + Cancel + "7 s of up to 20 s" (unchanged behaviour).
  - **Ready:** green `✓ Timetable ready` (optimal: "best possible"; feasible: "best found in 20 s" +
    *Try longer: 40 s*), 0 clashes, score strip, footer Next.
  - **Impossible** (`infeasible`, red, `role="alert"`, focus moves to the heading): "This timetable can't be built",
    "Nothing was changed", top 5 causes from `explainInfeasible` with fix buttons (+N more); none → "No single
    cause found: the rules conflict in combination" + `GENERAL_SUGGESTIONS`. Divider, then secondary
    **Make a partial timetable** with sub-text "Places as many classes as fit and lists the rest" (+ "Replaces your
    current timetable" when one exists).
  - **Couldn't finish** (`timeout` / `serverError` / `unreachable`, neutral, `role="alert"`): what happened, the
    previous timetable is unchanged; timeout → primary **Try again with {nextTimeLimit} s** (hidden at 120 s),
    secondary *Make a quick draft instead*; server errors → *Try again* + *Make a quick draft instead*.
  - **Partial** (amber): "Partial: N of M classes not placed", how it was made, 0 clashes among placed classes,
    unplaced grouped by `cause` (collapsible groups), *Back to the reasons* when it came from Impossible.
    Next is allowed.
- Fix links: step ② on the right tab with the section / teacher filter set (T17); locks → step ④ with
  *Clear all locks*.
- Step ④ (`ViewStep.tsx`): amber partial banner until a complete timetable replaces it; Regenerate uses the exact
  solver (reads "Regenerate as quick draft" while offline); a failed Regenerate toasts "Can't be built with these
  locks. See why →" (or "Couldn't finish…") linking to step ③'s outcome card, timetable kept.
- Print popover: amber line "N classes not placed yet; they won't appear on printouts". Sheets unchanged.
- Copy: "Exact solver" / "Quick draft" everywhere a coordinator reads; "CP-SAT" only in ⓘ tooltips.
- Update README (engines section, screenshot of step ③), ARCHITECTURE.md, FEATURES.md.

## Tests
- `solveClient.test.ts`: infeasible → `failure.kind = "infeasible"` with diagnosis and **no** heuristic call;
  network error → `unreachable`; timeout → `timeout`; server `error` → `serverError`; cancel still never falls
  back; `makeDraft` verifies and re-scores.
- `generate.test.ts`: `generateView` for every state (incl. offline idle, feasible vs optimal, partial from
  impossible vs from offline); `nextTimeLimit` (20 → 40, 80 → 120, 120 → none).
- `heuristic.test.ts`: unplaced sessions get a `cause`.
- Store migrate drops `engineMode`.
- Click-through: sample with server on (ready), server off (offline → quick draft), an over-booked teacher
  (impossible → fix link → step ② filtered), a blocking lock (impossible → locks cause → clear), partial →
  step ④ banner → drag one in → print warning, a 5 s limit timeout (→ try again with 10 s).

## Done when
- [x] Every state above reachable and clicked through (except dragging a class in from a partial timetable: the
      over-booked test data had no free slot; that drag is T13 code, unchanged)
- [x] No path runs the heuristic without the user clicking a button that says "quick draft" / "partial"
- [x] Committed in small steps, e.g. `T18: exact-only generate()`, `T18: step ③ impossible state`, …

## Cuts / deferred
- A complete quick draft gets no special label and no *Improve with exact solver* button (deferred in the
  design grilling; revisit after the user test).
