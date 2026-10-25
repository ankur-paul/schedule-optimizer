# T46 — Web client for a deployed solver
**Status:** DONE
**Lane:** C · **Prereqs:** T45 · **Branch:** t46-deployed-solver-client

## Goal
The web app copes with a solver on Lambda: cold starts don't read as "offline", a slow solve isn't cut off early, a
server on another contract version is called out, and no teacher name or name-like id reaches the server. Plan,
*Code changes before the first deploy*: [`docs/discussions/2026-10-25-deploy.md`](../docs/discussions/2026-10-25-deploy.md).

## Scope / files
- `web/src/engine/solveClient.ts`: timeouts, the health response, teacher codes.
- `web/src/features/generate/useServer.ts` and the app shell: a first check when the site opens.
- `web/src/features/assistant/mask.ts`: reused (move the code helpers to a shared place if that reads better, e.g.
  `web/src/domain/teacherCodes.ts`).
- The offline banner or step ③: the contract warning.
- Help (`web/src/help/generate.md` or `troubleshooting.md`), FEATURES.md, PROGRESS.md.

## Details
- **Health timeout:** `HEALTH_TIMEOUT_MS` 1 s → 5 s. A cold start is roughly 1–3 s plus the import.
- **Check on open:** call `/health` once when the app loads (any step), so the Lambda copy is warm by the time the
  user reaches step ③, and the result is ready. The 5 s polling while steps ③ and ④ are open stays.
- **Grace:** `SOLVE_GRACE_MS` 10 s → 15 s; update the comment and the timeout message test.
- **Contract version:** the web app reads `shared/contract.json` at build time. `checkServer` reads the `contract`
  field from `/health`. Missing or different: the server still counts as online, and step ③ shows a quiet warning:
  "The solver was updated at a different time from this page. Reload the page; if this stays, results may be
  wrong." Log the two numbers to the console.
- **Teacher codes to `/solve`:** `withoutPersonalData` replaces each teacher's id **and** name with its code
  (`teacherCodes` from T37) in `teachers` and in every course's `teacherId` and `batchTeacherIds`. The result's
  `teacherId`s, and any teacher in `diagnosis` or `unplaced` details, are mapped back to the real ids before the
  validator runs. An unknown code in the result is a server error, not a crash.
- Signed in or out the same. The policy already says "with each teacher's name replaced by a code", so it becomes
  true; T37's PROGRESS note gets a follow-up line saying so.

## Tests
- `checkServer`: the 5 s timeout; a matching, different and missing `contract`.
- `withoutPersonalData`: no teacher id or name appears anywhere in the JSON sent (use an imported-style slug id like
  `dr-anita-sharma` and per-batch teachers); codes are stable.
- Mapping back: placements, unplaced and diagnosis teachers get real ids; the verified result equals one solved with
  real ids (use a fake fetch that echoes a fixed result in codes); an unknown code gives `serverError`.
- The timeout message says 15 s more than the limit.
- Click through: Generate with the local server; stop it and see the banner within the poll; start it with
  `shared/contract.json` bumped and see the warning.

## Done when
- [x] Timeouts, check on open, contract warning and teacher codes as above
- [x] Tests above pass; full suite and `npx tsc -b` green
- [x] Help section, FEATURES.md bullet, PROGRESS.md line
- [x] Committed: `T46: client for a deployed solver`

## Notes
- No mapping back was needed: a result names sessions (from course ids), rooms and slots, never a teacher, so there is
  no teacher id in placements, `unplaced` or `diagnosis` to translate, and no unknown code to treat as a server error.
  The tests check that the coded input keeps every session id and that a result verifies the same as one for real ids.
- Clicked through with the local server: the site checks `/health` once on step ①; step ③ opens already online;
  Generate on the sample gave 0 clashes; stopping the server showed the banner within the poll; a server reporting
  contract 2 showed the grey line and one console warning, and it went once the server was back on 1.
