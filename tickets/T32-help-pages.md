# T32 — Help pages: build and layout
**Status:** TODO
**Lane:** D · **Prereqs:** — · **Branch:** t32-help-pages

## Goal
Static help pages at `/help` and `/help/<page>`, built from Markdown like `/privacy` and `/terms`, with stable anchors
the app links to through one checked helper. This ticket builds the frame: the pages hold their headings only; T34
and T35 write the text. Plan: [`docs/discussions/2026-10-24-help-page.md`](../docs/discussions/2026-10-24-help-page.md).

## Scope / files
- `web/src/help/*.md`: `index.md`, `start.md`, `data.md`, `generate.md`, `timetable.md`, `online.md`,
  `troubleshooting.md`. Each page gets its title and the section headings from the plan, with a one-line
  placeholder under each (e.g. "Written in T34.").
- HTML entries for each page next to `privacy`, `terms` and `published` in `web/vite.config.ts`, served at `/help`
  and `/help/<page>` without `.html` in `npm run dev` and `npm run preview`.
- A build-time renderer, reusing what `web/vite-plugin-legal.ts` and `web/src/legal/legalText.ts` already do
  (extend that plugin or share its pure functions; don't copy them).
- `web/src/help/helpLinks.ts`: `helpHref(page, anchor?)` with `page` and `anchor` typed from the Markdown
  headings (a generated file, or a test that keeps a hand-kept list in step with them).
- `help` reserved: add it to `NOT_HANDLES` in `web/src/published/path.ts`, and a migration that adds it to
  `private.handle_problem`'s reserved list.
- *Help* links: the footer next to *Privacy* · *Terms*, and the account menu. Both open in a new tab.
- CLAUDE.md, under Docs: a commit that changes what users see updates the matching help section in the same
  commit, and reruns `npm run help:shots` (T33) if a screenshot changed.

## Details
- **Anchors:** a heading's id comes from its text (`Lab batches` → `lab-batches`). `## Lab batches {#batches}` sets
  its own id, and the marker is stripped from the output. Two headings with the same id on one page fail the build.
- **Layout:** the legal pages' header with *Back to Lattice*, a contents list built from the `##` headings, readable
  width, phone layout, print styles. Pages link to each other with plain relative links.
- **Images:** `![alt](/help/<file>.png)` from `web/public/help/` (T33 fills it). Alt text is required: a missing
  one fails the build.
- **Reserved handle migration:** fail with a clear message if an institute already holds the handle `help`.
  `private.handle_problem` backs a check constraint, so replace the function rather than editing the old migration.
- The host rewrite note in `docs/v2-roadmap.md` (deploy section) says the public-link rewrite skips `/help/*`. It
  was added with the plan; check that it still matches what you built.

## Tests
- Vitest: heading ids (plain, punctuation, an explicit `{#id}`, duplicates throw); every page renders with a title;
  a missing image alt throws; `helpHref` builds the right URL.
- Vitest, the link test: every `helpHref(...)` call in `web/src` names a page and anchor that exist. Typing the
  arguments covers most of it; the test also covers the generated list going stale.
- Vitest: `isPublishedRewrite('/help/data')` is false; the existing rewrite cases still pass.
- Pytest or SQL test next to T27's: `set_institute_handle` refuses `help`.
- Click through: `/help` and each page in dev and preview, with JavaScript off, at phone width, printed; the footer
  and account-menu links.

## Done when
- [ ] `/help` and the six pages serve in `npm run dev` and `npm run preview` and are in `dist/`
- [ ] Anchors, contents list, `helpHref` and the link test
- [ ] `help` reserved in the rewrite and in the database
- [ ] Footer and account-menu links
- [ ] CLAUDE.md rule added
- [ ] Tests above pass; full suite and `npx tsc -b` green
- [ ] PROGRESS.md line; FEATURES.md mentions the help pages
- [ ] Committed: `T32: help pages build and layout`
