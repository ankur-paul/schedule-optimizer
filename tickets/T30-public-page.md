# T30 — Public timetable page
**Status:** DONE
**Lane:** D · **Prereqs:** T27 · **Branch:** t30-public-page

## Goal
Students and teachers open `<site>/<handle>/<id>` without signing in and find their timetable, on a phone or a
desktop. Plan, Q13 and Q21:
[`docs/discussions/2026-10-24-online-data.md`](../docs/discussions/2026-10-24-online-data.md).

## Scope / files
- `web/published.html`, `web/src/published/` (entry, page, pure helpers), the Vite input next to `privacy` and
  `terms` in `web/vite.config.ts`.
- A small Vite plugin (dev and preview) that serves `published.html` for two-segment paths `/<handle>/<id>` that
  aren't files, leaving `/assets/*`, `/src/*`, `/@…` and `/node_modules/*` alone.
- Reuse `TimetableSheet` / `TimetableGrid` and `EntityPicker` from `web/src/features/view/` with props; no app store.

## Details
- Parse the path; call `get_published(public_id)` with the anon key. If the handle in the path differs from the
  returned one, `history.replaceState` to the current handle.
- Header: institute name, timetable name, print heading, "Updated 24 Oct 2026".
- Section / Teacher / Room picker and the read-only grid: no locks, no drag and drop, no stats.
- Below 640 px: one day at a time as a list of periods (time, subject, teacher or section, room), with day tabs,
  opening on today, or the first day when today isn't a teaching day.
- *Print* uses the step ④ print layout.
- `<meta name="robots" content="noindex">`. No analytics.
- Not published or unknown id: "This timetable isn't published." Supabase env vars missing or the request failing:
  "Couldn't load this timetable. Try again later."
- The page must not pull in the sign-in or account code.

## Tests
- Vitest: path parsing (good, extra slashes, wrong segment count, bad characters); the dev rewrite's matcher
  (rewrites `/gndec/k7f3q9xa2m`, leaves `/assets/x.js`, `/privacy`, `/src/main.tsx` and `/`); today's tab (each
  weekday, a day not in `settings.days`); the day list built from a result.
- Click through: a published timetable in desktop and phone widths (devtools), each view, print, an unpublished id,
  a renamed handle.

## Done when
- [x] `/<handle>/<id>` serves the page in `npm run dev` and `npm run preview`, and `published.html` is in `dist/`
- [x] Section, teacher and room views; the phone layout; print; `noindex`
- [x] Tests above pass; full suite and `npx tsc -b` green
- [x] PROGRESS.md line; FEATURES.md updated (the public page)
- [x] Committed: `T30: public timetable page`
