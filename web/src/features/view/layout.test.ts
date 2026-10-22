import { describe, expect, it } from "vitest";
import { sampleCollege } from "@/domain/sampleCollege";
import { expandSessions } from "@/domain/sessions";
import type { Placement, Session } from "@/domain/types";
import {
  entityGroups,
  entitySubtitle,
  filterGroups,
  layoutDay,
  layoutWeek,
  placementsFor,
  sessionDetails,
  cellLabel,
  stepEntity,
  timeRange,
  unplacedFor,
  type PlacedSession,
} from "./layout";

const data = sampleCollege;
const settings = data.settings;

function session(id: string, over: Partial<Session> = {}): Session {
  return {
    id,
    courseId: "c",
    sectionId: "s",
    batch: null,
    teacherId: "t",
    kind: "lecture",
    length: 1,
    roomType: "classroom",
    fixedRoomId: null,
    ...over,
  };
}

function placed(s: Session, period: number, day = 0, roomId = "r"): PlacedSession {
  return { session: s, placement: { sessionId: s.id, day, period, roomId } };
}

describe("entityGroups", () => {
  it("groups sections by department in input order", () => {
    const groups = entityGroups(data, "section");
    expect(groups.map((g) => g.label)).toEqual(data.departments.map((d) => d.name));
    expect(groups[0].items.map((e) => e.name)).toEqual(["CSE A", "CSE B", "CSE C"]);
  });

  it("puts shared rooms in a last Shared group", () => {
    const groups = entityGroups(data, "room");
    const shared = groups.at(-1)!;
    expect(shared.label).toBe("Shared");
    expect(shared.items.map((r) => r.id)).toContain("sh-1");
    expect(groups.flatMap((g) => g.items)).toHaveLength(data.rooms.length);
  });

  it("collects entities of unknown departments in Other and drops empty groups", () => {
    const groups = entityGroups(
      { ...data, departments: [{ id: "x", name: "Empty" }], teachers: [{ id: "t1", name: "T", departmentId: "gone" }] },
      "teacher",
    );
    expect(groups).toEqual([{ label: "Other", items: [{ id: "t1", name: "T" }] }]);
  });

  it("returns no groups for an empty college", () => {
    expect(entityGroups({ ...data, sections: [] }, "section")).toEqual([]);
  });
});

describe("filterGroups / stepEntity", () => {
  const groups = entityGroups(data, "section");

  it("filters by name, case-insensitively", () => {
    const out = filterGroups(groups, "  cse a ");
    expect(out.flatMap((g) => g.items.map((e) => e.name))).toEqual(["CSE A"]);
  });

  it("matches an unlabelled group (the data step's \"All sections\" row) by its item names only", () => {
    const withAll = [{ label: "", items: [{ id: "", name: "All sections" }] }, ...groups];
    expect(filterGroups(withAll, "all").flatMap((g) => g.items.map((e) => e.name))).toEqual(["All sections"]);
    expect(filterGroups(withAll, "cse a").flatMap((g) => g.items.map((e) => e.name))).toEqual(["CSE A"]);
    expect(filterGroups(withAll, "")[0].items[0].name).toBe("All sections");
  });

  it("keeps a whole group when its department name matches", () => {
    const out = filterGroups(groups, "mechanical");
    expect(out).toHaveLength(1);
    expect(out[0].items).toHaveLength(3);
  });

  it("empty query keeps everything; no match gives no groups", () => {
    expect(filterGroups(groups, "")).toBe(groups);
    expect(filterGroups(groups, "zzz")).toEqual([]);
  });

  it("steps across groups and wraps around both ways", () => {
    expect(stepEntity(groups, "cse-c", 1)).toBe("ece-a");
    expect(stepEntity(groups, "me-c", 1)).toBe("cse-a");
    expect(stepEntity(groups, "cse-a", -1)).toBe("me-c");
    expect(stepEntity(groups, "cse-a", -10)).toBe("me-c"); // 9 sections: -10 ≡ -1
  });

  it("unknown id goes to the first entity; no entities gives null", () => {
    expect(stepEntity(groups, null, 1)).toBe("cse-a");
    expect(stepEntity(groups, "nope", -1)).toBe("cse-a");
    expect(stepEntity([], "cse-a", 1)).toBeNull();
  });
});

