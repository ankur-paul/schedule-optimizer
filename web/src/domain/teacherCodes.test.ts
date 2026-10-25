import { describe, expect, it } from "vitest";
import { sampleCollege } from "./sampleCollege";
import { maskTeachers, teacherCodes } from "./teacherCodes";
import type { Course, Teacher } from "./types";

const teacher = (id: string, name: string): Teacher => ({ id, name, departmentId: "cse" });
const teachers = [teacher("t1", "Ravi"), teacher("t2", "Ravi Kumar"), teacher("dr-anita-sharma", "Dr. Anita Sharma"), teacher("t10", "Meera Iyer")];
const codes = teacherCodes(teachers);
const c = (id: string) => codes.get(id)!;

describe("teacherCodes", () => {
  it("gives every teacher its own T- code, unrelated to the name", () => {
    expect(codes.size).toBe(4);
    expect(new Set(codes.values()).size).toBe(4);
    for (const code of codes.values()) expect(code).toMatch(/^T-[0-9A-Z]{5}$/);
    expect(c("dr-anita-sharma").toLowerCase()).not.toContain("anita");
  });

  it("keeps a teacher's code when others are added, removed or reordered", () => {
    const changed = teacherCodes([teacher("t9", "New"), ...teachers.slice(1).reverse()]);
    expect(changed.get("t2")).toBe(c("t2"));
    expect(changed.get("dr-anita-sharma")).toBe(c("dr-anita-sharma"));
  });

  it("is unique across the sample college and a large made-up one", () => {
    expect(new Set(teacherCodes(sampleCollege.teachers).values()).size).toBe(sampleCollege.teachers.length);
    const many = Array.from({ length: 2000 }, (_, i) => ({ id: `teacher-${i}` }));
    expect(new Set(teacherCodes(many).values()).size).toBe(2000);
  });
});

describe("maskTeachers", () => {
  it("replaces teacher ids and names in teachers and courses", () => {
    const course: Course = { id: "k", sectionId: "s", subject: "DS", teacherId: "t1", lecturesPerWeek: 1, labSessionsPerWeek: 1, labLength: 2, batchTeacherIds: ["t1", "t2"] };
    const out = maskTeachers({ teachers, courses: [course, { ...course, batchTeacherIds: null }] }, codes);
    expect(out.teachers[0]).toEqual({ id: c("t1"), name: c("t1"), departmentId: "cse" });
    expect(out.courses[0]).toMatchObject({ teacherId: c("t1"), batchTeacherIds: [c("t1"), c("t2")] });
    expect(out.courses[1].batchTeacherIds).toBeNull();
    expect(teachers[0].name).toBe("Ravi"); // input not mutated
  });

  it("codes a course's missing teacher too", () => {
    const course: Course = { id: "k", sectionId: "s", subject: "DS", teacherId: "gone-teacher", lecturesPerWeek: 1, labSessionsPerWeek: 0, labLength: 0 };
    expect(maskTeachers({ teachers, courses: [course] }, codes).courses[0].teacherId).toMatch(/^T-/);
  });
});
