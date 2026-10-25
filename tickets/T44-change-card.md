# T44 — Change card in the panel
**Status:** DONE
**Lane:** main · **Prereqs:** T41, T42, T43 · **Branch:** t44-change-card

## Goal
Turn on write actions: the assistant proposes a change card, the user applies or discards it, and the working copy
and online state change in the agreed order with an undo snapshot. Plan:
[`docs/discussions/2026-10-25-agent-write-actions.md`](../docs/discussions/2026-10-25-agent-write-actions.md) (all
of What changes for the user, Q12–Q15, Q19, Q20).

## Scope / files
- `shared/agent-tools.json`: add `propose_changes` and `online_status` from `shared/agent-change-tool.json`, then
  delete that file. This is the switch that turns the feature on.
- `web/src/features/assistant/`: the change card, its state in `chat.ts` (pure, with Vitest), the apply run, and
  the outcome note.
- `server/agent.py`: the system prompt section. Pytest.
- Help: the assistant section in `web/src/help/online.md`, and a section for each manual-only action that lacks
  one.
- `server/scripts/agent_eval.py`: the new questions.
- FEATURES.md, PROGRESS.md.

## Details
- **The tool call:** when the model calls `propose_changes`, the panel runs `dryRun` (T42, T43).
  - Failed: the errors go back as an error tool result, and the loop goes on as for any tool.
  - Passed: the card appears, numbered (#1, #2, … in this chat), and the tool result is "Shown to the user as
    changes #N; they will apply or discard it."
- **The card:** the summary, one line per change (unmasked), new data-check warnings, the unsaved-work warning
  where it applies, and "Undo restores your working copy; the saved version stays online" when the card has online
  changes. Buttons *Apply* and *Discard*. A card is applied or discarded once.
- **Apply:**
  1. Run the dry run again on the current working copy. If it fails, mark the card "Out of date: ask again" and
     disable *Apply*.
  2. `pushUndo("assistant changes #N")` (T41).
  3. Apply the working-copy changes; then, if the card has `regenerate`, run Generate exactly as the button does
     and wait; then run the online changes in order.
  4. Stop at the first failure. The card marks done steps, the failed step and its reason; a conflict says "Save
     by hand". Done steps stay.
  5. After a regenerate, show "Score 34 → 28 · 0 unplaced" (or the *Can't be built* summary) under the card. No
     model call.
- **Outcome note:** "Applied changes #3", "Applied changes #3 up to step 5: save conflict" or "Discarded changes #3"
  goes at the start of the user's next message, masked. Several outcomes since the last message all go.
- **System prompt:** use `propose_changes` for any change; never say a change is made before the outcome note says
  so; the manual-only list, answered with steps and the help link; Undo restores only the working copy.
- **Help:** what the assistant can change and how the card works, the manual-only list, Undo, and the known limit on
  new teacher names. Retake screenshots with `npm run help:shots` if the panel shot changes.
- **FEATURES.md:** the assistant bullet (no longer read-only) and known limits: manual-only actions; Undo is lost on
  reload and doesn't undo online steps; a new teacher's name goes to the assistant as typed; Apply takes the whole
  card.

## Tests
- Vitest (`chat.ts` and the apply run, with fake store and online API):
  - a passed proposal adds a card; a failed one returns an error tool result and adds none;
  - Apply order (working copy, regenerate, online) and stop at the first failure;
  - out-of-date check after a working-copy edit; an older passing card still applies;
  - the undo snapshot taken before the first change;
  - outcome notes on the next message, several at once, masked;
  - a card can't be applied twice.
- Pytest: the tool list sent includes `propose_changes` and `online_status`; the prompt has the new section.
- `agent_eval.py`: about 6 write questions, including "delete this timetable" (steps, no card). Each proposal must
  pass the dry run; online changes are never applied. Run once; note the cost per question in PROGRESS.md.
- Click through with a real key: every operation type, a mixed card with a forced save conflict, Undo and Redo after
  a card, an out-of-date card, a viewer asking to save, phone width.

## Done when
- [x] Change card, apply run, outcome notes and system prompt work as above
- [x] Help sections; link test green
- [x] `agent_eval.py` run once; cost per question in PROGRESS.md
- [x] Tests above pass; full suite and `npx tsc -b` green
- [x] PROGRESS.md line; FEATURES.md assistant bullet and known limits
- [x] Committed: `T44: change card in the panel`
