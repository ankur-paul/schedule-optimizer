# T12 — Polish, tooltips audit, README, user test
**Status:** BLOCKED (needs human: 5-minute user test)
**Lane:** main · **Prereqs:** T06, T07, T09, T10, T11 · **Branch:** main

## Goal
Admin can use it without help; demo is rehearsed.

## Checklist
- [ ] **User test (5 min):** give someone the app with no instructions, task: "load the sample, generate,
      find teacher X's Wednesday". Note where they hesitate; fix the top 1–2 issues.
- [x] Tooltips on every non-obvious field; empty states on every step; error toasts are human-readable
- [x] Manual click-through: setup → sample → generate (server on) → views → lock → regenerate → print;
      then repeat with server off
- [x] README: problem, features, screenshots, how to run, architecture (2 engines + validator), rules H/S table
- [x] `npm test` and `pytest` green
- [x] Demo script (90 s): sample → generate → verified badge → 3 views → stats → lock + regenerate → print
- [x] Design critique fixes (branch `t12-design`): scroll to top per step, one primary action per screen, one score
      vocabulary with counts, cancel a run, Print popover, score strip + reworked stats, lock button on grid cards,
      distinct subject colours, data tab order, one-line course rows, compact stepper
- [ ] Committed: `T12: polish + README`

## Notes
- Click-through driven in headless Chrome, server on and off: all steps work, CP-SAT optimal (score 18, ~10 s),
  fallback to in-browser (score 18, ~5 s) with a note, 2 locks kept through regenerate, print = 1 page / 9 pages.
- Fixed: toasts and hover tooltips were printed on top of the timetable.
- Still open: the 5-minute user test needs a real person.
