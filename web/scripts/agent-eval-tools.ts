// The browser half of server/scripts/agent_eval.py (T40): masks questions, runs the assistant's tools over a fixed
// sample-college scenario, and unmasks answers, with the same code the panel uses. It reads one JSON request per line
// on stdin and writes one JSON answer per line on stdout:
//   {"op": "mask" | "unmask", "scenario": "built", "text": "..."}       -> {"text": "..."}
//   {"op": "tool", "scenario": "built", "name": "overview", "input": {}} -> {"content": "...", "isError": false}
import { createInterface } from "node:readline";
import timetableJson from "../../shared/fixtures/sample-timetable.json";
import { sampleCollege } from "../src/domain/sampleCollege";
import type { SolveInput, SolveResult } from "../src/domain/types";
import { maskText, unmaskText } from "../src/features/assistant/mask";
import { runTool, type ToolData } from "../src/features/assistant/tools";

export type Scenario = "built" | "partial" | "impossible";

const timetable = timetableJson as SolveResult;
const college = (): SolveInput => structuredClone(sampleCollege);

/** The sample college with its solved timetable; with two classes left unplaced; or with CSE A overbooked. */
export function scenario(name: Scenario): ToolData {
  switch (name) {
    case "built":
      return { ...college(), result: timetable };
    case "partial": {
      const dropped = ["cse-a-ds:L1", "cse-a-os:L1"];
      const result: SolveResult = {
        ...timetable,
        status: "partial",
        placements: timetable.placements.filter((p) => !dropped.includes(p.sessionId)),
        unplaced: [
          { sessionId: dropped[0], reason: "no period where its teacher, CSE A and a classroom are all free", cause: "teacher" },
          { sessionId: dropped[1], reason: "no period where CSE A and a classroom are both free", cause: "section" },
        ],
      };
      return { ...college(), result };
    }
    case "impossible": {
      const input = college();
      input.courses = input.courses.map((c) => (c.id === "cse-a-ds" ? { ...c, lecturesPerWeek: 20 } : c));
      return {
        ...input,
        result: null,
        outcome: { showFailure: true, failed: { input, failure: { kind: "infeasible", message: "No timetable exists.", diagnosis: [] } } },
      };
    }
  }
}

export type Request =
  | { op: "mask" | "unmask"; scenario: Scenario; text: string }
  | { op: "tool"; scenario: Scenario; name: string; input: unknown };

export function answer(req: Request): unknown {
  const data = scenario(req.scenario);
  switch (req.op) {
    case "mask":
      return { text: maskText(req.text, data.teachers) };
    case "unmask":
      return { text: unmaskText(req.text, data.teachers) };
    case "tool":
      return runTool(req.name, req.input, data);
  }
}

if (process.argv[1]?.endsWith("agent-eval-tools.ts")) {
  for await (const line of createInterface({ input: process.stdin })) {
    if (!line.trim()) continue;
    let out: unknown;
    try {
      out = answer(JSON.parse(line) as Request);
    } catch (e) {
      out = { error: e instanceof Error ? e.message : String(e) };
    }
    process.stdout.write(JSON.stringify(out) + "\n");
  }
}
