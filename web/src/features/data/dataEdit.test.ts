import { describe, expect, it } from "vitest";
import { sampleCollege } from "@/domain/sampleCollege";
import { useAppStore } from "@/store/useAppStore";
import type { Course } from "@/domain/types";
import type { CollegeData } from "./excel";
import { DATA_TABS, defaultDataTab, labRoomsFor, nextId, removeRoom, removeSection, setBatchTeacher, usageCount } from "./dataEdit";

const data = (): CollegeData => ({
  departments: [
    { id: "cse", name: "CSE" },
    { id: "ece", name: "ECE" },
  ],
  teachers: [
    { id: "t1", name: "Anita", departmentId: "cse" },
    { id: "t2", name: "Ravi", departmentId: "cse" },
  ],
  rooms: [
    { id: "r1", name: "Room 1", type: "classroom", departmentId: "cse" },
    { id: "lab-cse", name: "CSE Lab", type: "lab", departmentId: "cse" },
    { id: "lab-ece", name: "ECE Lab", type: "lab", departmentId: "ece" },
    { id: "lab-shared", name: "Central Lab", type: "lab", departmentId: null },
  ],
  sections: [
    { id: "s1", name: "CSE A", departmentId: "cse", batches: 2 },
    { id: "s2", name: "CSE B", departmentId: "cse", batches: 1 },
  ],
  courses: [
    { id: "c1", sectionId: "s1", subject: "DS", teacherId: "t1", lecturesPerWeek: 3, labSessionsPerWeek: 1, labLength: 2, labRoomId: "lab-cse", batchTeacherIds: ["t1", "t2"] },
    { id: "c2", sectionId: "s2", subject: "OS", teacherId: "t1", lecturesPerWeek: 3, labSessionsPerWeek: 0, labLength: 1 },
  ],
});

describe("data edit helpers", () => {
  it("nextId always suffixes and skips taken ids", () => {
    expect(nextId("teacher", [])).toBe("teacher-2");
    expect(nextId("teacher", [{ id: "teacher-2" }, { id: "teacher-3" }])).toBe("teacher-4");
  });

  it("counts usages per kind", () => {
    const d = data();
    expect(usageCount(d, "department", "cse")).toBe(6); // 2 teachers + 2 owned rooms + 2 sections
    expect(usageCount(d, "department", "ece")).toBe(1);
    expect(usageCount(d, "teacher", "t1")).toBe(2);
    expect(usageCount(d, "teacher", "t2")).toBe(1); // only as a batch teacher
    expect(usageCount(d, "room", "lab-cse")).toBe(1);
    expect(usageCount(d, "room", "r1")).toBe(0);
    expect(usageCount(d, "section", "s1")).toBe(1);
  });

  it("removing a section removes its courses", () => {
    const r = removeSection(data(), "s1");
    expect(r.sections.map((s) => s.id)).toEqual(["s2"]);
    expect(r.courses.map((c) => c.id)).toEqual(["c2"]);
  });

  it("removing a pinned lab unpins courses instead of dangling", () => {
    const r = removeRoom(data(), "lab-cse");
    expect(r.rooms.map((x) => x.id)).toEqual(["r1", "lab-ece", "lab-shared"]);
    expect(r.courses[0].labRoomId).toBeNull();
  });

  it("sets batch teachers and collapses back to null when all match the course teacher", () => {
    const c: Course = { ...data().courses[0], batchTeacherIds: null };
    expect(setBatchTeacher(c, 2, 2, "t2")).toEqual(["t1", "t2"]);
    expect(setBatchTeacher({ ...c, batchTeacherIds: ["t1", "t2"] }, 2, 2, "")).toBeNull();
    expect(setBatchTeacher({ ...c, batchTeacherIds: ["t2"] }, 3, 3, "t2")).toEqual(["t2", "t1", "t2"]);
  });

  it("offers shared labs and the section's own department's labs", () => {
    const d = data();
    expect(labRoomsFor(d.rooms, d.sections[0]).map((r) => r.id)).toEqual(["lab-cse", "lab-shared"]);
    expect(labRoomsFor(d.rooms, undefined).map((r) => r.id)).toEqual(["lab-shared"]);
  });
});

describe("store setData", () => {
  it("replaces every table and drops a stale result and locks", () => {
    const s = useAppStore.getState();
    s.loadSample();
    s.setLocks([{ sessionId: "x", day: 0, period: 0, roomId: "r" }]);
    s.setData(data());
    const after = useAppStore.getState();
    expect(after.courses.map((c) => c.id)).toEqual(["c1", "c2"]);
    expect(after.departments).toHaveLength(2);
    expect(after.locks).toEqual([]);
    expect(after.result).toBeNull();
    expect(after.settings).toEqual(sampleCollege.settings);
    after.reset();
  });
});

describe("data tabs", () => {
  it("lists tables in dependency order, courses last", () => {
    expect(DATA_TABS).toEqual(["departments", "rooms", "teachers", "sections", "courses"]);
  });

  it("opens on Courses when there are courses, otherwise on Departments", () => {
    expect(defaultDataTab(data())).toBe("courses");
    expect(defaultDataTab({ courses: [] })).toBe("departments");
    expect(defaultDataTab(sampleCollege)).toBe("courses");
  });
});