describe("placementsFor", () => {
  const sessions = new Map(expandSessions(data).map((s) => [s.id, s]));
  const placements: Placement[] = [
    { sessionId: "cse-a-ds:L1", day: 0, period: 0, roomId: "cr-cse-a" },
    { sessionId: "cse-a-ds:P1:B2", day: 1, period: 3, roomId: "lab-cse1" },
    { sessionId: "ghost", day: 0, period: 0, roomId: "cr-cse-a" },
  ];

  it("selects by section, teacher (incl. batch teacher) and room", () => {
    expect(placementsFor("section", "cse-a", placements, sessions)).toHaveLength(2);
    expect(placementsFor("teacher", "t-c1", placements, sessions).map((p) => p.session.id)).toEqual(["cse-a-ds:L1"]);
    expect(placementsFor("teacher", "t-c2", placements, sessions).map((p) => p.session.id)).toEqual(["cse-a-ds:P1:B2"]);
    expect(placementsFor("room", "cr-cse-a", placements, sessions)).toHaveLength(1);
  });

  it("lists unplaced sessions per section/teacher, none for rooms", () => {
    const unplaced = [
      { sessionId: "cse-a-ds:P1:B2", reason: "no lab free" },
      { sessionId: "ghost", reason: "?" },
    ];
    expect(unplacedFor("section", "cse-a", unplaced, sessions).map((u) => u.reason)).toEqual(["no lab free"]);
    expect(unplacedFor("teacher", "t-c2", unplaced, sessions)).toHaveLength(1);
    expect(unplacedFor("teacher", "t-c1", unplaced, sessions)).toHaveLength(0);
    expect(unplacedFor("room", "lab-cse1", unplaced, sessions)).toEqual([]);
  });

  it("skips unknown sessions", () => {
    expect(placementsFor("room", "cr-cse-a", placements, sessions).map((p) => p.session.id)).not.toContain("ghost");
  });
});

describe("layoutDay", () => {
  it("empty day has one lane and no blocks", () => {
    expect(layoutDay([])).toEqual({ blocks: [], lanes: 1 });
  });

  it("sequential sessions share one lane; labs span their length", () => {
    const { blocks, lanes } = layoutDay([placed(session("lab", { kind: "lab", length: 2 }), 3), placed(session("a"), 0)]);
    expect(lanes).toBe(1);
    expect(blocks.map((b) => [b.session.id, b.start, b.span, b.lane, b.laneSpan])).toEqual([
      ["a", 0, 1, 0, 1],
      ["lab", 3, 2, 0, 1],
    ]);
  });

  it("stacks parallel batch labs, lowest batch on top", () => {
    const b2 = placed(session("p:B2", { batch: 2, kind: "lab", length: 2 }), 3);
    const b1 = placed(session("p:B1", { batch: 1, kind: "lab", length: 2 }), 3);
    const { blocks, lanes } = layoutDay([b2, b1]);
    expect(lanes).toBe(2);
    expect(blocks.map((b) => [b.session.id, b.lane])).toEqual([
      ["p:B1", 0],
      ["p:B2", 1],
    ]);
  });

  it("a whole-section lecture grows to fill the day's lanes when nothing is under it", () => {
    const lecture = placed(session("L"), 0);
    const b1 = placed(session("B1", { batch: 1, kind: "lab", length: 2 }), 3);
    const b2 = placed(session("B2", { batch: 2, kind: "lab", length: 2 }), 4);
    const { blocks, lanes } = layoutDay([lecture, b1, b2]);
    expect(lanes).toBe(2);
    const byId = Object.fromEntries(blocks.map((b) => [b.session.id, b]));
    expect(byId.L.laneSpan).toBe(2);
    expect(byId.B1).toMatchObject({ lane: 0, laneSpan: 1 });
    expect(byId.B2).toMatchObject({ lane: 1, laneSpan: 1 });
  });

  it("a block in an upper lane grows down only if the lane below is free across its whole span", () => {
    const top = placed(session("top", { kind: "lab", length: 3 }), 0); // periods 0-2
    const clash = placed(session("clash"), 2); // overlaps top at period 2 → lane 1
    const late = placed(session("late"), 5);
    const { blocks } = layoutDay([top, clash, late]);
    const byId = Object.fromEntries(blocks.map((b) => [b.session.id, b]));
    expect(byId.top.laneSpan).toBe(1);
    expect(byId.clash).toMatchObject({ lane: 1, laneSpan: 1 });
    expect(byId.late).toMatchObject({ lane: 0, laneSpan: 2 });
  });

  it("reuses a lane once the earlier session has ended", () => {
    const a = placed(session("a", { length: 2 }), 0); // 0-1
    const b = placed(session("b", { length: 2 }), 1); // 1-2, lane 1
    const c = placed(session("c"), 2); // lane 0 is free from 2
    const { blocks, lanes } = layoutDay([a, b, c]);
    expect(lanes).toBe(2);
    expect(blocks.find((x) => x.session.id === "c")!.lane).toBe(0);
  });
});

