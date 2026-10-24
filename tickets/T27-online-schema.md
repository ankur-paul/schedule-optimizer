# T27 — Online timetables: schema and RLS
**Status:** TODO
**Lane:** B · **Prereqs:** — · **Branch:** t27-online-schema

## Goal
Timetables, their versions, the live-version pointer and the institute handle live in Supabase, with every rule
enforced by RLS and `security definer` functions. Plan:
[`docs/discussions/2026-10-24-online-data.md`](../docs/discussions/2026-10-24-online-data.md).

## Scope / files
- A new migration in `supabase/migrations/`.
- `server/tests/test_rls_timetables.py` (marked `supabase`), reusing the helpers in `server/tests/`.

## Details

Tables (RLS on; members `select`; no direct insert, update or delete for `anon` or `authenticated`):
- `institutes.handle text unique`, nullable. Format `^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$` (3–30 characters). Reserved
  words refused: `assets`, `privacy`, `terms`, `api`, `published`, `admin`, `login`, `static`, `www`. The existing
  rename-name grant on `institutes` must not let anyone write `handle` directly.
- `timetables(id uuid pk, institute_id → institutes on delete cascade, name text 1–120 chars, public_id text unique,
  latest_version int not null default 0, live_version int null, created_by → auth.users on delete set null,
  created_at)`. Name unique per institute ignoring case and outer spaces. `public_id`: 10 random characters from
  `a–z0–9`, made at creation from `gen_random_bytes`.
- `timetable_versions(timetable_id → timetables on delete cascade, version int, data jsonb not null, saved_by →
  auth.users on delete set null, saved_at timestamptz not null default now(), primary key (timetable_id, version))`.
  `check (octet_length(data::text) <= 2097152)`.

Helpers in `private`: `can_edit(institute)` (admin or editor) and `has_current_consent()` (the caller has a
`consents` row for the highest `policy_versions.version`).

Functions (`security definer`, refusals raise `42501` with a message the UI shows, like T20):
- `create_timetable(institute_id, name, data) → (timetable_id, version)`: editors and the admin; version 1.
- `save_timetable(timetable_id, data, base_version) → version`: editors and the admin. If `latest_version <>
  base_version`, raise SQLSTATE `LT409` with the latest version, who saved it and when in the error detail (JSON),
  so the UI can say "Changed online by A at 10:42" and *Overwrite* can retry with that version as the base. Then
  delete versions outside the newest 20, keeping `live_version`.
- `rename_timetable(timetable_id, name)`: editors and the admin.
- `delete_timetable(timetable_id)`: admin only.
- `publish_timetable(timetable_id, version)`: editors and the admin; the version must exist and its `data` must have
  a non-null `result`; the institute must have a handle (a distinct message, so the UI can prompt for it). Used by
  both *Publish* (latest) and *Make live* (any kept version).
- `unpublish_timetable(timetable_id)`: editors and the admin; sets `live_version` null.
- `set_institute_handle(institute_id, handle)`: admin only; lower-cases and trims; "That handle is taken" on a clash.
- Every write above also refuses a caller without `has_current_consent()` ("Accept the current Terms first").
- `get_published(public_id) → (institute_name, handle, timetable_name, saved_at, data)`: granted to `anon` and
  `authenticated`. Returns no row unless `live_version` is set. `data` leaves out `locks`.

## Tests
Pytest (`supabase`), per role (admin, editor, viewer, non-member, signed out):
- the T20 guard test sees the new tables with RLS on;
- members read timetables and versions, non-members and anon read nothing;
- viewers and non-members are refused every write; delete and handle are admin only;
- the version check: a stale base raises `LT409` with the right detail; a retry with the reported version succeeds;
- pruning keeps 20 plus an older live version; the 2 MB check refuses a big document;
- publish refuses without a result and without a handle; make live switches versions; unpublish hides it from
  `get_published`;
- `get_published` as anon: the live version without locks, the current handle after a handle change, nothing for an
  unknown or unpublished id;
- handle format, reserved words and uniqueness; deleting a timetable or institute cascades;
- writes refused for a user without consent to the current policy version.

## Done when
- [ ] Migration applies cleanly with `npx supabase db push`
- [ ] Tests above pass; full suite and `npx tsc -b` green
- [ ] PROGRESS.md line
- [ ] Committed: `T27: online timetables schema and RLS`
