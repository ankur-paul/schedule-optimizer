# T28 — Save online and open from institute
**Status:** DONE
**Lane:** main · **Prereqs:** T27 · **Branch:** t28-save-open

## Goal
A signed-in editor can save the device's working copy to an institute and open it on another device, without
silently overwriting someone else's save. Plan, Q2, Q6–Q8, Q18, Q19:
[`docs/discussions/2026-10-24-online-data.md`](../docs/discussions/2026-10-24-online-data.md).

## Scope / files
- `web/src/features/online/`: a pure module for the document and link logic, an API module over T27's functions,
  the header status line and the dialogs.
- `web/src/store/useAppStore.ts`: the link, `PERSIST_VERSION` 2 with a migration.
- `FEATURES.md`: replace the "Roles don't limit the timetable yet" known limit.

## Details

Document and link (pure, tested):
- `toDoc(state)` takes settings, departments, teachers, rooms, sections, courses, locks, result and print heading;
  `fromDoc(doc)` returns them for the store. `step` and `timeLimitSec` stay on the device.
- The store gains `online: { instituteId, timetableId, name, version, savedHash } | null`, persisted. `savedHash` is
  a stable hash of `toDoc` at the last save or open; the working copy has unsaved changes when the hash differs.
- *Reset* clears the link. Everything else (import, sample, edits, generate) only changes the hash.

Header status line, next to the account button, with a menu:
- "On this device only", or "CSE odd sem 2026 · GNDEC" with "· unsaved changes" when dirty.
- Signed out with a link: the line stays, and *Save online* says to sign in.
- Menu: *Save online*, *Save as new timetable…*, *Open from institute…*, *Rename…*, *Delete…* (admin only),
  *Work on this device only* (drops the link, keeps the data). T29 adds *Versions* and *Publish*.
- Viewers see "View only" and no write actions. The buttons are cosmetic; T27's functions are the rule.

Save:
- First *Save online* (no link) and *Save as new*: a dialog with the institute (those where the user is admin or
  editor, defaulting to the active one) and a name (default: the print heading, else "Timetable"). Calls
  `create_timetable` and links the working copy.
- Linked: `save_timetable` with the linked version as base. On `LT409`: "Changed online by A at 10:42 since you
  opened it" with *Overwrite* (retry with the reported version as base), *Save as new timetable* or *Cancel*.
- A deleted timetable or lost access: say so and offer *Save as new timetable*.
- A refusal for missing consent shouldn't happen behind T24's gate; show the message if it does.
- Network or server errors: a toast; the working copy and link stay as they were.

Open:
- Lists the active institute's timetables: name, latest version, saved by and when, and a *Live* badge (T29 uses
  it). Opening loads the latest version and links to it. With unsaved changes: "Replace your working copy? Your
  unsaved changes will be lost" with *Replace* and *Cancel*.

Rename (editors and admin) and Delete (admin, type the name). Deleting the linked timetable drops the link.

## Tests
- Vitest: `toDoc`/`fromDoc` round trip on the sample college; the hash ignores `step` and `timeLimitSec` and key
  order; dirty detection; the persist migration from version 1 adds `online: null`; the conflict detail parser
  (good, malformed, missing); the status line text per case (no link, clean, dirty, signed out, viewer); name
  defaults.
- Click through with two browsers as two editors: save, open on the other, save on both (conflict dialog, each
  choice), as a viewer (no write actions), signed out (status line stays).

## Done when
- [x] Save online, Save as new, Open, Rename and Delete work against the dev project
- [x] A stale save shows the conflict dialog and never overwrites silently
- [x] Viewers can't write online; signed out works as before
- [x] Tests above pass; full suite and `npx tsc -b` green
- [x] PROGRESS.md line; FEATURES.md updated (online timetables, the known limits)
- [x] Committed: `T28: save online and open from institute`
