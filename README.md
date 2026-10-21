# College Timetable Generator

Generates clash-free weekly class timetables. See [PLAN.md](PLAN.md) for decisions and the data contract,
and [tickets/](tickets/README.md) for the work breakdown.

## Run

```bash
# Frontend (http://localhost:5173)
cd web && npm install && npm run dev

# Solver server (http://localhost:8000)
cd server && uv venv && uv pip install -r requirements.txt   # or: python -m venv .venv && .venv/bin/pip install -r requirements.txt
cd server && .venv/bin/uvicorn main:app --reload --port 8000
```

## Test

```bash
cd web && npm test
cd server && .venv/bin/python -m pytest
```
