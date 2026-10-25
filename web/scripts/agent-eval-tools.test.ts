import { describe, expect, it } from "vitest";
import { sampleCollege } from "../src/domain/sampleCollege";
import { answer, scenario } from "./agent-eval-tools";

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
});
