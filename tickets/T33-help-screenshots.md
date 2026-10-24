# T33 — Help screenshots script
**Status:** DONE
**Lane:** C · **Prereqs:** — · **Branch:** t33-help-screenshots

## Goal
One command makes every help screenshot from the sample college, and gives the same images on every run, so that
after a UI change the screenshots can be taken again without hand work. Plan:
[`docs/discussions/2026-10-24-help-page.md`](../docs/discussions/2026-10-24-help-page.md).

## Scope / files
- `web/scripts/help-shots.ts` and `npm run help:shots`. Playwright (`@playwright/test` or `playwright`, Chromium
  only) as a pinned dev dependency.
- `shared/fixtures/sample-timetable.json`: a complete `SolveResult` for the sample college, saved once from an
  exact-solver run, with a short script or npm script to make it again.
- `web/scripts/help-shots.config.ts` (or similar): the list of shots, each a name, a starting state, the steps to
  get there (click, open a dialog, hover) and the element or area to capture.
- Output: PNGs in `web/public/help/`.

## Details
- The script builds the app, starts `vite preview` on a free port, and seeds `localStorage` with the sample
  college plus the fixed timetable. It needs no solver and no Supabase. Stop the server when done, even on failure.
- Fixed viewport (e.g. 1280×800) and device scale factor 2, light theme, animations off. Capture elements or
  clipped areas, not whole pages, so the images stay small and focused.
- **The same images on every run:** use the fixed timetable, freeze `Date` where the UI shows the time, and
  set the solver status to *offline* or *online* deliberately (route `/health`).
- Start with a few shots, so T34 has the pattern to follow: step ② data checks, step ③ *Timetable ready*, step ④
  grid with a locked class, the print panel. T34 and T35 add their own entries to the list.
- Shots that need a signed-in state (T35) mock the Supabase responses with `page.route`. Leave them out if mocking
  gets expensive, and say so in T35.
- Keep each PNG under ~200 KB; the script warns about bigger ones.

## Tests
- Vitest on any pure parts (the shot list is valid: unique names, known starting states).
- Run `npm run help:shots` twice and check `git status` shows no changed images after the second run.
- `npm test` must not run Playwright.

## Done when
- [x] `npm run help:shots` writes the starter shots to `web/public/help/`, and a second run changes nothing
- [x] `shared/fixtures/sample-timetable.json` and how to make it again
- [x] Tests above pass; full suite and `npx tsc -b` green
- [x] PROGRESS.md line
- [x] Committed: `T33: help screenshots script`
