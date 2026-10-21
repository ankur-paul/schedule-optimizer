# College Timetable Generator — Plan

A web app that generates **clash-free weekly class timetables** for any college.
Built with parallel Claude Code agents. Work is split into
tickets in [`tickets/`](tickets/README.md).

## 1. Product decisions (settled)

| Topic            | Decision                                                                                                                                                                                                               |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| User             | One central **timetable coordinator** (admin). Teachers/students get read-only views (no login).                                                                                                                       |
| Scope            | Weekly recurring **class** timetable only (lectures + labs). No exam timetables.                                                                                                                                       |
| Any college      | Admin configures working days, periods (with times), break periods, lunch candidate periods. Same grid every day.                                                                                                      |
| Data entry       | One **Excel template** (sheet per entity, CSV also accepted) + **"Load sample college"** button + small edit tables.                                                                                                   |
| Departments      | Rooms have an optional **owning department**. Owned rooms → only that department. No owner → **shared** (seminar halls, central labs).                                                                                 |
| Batches          | Each section has `batches` (1 = no split). Split sections have **per-batch lab sessions**; batch labs can run in parallel. Lab teacher can be the same or differ per batch.                                            |
| Rooms            | Type = `classroom` or `lab`. **No capacity** constraint. A lab course may require a specific lab room.                                                                                                                 |
| Engines          | **Exact solver** (Python FastAPI + OR-Tools CP-SAT) is the only main engine; one *Generate timetable* button, no engine picker. **Quick draft** (TypeScript heuristic in a Web Worker) runs only (a) when the server is offline before the click: a banner says so and the button reads *Make a quick draft*; or (b) when the user picks it after the exact solver failed or proved the data impossible. Never a silent fallback. Time limit (default 20 s, max 120 s) sits under *Advanced*. See T15–T18. |
| Infeasible input | Exact solver proves it impossible → step ③ shows a red *This timetable can't be built* card: ranked causes (proven ones first: no valid slot, bad lock, locks probe; then section/teacher/room load maths), each with a fix link into step ②/④; if nothing explains it, say so. *Make a partial timetable* (quick draft) is an opt-in secondary action; a partial result is amber, can go on to step ④ and lists unplaced sessions grouped by cause. |
| Validator        | Independent TS validator re-checks **every** result. Complete result: green `✓ Timetable ready · 0 clashes (independently checked)`; partial: amber `Partial: N classes not placed`. |
| Editing          | Click cell → details. **Lock** cells → **Regenerate** keeps locks. Drag-and-drop = stretch.                                                                                                                            |
| Views            | One week grid with **Section / Teacher / Room** switcher, colour-coded subjects, print CSS (browser "Print → PDF"). Stats: score breakdown, teacher load table, shared room utilisation.                               |
| UI               | Vite + React + TS + Tailwind + shadcn/ui. Clean, modern, light theme. **4-step guided flow:** ① Setup week → ② Add data → ③ Generate → ④ View & export. One-line hint per step, ⓘ tooltips on every non-obvious field. |
| Storage          | Browser `localStorage` (zustand `persist`). No database, no auth.                                                                                                                                                      |
| Demo             | Local (`npm run dev` + `uvicorn`). Vercel deploy of frontend only if time allows (no server → offline banner → quick draft). |

## 2. Rules

### Hard constraints (must never be violated)

| ID     | Rule                                                                                                                                                                                                     |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **H1** | A teacher is in at most one session per (day, period).                                                                                                                                                   |
| **H2** | A section is in at most one session per (day, period). A whole-section session (`batch = null`) conflicts with every batch of that section; two batch sessions conflict only if they are the same batch. |
| **H3** | A room hosts at most one session per (day, period).                                                                                                                                                      |
| **H4** | Room eligibility: `room.type` matches session; room is shared (`departmentId = null`) or owned by the section's department; if the course has `labRoomId`, only that room.                               |
| **H5** | Every session is placed exactly once (otherwise reported in `unplaced` with a reason).                                                                                                                   |
| **H6** | A lab of length _L_ occupies _L_ **consecutive teaching periods** on one day (it cannot span a break period, because break periods are not teaching periods).                                            |
| **H7** | Nothing is placed in a `break` period.                                                                                                                                                                   |
| **H8** | **Lunch:** every section and every teacher has ≥ 1 free period among `lunchCandidates` on every working day. (A section counts as busy if the section or any of its batches is busy.)                    |

### Soft constraints (lower penalty = better)

