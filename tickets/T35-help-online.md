# T35 — Help content: online and institutes
**Status:** TODO
**Lane:** any · **Prereqs:** T32, T33, T31 · **Branch:** t35-help-online

## Goal
Explain signing in, institutes, roles, saving online, versions and publishing as they finally work, and link the
help from the account menu and the online dialogs. Plan:
[`docs/discussions/2026-10-24-help-page.md`](../docs/discussions/2026-10-24-help-page.md).

## Scope / files
- `web/src/help/online.md`, plus the matching troubleshooting entries in `troubleshooting.md` (email link didn't
  arrive, "Only the admin can do that", "Changed online by …", the consent dialog).
- New entries in T33's shot list, and the PNGs.
- In-app links through `helpHref` in `web/src/features/account/` and `web/src/features/online/`.

## Details
- Waits for T31 (and so T29) so it describes the finished flow: versions, publish, *Make live*, the handle, and
  consent before saving.
- **Write with the `/no-ai-slop` skill.** Facts come from the code and FEATURES.md; the UI's exact labels.
- Sections from the plan: signing in; institutes and roles (what admin, editor and viewer can each do, as a table);
  the working copy and *Save online*; two editors and the conflict dialog; versions; publishing, the public link
  and the handle; deleting and leaving.
- Say plainly what stays on the device and what goes online, matching the privacy policy's wording.
- Screenshots of signed-in UI need mocked Supabase responses (T33's notes). If that costs too much, describe the
  dialogs in text and say so in the Notes below.
- Links: *Learn more* in the Save online, conflict, versions and publish dialogs and the members dialog, where the
  help says more than the dialog does.

## Tests
- T32's link test passes with the new links.
- Click through: every new link signed in as admin, editor and viewer.

## Done when
- [ ] `online.md` and its troubleshooting entries written with `/no-ai-slop`
- [ ] In-app links in the account and online dialogs
- [ ] Tests above pass; full suite and `npx tsc -b` green
- [ ] PROGRESS.md line; FEATURES.md updated if links were added
- [ ] Committed: `T35: help for online and institutes`

## Notes
