# T12 — Polish, tooltips audit, README, user test
**Status:** IN PROGRESS
**Lane:** main · **Prereqs:** T06, T07, T09, T10, T11 · **Branch:** main

## Goal
Admin can use it without help; demo is rehearsed.

## Checklist
- [ ] **User test (5 min):** give someone the app with no instructions, task: "load the sample, generate,
      find teacher X's Wednesday". Note where they hesitate; fix the top 1–2 issues.
- [ ] Tooltips on every non-obvious field; empty states on every step; error toasts are human-readable
- [ ] Manual click-through: setup → sample → generate (server on) → views → lock → regenerate → print;
      then repeat with server off
- [ ] README: problem, features, screenshots, how to run, architecture (2 engines + validator), rules H/S table
- [ ] `npm test` and `pytest` green
- [ ] Demo script (90 s): sample → generate → verified badge → 3 views → stats → lock + regenerate → print
- [ ] Committed: `T12: polish + README`
