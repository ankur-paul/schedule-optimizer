# T19 — Sign-in: Supabase client, Google and email link, account menu
**Status:** IN PROGRESS
**Lane:** A · **Prereqs:** — · **Branch:** t19-sign-in

## Goal
Let a user sign in and out with Supabase Auth, using Google or an email link, while the app keeps working exactly as
v1 when signed out. First ticket of v2 idea #1; read [`docs/discussions/2026-10-22-auth-and-roles.md`](../docs/discussions/2026-10-22-auth-and-roles.md)
(the plan and the grilling notes) and PLAN.md §1 *User* / *Storage*. Runs in parallel with T20; T21 builds the
institute UI on both.

## Scope / files
- `scripts/setup-auth.sh`: a bash wizard written with the `mattpocock-skills:wizard` skill, for the steps only the
  user can do:
  - create the Supabase dev project in Mumbai (`ap-south-1`); skip if T20's wizard already made it;
  - create a Google Cloud OAuth client and paste its id and secret into Supabase's Google provider;
  - set Supabase's Site URL and redirect allow-list for local dev (any localhost port, since Vite moves off 5173);
  - write `web/.env.local` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- `web/.env.example` with both vars and a comment that the anon key is public by design.
- `@supabase/supabase-js` in `web/package.json`.
- `web/src/lib/supabase.ts`: the client, or `null` when either env var is missing.
- `web/src/features/account/`:
  - a small account store or hook holding the session, kept in sync through `onAuthStateChange`;
  - the header **Sign in** button, opening a dialog with *Continue with Google* and an email field for
    *Email me a sign-in link* (then "Check your inbox at …");
  - after sign-in, an avatar menu with the user's name (or email) and **Sign out**. T21 adds the institute items.
- `web/src/App.tsx` header: mount the account button next to *Start over*.

## Details
- **Signed out = v1.** With no client (env vars missing), the Sign in button doesn't render and nothing else
  changes. Signing in or out never touches the app store or `localStorage` app data.
- **No hard-coded URLs.** OAuth `redirectTo` and email `emailRedirectTo` are the current
  `window.location.origin`.
- Display name: Google's `full_name`, else the email. Email-link users have no name.
- Supabase's built-in email sender only reaches the project's team members, 2 emails an hour. Say so in
  FEATURES.md *Known limits*; the real sender comes in the deploy pass.
- Add the env vars, the Supabase project and the Google OAuth client to the deploy list at the end of
  `docs/v2-roadmap.md` if they aren't there yet.

## Tests
- Vitest: client config is `null` with either env var missing or empty; display name falls back to the email;
  redirect URL comes from the origin.
- Click through it yourself: signed out with no `.env.local` (no button), Google sign-in, email link to your own
  address, sign out, and a reload keeps the session.

## Done when
- [ ] Wizard runs end to end and leaves a working `web/.env.local`
- [ ] Google and email-link sign-in work locally; sign-out works; session survives a reload
- [ ] With no env vars the app is v1, with no Sign in button
- [ ] FEATURES.md (account menu, known limits) and PROGRESS.md updated
- [ ] Committed: `T19: sign in with Google or email link`
