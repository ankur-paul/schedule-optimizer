# T54 — "What to aim for" card, no time-limit slider
**Status:** IN PROGRESS
**Lane:** A · **Prereqs:** T52 · **Branch:** t54-aim-card

## Goal
Users see the soft rules as five aims they can switch on or off in step ③, the score explains which rules it counts,
the assistant can switch them, and the time-limit slider is gone. Plan, *What changes for the user*:
[`docs/discussions/2026-10-25-soft-rules.md`](../docs/discussions/2026-10-25-soft-rules.md).

## Scope / files
- `web/src/features/generate/GenerateStep.tsx` (and a pure helper for the card's text and state): the card, the
  "Preferences changed" line, the slider removed.
- `web/src/features/generate/generate.ts`: `TIME_LIMIT` keeps min/max/default for the retry; the remembered limit.
- `web/src/store/useAppStore.ts`: `setSoftRules`, the remembered limit (not persisted).
- The score panel (`web/src/features/view/…` stats): "Off", the counted-rules tooltip, S5's line.
- The assistant: `set_soft_rules` in `shared/agent-tools.json` (`propose_changes`), its dry run and apply in
  `web/src/features/assistant/changes.ts`, `score_details` in `tools.ts`, the before/after line in `applyCard.ts`,
  the system prompt section if it lists what cards can do, one question in `agent_eval.py`.
- Help: `web/src/help/generate.md` (*The time limit* section rewritten as what happens on a timeout; keep the
  `{#time-limit}` anchor or update every `helpHref` to it), `web/src/help/timetable.md` (the score table gains Late
  finish and explains switches). Rerun `npm run help:shots`.
- FEATURES.md, PROGRESS.md, PLAN.md *Engines* row if T52 didn't already.

## Details
- **The card,** above *Generate*, titled "What to aim for": five switches in this order, with an ⓘ each giving the
  penalty and a *Learn more* link:
  - Spread each subject across the week (S1)
  - At most 3 periods in a row for a teacher (S2)
  - No free periods between a section's classes (S3)
  - Keep a section's batches busy at the same time (S4)
  - Finish each day as early as possible (S5)
  Disabled while a run is going.
- **Flipping a switch** keeps the timetable and locks, re-scores the current result at once, and shows
  "Preferences changed: regenerate to use them" by *Generate* until the next run. A flip by hand takes no undo
  snapshot, like the step ② table edits (T41's rule); an assistant card that changes it does.
- **The score panel:** a rule that's off reads "Off"; the total's tooltip lists the rules counted.
- **No slider.** *Generate* uses 20 s, or the remembered limit. The timeout card's *Try again with N s* (doubling, up
  to 120) stays; when such a retry finishes with a timetable, its limit is remembered in memory for later runs until
  a reload. The running line "N s of up to M s" uses the limit in force.
- **`timeLimitSec` in the persisted store** is dropped (or ignored), so an old persisted value doesn't come back.
- **Assistant:**
  - `set_soft_rules({ s1…s5 })` on `propose_changes`, any subset of keys; the card line reads "Turn on: Finish each
    day as early as possible". The dry run is trivial; apply sets the switches.
  - `score_details` returns which rules are on and S5's per-section/teacher details like the others.
  - The before/after line says when the card changed the switches ("Score 34 → 41 with Late finish on").
  - Eval question: "make the days finish earlier" should get a card turning S5 on (if off) and regenerating, or an
    explanation if it's already on.

## Tests
- Pure helpers: the card's state from `softRules`; the "Preferences changed" flag (set on flip, cleared by a run);
  the remembered limit (set by a successful retry, not by a timeout, reset on reload).
- The score panel's rows for off rules and the tooltip text.
- `set_soft_rules`: parse, dry run, apply, undo via the card's snapshot; partial keys keep the rest.
- `score_details` output with rules off.
- `helpLinks.test.ts` passes.
- Click through: flip each switch and watch the score change without losing the timetable; regenerate; a timeout on
  a large case, retry, then *Generate* again uses the longer limit; reload resets it; ask the assistant to finish the
  days earlier; phone width.

## Done when
- [ ] Card, score panel, slider removal and assistant change as above
- [ ] Tests above pass; full suite and `npx tsc -b` green
- [ ] Help sections and screenshots, FEATURES.md, PROGRESS.md
- [ ] Committed: `T54: what to aim for card, no time-limit slider`
