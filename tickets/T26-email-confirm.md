# T26 — Email confirmation for Make admin and Leave institute
**Status:** DONE
**Lane:** main · **Prereqs:** T21 · **Branch:** t26-email-confirm

## Goal
Handing over the admin role and leaving an institute need a confirmation from the caller's own email, so someone at
an unlocked laptop can't do either. Asked for after T21's click-through (24 Oct 2026): the current admin confirms a
handover, and the leaving member confirms leaving. Postgres enforces it, like every other rule (grilling Q5 in
[`docs/discussions/2026-10-22-auth-and-roles.md`](../docs/discussions/2026-10-22-auth-and-roles.md)).

## Scope / files
- `supabase/migrations/<new>.sql`: `private.email_confirmed_recently()` and new versions of `make_admin` and
  `leave_institute` that call it.
- `server/tests/supabase_api.py` (sign a user in by email code through the admin API, no email sent) and
  `server/tests/test_rls.py`.
- `web/src/features/account/`: the email step in the *Make admin* and *Leave* flows, and its pure logic.

## Details
- **What counts as confirmed:** the caller's token has an `amr` entry with method `otp` or `magiclink` from the last
  10 minutes, i.e. they signed in through an email link within 10 minutes. Checked 24 Oct against the dev project:
  an email sign-in adds `{"method": "otp", "timestamp": …}`, and a token refresh keeps the original time.
- **A link, not a code, for now.** Supabase's built-in sender can't have its templates edited on the free plan, so
  the email holds a sign-in link. A 6-digit code can replace it in the deploy pass, with our own SMTP sender.
- `make_admin` and `leave_institute` check the role and the target first, then refuse without a recent email
  confirmation: errcode 42501, hint `email_confirmation_required`, message "Confirm from your email first."
- **Flow:** *Make admin* (or *Leave*) asks first. If the session already has a recent email confirmation, it goes
  ahead. Otherwise a dialog says a link goes to your email and has *Send link*. Sending uses
  `signInWithOtp({ shouldCreateUser: false })` and remembers the pending action in `localStorage` (per user,
  expires after an hour). Opening the link signs you in again and shows *Finish: make X the admin of Y?* with
  *Confirm* and *Cancel*. Google users get the same link for their account's email.
- If the database still says confirmation is needed (clock skew, a stale token), show the email step again rather
  than an error.

## Tests
- Pytest (`supabase` marker): a password sign-in (no email confirmation) is refused for both functions with the
  hint; an email-code sign-in is allowed; the role and target checks still come first.
- Vitest: reading `amr` from an access token (fresh, stale, missing, malformed, a refresh keeping the time); the
  pending-action store (per user, expiry, cleared after finishing); the refusal is recognised by its hint.
- Click-through by the user: hand over admin and leave, as a Google user and as an email-link user, the link opened
  in the same tab and in a new one.

## Done when
- [x] Both functions refuse without a recent email confirmation, and the tests prove it
- [x] The email-link flow works for Google and email-link users
- [x] FEATURES.md (account section, known limits) and PROGRESS.md updated
- [x] Committed: `T26: email confirmation for make admin and leave`
