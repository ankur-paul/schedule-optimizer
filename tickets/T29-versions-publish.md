# T29 — Versions and publish
**Status:** DONE
**Lane:** main · **Prereqs:** T28 · **Branch:** t29-versions-publish

## Goal
An editor publishes a timetable to a stable public link and can put an earlier version back at once if the wrong
one went out. Plan, Q10, Q13, Q15–Q17:
[`docs/discussions/2026-10-24-online-data.md`](../docs/discussions/2026-10-24-online-data.md).

## Scope / files
- `web/src/features/online/`: the Versions dialog, Publish, the link dialog, the handle dialog, and pure helpers.
- `web/src/features/account/`: the admin's handle setting in the institute part of the account menu.

## Details

Versions dialog (from the status menu, for the linked timetable, and from each row of *Open from institute*):
- Rows newest first: "Version 7 · A · 24 Oct, 10:42", a *Live* badge on the live one, and "Kept: last 20" as a note.
- *Open*: loads that version into the working copy (asking first if dirty). The link's base becomes the **latest**
  version, so the next *Save online* saves the old data as a new version without a conflict: this is "restore".
- *Make live* (editors and admin): "The public link will show version 5" → `publish_timetable` with that version.
- *Unpublish* (editors and admin), confirmed.
- Viewers see the list and *Open* only.

Publish (status menu, editors and admin):
- Unsaved changes: "Save online first?" with *Save and publish* and *Cancel*.
- No result in the working copy: disabled, with the reason as a tooltip.
- No handle: the admin gets the handle dialog, then publishing continues; an editor sees "Ask your admin (X) to set
  the institute's link name".
- After publishing: a dialog with the link (`<origin>/<handle>/<public_id>`), a *Copy* button and an *Open* link.
- The status line shows "· published" when the linked timetable has a live version.

Handle dialog and setting (admin): an input with live checks for the format and reserved words (the same rules as
T27), a preview of the link, and the server's "That handle is taken". Changing it later explains that old links
keep working.

## Tests
- Vitest: the handle checker (length, characters, leading and trailing `-`, reserved words, case and spaces);
  `publicUrl(origin, handle, publicId)`; the version row label; Publish's state (dirty, no result, no handle as
  admin or editor, ready).
- Click through: publish, open the link (T30, or check `get_published` in the browser console if T30 isn't merged
  yet), save a new version and publish again, make an old one live, unpublish; set and change the handle; as an
  editor in an institute with no handle; as a viewer.

## Done when
- [x] Publish, Make live and Unpublish work; the link never changes
- [x] Opening an old version and saving restores it as a new version
- [x] The handle is set by the admin, prompted at the first publish, and changeable
- [x] Tests above pass; full suite and `npx tsc -b` green
- [x] PROGRESS.md line; FEATURES.md updated (versions, publishing)
- [x] Committed: `T29: versions and publish`
