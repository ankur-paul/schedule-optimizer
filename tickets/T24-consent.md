# T24 — Consent at sign-in and re-accept on policy change
**Status:** DONE
**Lane:** main · **Prereqs:** T21, T23 · **Branch:** t24-consent

## Goal
Nobody signs in without agreeing to the current Terms and Privacy Policy, every acceptance is recorded, and a
policy version bump makes signed-in users accept again. See grilling Q1 and Q6 in
[`docs/discussions/2026-10-24-privacy-and-consent.md`](../docs/discussions/2026-10-24-privacy-and-consent.md).

## Scope / files
- A new migration in `supabase/migrations/`: `policy_versions`, `consents`, `record_consent`.
- `web/src/features/account/`: the sign-in checkbox, the consent gate, a pure `consent.ts` module.
- `server/tests/test_rls_consent.py` (marked `supabase`).

## Details

Database:
- `policy_versions(version int primary key, published_at timestamptz)`, seeded with version 1. Readable by
  everyone, writable by no one but migrations. Bumping the version later = a migration row + `POLICY_VERSION` +
  `POLICY_CHANGES` in `web/src/legal/policy.ts`.
- `consents(user_id uuid references auth.users on delete cascade, version int references policy_versions,
  accepted_at timestamptz not null default now(), primary key (user_id, version))`. RLS on; users select their own
  rows; no direct insert, update or delete.
- `record_consent(version int)`: `security definer`, signed-in callers only; the version must exist; inserts for
  `auth.uid()` with `now()`; calling it twice is a no-op.

Web:
- **Sign-in dialog:** an unticked checkbox "I agree to the [Terms] and [Privacy Policy]" (links to `/terms` and
  `/privacy`, new tab). The Google and email-link buttons are disabled until it is ticked. On click, save
  `{ version: POLICY_VERSION }` under the `localStorage` key `lattice.pendingConsent` before the redirect, since
  OAuth and email links leave the page.
- **Gate**, after every sign-in and on load with a session, **before** T21's `accept_invites()` call (joining an
  institute is processing too). Read the caller's highest accepted version:
  - at least `POLICY_VERSION`: done;
  - otherwise, a pending consent for exactly `POLICY_VERSION`: call `record_consent`, clear the key, done;
  - otherwise (older pending, none, or signed in on another device from an email link): a blocking dialog with no
    close button, and Esc and outside clicks do nothing. Title "Before you continue" (never accepted) or "We've
    updated our Terms and Privacy Policy" (accepted an older one), the `POLICY_CHANGES` lines for the versions in
    between, links to both pages, and the buttons *Accept* and *Sign out*.
  - A failed read or record shows a toast and keeps the dialog. Never let the user through unrecorded.
- Clear `lattice.pendingConsent` on sign-out, and ignore a malformed value.
- Account menu: *Privacy* and *Terms* links.
- Existing dev accounts have no consent row, so they see the gate once. That is expected.

## Tests
- Vitest on `consent.ts`: the gate decision `(acceptedMax, pending, current) → ok | record | ask`, covering none,
  older, equal, newer, and pending for an old version; the dialog title per case; the changes list for skipped
  versions; pending-consent parse (malformed, wrong shape, missing).
- Pytest (`supabase`): `consents` has RLS on (the T20 guard test covers new tables); anon reads nothing; users see
  only their own rows; direct insert refused; `record_consent` refuses an unknown version and anon callers, sets
  the time itself, and is idempotent; rows go when the user is deleted.
- Click through: sign in with the box unticked (buttons disabled), ticked (no dialog after the redirect), then
  insert a `policy_versions` row 2 with `POLICY_VERSION = 2` locally and reload (dialog; *Sign out* signs out;
  *Accept* records it).

## Done when
- [x] Sign-in is impossible without ticking the box; acceptance recorded with version and time
- [x] Version bump shows the blocking dialog; Accept records, Sign out signs out
- [x] The gate runs before `accept_invites()`
- [x] Migration applies cleanly with `npx supabase db push`; tests above pass; full suite and `npx tsc -b` green
- [x] PROGRESS.md line; FEATURES.md updated (sign-in consent, re-accept)
- [x] Committed: `T24: consent at sign-in and re-accept`
