# T43 — Online operations and online_status
**Status:** DONE
**Lane:** B · **Prereqs:** T42 · **Branch:** t43-online-operations

## Goal
The online changes the assistant can propose, and a read tool that tells it the online state, both without new
personal data reaching Anthropic. Plan:
[`docs/discussions/2026-10-25-agent-write-actions.md`](../docs/discussions/2026-10-25-agent-write-actions.md) (What
it can propose, Q6, Q10, Q12).

## Scope / files
- `shared/agent-change-tool.json`: add the online operations to `propose_changes`.
- `web/src/features/assistant/changes.ts`: their dry run and an async `runOnline(change, api)` that calls the
  existing functions in `features/online/` (`saveOnline`, `createOnline`, `renameOnline`, `publishVersion`, …).
- `online_status` in `shared/agent-change-tool.json` (moves to `agent-tools.json` with the rest in T44) and
  `web/src/features/assistant/tools.ts`.
- Tests next to each file.

## Details
- **Operations:**
  - `save_online`, `save_as_new { name }`, `rename_online { name }`, `publish { version }`, `make_live { version }`,
    `open_online { timetableId, version? }` (replaces the working copy; unsaved-work warning as `load_sample`).
- **Dry run:**
  - **Role:** viewers can't save, rename or publish (`canEdit`); the set fails with "Your role can't …, ask an
    editor" so the model can explain instead of proposing.
  - **20 versions:** a save that would make the server drop a version (`save_timetable` keeps the newest 20 plus
    the live one) fails with "This save would delete version N. Save by hand." Check against `highestVersion` and
    the live version. `save_as_new` starts a new timetable, so it never drops one.
  - **Not linked:** `save_online` with no linked timetable fails and points to `save_as_new`.
  - Online changes must come after every working-copy change in the set; otherwise fail ("put online changes
    last").
- **`runOnline`:** returns `{ ok }` or `{ ok: false, reason }`. A version conflict returns `conflict` and never
  overwrites. No retries.
- **`online_status`:** the linked institute and timetable name, the user's role, unsaved changes (`isDirty`), the
  versions with number, date and saved by "you" or "another member", and which version is live and published. No
  member names or emails, no member list, no invites. Signed out or not linked: says so.
- **Manual-only actions** (delete, unpublish, handle, invites, members, overwrite) have no operation. The schema
  description says they are manual so the model doesn't try.

## Tests
- Each operation's dry run for admin, editor and viewer.
- The 20-version block at exactly 20 kept versions, with and without the live one among them.
- `save_online` when not linked; an online change before a working-copy change.
- `runOnline` with a fake API: success, conflict (no overwrite call made), RLS refusal, network error.
- `online_status`: no member name or email appears (checked on a fixture with named savers); signed out; not linked.

## Done when
- [x] Online operations and `online_status` work as above
- [x] Tests above pass; full suite and `npx tsc -b` green
- [x] PROGRESS.md line
- [x] Committed: `T43: online operations and online_status`