| ID     | Rule                                                                                                                            | Weight                  |
| ------ | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| **S1** | Subject repeat: more than one lecture of the same course on the same day                                                        | 10 per extra lecture    |
| **S2** | Teacher overload: more than 3 consecutive teaching periods in a row                                                             | 5 per period beyond 3   |
| **S3** | Section gaps: idle teaching periods between a section's first and last class of a day, **not counting lunch candidate periods** | 2 per gap period        |
| **S4** | Batch idle: in a split section, a period where one batch is in a lab and another batch is idle                                  | 3 per idle batch-period |

"Consecutive" = adjacent teaching periods with no break period between them.
`score.total = sum of penalties`. The **TS scorer is the source of truth** for the score shown in the UI, whichever engine ran.

## 3. Data contract (shared by all agents — do not change without updating all tickets)

Lives in `web/src/domain/types.ts`. Python mirrors it with Pydantic in `server/models.py`.
JSON field names are **camelCase** in both.

```ts
export type Id = string;

export interface Period {
  id: number; // index in Settings.periods, 0-based
  label: string; // "P1", "Break"
  start: string; // "09:00"
  end: string; // "09:50"
  kind: "teaching" | "break";
}

export interface Settings {
  days: string[]; // ["Mon","Tue","Wed","Thu","Fri"]
  periods: Period[]; // in time order, breaks included
  lunchCandidates: number[]; // Period ids (must be teaching periods)
}

export interface Department {
  id: Id;
  name: string;
}
export interface Teacher {
  id: Id;
  name: string;
  departmentId: Id;
}
export interface Room {
  id: Id;
  name: string;
  type: "classroom" | "lab";
  departmentId: Id | null;
} // null = shared
export interface Section {
  id: Id;
  name: string;
  departmentId: Id;
  batches: number;
} // 1 = no split

export interface Course {
  id: Id;
  sectionId: Id;
  subject: string; // "Data Structures"
  teacherId: Id; // lecture teacher; default lab teacher
  lecturesPerWeek: number; // 1-period whole-section sessions in a classroom
  labSessionsPerWeek: number; // per batch
  labLength: number; // consecutive periods per lab session (ignored if labSessionsPerWeek = 0)
  labRoomId?: Id | null; // specific lab required, else any eligible lab
  batchTeacherIds?: Id[] | null; // length = section.batches; missing → teacherId for all batches
}

export interface Placement {
  sessionId: Id;
  day: number; // index into Settings.days
  period: number; // starting Period id
  roomId: Id;
}

export interface SolveInput {
  settings: Settings;
  departments: Department[];
  teachers: Teacher[];
  rooms: Room[];
  sections: Section[];
  courses: Course[];
  locks: Placement[]; // must appear unchanged in the output
  options: { timeLimitSec: number; seed?: number };
}

export interface ScoreBreakdown {
  subjectRepeat: number;
  teacherOverload: number;
  sectionGaps: number;
  batchIdle: number;
}
export interface Score {
  total: number;
  breakdown: ScoreBreakdown;
}

/** Why a session has no slot. `noRoom` / `noStart`: it can never be placed; the rest: what blocked it most. */
export type UnplacedCause = "noRoom" | "noStart" | "teacher" | "section" | "room" | "lunch";

/**
 * A structured reason the exact solver gives for `infeasible` (contract T15, filled by the server in T16). The client turns these into sentences,
 * fixes and links, so the server never writes user-facing copy here.
 * - noSlot: these sessions have no valid (day, start, room) at all.
 * - badLock: these locks are not valid placements.
 * - locks: proven: without the locks the data solves. `ids` = locked session ids.
 * - locksLikely: same probe, but it ran out of time, so the locks are only suspected.
 */
export interface Diagnosis {
  kind: "noSlot" | "badLock" | "locks" | "locksLikely";
  ids: Id[]; // session ids
  detail?: string; // noSlot: "noRoom" | "noStart"
}

export interface SolveResult {
  engine: "cpsat" | "heuristic";
  status: "optimal" | "feasible" | "partial" | "infeasible" | "error";
  placements: Placement[];
  unplaced: { sessionId: Id; reason: string; cause?: UnplacedCause }[];
  score: Score;
  timeMs: number;
  message?: string; // human-readable fallback; the UI renders `diagnosis` when present
  diagnosis?: Diagnosis[]; // only with status "infeasible"
}
```

### Sessions (derived, never stored)

