# T20 — Schema and RLS: institutes, memberships, invites
**Status:** IN PROGRESS
**Lane:** B · **Prereqs:** — · **Branch:** t20-schema-rls

## Goal
Create the Supabase tables, row-level security (RLS) policies and database functions behind institutes and roles,
with a Pytest suite that proves each role can do exactly what it should. RLS is the only place roles are enforced
(grilling Q5 in [`docs/discussions/2026-10-22-auth-and-roles.md`](../docs/discussions/2026-10-22-auth-and-roles.md));
the browser only hides buttons. Runs in parallel with T19.

## Scope / files
- `scripts/setup-supabase-cli.sh`: a bash wizard written with the `mattpocock-skills:wizard` skill:
  - create the Supabase dev project in Mumbai if T19's wizard hasn't;
  - `npx supabase login`, then `npx supabase link` to the project;
  - write `server/.env` with `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`;
  - `npx supabase db push` to apply the migrations.
- `supabase/config.toml` and `supabase/migrations/*.sql`.
- `server/.env.example` with the three vars; the service key is secret and never reaches the web bundle.
- Test dependency in `server/pyproject.toml` (supabase-py or plain `httpx`) and a `supabase` Pytest marker.
- `server/tests/test_rls.py` (split as it grows).

## Details

Tables (all with RLS on):

| Table | Columns | Who can read |
|---|---|---|
| `institutes` | `id`, `name`, `created_by`, `created_at` | its members |
| `memberships` | `institute_id`, `user_id`, `role` (`admin`/`editor`/`viewer`) | your own rows; the admin row of your institutes; every row of an institute you're admin of |
| `invites` | `institute_id`, `email` (lower-cased), `role` (`editor`/`viewer`), `created_at` | the institute's admin |
| `profiles` | `user_id`, `email`, `name` | yourself; the admin of an institute you're in; members of an institute you're admin of |

- **Exactly one admin per institute**: a partial unique index on `memberships(institute_id) where role = 'admin'`,
  and the functions below never leave an institute without one.
- `profiles` is filled by a trigger on `auth.users` (insert and email/name update). The browser can't read
  `auth.users`, and the admin needs members' names and emails.
- Direct writes: an admin may rename their institute and insert or delete its invites. Every other write goes
  through a `security definer` function, so `memberships` has no insert, update or delete policies.
- Functions, each checking the caller with `auth.uid()`:
  - `create_institute(name)`: any signed-in user; inserts the institute and makes the caller its admin.
  - `accept_invites()`: turns invites matching the caller's **confirmed** email into memberships, deletes them,
    and returns the institutes joined (name, role) for T21's toast. An invite for an institute the caller already
    belongs to is just deleted.
  - `set_member_role(institute, user, role)`: admin only; `editor` or `viewer`; not on the admin.
  - `make_admin(institute, user)`: admin only; target must be a member; target becomes admin, caller becomes editor.
  - `remove_member(institute, user)`: admin only; not on the admin.
  - `leave_institute(institute)`: any member except the admin.
  - `delete_institute(institute)`: admin only; memberships and invites go with it (`on delete cascade`).
- `tables_without_rls()`: returns public tables with RLS off; executable by `service_role` only (revoked from
  `anon` and `authenticated`). The guard test calls it.
- Helper checks such as `is_admin(institute)` are `security definer` so policies don't recurse.

## Tests
Pytest, marked `supabase`, skipped when `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` is missing from the
environment or `server/.env`. Each test creates throwaway users through the admin API (unique email prefix) and
deletes them and their institutes afterwards.
- `tables_without_rls()` returns nothing.
- `anon` reads nothing from any table.
- Per role (admin, editor, viewer, non-member): what each sees in every table, matching the table above.
- Every function: allowed for the right caller, refused for each wrong one. Includes: the admin can't leave,
  be removed or be demoted; `make_admin` swaps roles; a second admin can't be inserted; an invite can't carry
  `admin`.
- `accept_invites()` matches case-insensitively, ignores other emails, and is safe to call twice.
- Offline: `uv run pytest` passes with the `supabase` tests skipped.

## Done when
- [ ] Wizard links the project and `db push` applies the migrations cleanly to a fresh project
- [ ] Every test above passes against the dev project, and the suite passes offline with them skipped
- [x] Server env vars added to the deploy list in `docs/v2-roadmap.md`
- [ ] PROGRESS.md updated (no user-visible change, so FEATURES.md stays)
- [ ] Committed: `T20: institutes, memberships and invites with RLS`
