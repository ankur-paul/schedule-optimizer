# T23 — Privacy policy and terms pages
**Status:** DONE
**Lane:** D · **Prereqs:** — · **Branch:** t23-legal-pages

## Goal
Publish the approved privacy policy and terms as plain public pages at `/privacy` and `/terms`, and link them from
the app. Google's OAuth consent screen needs these URLs, and T24's sign-in checkbox links to them. See
[`docs/discussions/2026-10-24-privacy-and-consent.md`](../docs/discussions/2026-10-24-privacy-and-consent.md).

**Before you start:** the user must have approved `docs/legal/privacy.md` and `docs/legal/terms.md` (the
discussion file or the commit that merged them says so). If not, set `BLOCKED (needs human: approve policy
drafts)`.

## Scope / files
- Move the drafts to `web/src/legal/privacy.md` and `web/src/legal/terms.md` (`git mv`). They stay the single
  source of the text.
- `web/src/legal/policy.ts`: `POLICY_VERSION = 1`, `POLICY_EFFECTIVE_DATE`, `OPERATOR_NAME = "Ankur Paul"`, and
  `POLICY_CHANGES: Record<number, string[]>`, the short "what changed" list T24's dialog shows (v1: "First
  version.").
- `web/privacy.html`, `web/terms.html` as extra Vite entries (`build.rollupOptions.input`), served at `/privacy`
  and `/terms` in dev and preview. Check that the deploy pass's static host can serve them without `.html` (Vercel
  `cleanUrls`, Cloudflare Pages does by default) and note it in the roadmap's deploy section.
- A footer in `App.tsx` with *Privacy* · *Terms* links (new tab).
- `web/.env.example`: `VITE_CONTACT_EMAIL`.

## Details
- The markdown is rendered to HTML **at build time** (a small Vite plugin, or `transformIndexHtml`, using a pinned
  markdown library), so the pages read without JavaScript. Crawlers and Google's verification fetch them.
- Placeholders in the markdown: `{{OPERATOR_NAME}}`, `{{CONTACT_EMAIL}}`, `{{POLICY_VERSION}}`,
  `{{EFFECTIVE_DATE}}`. They are filled from `policy.ts` and `VITE_CONTACT_EMAIL`. An unknown placeholder fails the
  build. A missing `VITE_CONTACT_EMAIL` prints a build warning and the page shows "(contact address not set)".
- Pages use the app's fonts and colours: a Lattice header with a *Back to Lattice* link, readable width, a print
  style. Same light theme as the app.
- Before rendering, resolve the `[check: …]` notes the drafts leave (Supabase backup retention on our plan, from
  the dashboard). Any wording change beyond that goes back to the user.

## Tests
- Vitest on the pure fill function: every placeholder replaced; unknown placeholder throws; missing contact gives
  the fallback text; output has no `{{`.
- Vitest: both markdown files render, contain a heading, and have no leftover `[check:`.
- Click through: `npm run dev`, open `/privacy` and `/terms` with JavaScript disabled, follow the footer links.

## Done when
- [x] `/privacy` and `/terms` serve the approved text with placeholders filled, readable without JavaScript
- [x] Footer links in the app
- [x] `VITE_CONTACT_EMAIL` and the public URLs added to the deploy list in `docs/v2-roadmap.md`
- [x] Tests above pass, full suite and `npx tsc -b` green
- [x] PROGRESS.md line; FEATURES.md mentions the policy pages; Known issues notes "policy not legally reviewed"
- [x] Committed: `T23: privacy policy and terms pages`

## Notes
- Vite 8 renamed `build.rollupOptions` to `build.rolldownOptions`; the extra entries use the new name.
- The build-time renderer is `web/vite-plugin-legal.ts` (`transformIndexHtml` on a `<!-- legal-text -->` marker);
  the pure fill and render functions are in `web/src/legal/legalText.ts`.
- `[check:]` notes: the subprocessor link now points at Supabase's undated list page; backups line set to
  "erased within 7 days" (Pro keeps 7 days, Free none). Recheck if the production plan is Team or Enterprise.
