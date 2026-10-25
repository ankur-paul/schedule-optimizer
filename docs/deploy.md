# Deploy

How Lattice gets from a commit to production. Plan: [`discussions/2026-10-25-deploy.md`](discussions/2026-10-25-deploy.md).
This page grows with T50 and T51; for now it covers CI.

## CI

`.github/workflows/ci.yml` runs on every push, every pull request, and as a reusable workflow for the deploy:

- `web`: `npm ci`, `npm test`, `npx tsc -b`, `npm run build` on Node 24.
- `server`: `uv sync --frozen`, `uv run pytest`, including the `supabase` tests against the **dev** project.

A pull request from a branch in this repository shows the checks of the push run; its own `pull_request` run skips
both jobs (shown as skipped), so each commit is tested once. A pull request from a fork runs them itself.

Only one `server` job runs at a time (concurrency group `supabase-dev`): the tests share the dev project, and the
agent budget test reads the month's spend across every run. GitHub keeps one waiting run per group, so if a third
push comes in while one runs and one waits, the waiting one is cancelled (it shows as cancelled, not failed).

### GitHub secrets

Repository secrets for the **dev** Supabase project, passed only to the `server` job's test step. Nothing for
production goes here.

| Secret | Where to find it |
|---|---|
| `SUPABASE_URL` | dev project → Project Settings → API → Project URL |
| `SUPABASE_ANON_KEY` | same page, the anon (or publishable) key |
| `SUPABASE_SERVICE_ROLE_KEY` | same page, the service_role (or secret) key |

They are the same values as `server/.env`. Set them under GitHub → repository → Settings → Secrets and variables →
Actions → New repository secret, or from that file with the GitHub CLI:

```bash
cd server && set -a && . ./.env && set +a
for k in SUPABASE_URL SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY; do gh secret set "$k" --body "${!k}"; done
```

Without them (forks, or before they are set), the `supabase` tests skip and the job still passes.
