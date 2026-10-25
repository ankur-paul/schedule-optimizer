import { describe, expect, it } from "vitest";
import { sampleCollege } from "../src/domain/sampleCollege";
import { answer, scenario, type ToolAnswer } from "./agent-eval-tools";

const teacher = sampleCollege.teachers[0];

describe("agent-eval-tools", () => {
  it("builds each scenario's status", () => {
    const status = (name: "built" | "partial" | "impossible") =>
      JSON.parse((answer({ op: "tool", scenario: name, name: "overview", input: {} }) as { content: string }).content).status;
    expect(status("built")).toBe("built");
    expect(status("partial")).toBe("partial");
    expect(status("impossible")).toBe("can't be built");
  });

  it("leaves two classes unplaced in the partial scenario", () => {
    expect(scenario("partial").result!.unplaced).toHaveLength(2);
  });

  it("masks and unmasks teacher names", () => {
    const masked = (answer({ op: "mask", scenario: "built", text: `When is ${teacher.name} free?` }) as { text: string }).text;
    expect(masked).not.toContain(teacher.name);
    expect((answer({ op: "unmask", scenario: "built", text: masked }) as { text: string }).text).toBe(`When is ${teacher.name} free?`);
  });

  it("returns a bad tool call as an error result", () => {
    expect(answer({ op: "tool", scenario: "built", name: "nope", input: {} })).toMatchObject({ isError: true });
  });

  it("dry-runs a proposal and returns its card, changing nothing", () => {
    const input = { summary: "Move DS", changes: [{ op: "move", sessionId: "cse-a-ds:L1", day: "Tue", period: "P1", roomId: "" }, { op: "save_online" }] };
    const out = answer({ op: "tool", scenario: "built", name: "propose_changes", input, n: 2 }) as ToolAnswer;
    expect(out).toMatchObject({ isError: false, content: "Shown to the user as changes #2; they will apply or discard it." });
    expect(out.card!.lines).toEqual([expect.stringMatching(/^Move CSE A Data Structures .+ locked$/), "Save online as version 6 of “CSE odd sem 2026”"]);
    expect(scenario("built").locks).toEqual([]);
  });

  it("returns a proposal that fails its dry run as an error, with no card", () => {
    const out = answer({ op: "tool", scenario: "built", name: "propose_changes", input: { summary: "x", changes: [{ op: "remove_room", id: "nope" }] } }) as ToolAnswer;
    expect(out.isError).toBe(true);
    expect(out.card).toBeUndefined();
  });

  it("answers online_status from the editor's snapshot, with no names", () => {
    const out = answer({ op: "tool", scenario: "built", name: "online_status", input: {} }) as ToolAnswer;
    expect(JSON.parse(out.content)).toMatchObject({ linked: true, role: "editor", latestVersion: 5, published: false });
    expect(out.content).not.toMatch(/@|Meera/);
  });
});
