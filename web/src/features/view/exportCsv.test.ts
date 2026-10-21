import { describe, expect, it } from "vitest";
import { sampleCollege } from "@/domain/sampleCollege";
import { expandSessions } from "@/domain/sessions";
import type { Placement } from "@/domain/types";
import { CSV_HEADER, csvCell, placementsCsv } from "./exportCsv";

const sessions = new Map(expandSessions(sampleCollege).map((s) => [s.id, s]));

describe("csvCell", () => {
  it("leaves plain values alone", () => {
    expect(csvCell("CSE A")).toBe("CSE A");
    expect(csvCell("")).toBe("");
  });

  it("quotes commas, quotes and newlines", () => {
    expect(csvCell("Smith, J")).toBe('"Smith, J"');
    expect(csvCell('The "Lab"')).toBe('"The ""Lab"""');
    expect(csvCell("a\nb")).toBe('"a\nb"');
  });
});

describe("placementsCsv", () => {
  const placements: Placement[] = [
    { sessionId: "cse-b-ds:L1", day: 0, period: 0, roomId: "cr-cse-b" },
    { sessionId: "cse-a-ds:P1:B2", day: 1, period: 3, roomId: "lab-cse1" },
    { sessionId: "cse-a-ds:L1", day: 1, period: 0, roomId: "cr-cse-a" },
    { sessionId: "cse-a-ds:P1:B1", day: 1, period: 3, roomId: "lab-cse2" },
    { sessionId: "ghost", day: 0, period: 0, roomId: "cr-cse-a" },
  ];

  it("writes a header and one row per known placement, sorted by section, day, period, batch", () => {
    const lines = placementsCsv(sampleCollege, placements, sessions).trimEnd().split("\r\n");
    expect(lines[0]).toBe(CSV_HEADER.join(","));
    expect(lines.slice(1)).toEqual([
      "CSE A,,Tue,P1,09:00–09:50,Data Structures,lecture,Dr. Anita Sharma,CSE Room A",
      "CSE A,B1,Tue,P3–P4,11:00–12:40,Data Structures,lab,Dr. Anita Sharma,CSE Lab 2",
      "CSE A,B2,Tue,P3–P4,11:00–12:40,Data Structures,lab,Prof. Rahul Verma,CSE Lab 1",
      expect.stringMatching(/^CSE B,,Mon,P1,/),
    ]);
  });

  it("ends every line with CRLF", () => {
    const csv = placementsCsv(sampleCollege, placements.slice(0, 1), sessions);
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(csv.split("\r\n")).toHaveLength(3); // header, row, trailing empty
  });

  it("only a header when nothing is placed", () => {
    expect(placementsCsv(sampleCollege, [], sessions)).toBe(CSV_HEADER.join(",") + "\r\n");
  });

  it("quotes names that contain commas", () => {
    const data = { ...sampleCollege, rooms: sampleCollege.rooms.map((r) => (r.id === "cr-cse-a" ? { ...r, name: "Room A, Block 2" } : r)) };
    const csv = placementsCsv(data, [placements[2]], sessions);
    expect(csv).toContain(',"Room A, Block 2"\r\n');
  });
});
