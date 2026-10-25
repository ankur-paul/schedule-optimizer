# T45 — Server hardening for the deploy
**Status:** DONE
**Lane:** B · **Prereqs:** — · **Branch:** t45-server-hardening

## Goal
The server is safe to put on a public URL: inputs are capped, the worker count comes from the environment, `/health`
says which contract it speaks, and each request leaves one log line with no data in it. Plan, *Code changes before
the first deploy*: [`docs/discussions/2026-10-25-deploy.md`](../docs/discussions/2026-10-25-deploy.md).

## Scope / files
- `server/models.py`: `time_limit_sec` bounded.
- `server/main.py`: the `/solve` body cap, `/health` with the contract version, the request-log middleware.
- `server/solver.py`: `num_workers` from `SOLVER_WORKERS`.
- `shared/contract.json` (new): `{ "version": 1 }`. This ticket may change the data contract: PLAN.md §3 *Server
  API* gets the new `/health` body and the caps.
- Tests in `server/tests/`.

## Details
- **Time limit:** `time_limit_sec` gets `gt=0, le=120` (the UI's *Advanced* max is already 120). Over the cap is a
  422, like any invalid input.
- **Body cap:** `/solve` refuses bodies over 2 MB with 413 `{"reason": "too_large"}`, checking `Content-Length`
  first and the read body after, as `/agent` does. Pull the shared check into one helper. 2 MB matches the online
  document cap; the sample college is far below it (measure and note it in the test).
- **Workers:** `SOLVER_WORKERS` read once; unset or invalid means 8, as now. The locks probe uses the same number.
- **Contract version:** `GET /health` → `{ "ok": true, "contract": 1 }`, read from `shared/contract.json` at import.
  Bump the number when `SolveInput`, `SolveResult` or the `/agent` body changes in a way the other side must know;
  say so in a comment in the file's neighbour, `server/models.py`, and in PLAN.md §3. If T52 (soft-rule switches)
  is already merged when this lands, start at 2, since T52 changed the contract.
- **Request logs:** middleware writes one line per request to stdout (CloudWatch picks it up): method, path, status,
  duration in ms. Never the body, query string, headers or client address. Uvicorn's own access log is turned off
  where the server starts (it logs the client address); keep `uvicorn main:app --reload` working for development.
- **CORS** stays as T38 left it (`CORS_ORIGINS`).

## Tests
- `time_limit_sec` 120 passes, 121 and 0 give 422.
- `/solve` over 2 MB gives 413 with and without `Content-Length`; just under passes validation.
- `SOLVER_WORKERS` unset, `"2"`, `"abc"`, `"0"` → 8, 2, 8, 8.
- `/health` returns the version in `shared/contract.json`.
- A request logs exactly one line with method, path, status and a duration, and none of a posted body's text.

## Done when
- [x] Caps, workers, contract version and request logs as above
- [x] PLAN.md §3 *Server API* updated
- [x] Tests above pass; full suite and `npx tsc -b` green
- [x] PROGRESS.md line
- [x] Committed: `T45: server hardening`
