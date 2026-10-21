# T17 — Room load checks + explaining causes
**Status:** TODO
**Lane:** A · **Prereqs:** T15 · **Branch:** t17-causes

## Goal
Pure logic that turns "this can't be built" into a short, ranked list of specific causes with a fix and a link,
e.g. "Prof. R. Verma teaches 34 periods; only 30 are free after one lunch period a day → Move 4 lectures to
another teacher [Edit courses]". Part of the exact-first redesign (T15 → T16 / T17 → T18); runs in parallel with T16. No step ③ UI here (that's T18).

## Scope / files
- `web/src/features/data/dataChecks.ts`: add **room load** warnings (lower bounds, warn, never block):
  - Each lab room some course requires (`labRoomId`): periods needed (`labSessionsPerWeek × batches × labLength`
    over those courses) vs `days × teaching periods`.
  - Each department × room type pool (rooms it owns + shared rooms): periods needed by that department's
    sections vs pool size × days × teaching periods. Also the all-college total per room type.
  - Return them as `rooms: RoomLoad[]` in `DataReport` (like `sections` / `teachers`), plus warning strings.
- New `web/src/features/generate/causes.ts`:
  - `explainInfeasible(input, diagnosis, report): Cause[]` where
    `Cause = { kind, text, fix, link, proven, over }` and
    `link` = `{ step: 2, tab: "courses" | "rooms" | "teachers", sectionId?, teacherId? }` or
    `{ step: 4, action: "clearLocks" }`.
  - Sources: server `diagnosis` (`noSlot`, `badLock`, `locks`, `locksLikely` → "may be") + `checkData()` section,
    teacher and room loads.
  - **Order:** proven first (noSlot, badLock, locks), then load causes by how far over (`required − available`,
    largest first), then `locksLikely`. `topCauses(causes, 5)` → `{ shown, more }` for the "+N more" line.
  - Empty → `[]`; T18 shows the honest "no single cause found" text and three general suggestions
    (fewer lab sessions, more lunch candidate periods, fewer required lab rooms), exported from here as
    `GENERAL_SUGGESTIONS` so the copy lives in one place.
  - Session ids → readable names with the existing `sessionLabel`.
- Step ② **teacher filter** on the Courses tab (next to the section filter), so a teacher cause can link to
  "Courses taught by Prof. Verma". Filter state must be settable from outside the tab (T18 deep-links into it):
  keep it in the store (not persisted) or pass it in; pick one and note it.
- Pre-flight: export `preflightWarnings(report)` (section, teacher and room warnings) for T18's
  "Before you start" panel.

## Tests
- `dataChecks.test.ts`: required lab room over capacity; department pool over while the college total is fine;
  shared rooms count towards every department; under capacity → no warning.
- `causes.test.ts`: each diagnosis kind → text + link; ordering (proven before load, larger overrun first,
  locksLikely last); more than 5 → `more`; empty input → `[]`; unknown session id doesn't crash.
- `dataEdit` teacher filter: filters by lecture teacher and batch teachers.

## Done when
- [ ] Room load warnings show in step ② (click through with the sample + one over-booked lab room)
- [ ] `causes.ts` fully tested; teacher filter works in step ②
- [ ] Committed: `T17: room load checks, ranked infeasibility causes, teacher filter`
