import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { sampleCollege } from "@/domain/sampleCollege";
import { expandSessions } from "@/domain/sessions";
import { parseWorkbook, readFiles, slugify, templateWorkbook, toWorkbook, uniqueId, type ImportResult } from "./excel";

type Rows = (string | number)[][];

/** Workbook from {sheet: rows}, first row = header. */
function book(sheets: Record<string, Rows>): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  return wb;
}

const header = {
  Teachers: ["Name", "Department"],
  Rooms: ["Name", "Type", "Department"],
  Sections: ["Name", "Department", "Lab Batches"],
  Courses: ["Section", "Subject", "Teacher", "Lectures/Week", "Lab Sessions/Week", "Lab Length", "Lab Room", "Batch Teachers"],
};

/** A small valid college; override any sheet's data rows. */
function college(over: Partial<Record<keyof typeof header, Rows>> = {}): XLSX.WorkBook {
  const rows: Record<keyof typeof header, Rows> = {
    Teachers: [
      ["Dr. Anita Sharma", "CSE"],
      ["Prof. Ravi Iyer", "CSE"],
      ["Meera Das", "Physics"],
    ],
    Rooms: [
      ["CSE Room A", "classroom", "CSE"],
      ["CSE Lab", "Lab", "CSE"],
      ["Seminar Hall", "classroom", ""],
    ],
    Sections: [
      ["CSE A", "CSE", 2],
      ["Physics 1", "physics", ""],
    ],
    Courses: [
      ["CSE A", "Data Structures", "Dr. Anita Sharma", 3, 1, 2, "CSE Lab", "Dr. Anita Sharma, Prof. Ravi Iyer"],
      ["Physics 1", "Mechanics", "meera das", 4, "", "", "", ""],
    ],
    ...over,
  };
  return book(Object.fromEntries(Object.entries(header).map(([k, h]) => [k, [h, ...rows[k as keyof typeof header]]])));
}

function errorsOf(r: ImportResult): string[] {
  return r.ok ? [] : r.errors;
}

describe("ids", () => {
  it("slugifies names", () => {
    expect(slugify("Dr. Anita Sharma")).toBe("dr-anita-sharma");
    expect(slugify("  Signals & Systems ")).toBe("signals-systems");
    expect(slugify("!!!")).toBe("item");
  });

  it("makes ids unique with a numeric suffix", () => {
    const taken = new Set<string>();
    expect([uniqueId("A B", taken), uniqueId("a-b", taken), uniqueId("A.B", taken)]).toEqual(["a-b", "a-b-2", "a-b-3"]);
  });
});

