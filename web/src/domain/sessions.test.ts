import { describe, expect, it } from "vitest";
import golden from "../../../shared/fixtures/sample-sessions.json";
import { sampleCollege } from "./sampleCollege";
import { expandSessions } from "./sessions";

describe("expandSessions", () => {
  it("matches the golden file for the sample college", () => {
    expect(expandSessions(sampleCollege)).toEqual(golden);
  });

  it("splits a 2-batch lab into per-batch sessions with batch teachers", () => {
    const sessions = expandSessions(sampleCollege).filter((s) => s.courseId === "cse-a-ds" && s.kind === "lab");
    expect(sessions.map((s) => [s.id, s.batch, s.teacherId])).toEqual([
      ["cse-a-ds:P1:B1", 1, "t-c1"],
      ["cse-a-ds:P1:B2", 2, "t-c2"],
    ]);
  });

  it("keeps an unsplit section's lab as one whole-section session", () => {
    const sessions = expandSessions(sampleCollege).filter((s) => s.courseId === "cse-c-ds");
    expect(sessions.map((s) => s.id)).toEqual(["cse-c-ds:L1", "cse-c-ds:L2", "cse-c-ds:L3", "cse-c-ds:P1"]);
    expect(sessions[3]).toMatchObject({ batch: null, length: 2, roomType: "lab" });
  });
});
