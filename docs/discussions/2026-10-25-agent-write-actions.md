# AI assistant: write actions (discussion, 25 Oct 2026)

Roadmap idea #5b, split from the agent pass (#5) on 24 Oct. Four rounds of questions. The plan below is what came out
of them, and the grilling notes at the end record the reasons and the options turned down.

## Plan

### What changes for the user

- **The assistant can change things, but only after the user agrees.** When asked to change something it shows a
  **change card** in the chat: a summary and one line per change ("Move CSE-3A Database Systems from Mon P2 to Tue
  P4", "Add room LH-5", "Regenerate"), with **Apply** and **Discard**. Nothing changes until the user clicks
  *Apply*.
- **What it can propose:**
  - **Working copy:** add, edit or remove departments, teachers, rooms, sections and courses; change settings (the
    card warns this clears the timetable and locks); lock and unlock; move and swap classes; regenerate; load the
    sample; open a timetable from the institute.
  - **Online:** *Save online*, *Save as new*, rename a timetable, publish a version and *Make live*.
- **What stays manual.** Anything that can't be taken back with Undo or *Make live*, or that changes who can reach
  the institute. The assistant explains the steps and links the help instead:
  - delete a timetable online, delete the institute, leave the institute;
  - remove a member, cancel an invite, demote someone, hand over the admin role;
  - invite someone (it gives a person access, and their email would go to Anthropic);
  - change the institute's handle (breaks every public link);
  - unpublish (takes the public page down for everyone holding the link);
  - *Overwrite* on a version conflict (discards another editor's save as the live version);
  - a *Save online* that would drop a version: the server keeps the newest 20 plus the live one, so the 21st save
    deletes the oldest. The card shows that save as blocked, "save by hand".
- **Apply takes the whole card.** To drop one change, the user asks again ("do it without the room change"). At most
  100 changes per card.
- **Order on Apply:** working-copy changes first, in order; then regenerate, waited for; then online changes. If a
  step fails (a save conflict, no connection, an RLS refusal), it stops there: the changes already made stay, and
  the card marks the failed step and why. A conflict ends with "save by hand".
- **Out-of-date cards.** On *Apply* the card's changes are checked again against the working copy as it is now. If
  that fails, the card says "Out of date: ask again" and *Apply* is disabled. Older cards stay in the chat and can
  still be applied while they pass.
- **Moves lock the class** in its new place, as drag-and-drop does, so the next regenerate keeps it there.
- **Regenerate** runs **Generate** exactly as the button does: same engine choice and fallback, locks kept. When it
  finishes the panel shows a before/after line without a model call ("Score 34 → 28 · 0 unplaced", or the *Can't be
  built* summary).
- **Replacing the working copy** (*Load sample*, *Open from institute*) shows the same unsaved-work warning on the
  card as the menu does.
- **Undo and Redo** in the header, with Ctrl+Z and Ctrl+Shift+Z outside text fields:
  - shown once there is something to undo; the tooltip names it ("Undo: assistant changes #3", "Undo: move Database
    Systems to Tue P4");
  - a snapshot of the data, settings, result and locks is taken before each applied card and each drag-and-drop move
    (whose toast *Undo* now uses the same stack);
  - at most 20, in memory only, so a reload clears them; a new snapshot clears Redo;
  - hand edits in the step ② tables don't take snapshots;
  - **online steps aren't undone**: the card and the tooltip say "Undo restores your working copy; the saved version
    stays online".
- **Who:** every role (admin, editor, viewer), since changes land in the user's own working copy, which viewers can
  already edit by hand. Online changes are checked against the role before a card is shown, so a viewer never sees
  a *Save online* they can't do; RLS still enforces it.
- **Cost:** a question that ends in a card costs one question, like any other, with the same caps (8 tool rounds,
  15 minutes). *Apply* and *Discard* don't call the model.

### How it's built

- **One new write tool, `propose_changes({ summary, changes })`.** Each change is a typed operation (`move`, `swap`,
  `lock`, `unlock`, `add_teacher`, `update_room`, `remove_course`, `set_settings`, `regenerate`, `load_sample`,
  `open_online`, `save_online`, `save_as_new`, `rename_online`, `publish`, `make_live`, …). The schema sits in
  `shared/agent-tools.json` with the others, so the file stays the one list of what the model may do.
- **The browser dry-runs a proposal** on a copy of the working copy:
  - **Moves, swaps and locks** must keep every hard rule H1–H8, using the same checks as drag-and-drop
    (`features/view/moves.ts`). A break rejects the proposal and tells the model which rule.
  - **Data edits and settings** run the step ② data checks. The card lists any *new* errors or warnings; *Apply*
    still works, because the UI lets users enter bad data by hand too.
  - **Online changes** are checked against the user's role and the 20-version rule.
  - **Failed:** the errors go back to the model as the tool result, which costs one tool round, so it can fix them.
  - **Passed:** the panel shows the card and the tool result says "shown to the user; they will apply or discard
    it". The model ends its turn with a short line and never claims a change was made.
- **Outcomes travel with the next message.** "Applied changes #3" or "Discarded #3" (and a failed step) is put at
  the start of the user's next message. No extra model call just to report it.
- **One new read tool, `online_status`:** the linked institute and timetable name, the user's role, unsaved
  changes, the versions (number, date, saved by "you" or "another member") and which is live and published. No
  member names, emails, member list or invites, so policy v3 still covers what is sent.
- **The system prompt** gains a short section: always use `propose_changes`; never say a change is done before it
  is applied; the manual-only list, answered with steps and the help link; Undo restores only the working copy. The
  steps come from the help pages already in the prompt; any manual action without a help section gets one. The
  server changes only by this prompt text and the longer tool list. The 8,000-token output cap is enough for 100
  changes.
- **The undo stack** lives in the store (`useAppStore`) and is not persisted.

### Privacy

- No policy bump. `online_status` sends no new personal data, and policy v3 already says a teacher name not spelt as
  in the data "is sent as you typed it".
- **A new teacher's name** the user types ("add teacher Ravi Sharma") goes to Anthropic as typed, since it isn't in
  the teacher list yet, and the proposal repeats it. Accepted, and noted as a known limit in FEATURES.md and the
  help.

### Testing

- **Vitest:**
  - each operation's dry run and apply, and their failures: H-rule breaks, new data-check errors, role refusals,
    the 21st-save block, the 100-change cap;
  - the run order on *Apply* and stopping on a failed step;
  - the out-of-date check;
  - the undo stack: 20 cap, a new snapshot clearing Redo, drag moves on the same stack;
  - the outcome note on the next message.
- **Pytest:** the server sends the new tools and the new prompt section.
- **`agent_eval.py`:** about 6 more questions ("move CSE-3A's DBMS lecture off Monday", "add a room LH-5 and
  regenerate", "save this online", "delete this timetable", which should get steps). It checks each proposal passes
  the dry run and never applies an online change.
- **Click-through:** every operation type, a mixed card with a forced save conflict, Undo/Redo, an out-of-date card,
  phone width.

### Tickets

All four come after T40 except T41, which is useful without the assistant.

- **T41 Undo stack** (Prereqs: —). Snapshots in the store, header Undo/Redo and shortcuts, drag-and-drop on the
  stack.
- **T42 Working-copy change operations** (Prereqs: T40). The working-copy part of the `propose_changes` schema, dry
  run and apply as pure TypeScript, Vitest. The server sends `shared/agent-tools.json` to Claude as it is, so the new
  tool stays out of that file until T44.
- **T43 Online operations and `online_status`** (Prereqs: T42). Save, save as new, rename, publish and *Make live*
  as operations; the role check and the 20-version block; the read tool.
- **T44 Change card in the panel** (Prereqs: T41, T42, T43). The card, *Apply* and *Discard*, the run order,
  regenerate with the before/after line, the out-of-date check, outcome notes, the system prompt section, the help,
  FEATURES.md and the eval questions. It turns the feature on by adding the tools to `shared/agent-tools.json`.

### Not in this pass

- The manual-only actions above.
- Undo that survives a reload, and undo of hand edits in the tables.
- Applying part of a card.
- Changes that take effect without a card.

## Grilling notes

- **Q1 Everything, except permanent destruction and access changes.** The user's rule: "Permanent destruction stays
  out of AI's hands"; for those the assistant gives steps. Rejected: timetable only; timetable and data without
  settings or online actions.
- **Q2 Propose, then Apply.** Easiest to trust and to test, and lets a viewer try "what if" safely. Rejected: apply
  at once with Undo; a mix by size.
- **Q3 A snapshot per applied card,** at most 20, in memory. Rejected: app-wide history of every edit (needs edit
  grouping in every table; a separate feature); no undo.
- **Q4 Every role,** since changes land in the user's own working copy.
- **Q5 One question per question,** cards included; *Apply* is free.
- **Q6 The line:** if Undo or *Make live* can't take it back, or it changes who can reach the institute, it's
  manual. Found while asking: `save_timetable` deletes versions older than the newest 20 except the live one
  (`supabase/migrations/20261024200000_timetables.sql`), so the 21st save is blocked on the card.
- **Q7 One `propose_changes` tool per change set,** dry-run in the browser, outcome on the next message. Rejected: one
  tool per action.
- **Q8 Moves keep H1–H8; data edits show new checks but may apply; online changes are role-checked first.**
- **Q9 Regenerate runs Generate as the button does,** then a before/after line without a model call.
- **Q10 `online_status` with "you / another member"** in place of names, so no policy v4.
- **Q11 New teacher names go as typed;** a name field on the card was rejected because the name is already in the
  question.
- **Q12 Working copy, then regenerate, then online;** stop at the first failure.
- **Q13 Re-check on Apply;** out-of-date cards are disabled, older passing cards still work.
- **Q14 All or nothing.** Changes often depend on each other (add a room, then move a lab into it).
- **Q15 Header Undo/Redo with shortcuts;** drag-and-drop joins the stack; online steps aren't undone.
- **Q16 A moved class is locked,** as drag-and-drop does.
- **Q17 At most 100 changes per card.**
- **Q18 Replacing the working copy warns about unsaved work** on the card.
- **Q19 A system prompt section and help sections for manual actions;** no other server change.
- **Q20 Vitest, Pytest, more eval questions and a click-through.**
- **Q21 Four tickets, T41–T44.** T41 can start alongside T40.
