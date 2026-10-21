# T10 — Lock cells + regenerate
**Status:** DONE
**Lane:** any · **Prereqs:** T07, T08 · **Branch:** t10-locks

## Goal
"The principal insists Maths is first period Monday" — admin pins sessions and re-solves the rest.

## Scope / files
- Cell detail panel: **Lock / Unlock** button; locked cells show a 🔒 icon and a thicker border.
- Store `locks: Placement[]`; included in `SolveInput.locks`.
- "Regenerate (keep N locked)" button in step ④ and ③. "Clear all locks".
- If data changed so a lock is invalid (session gone / room ineligible) → drop it with a toast.

## Tests (keep light)
- Covered by T03 lock test; manual check with CP-SAT and heuristic.

## Done when
- [x] Locked sessions survive regenerate on both engines
- [x] Committed: `T10: lock + regenerate`
