# T25 — Delete account and invite expiry
**Status:** TODO
**Lane:** B · **Prereqs:** T21 · **Branch:** t25-delete-account

## Goal
Users can delete their own account, and invites holding someone else's email don't linger. These are the two
retention promises in the privacy policy. See grilling Q7 and Q9 in
[`docs/discussions/2026-10-24-privacy-and-consent.md`](../docs/discussions/2026-10-24-privacy-and-consent.md).

## Scope / files
- A new migration in `supabase/migrations/`: `delete_account()`, invite expiry in `accept_invites()`, and a
  `pg_cron` job.
- `web/src/features/account/`: the *Delete account…* dialog, expiry dates in the Members dialog, pure logic in
  the existing modules.
- `server/tests/test_rls_delete.py` (marked `supabase`).

## Details

Database:
- `delete_account()`: `security definer`, signed-in callers only.
  - If the caller is the admin of any institute, raise an error naming those institutes. They hand over (*Make
    admin*) or delete each first, the same rule as `leave_institute`.
  - Otherwise `delete from auth.users where id = auth.uid()`. Memberships, the profile and (once T24 is merged)
    consent rows go by `on delete cascade`, and `institutes.created_by` is set null.
  - Check that Supabase lets a `security definer` function owned by `postgres` delete from `auth.users`. If it
    doesn't, fall back to a FastAPI `POST /account/delete` that verifies the user's token, runs the same admin
    check, and calls the Auth admin API with the service key. Note which route was used.
- **Invite expiry, 30 days:**
  - `accept_invites()` ignores invites older than 30 days and deletes them;
  - a daily `pg_cron` job deletes every invite older than 30 days. Enable the extension in the migration and
    check it is available on the free plan. If it isn't, set `BLOCKED (needs human: pg_cron)` rather than
    dropping the purge, since the policy promises it.

Web:
- Account menu: *Delete account…* opens a dialog.
  - Caller is an admin somewhere: list those institutes and say "Make someone else admin or delete the institute
    first." No delete button.
  - Otherwise: say what goes (account, memberships) and what stays (timetable data saved in this browser), and ask
    for the account's email to be typed (trimmed, case-insensitive) to enable *Delete account*. On success, sign
    out, clear `lattice.pendingConsent` and the active-institute key, and toast "Your account was deleted".
- Members dialog: each pending invite shows "expires 23 Nov". The dates come from `created_at` + 30 days.
- Refusals show as plain toasts, never raw SQL errors (as in T21).

## Tests
- Vitest: delete-confirm match (trimmed, case-insensitive); which dialog state shows (admin of 0, 1 or several
  institutes); the invite expiry date and its text.
- Pytest (`supabase`): an admin is refused, with the institute names in the message; an editor or viewer is
  deleted, along with their memberships and profile (and consents, if T24 is in); the institute they created
  survives with `created_by` null; anon is refused; an invite backdated past 30 days is not accepted and is gone
  after `accept_invites()`; the cron job exists in `cron.job`.
- Click through: delete as an admin (blocked), hand over, delete (signed out, toast); sign in again with the same
  email (a fresh account, no institutes).

## Done when
- [ ] Non-admins can delete their account from the menu; admins are told to hand over first
- [ ] Invites expire after 30 days (join-time check and daily purge); the Members dialog shows expiry
- [ ] Migration applies cleanly; tests above pass; full suite and `npx tsc -b` green
- [ ] PROGRESS.md line; FEATURES.md updated (delete account, invite expiry)
- [ ] Committed: `T25: delete account and invite expiry`
