# T48 — CI on GitHub Actions
**Status:** IN PROGRESS
**Lane:** C · **Prereqs:** — · **Branch:** t48-ci

## Goal
Every push and pull request runs the whole test suite on GitHub, so a broken `main` never deploys (T50 waits on
this workflow). Plan, *How a change reaches production*:
[`docs/discussions/2026-10-25-deploy.md`](../docs/discussions/2026-10-25-deploy.md).

## Scope / files
- `.github/workflows/ci.yml`.
- `server/tests/` or `web/` changes only where a test can't run on a clean Ubuntu runner (note each).
- `docs/deploy.md` stub: the GitHub secrets CI needs and how to set them.

## Details
- **Triggers:** `push` to any branch, `pull_request`, and `workflow_call` so T50's deploy can reuse it.
- **Jobs:**
  - `web`: Node from `web/package.json`'s engines or the current LTS; `npm ci`, `npm test`, `npx tsc -b`,
    `npm run build`. Cache npm.
  - `server`: `astral-sh/setup-uv`, `uv sync --frozen`, `uv run pytest`. With the dev project's secrets set, the
    `supabase` tests run; without them (forks) they skip, as today.
- **Secrets:** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` for the **dev** project, as
  repository secrets, passed only to the `server` job's test step. Nothing for production.
- **Supabase tests at once:** two runs share the dev project. Give the `server` job a `concurrency` group so they
  queue rather than collide, unless the tests already isolate by unique names (check and note which).
- **Pinning:** every third-party action pinned to a full commit SHA with the version in a comment. Default
  `permissions: contents: read`.
- **Timing:** the CP-SAT tests can run out of time under load (T37's note). If they flake on GitHub's 4-vCPU
  runners, raise their limits or mark them, and note it.
- **Not here:** deploys, `agent_eval.py` (costs money), `help:shots` (needs Playwright and a solver).

## Tests
- The workflow passes on a branch push, and fails on a pushed commit with a deliberately failing test (revert it).
- A pull request shows both jobs as checks.

## Done when
- [ ] `ci.yml` runs both jobs green on GitHub, Supabase tests included
- [ ] Actions pinned to SHAs; secrets documented
- [ ] PROGRESS.md line (run time of each job)
- [ ] Committed: `T48: CI`
