# T00 — Repo + web + server scaffold
**Status:** TODO
**Lane:** main · **Prereqs:** — · **Branch:** main

## Goal
An empty but runnable monorepo so every lane can start in its own worktree.

## Scope / files
- `git init`, `.gitignore` (node_modules, dist, .venv, __pycache__, .env*)
- `web/`: Vite + React + TypeScript, Tailwind, shadcn/ui init (button, card, input, label, select, table,
  tabs, tooltip, dialog, badge, sonner/toast), Vitest, path alias `@/` → `web/src`.
  Extra deps: `zustand`, `xlsx` (SheetJS), `lucide-react`.
- `server/`: `requirements.txt` (`fastapi`, `uvicorn[standard]`, `ortools`, `pydantic`, `pytest`, `httpx`),
  `main.py` with `GET /health` and CORS for `http://localhost:5173`. Use `uv` if installed, else `python -m venv`.
- Folders from PLAN.md §4 with `.gitkeep`.
- Root `README.md` with run commands: `cd web && npm run dev`, `cd server && uvicorn main:app --reload --port 8000`.

## Tests
- `npm test` runs (one trivial test), `pytest` runs (health endpoint test).

## Done when
- [ ] `npm run dev` shows a page; `uvicorn` serves `/health`
- [ ] Both test commands pass
- [ ] Committed: `T00: scaffold web + server`
