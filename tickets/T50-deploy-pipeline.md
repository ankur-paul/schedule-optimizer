# T50 — Deploy pipeline
**Status:** DONE
**Lane:** main · **Prereqs:** T45, T47, T48 · **Branch:** t50-deploy-pipeline

## Goal
Everything needed to deploy, written and tested as far as it can be without the production accounts: the
workflows, the AWS setup script, the migration script and check, and the host's routing files. T51 creates the
accounts and runs them. Plan, *How a change reaches production* and *Secrets*:
[`docs/discussions/2026-10-25-deploy.md`](../docs/discussions/2026-10-25-deploy.md).

## Scope / files
- `supabase/migrations/…_schema_version.sql`: the `schema_version()` function, with a Pytest.
- `.github/workflows/deploy.yml`, `rollback.yml`, `keepalive.yml`.
- `scripts/aws-setup.sh`: idempotent; creates what AWS needs.
- `scripts/migrate-prod.sh`.
- `scripts/smoke.sh`: the post-deploy check, used by `deploy.yml` and `keepalive.yml`.
- `web/public/_redirects` (and `_headers` if needed), `web/.env.production` with placeholders,
  `!web/.env.production` in `.gitignore`.
- `docs/deploy.md`: the parts this ticket owns (the scripts, the workflows, rollback).

## Details
- **`schema_version()`:** a `security definer` SQL function returning the newest applied version from
  `supabase_migrations.schema_migrations`, executable by `anon`. It reveals only a timestamp. Pytest against dev:
  it returns the newest file name's prefix in `supabase/migrations/`.
- **`deploy.yml`:** on push to `main`; first calls `ci.yml` (`workflow_call`) and needs it to pass. Then:
  1. **Migration check:** call `schema_version()` on production (URL and anon key from `web/.env.production`); fail
     with "run scripts/migrate-prod.sh" if it is older than the newest file.
  2. **Image:** log in to AWS with `aws-actions/configure-aws-credentials` through OIDC (`role-to-assume` from a
     repository variable), build for `linux/amd64`, push to ECR as `:<sha>`.
  3. **Functions:** `aws lambda update-function-code --image-uri …:<sha>` on both, then `aws lambda wait
     function-updated`. **Never** `update-function-configuration`.
  4. **Web:** `curl -X POST` the Pages deploy hook (secret `PAGES_DEPLOY_HOOK`), then poll the site until it serves
     the new build (put the commit SHA in a `<meta>` tag or `/version.txt` at build time; Pages exposes
     `CF_PAGES_COMMIT_SHA`).
  5. **Smoke:** `scripts/smoke.sh`.
  One deploy at a time (`concurrency: deploy`, no cancel).
- **`smoke.sh`:** `/health` on both Function URLs answers within 10 s (one retry for a cold start) with the
  contract version in `shared/contract.json`; `https://uselattice.app/privacy` answers 200 and contains the policy
  version. URLs from `web/.env.production`.
- **`rollback.yml`:** `workflow_dispatch` with a SHA input; checks the tag exists in ECR, updates both functions,
  runs the server half of the smoke check. Note in `docs/deploy.md` that the web app rolls back in the Pages
  dashboard and the contract versions must agree.
- **`keepalive.yml`:** `schedule` every 3 days plus `workflow_dispatch`; calls `schema_version()` and runs
  `smoke.sh`. No AWS login needed.
- **`aws-setup.sh`** (run by the operator with their own login; prints what it did):
  - ECR repository `lattice-server`, with a lifecycle rule keeping the last 10 images;
  - the GitHub OIDC provider, and a role trusted only for `repo:ankur-paul/schedule-optimizer:ref:refs/heads/main`,
    allowed to push to that repository and call `UpdateFunctionCode`/`GetFunction` on the two functions only;
  - both functions from the image (`lattice-solver`: 3,008 MB, timeout 150 s; `lattice-agent`: 512 MB, timeout
    300 s), x86_64, each with a Function URL (auth `NONE`, CORS off), and their log groups at 14 days. It creates the
    functions with **no** env vars and never changes env vars on later runs;
  - an AWS Budgets alert emailing the operator when monthly cost before credits passes $5.
- **`migrate-prod.sh`:** links the production project (ref from an argument or `.env`), shows `supabase migration
  list`, asks for confirmation, runs `supabase db push`. Never stores the password.
- **`_redirects`:** the public timetable rewrite `/<handle>/<id>` → `/published.html` (200), leaving `/assets/*`,
  `/help/*` and real files alone; `www.uselattice.app` → `uselattice.app` is a Cloudflare redirect rule (T51), not
  this file. Check Pages serves `privacy.html`, `terms.html`, `help.html` and `help/<page>.html` without `.html` by
  default, and that `npm run preview` behaves the same.
- **Pages deploy hook with automatic deploys off:** read Cloudflare's docs and note what they say; T51 confirms it
  live. **If the hook option is gone:** no `wrangler`, no Cloudflare token. Pages deploys `main` automatically, its
  build command runs the web tests first, and step 4 skips the `curl` and only waits for the new build. Write step 4
  so this is one switch (e.g. the step runs only when the `PAGES_DEPLOY_HOOK` secret is set).

## Tests
- Pytest for `schema_version()` (dev).
- `actionlint` on the workflows, `shellcheck` on the scripts (run locally; note the versions).
- `smoke.sh` against a local run: the T47 image on one port and `npm run preview` on another, with URLs overridden
  by env vars.
- `_redirects`: a small test that parses it and checks the sample paths (`/acme/abc123` rewritten; `/help/start`,
  `/assets/x.js`, `/privacy` not).
- `aws-setup.sh` is not run here (no production account yet); T51 runs it.

## Done when
- [x] Workflows, scripts, migration, `_redirects` and `web/.env.production` committed
- [x] Tests above pass; full suite and `npx tsc -b` green
- [x] `docs/deploy.md` covers the scripts, the workflows and rollback
- [x] PROGRESS.md line
- [x] Committed: `T50: deploy pipeline`
