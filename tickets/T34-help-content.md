# T34 — Help content: start, data, generate, timetable, troubleshooting
**Status:** TODO
**Lane:** main · **Prereqs:** T32, T33 · **Branch:** t34-help-content

## Goal
Write the help a timetable coordinator needs to go from an empty app to a printed timetable, and link it from the
spots in the app where people get stuck. Plan:
[`docs/discussions/2026-10-24-help-page.md`](../docs/discussions/2026-10-24-help-page.md).

## Scope / files
- `web/src/help/index.md`, `start.md`, `data.md`, `generate.md`, `timetable.md`, `troubleshooting.md` (not
  `online.md`: that's T35).
- New entries in T33's shot list, and the PNGs in `web/public/help/`.
- In-app links through `helpHref`, in `web/src/features/setup|data|generate|view/` and `web/src/components/`.

## Details
- **Write with the `/no-ai-slop` skill.** Run it on each page before committing. Use the app's own words: the
  button labels, card titles and messages exactly as FEATURES.md and the UI have them.
- **Facts come from the code and FEATURES.md,** not memory. Where they disagree, the code wins. Report the
  mismatch rather than fixing FEATURES.md silently.
- **`start.md`, *Your first timetable*:** load the sample, look at the data checks, generate, read the badge and
  score, lock a class, regenerate, print. About 5 minutes, numbered steps, a screenshot where the screen changes.
- **Reference pages:** one `##` section per topic in the plan. Each opens with what it is in one or two sentences,
  then how to do it, then the gotchas. For each *Can't be built* cause and each unplaced cause, say what it means
  and the usual fix.
- **Troubleshooting:** symptom as the heading ("The exact solver says offline"), then the causes and fixes.
- **Links in the app** (all open in a new tab):
  - Each *Can't be built* cause, the *Couldn't finish* card, the partial timetable's unplaced-cause groups, import
    errors and the step ② data checks → the section that explains them.
  - ⓘ tooltips → *Learn more*, only where the section says more than the tooltip.
  - Each step's one-line hint → *Help* to that step's page.
  - The solver-offline banner → troubleshooting.
- Pull any new link logic (e.g. cause → anchor) into a pure function with tests; no component tests (PLAN.md §5).
- Keep screenshots few: where the screen changes in the tutorial, and where words can't say where something is.

## Tests
- Vitest: the cause → anchor maps cover every cause kind and unplaced reason the app can show (a new kind without
  a help section fails the test).
- T32's link test passes with the new links.
- Click through: follow every new link from the app; read each page at phone width and printed.

## Done when
- [ ] Six pages written with `/no-ai-slop`, with screenshots from `npm run help:shots`
- [ ] In-app links on problem cards, tooltips, step hints and the offline banner
- [ ] Tests above pass; full suite and `npx tsc -b` green
- [ ] PROGRESS.md line; FEATURES.md mentions where help is linked
- [ ] Committed: `T34: help content`
