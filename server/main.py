import json
import logging
import os
import time
from functools import cache
from pathlib import Path

from fastapi import Depends, FastAPI, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import ValidationError

import agent
from models import SolveInput, SolveResult
from solver import solve

CONTRACT_FILE = Path(__file__).resolve().parent.parent / "shared" / "contract.json"
CONTRACT_VERSION: int = json.loads(CONTRACT_FILE.read_text())["version"]  # see the note in models.py
MAX_SOLVE_BYTES = 2 * 1024 * 1024  # the online document cap; the sample college is about 16 KB

# Uvicorn's access log records the client address; log_request below replaces it. Uvicorn sets up its loggers
# before it imports this module, so this holds for `uvicorn main:app`, with or without --reload.
logging.getLogger("uvicorn.access").disabled = True

app = FastAPI(title="Timetable Solver")

# CORS_ORIGINS: the web app's origins, comma-separated, for the deploy. Unset: any local port, since Vite moves off
# 5173 when it's taken (e.g. several dev servers running at once).
cors_origins = [o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_origin_regex=None if cors_origins else r"http://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_methods=["*"],
    allow_headers=["*"],  # includes Authorization, which /agent needs
)


@app.middleware("http")
async def log_request(request: Request, call_next):
    """One line per request on stdout: method, path, status, duration. Never the body, query, headers or client."""
    start = time.perf_counter()
    status = 500
    try:
        response = await call_next(request)
        status = response.status_code
        return response
    finally:
        ms = round((time.perf_counter() - start) * 1000)
        print(f"{request.method} {request.url.path} {status} {ms}ms", flush=True)


@app.get("/health")
def health() -> dict:
    return {"ok": True, "contract": CONTRACT_VERSION}


def refuse(status: int, reason: str) -> JSONResponse:
    return JSONResponse({"reason": reason}, status_code=status)


async def read_capped(request: Request, max_bytes: int) -> bytes | None:
    """The request body, or None if it's over max_bytes. Content-Length is checked first, so a big body isn't read."""
    length = request.headers.get("content-length", "")
    if length.isdigit() and int(length) > max_bytes:
        return None
    body = await request.body()
    return None if len(body) > max_bytes else body


def validation_detail(e: ValidationError) -> list:
    return e.errors(include_url=False, include_context=False, include_input=False)


def solve_or_error(inp: SolveInput) -> SolveResult:
    try:
        return solve(inp)
    except Exception as e:  # never 500 on solver bugs; the client falls back to the heuristic
        return SolveResult(engine="cpsat", status="error", message=f"Solver crashed: {e}")


# Drop None fields so optional ones (message, diagnosis, unplaced cause) are absent, as in types.ts, not null.
@app.post("/solve", response_model=SolveResult, response_model_exclude_none=True)
async def solve_endpoint(request: Request):
    body = await read_capped(request, MAX_SOLVE_BYTES)
    if body is None:
        return refuse(413, "too_large")
    try:
        inp = SolveInput.model_validate_json(body)
    except ValidationError as e:
        return JSONResponse({"detail": validation_detail(e)}, status_code=422)
    # In a worker thread, so a long solve doesn't block /health.
    return await run_in_threadpool(solve_or_error, inp)


@cache
def get_agent() -> agent.Agent | None:
    """Built on the first /agent request, so /solve works without the agent's keys."""
    return agent.from_env()


@app.post("/agent")
async def agent_endpoint(request: Request, assistant: agent.Agent | None = Depends(get_agent)):
    if assistant is None:
        return refuse(503, "not_configured")
    body = await read_capped(request, agent.MAX_BODY_BYTES)
    if body is None:
        return refuse(413, "too_large")
    try:
        req = agent.AgentRequest.model_validate_json(body)
    except ValidationError as e:
        return JSONResponse({"reason": "bad_request", "detail": validation_detail(e)}, status_code=422)

    auth = request.headers.get("authorization", "")
    token = auth[7:].strip() if auth[:7].lower() == "bearer " else None
    try:
        # The Supabase and Claude calls block, so they run in a worker thread.
        res = await run_in_threadpool(assistant.handle, token, req)
    except agent.AgentError as e:
        return refuse(e.status, e.reason)
    return res
