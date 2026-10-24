// Saves the exact solver's timetable for the sample college to shared/fixtures/sample-timetable.json, the fixed
// timetable the help screenshots load (scripts/help-shots.ts). Needs the solver running:
//   cd server && uv run uvicorn main:app --port 8000
//   cd web && npm run gen:timetable
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { solveOnServer, verify } from "../src/engine/solveClient";
import type { SolveInput } from "../src/domain/types";
import { sampleCollege } from "../src/domain/sampleCollege";

const TIME_LIMIT_SEC = 60;
const out = resolve(import.meta.dirname, "../../shared/fixtures/sample-timetable.json");

const input: SolveInput = { ...sampleCollege, locks: [], options: { timeLimitSec: TIME_LIMIT_SEC, seed: 1 } };
const { result, validation } = verify(input, await solveOnServer(input, { solverUrl: process.env.SOLVER_URL }));
if (result.status !== "optimal" || result.unplaced.length > 0 || validation.violations.length > 0) {
  console.error(`Not saved: status ${result.status}, ${result.unplaced.length} unplaced, ${validation.violations.length} violations.`);
  process.exit(1);
}
writeFileSync(out, JSON.stringify(result, null, 2) + "\n");
console.log(`Wrote ${result.placements.length} placements (score ${result.score.total}) to shared/fixtures/sample-timetable.json`);
