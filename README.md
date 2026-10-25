# <picture><source media="(prefers-color-scheme: dark)" srcset="web/public/logo-light.svg"><img src="web/public/logo.svg" width="36" alt="" align="top"></picture> Lattice

Lattice builds a weekly class timetable for a whole college, with no teacher, section, or room booked twice.

Most colleges still make the timetable by hand in a spreadsheet. It takes days, and one change, like a teacher
leaving, can cause clashes across a dozen sections. In Lattice you enter the week, rooms, teachers, sections, and
courses, then click **Generate timetable**. A solver finds the best timetable it can, and a separate checker
confirms it has no clashes before you see it.

![A section's timetable with two locked classes](docs/screenshots/timetable.png)

## What it does

The app has four steps:

1. **Setup week.** Pick the working days, the periods and their times, the breaks, and the periods where lunch
   can fall.
2. **Add data.** Fill in an Excel template and upload it, edit the tables in the app, or load the sample college
   (3 departments, 9 sections, 25 teachers). A file with any error imports nothing and lists each problem by
   row.
3. **Generate.** The exact solver (OR-Tools CP-SAT, on the Python server) finds the best timetable or proves that
   none exists. If none exists, the app names the cause, such as an over-booked teacher or a lab with no room.
   If the server is offline, **Make a quick draft** builds a timetable in the browser instead.
4. **View and export.** See the timetable by section, teacher, or room. Lock the classes you want to keep and
   generate again, or drag a class to a free slot. Print every section on its own A4 page, or download a CSV.

The app saves your work in the browser. Signing in is optional. Signed in, you can:

- Create an institute and invite members as admin, editor, or viewer.
- Save timetables online, keep versions, and publish one at a public link.
- Ask the assistant about your data, or have it propose changes that you accept or reject. The assistant needs a
  coupon.

[`FEATURES.md`](FEATURES.md) describes every feature and its known limits. The app's own help is at `/help`.

## The rules a timetable follows

Hard rules are never broken. For example, a teacher is in one class at a time, a lab fills consecutive periods,
and every section and teacher gets a free lunch period each day.

Soft rules add points to a score. Lower is better and 0 is perfect. For example, the same subject twice in one
day adds 10 points. You can switch each soft rule off.

The full list is in [`FEATURES.md`](FEATURES.md#scheduling-rules).

## Run it on your computer

You need Node 20.19 or later and [uv](https://docs.astral.sh/uv/). uv installs Python 3.12 if you don't have it.

1. Start the web app at `http://localhost:5173`:

   ```bash
   cd web && npm install && npm run dev
   ```

2. In a second terminal, start the solver server at `http://localhost:8000`:

   ```bash
   cd server && uv sync && uv run uvicorn main:app --port 8000
   ```

3. Open the app. In step 2, click **Load sample**. In step 3, click **Generate timetable**.

The web app looks for the server at `http://localhost:8000`. To use another address, set `VITE_SOLVER_URL`.

Sign-in is off until `web/.env.local` exists. To turn it on, run `scripts/setup-auth.sh` once. It walks you
through the Supabase and Google Cloud dashboards and writes the file. Then restart `npm run dev`.

## Run the tests

```bash
cd web && npm test && npx tsc -b
cd server && uv run pytest
```

The tests marked `supabase` run against the Supabase dev project. Without keys in `server/.env`, they are
skipped. To add the keys, run `scripts/setup-supabase-cli.sh` once.

## How it fits together

- **`web/`** is the React app. It also holds the quick-draft engine, which runs in a Web Worker, and the checker
  that tests every result against the hard rules.
- **`server/`** is a FastAPI server. `POST /solve` runs CP-SAT, and `POST /agent` runs the assistant.
- **`supabase/`** holds the database migrations for institutes, members, saved timetables, and assistant usage.

The web app and the server share one data format: `SolveInput` and `SolveResult` in
[`web/src/domain/types.ts`](web/src/domain/types.ts), mirrored in [`server/models.py`](server/models.py).

## More docs

- [`ARCHITECTURE.md`](ARCHITECTURE.md) explains how a timetable is generated and how the code is laid out.
- [`PLAN.md`](PLAN.md) records the design decisions and the data format.
- [`docs/deploy.md`](docs/deploy.md) explains how to deploy to AWS Lambda and Cloudflare Pages.
- [`docs/v2-roadmap.md`](docs/v2-roadmap.md) lists what version 2 adds.
- [`tickets/`](tickets/README.md) holds the work, one ticket per task. [`PROGRESS.md`](PROGRESS.md) logs what
  was built and lists the known issues.
