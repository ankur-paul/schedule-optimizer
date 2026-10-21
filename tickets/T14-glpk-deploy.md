# T14 — Stretch: glpk.js exact engine in browser / Vercel deploy
**Status:** TODO
**Lane:** any · **Prereqs:** T07 · **Branch:** t14-glpk

## Goal
(a) Deploy frontend to Vercel (fallback engine works without server). (b) Optional third engine:
ILP via `glpk.js` (WASM) in a worker for small inputs, exposed as "Exact – in-browser".

## Details
- (a) first: `vercel --prod` from `web/`, verify sample → generate works offline-of-server.
- (b) Same model as T04 minus soft S3/S4; guard: only offer when sessions × options < ~20k variables.

## Done when
- [ ] Public URL works
- [ ] Committed: `T14: deploy (+ glpk engine)`
