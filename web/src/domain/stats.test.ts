import { describe, expect, it } from "vitest";
import { loadRange, roomUtilisation, SCORE_ROWS, sortLoads, teacherLoads } from "./stats";
import { tinyCollege, tinyValid } from "./tinyCollege";

// tinyValid: 2 days × 5 teaching periods, so each room has 10 slots.
describe("teacherLoads", () => {
  it("counts busy teaching periods per day, labs by length", () => {
    expect(teacherLoads(tinyCollege, tinyValid)).toEqual([
      { teacherId: "t1", name: "A. Sharma", department: "CSE", perDay: [3, 1], total: 4 },
      { teacherId: "t2", name: "R. Gupta", department: "ECE", perDay: [3, 3], total: 6 },
      { teacherId: "t3", name: "S. Rao", department: "CSE", perDay: [2, 0], total: 2 },
    ]);
  });

  it("gives teachers with no classes zeros", () => {
    expect(teacherLoads(tinyCollege, []).map((l) => [l.perDay, l.total])).toEqual([
      [[0, 0], 0],
      [[0, 0], 0],
      [[0, 0], 0],
    ]);
  });

  it("falls back to the department id when the department is unknown", () => {
    const data = { ...tinyCollege, teachers: [{ id: "t1", name: "A. Sharma", departmentId: "gone" }] };
    expect(teacherLoads(data, tinyValid)[0].department).toBe("gone");
  });
});

describe("sortLoads / loadRange", () => {
  const loads = teacherLoads(tinyCollege, tinyValid);

  it("sorts by total either way and by text keys", () => {
    expect(sortLoads(loads, "total", "desc").map((l) => l.total)).toEqual([6, 4, 2]);
    expect(sortLoads(loads, "total", "asc").map((l) => l.total)).toEqual([2, 4, 6]);
    expect(sortLoads(loads, "department", "asc").map((l) => l.name)).toEqual(["A. Sharma", "S. Rao", "R. Gupta"]);
  });

  it("breaks ties by name and doesn't mutate the input", () => {
    const tied = loads.map((l) => ({ ...l, total: 1 }));
    expect(sortLoads(tied, "total", "desc").map((l) => l.name)).toEqual(["A. Sharma", "R. Gupta", "S. Rao"]);
    expect(loads.map((l) => l.teacherId)).toEqual(["t1", "t2", "t3"]);
  });

  it("finds the highest and lowest load", () => {
    expect(loadRange(loads)).toEqual({ max: 6, min: 2 });
    expect(loadRange([])).toBeNull();
  });
});

describe("roomUtilisation", () => {
  it("computes per-room, shared and overall rates", () => {
    const u = roomUtilisation(tinyCollege, tinyValid);
    expect(u.rooms.map((r) => [r.roomId, r.used, r.capacity, r.shared])).toEqual([
      ["lab1", 6, 10, true],
      ["cr1", 3, 10, false],
      ["cr2", 3, 10, true],
    ]);
    expect(u.rooms[0].rate).toBeCloseTo(0.6);
    expect(u.shared).toBeCloseTo(9 / 20);
    expect(u.overall).toBeCloseTo(12 / 30);
  });

  it("reports no shared rate when every room is owned", () => {
    const data = { ...tinyCollege, rooms: tinyCollege.rooms.map((r) => ({ ...r, departmentId: "cse" })) };
    expect(roomUtilisation(data, tinyValid).shared).toBeNull();
  });

  it("returns 0, not NaN, with no teaching periods or no rooms", () => {
    const noTeaching = { ...tinyCollege, settings: { ...tinyCollege.settings, periods: [] } };
    expect(roomUtilisation(noTeaching, []).rooms.every((r) => r.rate === 0)).toBe(true);
    expect(roomUtilisation({ ...tinyCollege, rooms: [] }, tinyValid)).toEqual({ rooms: [], shared: null, overall: 0 });
  });
});

describe("SCORE_ROWS", () => {
  it("covers every breakdown key once, in S1–S4 order", () => {
    expect(SCORE_ROWS.map((r) => [r.rule, r.key])).toEqual([
      ["S1", "subjectRepeat"],
      ["S2", "teacherOverload"],
      ["S3", "sectionGaps"],
      ["S4", "batchIdle"],
    ]);
  });
});
