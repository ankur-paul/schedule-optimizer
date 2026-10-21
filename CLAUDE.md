# CLAUDE.md

College timetable generator (2-hour solo hackathon). Read `PLAN.md` for decisions, rules and the data contract; work is split into tickets in `tickets/`.

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
