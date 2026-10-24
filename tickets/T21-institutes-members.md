# T21 — Institutes and members UI
**Status:** DONE
**Lane:** main · **Prereqs:** T19, T20 · **Branch:** t21-institutes

## Goal
Signed-in users can create an institute, switch between institutes, and see their role. The admin manages
members and invites. Last ticket of v2 idea #1; the behaviour is settled in the plan and grilling notes Q8–Q18 of
[`docs/discussions/2026-10-22-auth-and-roles.md`](../docs/discussions/2026-10-22-auth-and-roles.md). All writes
go through T20's functions and policies; the UI only hides what the role can't use.

## Scope / files
- `web/src/features/account/`: the dialogs below, account-menu items, and a pure module for the logic.
- No new page or routing; everything hangs off T19's avatar menu.

## Details
- **After every sign-in** (and on load with a session), call `accept_invites()`. For each institute joined,
  toast "You joined GNDEC Ludhiana as editor".
- **No institute and no invite:** a *Create institute* dialog asks for a name (trimmed, not empty) and has
  *Not now*. The menu then offers *Create institute*. Creating makes you admin and switches to the new institute.
- **Active institute:** remembered per browser in its own `localStorage` key, not in the app store's data. If it
  is gone (left, removed or deleted), fall back to the first membership. Show the switcher only with two or more
  institutes.
- **Menu for editors and viewers:** institute name, "Editor · admin is Dr. Meera Iyer (meera@…)", *Leave
  institute* (confirm).
- **Menu for the admin:** institute name, *Members…*, *Rename*, *Delete institute*.
- **Members dialog (admin only):**
  - members with name, email and role, the admin first;
  - per member (not the admin): role select (editor/viewer), *Make admin* (confirm: "You'll become an editor"),
    *Remove* (confirm);
  - pending invites with *Cancel*;
  - an invite form: email plus role (editor/viewer), with the hint "Use the address they'll sign in with (Google
    or email link)". Reject a malformed email or an existing member's email before calling the database.
- **Delete institute:** type the institute's name to enable the button.
- Database refusals show as toasts in plain words, e.g. "Only the admin can do that." Never show raw SQL errors.
- Roles don't limit the timetable steps yet; viewer read-only mode comes with pass #3.

## Tests
- Vitest on the pure module: active-institute fallback; switcher shown only with 2+ institutes; menu items per
  role; the "admin is X" line (name, else email); invite email validation and the already-a-member check; the
  delete-confirm match (trimmed, exact case); the joined-toast text for one and several institutes.
- Click through with two accounts (Google plus an email link to a second address of yours): create, invite,
  auto-join toast, change role, make admin and back, remove, leave, rename, delete. Also check a non-admin sees
  no Members.

## Done when
- [x] Every flow above works with two real accounts
- [x] Non-admins see their role and the admin, never the member list
- [x] FEATURES.md (new account section, known limits) and PROGRESS.md updated
- [x] `docs/v2-roadmap.md`: idea #1 status set to built
- [x] Committed: `T21: institutes, members and invites UI`
