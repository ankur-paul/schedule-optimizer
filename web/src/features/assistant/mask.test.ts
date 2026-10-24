import { describe, expect, it } from "vitest";
import { sampleCollege } from "@/domain/sampleCollege";
import type { Course, Teacher } from "@/domain/types";
import { maskTeachers, maskText, teacherCodes, unmaskText } from "./mask";

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

describe("maskText", () => {
  it("replaces whole names, ignoring case", () => {
    expect(maskText("Is meera iyer free?", teachers)).toBe(`Is ${c("t10")} free?`);
    expect(maskText("MEERA IYER", teachers)).toBe(c("t10"));
  });

  it("tries longer names first, so a name containing another wins", () => {
    expect(maskText("Ravi Kumar and Ravi", teachers)).toBe(`${c("t2")} and ${c("t1")}`);
  });

  it("matches whole words only", () => {
    expect(maskText("Ravindra and Raviraj", teachers)).toBe("Ravindra and Raviraj");
  });

  it("matches names next to punctuation and across extra spaces", () => {
    expect(maskText("(Dr. Anita Sharma), Ravi's lab; Ravi.", teachers)).toBe(`(${c("dr-anita-sharma")}), ${c("t1")}'s lab; ${c("t1")}.`);
    expect(maskText("Ravi   Kumar\nteaches", teachers)).toBe(`${c("t2")}\nteaches`);
  });

  it("replaces ids too, which may be slugs of names", () => {
    expect(maskText("dr-anita-sharma and T10", teachers)).toBe(`${c("dr-anita-sharma")} and ${c("t10")}`);
    expect(maskText("t1 but not t10x or at1", teachers)).toBe(`${c("t1")} but not t10x or at1`);
  });

  it("leaves text without teachers alone, and works with no teachers", () => {
    expect(maskText("Why can't CSE A be built?", teachers)).toBe("Why can't CSE A be built?");
    expect(maskText("Ravi", [])).toBe("Ravi");
    expect(maskText("Ravi", [teacher("x", "  ")])).toBe("Ravi");
  });

  it("masks a name with regex characters in it", () => {
    const odd = [teacher("o", "A. (Bob) Rao+")];
    expect(maskText("ask A. (Bob) Rao+ now", odd)).toBe(`ask ${teacherCodes(odd).get("o")} now`);
  });
});

describe("unmaskText", () => {
  it("turns codes back into names", () => {
    expect(unmaskText(`${c("t2")} teaches 4 in a row; ask ${c("dr-anita-sharma")}.`, teachers)).toBe("Ravi Kumar teaches 4 in a row; ask Dr. Anita Sharma.");
  });

  it("matches whole tokens only, in exact case", () => {
    const code = c("t1");
    expect(unmaskText(`${code}X ${code.toLowerCase()} x${code}`, teachers)).toBe(`${code}X ${code.toLowerCase()} x${code}`);
  });

  it("does not touch ids, so t1 never changes t10", () => {
    expect(unmaskText("t1 and t10", teachers)).toBe("t1 and t10");
  });

  it("round-trips: text without teachers is unchanged, names come back", () => {
    const plain = "CSE A has 3 free periods on Tue: P1, P4 and P8. See /help/generate#no-room.";
    expect(unmaskText(maskText(plain, teachers), teachers)).toBe(plain);
    expect(unmaskText(maskText("Is Ravi Kumar free?", teachers), teachers)).toBe("Is Ravi Kumar free?");
  });
});
