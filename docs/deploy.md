# Deploying Lattice

How production is set up, so it can be redone. Plan: [`discussions/2026-10-25-deploy.md`](discussions/2026-10-25-deploy.md).
T51 writes the rest of this file (accounts, settings, env vars per function); only the server image is here so far.

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
