# T22 — Strip teacher names before solving
**Status:** TODO
**Lane:** C · **Prereqs:** — · **Branch:** t22-solver-names

## Goal
No personal data leaves the browser when someone generates a timetable signed out. Teacher names are the only
personal data in `SolveInput`, and the server never reads them (it works on IDs), so the browser replaces each name
with the teacher's ID before `POST /solve`. First ticket of v2 idea #2; see grilling Q2 in
[`docs/discussions/2026-10-24-privacy-and-consent.md`](../docs/discussions/2026-10-24-privacy-and-consent.md).

## Scope / files
- `web/src/engine/solveClient.ts`: a pure `withoutPersonalData(input: SolveInput): SolveInput` used on the body of
  every `/solve` call (including the locks probe, if it sends its own request).
- No change to the data contract, the server or the heuristic (it runs in the browser).

## Details
- Each teacher's `name` becomes its `id`. Everything else is untouched: department, room, section and course names
  are not personal data, and the server's diagnosis refers to IDs.
- The result coming back holds IDs only, so nothing needs mapping back. Check that diagnosis and unplaced causes
  still show real teacher names in the UI (they are rendered from the local store, not the response).
- Check that the server doesn't log request bodies (uvicorn's access log records only the path); note the result
  in the ticket. The privacy policy (T23) says the solver keeps nothing.

## Tests
- Vitest: the output has no teacher name anywhere (serialise and search for each name); it deep-equals the input
  apart from teacher names; the input object isn't mutated; an input with no teachers works.
- Vitest on the solve path: the body sent to the mocked `fetch` contains no teacher name.

## Done when
- [ ] `/solve` requests carry teacher IDs in place of names; the UI still shows names everywhere
- [ ] Server logging checked and noted
- [ ] Tests above pass, full suite and `npx tsc -b` green
- [ ] PROGRESS.md line; FEATURES.md notes that the solver receives no names
- [ ] Committed: `T22: strip teacher names before solving`