describe("parseWorkbook", () => {
  it("parses a valid workbook into entities", () => {
    const r = parseWorkbook(college());
    expect(errorsOf(r)).toEqual([]);
    if (!r.ok) return;
    const { departments, teachers, rooms, sections, courses } = r.data;
    // departments come from names in any sheet, matched case-insensitively
    expect(departments).toEqual([
      { id: "cse", name: "CSE" },
      { id: "physics", name: "Physics" },
    ]);
    expect(teachers[0]).toEqual({ id: "dr-anita-sharma", name: "Dr. Anita Sharma", departmentId: "cse" });
    expect(rooms).toEqual([
      { id: "cse-room-a", name: "CSE Room A", type: "classroom", departmentId: "cse" },
      { id: "cse-lab", name: "CSE Lab", type: "lab", departmentId: "cse" },
      { id: "seminar-hall", name: "Seminar Hall", type: "classroom", departmentId: null },
    ]);
    expect(sections).toEqual([
      { id: "cse-a", name: "CSE A", departmentId: "cse", batches: 2 },
      { id: "physics-1", name: "Physics 1", departmentId: "physics", batches: 1 },
    ]);
    expect(courses).toEqual([
      {
        id: "cse-a-data-structures",
        sectionId: "cse-a",
        subject: "Data Structures",
        teacherId: "dr-anita-sharma",
        lecturesPerWeek: 3,
        labSessionsPerWeek: 1,
        labLength: 2,
        labRoomId: "cse-lab",
        batchTeacherIds: ["dr-anita-sharma", "prof-ravi-iyer"],
      },
      {
        id: "physics-1-mechanics",
        sectionId: "physics-1",
        subject: "Mechanics",
        teacherId: "meera-das",
        lecturesPerWeek: 4,
        labSessionsPerWeek: 0,
        labLength: 1,
        labRoomId: null,
        batchTeacherIds: null,
      },
    ]);
  });

  it("reports an unknown teacher with its Excel row number", () => {
    const r = parseWorkbook(
      college({ Courses: [["CSE A", "Data Structures", "Dr. Anita Sharma", 3, 0, "", "", ""], ["CSE A", "DBMS", "Sharma", 3, 0, "", "", ""]] }),
    );
    expect(errorsOf(r)).toEqual(['Courses row 3: teacher "Sharma" not found in Teachers sheet']);
  });

  it("names every missing sheet", () => {
    const r = parseWorkbook(book({ Teachers: [header.Teachers] }));
    expect(errorsOf(r)).toHaveLength(3);
    expect(errorsOf(r)[0]).toMatch(/^Missing sheet "Rooms"/);
  });

  it("accepts sheet and header names in any case, and skips blank rows", () => {
    const wb = college();
    const ws = wb.Sheets.Teachers;
    XLSX.utils.sheet_add_aoa(ws, [["NAME ", "department"]], { origin: "A1" });
    XLSX.utils.sheet_add_aoa(ws, [["", ""]], { origin: -1 });
    wb.SheetNames[0] = "teachers";
    wb.Sheets.teachers = ws;
    const r = parseWorkbook(wb);
    expect(errorsOf(r)).toEqual([]);
    expect(r.ok && r.data.teachers).toHaveLength(3);
  });

  it("collects row errors across every sheet", () => {
    const r = parseWorkbook(
      college({
        Teachers: [["Dr. Anita Sharma", "CSE"], ["dr. anita sharma", "CSE"], ["", "CSE"], ["Meera Das", ""]],
        Rooms: [["CSE Room A", "hall", "CSE"], ["CSE Lab", "lab", "CSE"], ["Phys Lab", "lab", "Physics"]],
        Sections: [["CSE A", "CSE", 0], ["Physics 1", "Physics", 1]],
        Courses: [
          ["CSE A", "Data Structures", "Dr. Anita Sharma", 2.5, 1, 2, "CSE Room A", "Nobody"],
          ["Physics 1", "Optics", "Dr. Anita Sharma", 0, 0, "", "", ""],
          ["Physics 1", "Lab Work", "Dr. Anita Sharma", 0, 1, 2, "CSE Lab", ""],
          ["Nowhere", "", "", 1, 0, "", "", ""],
          ["Physics 1", "Optics", "Dr. Anita Sharma", 1, 0, "", "", ""],
        ],
      }),
    );
    expect(errorsOf(r)).toEqual([
      'Teachers row 3: teacher "dr. anita sharma" is listed twice',
      "Teachers row 4: Name is empty",
      'Teachers row 5: Department is empty for "Meera Das"',
      'Rooms row 2: Type must be "classroom" or "lab", got "hall"',
      'Sections row 2: Lab Batches must be a whole number ≥ 1, got "0"',
      'Courses row 2: Lectures/Week must be a whole number ≥ 0, got "2.5"',
      'Courses row 2: lab room "CSE Room A" not found in Rooms sheet',
      'Courses row 2: batch teacher "Nobody" not found in Teachers sheet',
      'Courses row 3: needs at least one lecture or lab session per week',
      'Courses row 4: lab "CSE Lab" belongs to another department than section "Physics 1"',
      'Courses row 5: section "Nowhere" not found in Sections sheet',
      "Courses row 5: Subject is empty",
      "Courses row 5: Teacher is empty",
      'Courses row 6: "Optics" is listed twice for "Physics 1"',
    ]);
  });

  it("rejects a classroom as lab room and a wrong number of batch teachers", () => {
    const r = parseWorkbook(
      college({ Courses: [["CSE A", "Data Structures", "Dr. Anita Sharma", 3, 1, 2, "Seminar Hall", "Prof. Ravi Iyer"]] }),
    );
    expect(errorsOf(r)).toEqual([
      'Courses row 2: "Seminar Hall" is a classroom, not a lab',
      'Courses row 2: Batch Teachers lists 1 name(s) but "CSE A" has 2 batch(es)',
    ]);
  });

  it("defaults lab length to 2 when labs are given without a length", () => {
    const r = parseWorkbook(college({ Courses: [["CSE A", "Data Structures", "Dr. Anita Sharma", 3, 1, "", "", ""]] }));
    expect(r.ok && r.data.courses[0].labLength).toBe(2);
  });
});

describe("template and export", () => {
  it("the downloadable template parses with no errors", () => {
    const r = parseWorkbook(templateWorkbook());
    expect(errorsOf(r)).toEqual([]);
    expect(r.ok && r.data.courses).toHaveLength(2);
  });

  it("sample college round-trips through Excel with the same sessions", () => {
    const wb = XLSX.read(XLSX.write(toWorkbook(sampleCollege), { type: "array", bookType: "xlsx" }), { type: "array" });
    const r = parseWorkbook(wb);
    expect(errorsOf(r)).toEqual([]);
    if (!r.ok) return;
    const shape = (d: typeof r.data) => {
      const teacher = new Map(d.teachers.map((t) => [t.id, t.name]));
      const section = new Map(d.sections.map((s) => [s.id, s.name]));
      return expandSessions(d).map((s) => [section.get(s.sectionId), s.kind, s.batch, s.length, teacher.get(s.teacherId)]);
    };
    expect(shape(r.data)).toEqual(shape(sampleCollege));
    expect(r.data.rooms.map((x) => [x.name, x.type, x.departmentId === null])).toEqual(
      sampleCollege.rooms.map((x) => [x.name, x.type, x.departmentId === null]),
    );
  });
});

describe("readFiles", () => {
  const file = (name: string, content: string | Uint8Array) => ({
    name,
    arrayBuffer: async () => (typeof content === "string" ? new TextEncoder().encode(content) : content).buffer as ArrayBuffer,
  });

  it("turns CSVs named like the sheets into one workbook", async () => {
    const wb = await readFiles([
      file("Teachers.csv", "Name,Department\nMeera Das,Physics\n"),
      file("rooms.csv", "Name,Type,Department\nP Room,classroom,Physics\n"),
      file("Sections.CSV", "Name,Department,Lab Batches\nPhysics 1,Physics,1\n"),
      file("Courses.csv", 'Section,Subject,Teacher,Lectures/Week\nPhysics 1,"Optics, Waves",Meera Das,3\n'),
    ]);
    const r = parseWorkbook(wb);
    expect(errorsOf(r)).toEqual([]);
    expect(r.ok && r.data.courses[0].subject).toBe("Optics, Waves");
  });

  it("reads an .xlsx file", async () => {
    const bytes = new Uint8Array(XLSX.write(templateWorkbook(), { type: "array", bookType: "xlsx" }));
    const wb = await readFiles([file("college.xlsx", bytes)]);
    expect(wb.SheetNames).toEqual(["Teachers", "Rooms", "Sections", "Courses"]);
  });
});
