import { describe, expect, it } from "vitest";
import { sampleCollege } from "@/domain/sampleCollege";
import type { Course, Settings } from "@/domain/types";
import { checkData } from "./dataChecks";
import type { CollegeData } from "./excel";

const settings = sampleCollege.settings; // 5 days × 8 teaching periods, longest run 6

const tiny = (): CollegeData => ({
  departments: [{ id: "cse", name: "CSE" }],
  teachers: [
    { id: "t1", name: "Anita", departmentId: "cse" },
    { id: "t2", name: "Ravi", departmentId: "cse" },
  ],
  rooms: [
    { id: "r1", name: "Room 1", type: "classroom", departmentId: "cse" },
    { id: "lab", name: "Lab", type: "lab", departmentId: null },
  ],
  sections: [{ id: "s1", name: "CSE A", departmentId: "cse", batches: 2 }],
  courses: [
    { id: "c1", sectionId: "s1", subject: "DS", teacherId: "t1", lecturesPerWeek: 3, labSessionsPerWeek: 1, labLength: 2, batchTeacherIds: ["t1", "t2"] },
  ],
});

const course = (over: Partial<Course>): Course => ({ ...tiny().courses[0], ...over });

describe("checkData", () => {
  it("the sample college has no errors or warnings", () => {
    const r = checkData(sampleCollege, settings);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.sections).toHaveLength(9);
  });

  it("computes loads: batch labs run in parallel for the section, each batch teacher pays", () => {
    const r = checkData(tiny(), settings);
    expect(r.errors).toEqual([]);
    // 3 lectures + one 2-period lab (batches side by side); 5 days × (8 − 1 lunch)
    expect(r.sections).toEqual([{ id: "s1", name: "CSE A", required: 5, available: 35 }]);
    expect(r.teachers.map((t) => t.required)).toEqual([5, 2]);
  });

  it("same teacher for both batches teaches the lab twice", () => {
    const d = { ...tiny(), courses: [course({ batchTeacherIds: null })] };
    expect(checkData(d, settings).teachers.map((t) => t.required)).toEqual([7, 0]);
  });

  it("no lunch candidates means no period is reserved", () => {
    expect(checkData(tiny(), { ...settings, lunchCandidates: [] }).sections[0].available).toBe(40);
  });

  it("needs at least one course", () => {
    expect(checkData({ ...tiny(), courses: [] }, settings).errors).toEqual(["Add at least one course (or load the sample college)."]);
  });

  it("flags dangling references after a delete", () => {
    const d = tiny();
    d.departments = [];
    d.teachers = d.teachers.filter((t) => t.id !== "t2");
    const r = checkData(d, settings);
    expect(r.errors).toEqual([
      'Teacher "Anita" has no department.',
      'Room "Room 1" has an unknown department.',
      'Section "CSE A" has no department.',
      'Course "DS" (CSE A): a batch teacher no longer exists.',
    ]);
  });

  it("flags bad course numbers and labs too long for the day", () => {
    const d = {
      ...tiny(),
      courses: [
        course({ id: "a", subject: "A", lecturesPerWeek: 0, labSessionsPerWeek: 0 }),
        course({ id: "b", subject: "B", lecturesPerWeek: -1 }),
        course({ id: "c", subject: "C", labLength: 7 }),
        course({ id: "d", subject: "", teacherId: "gone", sectionId: "gone" }),
        course({ id: "e", subject: "E", labRoomId: "r1" }),
      ],
    };
    expect(checkData(d, settings).errors).toEqual([
      'Course "A" (CSE A) has no lectures or labs.',
      'Course "B" (CSE A): lectures per week must be a whole number ≥ 0.',
      `Course "C" (CSE A): a 7-period lab can't fit; the longest run without a break is 6.`,
      'Course "(no subject)" has no section.',
      'Course "(no subject)" has no subject.',
      'Course "(no subject)" has no teacher.',
      'Course "E" (CSE A): its lab room is missing or not a lab.',
    ]);
  });

  it("flags a course with no eligible room, once per course and room type", () => {
    const d = { ...tiny(), rooms: [] };
    expect(checkData(d, settings).errors).toEqual([
      'Course "DS" (CSE A): no classroom it may use. Add a shared classroom or one owned by its department.',
      'Course "DS" (CSE A): no lab it may use. Add a shared lab or one owned by its department.',
    ]);
  });

  it("warns when a section or teacher needs more periods than the week has", () => {
    const short: Settings = { ...settings, days: ["Mon"] }; // 7 free periods
    const d = { ...tiny(), courses: [course({ lecturesPerWeek: 6 })] };
    expect(checkData(d, short).warnings).toEqual([
      'Section "CSE A" needs 8 periods a week but only 7 are free.',
      "Anita teaches 8 periods a week but only 7 are free.",
    ]);
  });
});