describe("layoutWeek / timeRange / sessionDetails", () => {
  it("one layout per day; placements on missing days are dropped", () => {
    const week = layoutWeek(settings, [placed(session("a"), 0, 1), placed(session("b"), 0, 9)]);
    expect(week).toHaveLength(settings.days.length);
    expect(week[1].blocks).toHaveLength(1);
    expect(week.flatMap((d) => d.blocks)).toHaveLength(1);
  });

  it("formats time ranges, clamping past the end of the day", () => {
    expect(timeRange(settings, 0, 1)).toBe("09:00–09:50");
    expect(timeRange(settings, 3, 2)).toBe("11:00–12:40");
    expect(timeRange(settings, 8, 3)).toBe("15:10–16:00");
    expect(timeRange(settings, 42, 1)).toBe("");
  });

  it("resolves names for a batch lab", () => {
    const s = expandSessions(data).find((x) => x.id === "cse-a-ds:P1:B2")!;
    const details = sessionDetails(data, { session: s, placement: { sessionId: s.id, day: 1, period: 3, roomId: "lab-cse1" } });
    expect(details).toEqual({
      subject: "Data Structures",
      kind: "lab",
      section: "CSE A",
      batch: "B2",
      teacher: "Prof. Rahul Verma",
      room: "CSE Lab 1",
      day: "Tue",
      periods: "P3–P4",
      time: "11:00–12:40",
    });
  });

  it("reads a whole card out for screen readers, saying when it is locked", () => {
    const s = expandSessions(data).find((x) => x.id === "cse-a-ds:P1:B2")!;
    const details = sessionDetails(data, { session: s, placement: { sessionId: s.id, day: 1, period: 3, roomId: "lab-cse1" } });
    expect(cellLabel(details, false)).toBe("Data Structures lab (B2), CSE A, Prof. Rahul Verma, CSE Lab 1, Tue P3–P4, 11:00–12:40");
    expect(cellLabel({ ...details, kind: "lecture", batch: null }, true)).toBe(
      "Data Structures, CSE A, Prof. Rahul Verma, CSE Lab 1, Tue P3–P4, 11:00–12:40, locked",
    );
  });

  it("falls back to ids for unknown references", () => {
    const s = session("x", { courseId: "c?", sectionId: "s?", teacherId: "t?" });
    const details = sessionDetails(data, { session: s, placement: { sessionId: "x", day: 7, period: 0, roomId: "r?" } });
    expect(details).toMatchObject({ subject: "c?", section: "s?", teacher: "t?", room: "r?", day: "Day 8", batch: null, periods: "P1" });
  });
});

describe("entitySubtitle", () => {
  it("section: department and batch count (only when split)", () => {
    expect(entitySubtitle(data, "section", "cse-a")).toBe("Computer Science & Engineering · 2 batches");
    expect(entitySubtitle(data, "section", "cse-c")).toBe("Computer Science & Engineering");
  });

  it("teacher: department", () => {
    expect(entitySubtitle(data, "teacher", "t-c1")).toBe("Computer Science & Engineering");
  });

  it("room: type and owner, or Shared", () => {
    expect(entitySubtitle(data, "room", "cr-cse-a")).toBe("Classroom · Computer Science & Engineering");
    expect(entitySubtitle(data, "room", "lab-phy")).toBe("Lab · Shared");
  });

  it("unknown ids give an empty or generic line instead of throwing", () => {
    expect(entitySubtitle(data, "section", "nope")).toBe("");
    expect(entitySubtitle(data, "teacher", "nope")).toBe("");
    expect(entitySubtitle(data, "room", "nope")).toBe("Classroom · Shared");
  });
});
