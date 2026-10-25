import os
from functools import cache

from fastapi import Depends, FastAPI, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import ValidationError

import agent
from models import SolveInput, SolveResult
from solver import solve

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


@app.get("/health")
def health() -> dict:
    return {"ok": True}


# Drop None fields so optional ones (message, diagnosis, unplaced cause) are absent, as in types.ts, not null.
@app.post("/solve", response_model_exclude_none=True)
def solve_endpoint(inp: SolveInput) -> SolveResult:
    # Sync def: FastAPI runs it in a worker thread, so a long solve doesn't block /health.
    try:
        return solve(inp)
    except Exception as e:  # never 500 on solver bugs; the client falls back to the heuristic
        return SolveResult(engine="cpsat", status="error", message=f"Solver crashed: {e}")


@cache
def get_agent() -> agent.Agent | None:
    """Built on the first /agent request, so /solve works without the agent's keys."""
    return agent.from_env()


def refuse(status: int, reason: str) -> JSONResponse:
    return JSONResponse({"reason": reason}, status_code=status)


@app.post("/agent")
async def agent_endpoint(request: Request, assistant: agent.Agent | None = Depends(get_agent)):
    if assistant is None:
        return refuse(503, "not_configured")
    length = request.headers.get("content-length", "")
    if length.isdigit() and int(length) > agent.MAX_BODY_BYTES:  # don't read a body that's too big
        return refuse(413, "too_large")
    body = await request.body()
    if len(body) > agent.MAX_BODY_BYTES:
        return refuse(413, "too_large")
    try:
        req = agent.AgentRequest.model_validate_json(body)
    except ValidationError as e:
        detail = e.errors(include_url=False, include_context=False, include_input=False)
        return JSONResponse({"reason": "bad_request", "detail": detail}, status_code=422)

    auth = request.headers.get("authorization", "")
    token = auth[7:].strip() if auth[:7].lower() == "bearer " else None
    try:
        # The Supabase and Claude calls block, so they run in a worker thread.
        res = await run_in_threadpool(assistant.handle, token, req)
    except agent.AgentError as e:
        return refuse(e.status, e.reason)
    return res