`expandSessions(input): Session[]` in `web/src/domain/sessions.ts`, mirrored **exactly** in
`server/sessions.py`. Parity is checked against the golden file `shared/fixtures/sample-sessions.json`.

```ts
export interface Session {
  id: Id;
  courseId: Id;
  sectionId: Id;
  batch: number | null; // null = whole section; 1..n for batch sessions
  teacherId: Id;
  kind: "lecture" | "lab";
  length: number; // 1 for lectures, course.labLength for labs
  roomType: "classroom" | "lab";
  fixedRoomId: Id | null; // course.labRoomId for labs
}
```

Expansion order and IDs (deterministic, courses in input order):

- Lectures: `${courseId}:L${i}` for i = 1..lecturesPerWeek, `batch = null`.
- Labs: if `section.batches === 1` → `${courseId}:P${i}`, `batch = null`;
  else for i = 1..labSessionsPerWeek, for b = 1..batches → `${courseId}:P${i}:B${b}`, `batch = b`,
  `teacherId = batchTeacherIds?.[b-1] ?? teacherId`.

### Server API

- `GET  /health` → `{ "ok": true }`
- `POST /solve` body `SolveInput` → `SolveResult` (`score` may be zeros; client re-scores). On `infeasible` it fills
  `diagnosis`; with locks it also re-solves once without them (feasibility only, ≤ 5 s) to tell `locks` from `locksLikely`.
- Port **8000**, CORS allows `http://localhost:5173`. Frontend reads `VITE_SOLVER_URL` (default `http://localhost:8000`).

## 4. Repository layout

```
PLAN.md
tickets/                    one file per ticket + README index
shared/fixtures/
  sample-college.json       SolveInput for the demo college
  sample-sessions.json      golden expandSessions output
web/                        Vite + React + TS app
  src/domain/               types, sessions, eligibility, validator, score   (pure, tested)
  src/engine/               heuristic, worker, solveClient                    (pure-ish, tested)
  src/store/                zustand store + persist
  src/features/setup|data|generate|view/
  src/components/ui/        shadcn
server/                     FastAPI + CP-SAT
  main.py  models.py  sessions.py  solver.py  tests/
```

## 5. Testing policy (light — 2-hour budget)

Test **logic**, not UI. Each ticket lists its own minimal tests. Overall:

- **Vitest** for `web/src/domain` and `web/src/engine`: session expansion vs golden, validator catches one
  example of each hard rule, heuristic solves the sample college with **0 violations**.
- **Pytest** for `server`: session parity with golden, sample college solves with all sessions placed,
  one tiny infeasible case returns `infeasible`.
- **No** component/E2E tests. UI is checked with the manual click-through in T12.
- Target: whole test suite runs in < 15 s.

## 6. Timeline

| Time      | Work                                                                                   |
| --------- | -------------------------------------------------------------------------------------- |
| 0:00–0:15 | T00, T01 (sequential, main session)                                                    |
| 0:15–1:10 | Lanes in parallel worktrees: **A** T05→T06 · **B** T04 · **C** T02→T03 · **D** T08→T11 |
| 1:10–1:25 | T07 integration (main session), merge all lanes                                        |
| 1:25–1:45 | T09, T10 in parallel                                                                   |
| 1:45–2:00 | T12: show someone for 5 min, fix top issue, README, rehearse                           |

### Cut order if behind (first → last)

1. T14 glpk.js / Vercel deploy
2. T13 drag-and-drop
3. Per-batch teachers (one teacher for all batches)
4. S4 batch-idle rule
5. H8 lunch for teachers (keep for sections)
6. Edit tables in T06 (keep import + sample)
7. T17 teacher filter (fix links open the Courses tab unfiltered)
8. T17 department/room-type pool checks (keep the required-lab-room check)
9. T16 locks probe (a locks cause becomes "may be" whenever locks exist)

**Never cut:** exact solver (CP-SAT), validator, the "can't be built" card with specific causes, quick draft only
by the user's choice, the three views, sample data, guided flow.

## 7. Conventions

- Branch per ticket: `tNN-short-name`; commit messages prefixed `TNN:`; small commits.
- Pick and claim tickets with the board (`python3 tickets/board.py`; rules in `tickets/README.md`): claim = create the
  ticket's branch; set `Status: IN PROGRESS` when starting, `Status: DONE` when finished, **in the ticket file**, and tick its checklist.
- Do not edit `web/src/domain/types.ts` outside T01 without telling the main session.
