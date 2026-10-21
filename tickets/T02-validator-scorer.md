# T02 — Validator + scorer
**Status:** TODO
**Lane:** C · **Prereqs:** T01 · **Branch:** t02-validator

## Goal
Independent checker that proves a result is clash-free, plus the single source of truth for the score.

## Scope / files
- `web/src/domain/validator.ts`:
  `validate(input, placements): { ok: boolean; violations: { rule: "H1".."H8"; message: string; sessionIds: Id[] }[] }`
  - Checks H1–H4, H6–H8, unknown session ids, duplicate placements, locks present and unchanged.
  - H5 is reported separately: `missing: Id[]` (sessions with no placement) — not a violation when the
    result status is `partial`, the UI shows them as unplaced.
  - Messages are human-readable using names: `"Teacher A. Sharma double-booked Tue P3 (CSE-2A DS, ECE-2B Maths)"`.
- `web/src/domain/score.ts`: `score(input, placements): Score` implementing S1–S4 with weights from PLAN.md §2.
- Helper `buildGrid(input, placements)` → lookups `byTeacher/bySection/byRoom[day][period]` (reused by T03, T08, T09).

## Tests (keep light)
- One tiny hand-written input (2 sections, 3 teachers, 3 rooms, 1 day × 4 periods).
- Validator: one failing case per H1, H2 (incl. batch vs whole-section), H3, H4, H6, H8; one passing case.
- Score: one case each for S1, S2, S3, S4 with exact expected numbers.

## Done when
- [ ] All tests pass
- [ ] Committed: `T02: validator + scorer`
