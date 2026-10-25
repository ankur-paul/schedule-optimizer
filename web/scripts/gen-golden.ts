import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { scoreCases } from "../src/domain/scoreCases";
import { expandSessions } from "../src/domain/sessions";
import type { SolveInput } from "../src/domain/types";

const fixtures = resolve(import.meta.dirname, "../../shared/fixtures");
const input = JSON.parse(readFileSync(resolve(fixtures, "sample-college.json"), "utf8")) as SolveInput;
const sessions = expandSessions(input);
writeFileSync(resolve(fixtures, "sample-sessions.json"), JSON.stringify(sessions, null, 2) + "\n");
console.log(`Wrote ${sessions.length} sessions to shared/fixtures/sample-sessions.json`);

const cases = scoreCases(input);
writeFileSync(resolve(fixtures, "sample-scores.json"), JSON.stringify(cases, null, 2) + "\n");
console.log(`Wrote ${cases.length} scored timetables to shared/fixtures/sample-scores.json`);
