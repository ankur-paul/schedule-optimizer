// The browser half of server/scripts/agent_eval.py (T40): masks questions, runs the assistant's tools over a fixed
// sample-college scenario, and unmasks answers, with the same code the panel uses. It reads one JSON request per line
// on stdin and writes one JSON answer per line on stdout:
//   {"op": "mask" | "unmask", "scenario": "built", "text": "..."}       -> {"text": "..."}
//   {"op": "tool", "scenario": "built", "name": "overview", "input": {}} -> {"content": "...", "isError": false}
// `propose_changes` is dry-run as the panel does (T44) and answers with the card's lines too; `n` numbers the card.
// Nothing is ever applied, online or not. The online snapshot is an editor linked to a saved, unpublished timetable.
import { createInterface } from "node:readline";
import timetableJson from "../../shared/fixtures/sample-timetable.json";
import { sampleCollege } from "../src/domain/sampleCollege";
import type { SolveInput, SolveResult } from "../src/domain/types";
import { dryRun } from "../src/features/assistant/changes";
import { proposalOutcome } from "../src/features/assistant/chat";
import { maskText, unmaskText } from "../src/features/assistant/mask";
import type { OnlineSnapshot } from "../src/features/assistant/onlineState";
import { runTool, type ToolData, type ToolOutput } from "../src/features/assistant/tools";

export type Scenario = "built" | "partial" | "impossible";

const timetable = timetableJson as SolveResult;
const college = (): SolveInput => structuredClone(sampleCollege);

const GNDEC = { instituteId: "i1", name: "GNDEC Ludhiana", handle: "gndec" };

/** An editor of GNDEC, linked to "CSE odd sem 2026" version 5 of 5 with no unsaved changes, not published. */
export const ONLINE: OnlineSnapshot = {
  signedIn: true,
  link: { instituteId: "i1", instituteName: GNDEC.name, timetableId: "t1", name: "CSE odd sem 2026", version: 5, savedHash: "h" },
  role: "editor",
  linkedInstitute: GNDEC,
  dirty: false,
  timetable: {
    latestVersion: 5,
    liveVersion: null,
    versions: [5, 4, 3, 2, 1].map((version) => ({ version, savedAt: `2026-10-2${version}T10:00:00Z`, savedBy: version % 2 ? "you" : "another member" })),
  },
  saveAsInto: { ...GNDEC, role: "editor" },
  active: { ...GNDEC, role: "editor", timetables: [{ id: "t1", name: "CSE odd sem 2026", latestVersion: 5, published: false }] },
  problems: [],
};

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
  | { op: "tool"; scenario: Scenario; name: string; input: unknown; n?: number };

/** A tool's result; a proposal that passed also has its card's lines (teachers as codes). */
export type ToolAnswer = ToolOutput & { card?: { summary: string; lines: string[]; warnings: string[] } };

function tool(name: string, input: unknown, data: ToolData, n: number): ToolAnswer {
  if (name !== "propose_changes") return runTool(name, input, { ...data, onlineSnapshot: ONLINE });
  const { output, card } = proposalOutcome(dryRun(input, data, { hasUnsavedWork: false, online: ONLINE }), n, input);
  if (!card) return output;
  const lines = card.lines.map((l) => (l.warning ? `${l.text} (${l.warning})` : l.text));
  return { ...output, card: { summary: card.summary, lines, warnings: card.warnings.map((w) => `${w.level}: ${w.text}`) } };
}

export function answer(req: Request): unknown {
  const data = scenario(req.scenario);
  switch (req.op) {
    case "mask":
      return { text: maskText(req.text, data.teachers) };
    case "unmask":
      return { text: unmaskText(req.text, data.teachers) };
    case "tool":
      return tool(req.name, req.input, data, req.n ?? 1);
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
