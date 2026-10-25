# T47 — Server container image
**Status:** DONE
**Lane:** B · **Prereqs:** — · **Branch:** t47-server-image

## Goal
One container image runs the FastAPI server on AWS Lambda and, unchanged, on a laptop with `podman run`. Plan, *Code
changes before the first deploy*: [`docs/discussions/2026-10-25-deploy.md`](../docs/discussions/2026-10-25-deploy.md).

## Scope / files
- `server/Dockerfile` (or `Dockerfile` at the root if the build context must include `web/src/help` and `shared/`;
  pick one and say why in a comment) and a `.dockerignore`.
- `server/README` section or `docs/deploy.md` stub: build and run commands.
- A smoke test script, e.g. `server/scripts/image_smoke.sh`.

## Details
- **Base:** a slim Python 3.12 image, dependencies installed with `uv sync --frozen --no-dev` from `uv.lock`. No
  build tools left in the final stage. `linux/amd64`.
- **On Lambda:** the [AWS Lambda Web Adapter](https://github.com/awslabs/aws-lambda-web-adapter) copied in as an
  extension (`COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:<pinned version> /lambda-adapter
  /opt/extensions/lambda-adapter`). The image's command starts uvicorn on `PORT` (default 8080); the adapter
  forwards Function URL requests to it and is inert outside Lambda. Set `AWS_LWA_READINESS_CHECK_PATH=/health`.
  Check the adapter's README for the current version and settings while building, and note them in the ticket.
- **Contents:** the server code, `shared/` (agent tools, contract version), `web/src/help/*.md` (the agent's system
  prompt; `AGENT_HELP_DIR` points at it). Nothing else from `web/`. No `.env` files.
- **Size:** report the image size; the 22 Oct notes measured ~239 MB of packages. Drop dev-only packages.
- **Uvicorn** runs without its access log (T45's middleware logs instead) and with one worker process; CP-SAT uses
  threads.
- **Read-only filesystem:** Lambda's is read-only outside `/tmp`. Make sure nothing writes elsewhere (Python
  bytecode: `PYTHONDONTWRITEBYTECODE=1`).

## Tests
- `image_smoke.sh`: builds the image, runs it with `podman run -p 8080:8080`, waits for `/health`, posts the sample
  college (`shared/fixtures`) to `/solve` with a 10 s limit, checks `status` and that every session is placed, posts
  an empty body to `/agent` and expects the "not configured" refusal. Stops the container.
- Run it once and record the image size and the cold-start time to the first `/health` in PROGRESS.md.

## Done when
- [x] The image builds and passes `image_smoke.sh` locally
- [x] Build and run commands written down
- [x] Full suite and `npx tsc -b` green
- [x] PROGRESS.md line with size and start time
- [x] Committed: `T47: server image`

## Notes (built 25 Oct 2026)
- `Dockerfile` and `.dockerignore` sit at the repo root: the context needs `shared/` and `web/src/help`. The ignore
  file is an allowlist (server `*.py`, `pyproject.toml`, `uv.lock`, `shared/`, `web/src/help/*.md`), with `.env*`
  and `__pycache__` excluded on top.
- Lambda Web Adapter **1.1.0** (latest release, 18 Sep), copied from `public.ecr.aws/awsguru/aws-lambda-adapter:1.1.0`.
  Its README: port from `AWS_LWA_PORT`, else `PORT`, default 8080; readiness check over HTTP on
  `AWS_LWA_READINESS_CHECK_PATH` (default `/`, set to `/health`); `AWS_LWA_INVOKE_MODE` stays `buffered`.
- uv **0.12.6** (the local version; 0.13.5 is three days old) from `ghcr.io/astral-sh/uv`, only in the build stage.
  Images are pinned by tag, not digest.
- Runs as `nobody`, bytecode compiled at build time, `PYTHONDONTWRITEBYTECODE=1`; the smoke test runs it with
  `--read-only --tmpfs /tmp` to catch writes.
- Measured: 419 MB (the venv is 299 MB: ortools 81, pandas 72, numpy 70, anthropic 28); 5.0–5.4 s from
  `podman run` to the first `/health` on the dev laptop, of which ~4.6 s is importing `main` (anthropic ~2.6 s).
