from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from models import SolveInput, SolveResult
from solver import solve

app = FastAPI(title="Timetable Solver")

app.add_middleware(
    CORSMiddleware,
    # Any local port: Vite moves off 5173 when it's taken (e.g. several dev servers running at once).
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    return {"ok": True}


@app.post("/solve")
def solve_endpoint(inp: SolveInput) -> SolveResult:
    # Sync def: FastAPI runs it in a worker thread, so a long solve doesn't block /health.
    try:
        return solve(inp)
    except Exception as e:  # never 500 on solver bugs; the client falls back to the heuristic
        return SolveResult(engine="cpsat", status="error", message=f"Solver crashed: {e}")
