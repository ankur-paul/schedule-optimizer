# T36 — Assistant access: coupons and usage in the database
**Status:** DONE
**Lane:** B · **Prereqs:** — · **Branch:** t36-agent-access

## Goal
Trial coupons unlock the assistant for an institute, and every assistant call is checked and recorded in Supabase,
so the stateless `/agent` server (T38) can rely on the database for access, limits and spend. Plan:
[`docs/discussions/2026-10-24-ai-agent.md`](../docs/discussions/2026-10-24-ai-agent.md) (Access by coupon, How it's
built, Q11/Q32).

## Scope / files
- A new migration in `supabase/migrations/`.
- `server/scripts/issue_coupon.py`.
- `server/tests/test_rls_agent.py` (marked `supabase`), reusing the helpers in `server/tests/`.

## Details

Tables (RLS on; no direct insert, update or delete for `anon` or `authenticated`):
- `agent_coupons(code_hash text primary key, questions int > 0, days int > 0, note text, created_at, redeemed_at,
  redeemed_by → auth.users on delete set null, institute_id → institutes on delete set null)`. Nobody but the
  service role reads it.
- `agent_access(institute_id primary key → institutes on delete cascade, questions_left int >= 0, expires_at
  timestamptz, updated_at)`. Members `select` their institute's row (the panel shows it before the first question).
- `agent_redeem_failures(user_id, at)`: wrong tries for the rate limit.
- `agent_questions(id uuid primary key, institute_id → institutes on delete cascade, user_id → auth.users on delete
  set null, started_at, calls int, compactions int)`.
- `agent_usage(id bigint identity, question_id → agent_questions, institute_id → institutes on delete cascade, user_id
  → auth.users on delete set null, at, kind 'turn' | 'compact', model text, input_tokens, output_tokens,
  cache_read_tokens, cache_write_tokens int, cost_cents numeric(10,4))`. No chat text, ever.

Helpers: `private.has_current_consent_for(user uuid)` and `private.is_member_user(institute, user)`. The existing
helpers read `auth.uid()`, which is empty when the server calls with the service role. Keep the old ones working.

Functions (`security definer`; refusals raise `42501` with a message the UI shows and a `hint` code the UI and T38
can branch on, like T27):
- `redeem_coupon(institute_id, code) → (questions_left, expires_at)`: `authenticated`, the institute's admin only,
  and the caller must have current consent.
  - **Normalising:** upper-case, drop spaces, dashes and the `LTC` prefix, then hash with SHA-256 (`pgcrypto`).
  - **Wrong tries:** an unknown or used code records a failure and says "That coupon isn't valid". The 11th failure
    within an hour says "Too many tries, wait an hour" without checking the code.
  - **Granting:** if the access is still current, add the coupon's questions and keep the later expiry. If it has
    expired (or there is none), start fresh with the coupon's questions and `now() + days`.
- `agent_begin(user_id, institute_id, question_id uuid null, kind, budget_cents) → (question_id, call_number,
  questions_left, expires_at)`: **`service_role` only**. Checks, in order, each with its own hint:
  1. **Member:** the user belongs to the institute (`not_member`).
  2. **Consent:** the user has accepted the current policy version (`consent_required`).
  3. **Access:** the institute's access hasn't expired (`no_access`, `expired`).
  4. **Budget:** this month's `sum(cost_cents)` across all usage is below `budget_cents` (`paused`).
  5. **New question** (`question_id` null, kind `turn`): questions are left (`used_up`). Subtract one and create the
     `agent_questions` row.
  6. **Continuing question:** the question exists, belongs to this user and institute, started under 15 minutes ago
     (`question_closed`), has made fewer than 9 calls (`too_many_calls`), and, for `compact`, has no compaction yet
     (`too_many_compactions`). Add one to `calls` or `compactions`.

  A compaction always continues an existing question.
- `agent_record(question_id, kind, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
  cost_cents)`: **`service_role` only**. Inserts the usage row.
- Revoke execute on both from `public`, `anon` and `authenticated`, and test that a signed-in user can't call them.

`issue_coupon.py`:
- `--questions` (default 200), `--days` (default 30), `--note`.
- **The code:** 16 characters chosen with `secrets.choice` from the 31-character alphabet `A–Z 2–9` minus `O I L`
  (`0` and `1` are not in it), printed as `LTC-XXXX-XXXX-XXXX-XXXX`.
- **Storing:** the script inserts the hash with the service-role key (reuse the env loading in
  `tests/supabase_api.py`, or move it somewhere both can import). It prints the code once and never stores it. The
  normalising and hashing match `redeem_coupon`'s exactly; share a test vector.

## Tests
Pytest (`supabase`):
- the T20 guard test sees the new tables with RLS on;
- `redeem_coupon`:
  - admin succeeds; editor, viewer, non-member and a user without consent are refused;
  - the code works lower-case and without dashes; a used code is refused;
  - the 11th wrong try in an hour is refused even with a valid code;
  - a second coupon adds questions and takes the later expiry; after expiry, it starts fresh;
- members read their `agent_access` row; non-members don't; nobody but the service role reads `agent_coupons` or
  `agent_usage`;
- `authenticated` can't execute `agent_begin` or `agent_record`;
- `agent_begin`:
  - each hint in the list above;
  - a new question uses one and continuing doesn't;
  - the 10th call of a question is refused, and so is a second compaction;
  - another user's question ID is refused;
  - the budget check counts only this month;
- deleting an institute cascades; deleting a user keeps usage rows with `user_id` null;
- unit test (no network): the script's code format, alphabet and the hash test vector.

## Done when
- [x] Migration applies cleanly with `npx supabase db push`
- [x] `issue_coupon.py` issues a code that `redeem_coupon` accepts
- [x] Tests above pass; full suite and `npx tsc -b` green
- [x] PROGRESS.md line
- [x] Committed: `T36: assistant coupons and usage`

## Notes
- A wrong or used code makes `redeem_coupon` return no rows instead of raising: raising rolls back the transaction,
  which would drop the failure row the try limit counts. T40 shows "That coupon isn't valid." for an empty result.
- `agent_begin` has one more hint than listed: `unknown_question`, for a question ID that isn't this user's in this
  institute. Added to T38's list.
- Hashing uses Postgres's built-in `sha256()`, so `pgcrypto` isn't needed.
- The env loading moved from `tests/supabase_api.py` to `server/supabase_env.py`, so the script and T38 can import it.
