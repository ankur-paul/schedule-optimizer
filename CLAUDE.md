# CLAUDE.md

College timetable generator (2-hour solo hackathon). Read `PLAN.md` for decisions, rules and the data contract; work is split into tickets in `tickets/`.

## Testing

- **Test everything you build, always.** Every new function or module gets tests in the same commit (Vitest next to the file in `web/src`, Pytest in `server/tests`). This goes beyond the ticket's minimum list: cover the main path plus the edge cases you thought about while writing it.
- Run the full suite (`cd web && npm test`, `cd server && .venv/bin/pytest`) plus `npx tsc -b` before every commit; never commit with a failing test.
- UI components: no component tests (PLAN.md §5), but pull logic out into pure functions and test those; click through the UI yourself before committing.

## Committing

- **Commit each feature as soon as it works**, so progress is tracked and nothing is lost. Don't batch several features into one commit or leave working code uncommitted.
- Commit small working steps: run the relevant tests first, and only commit code that builds.
- Prefix messages with the ticket ID (e.g. `T03: heuristic restarts`).
- Update the ticket's `**Status:**` in the same commit that finishes it.

## Progress log

- Record every feature you build in `PROGRESS.md`, in the same commit as the feature.
- **Append only:** add one line at the bottom of the log as `- [TNN] what was built (how to see/try it)`. Never rewrite or reorder other entries.
- Parallel branches will conflict on this file; resolve by keeping **both** sides' lines.
- Note anything cut, known bugs or workarounds under "Known issues / cuts" so the demo has no surprises.
