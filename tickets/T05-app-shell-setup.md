# T05 — App shell, stepper, store, Step ① Setup
**Status:** TODO
**Lane:** A · **Prereqs:** T01 · **Branch:** t05-shell

## Goal
The guided flow skeleton and the first step: configure the week.

## Scope / files
- `web/src/store/useAppStore.ts` (zustand + `persist` to localStorage, key `timetable-v1`, wrapped in try/catch):
  `settings, departments, teachers, rooms, sections, courses, result: SolveResult | null, locks: Placement[], step`
  + setters, `loadSample()`, `reset()`. Default `settings` = sample college settings.
- `web/src/App.tsx`: header (app name), **stepper** ① Setup week → ② Add data → ③ Generate → ④ View & export,
  Back / Next buttons, one-line hint under each step title.
- `web/src/features/setup/SetupStep.tsx`:
  - Working days: toggle chips Mon–Sun.
  - Periods table: label, start, end, kind (teaching/break) — add/remove/reorder rows; "Generate periods"
    helper (start time, period length, count, break after Px).
  - Lunch candidates: checkboxes on teaching periods.
  - ⓘ tooltips: lunch candidates ("Each section and teacher gets at least one of these free every day"), break.
  - Inline validation (end > start, at least one lunch candidate, ≥1 day).
- Clean modern look: neutral background, cards, generous spacing, Inter or system font.

## Tests (keep light)
- None for UI. Optional: one store test for `loadSample()`.

## Done when
- [ ] Can move between 4 steps (steps 2–4 can be placeholders)
- [ ] Settings persist across reload
- [ ] Committed: `T05: app shell + setup step`
