# T31 — Privacy policy and Terms v2
**Status:** DONE
**Lane:** main · **Prereqs:** T29, T30 · **Branch:** t31-policy-v2

## Goal
The policy describes online data and publishing as built, and every signed-in user accepts it before saving.
Plan, Q20 and Q24: [`docs/discussions/2026-10-24-online-data.md`](../docs/discussions/2026-10-24-online-data.md).

## Scope / files
- `web/src/legal/privacy.md`, `web/src/legal/terms.md`, `web/src/legal/policy.ts` (`POLICY_VERSION` 2,
  `POLICY_CHANGES`).
- A migration adding `policy_versions` row 2.

## Details
- **Claude drafts, the user approves before anything is committed.** Set `BLOCKED (needs human: approve drafts)`
  while waiting.
- **Approved 24 Oct 2026:** [`docs/policy-v2/privacy.md`](../docs/policy-v2/privacy.md) and
  [`docs/policy-v2/terms.md`](../docs/policy-v2/terms.md), drafted before T29 from the plan. Copy them over
  `web/src/legal/` as they are; if T29 ended up working differently from what they say (versions, publishing, the
  public page), change only those facts and ask the user again. Decided with the approval: plain words for the
  teacher-data paragraph (the institution decides, we process for it), not "Data Fiduciary / Data Processor"; keep
  "We may also unpublish a timetable that breaks them"; `POLICY_EFFECTIVE_DATE` is the day T31 ships.
- Approved `POLICY_CHANGES[2]`:
  - "Institutes can save timetables online, including teachers' names. Every member can open them, and the last 20
    versions are kept."
  - "A saved timetable can be published at a link that anyone who has it can open without signing in."
  - "When you save or publish other people's details, you confirm your institution allows it."
- Privacy policy: what is stored online (the working copy's data, including teacher names, as versions of named
  timetables), who can see it per role, that publishing makes a version readable by anyone with the link and that
  the page asks search engines not to index it, the last 20 versions kept, that deleting a timetable or institute
  removes its versions and link, and Lattice's role as the institute's processor for teacher data.
- Terms: widen "When you add details about other people … you confirm that your institution allows you to do so"
  to cover saving online and publishing.
- `POLICY_CHANGES` for v2: two or three short lines for the re-accept dialog.
- The app and the database must agree on the version (FEATURES.md known limit), so the migration and `policy.ts`
  ship in one commit and the migration is pushed before the web change is used.

## Tests
- The existing `legalText` and `consent` tests pass with version 2; add a case if the changes list logic needs one.
- Click through: a signed-in user sees the re-accept dialog with the v2 lines; *Accept* records it; saving works
  after; a user who hasn't accepted v2 can't save (T27's check).

## Done when
- [x] Drafts approved by the user
- [x] Migration applied; `POLICY_VERSION` 2 in the app; re-accept works
- [x] Tests above pass; full suite and `npx tsc -b` green
- [x] PROGRESS.md line; FEATURES.md updated (policy v2)
- [x] Committed: `T31: privacy policy and terms v2`
