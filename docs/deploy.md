# Deploying Lattice

How Lattice gets from a commit to production, so it can be redone. Plan:
[`discussions/2026-10-25-deploy.md`](discussions/2026-10-25-deploy.md). T50 and T51 write the rest of this file
(the deploy pipeline, accounts, settings, env vars per function); so far it covers CI and the server image.

## CI

`.github/workflows/ci.yml` runs on every push, every pull request, and as a reusable workflow for the deploy:

- `web`: `npm ci`, `npm test`, `npx tsc -b`, `npm run build` on Node 24.
- `server`: `uv sync --frozen`, `uv run pytest`, including the `supabase` tests against the **dev** project.

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

## Server image (T47)

One image runs the FastAPI server on AWS Lambda and, unchanged, on a laptop. The [`Dockerfile`](../Dockerfile) is
at the repo root because the image also carries `shared/` (the assistant's tools, the contract version) and
`web/src/help/*.md` (the assistant's system prompt); [`.dockerignore`](../.dockerignore) lets in only those and the
server code, never a `.env` file.

- Base: `python:3.12-slim`, `linux/amd64`. Dependencies come from `server/uv.lock` (`uv sync --frozen --no-dev`)
  in a build stage; the final stage has no uv and no build tools. Bytecode is compiled at build time.
- [AWS Lambda Web Adapter](https://github.com/awslabs/aws-lambda-web-adapter) **1.1.0** is copied in as an
  extension (`/opt/extensions/lambda-adapter`). On Lambda it forwards Function URL requests to uvicorn on `PORT`
  (8080) once `AWS_LWA_READINESS_CHECK_PATH=/health` answers; outside Lambda it does nothing. Invoke mode stays
  `buffered` (the default), as nothing streams.
- uvicorn runs one worker process without its access log, as user `nobody`. Nothing writes outside `/tmp`
  (`PYTHONDONTWRITEBYTECODE=1`), since Lambda's filesystem is read-only.
- Settings come from the environment only (`server/.env` is not in the image). With no keys, `/solve` works and
  `/agent` answers 503 `not_configured`.

Build and run from the repo root:

```bash
podman build --platform linux/amd64 -t lattice-server .
podman run --rm -p 8080:8080 lattice-server                 # the solver at http://localhost:8080
podman run --rm -p 8080:8080 --env-file server/.env lattice-server   # with the assistant's keys too
```

`docker` takes the same arguments. Point the web app at it with `VITE_SOLVER_URL=http://localhost:8080`.

Smoke test: [`server/scripts/image_smoke.sh`](../server/scripts/image_smoke.sh) builds the image, runs it read-only
like Lambda, waits for `/health`, solves the sample college with a 10 s limit (every session must be placed) and
checks that `/agent` refuses with `not_configured`. It prints the image size and the time to the first `/health`.
`SMOKE_PORT` picks another host port.
