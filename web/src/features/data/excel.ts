import * as XLSX from "xlsx";
import type { Course, Department, Id, Room, Section, Teacher } from "@/domain/types";

/** The five entity tables the Data step edits (settings live in step ①). */
export interface CollegeData {
  departments: Department[];
  teachers: Teacher[];
  rooms: Room[];
  sections: Section[];
  courses: Course[];
}

export type ImportResult = { ok: true; data: CollegeData } | { ok: false; errors: string[] };

export const SHEETS = {
  Teachers: ["Name", "Department"],
  Rooms: ["Name", "Type", "Department"],
  Sections: ["Name", "Department", "Lab Batches"],
  Courses: ["Section", "Subject", "Teacher", "Lectures/Week", "Lab Sessions/Week", "Lab Length", "Lab Room", "Batch Teachers"],
} as const;

type SheetName = keyof typeof SHEETS;

/** Two example rows per sheet; also a valid college on its own. */
export const TEMPLATE_ROWS: Record<SheetName, (string | number)[][]> = {
  Teachers: [
    ["Dr. Anita Sharma", "CSE"],
    ["Prof. Ravi Iyer", "ECE"],
  ],
  Rooms: [
    ["CSE Room A", "classroom", "CSE"],
    ["Central Lab 1", "lab", ""],
  ],
  Sections: [
    ["CSE A", "CSE", 2],
    ["ECE A", "ECE", 1],
  ],
  Courses: [
    ["CSE A", "Data Structures", "Dr. Anita Sharma", 3, 1, 2, "Central Lab 1", "Dr. Anita Sharma, Prof. Ravi Iyer"],
    ["ECE A", "Signals & Systems", "Prof. Ravi Iyer", 4, 0, "", "", ""],
  ],
};

/** Lowercase, dash-separated id from a name: "Dr. Anita Sharma" → "dr-anita-sharma". */
export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "item"
  );
}

/** slugify, adding -2, -3… until the id is not in `taken`. Adds the result to `taken`. */
export function uniqueId(name: string, taken: Set<string>): string {
  const base = slugify(name);
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  taken.add(id);
  return id;
}

/** Key for matching names across sheets: case and spacing don't matter. */
const key = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

function sheetRows(wb: XLSX.WorkBook, name: SheetName): Record<string, string>[] | null {
  const sheetName = wb.SheetNames.find((n) => key(n) === key(name));
  if (!sheetName) return null;
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName], { defval: "", raw: false });
  // Normalise header spelling so "lab batches " matches "Lab Batches".
  return raw
    .map((row) => {
      // Missing optional columns read as blank.
      const out: Record<string, string> = Object.fromEntries(SHEETS[name].map((h) => [h, ""]));
      for (const [h, v] of Object.entries(row)) {
        const header = SHEETS[name].find((x) => key(x) === key(h));
        if (header) out[header] = String(v ?? "").trim();
      }
      return out;
    })
    .filter((row) => Object.values(row).some((v) => v !== ""));
}

/** Parse a workbook in the template format. All-or-nothing: any row error means no data. */
export function parseWorkbook(wb: XLSX.WorkBook): ImportResult {
  const errors: string[] = [];
  const sheets = {} as Record<SheetName, Record<string, string>[]>;
  for (const name of Object.keys(SHEETS) as SheetName[]) {
    const rows = sheetRows(wb, name);
    if (rows === null) errors.push(`Missing sheet "${name}" (expected columns: ${SHEETS[name].join(", ")})`);
    sheets[name] = rows ?? [];
  }
  if (errors.length) return { ok: false, errors };

  // Rows are numbered as Excel shows them: header is row 1.
  const err = (sheet: SheetName, i: number, msg: string) => errors.push(`${sheet} row ${i + 2}: ${msg}`);
  const wholeNumber = (sheet: SheetName, i: number, col: string, value: string, fallback: number, min: number) => {
    if (value === "") return fallback;
    const n = Number(value);
    if (!Number.isInteger(n) || n < min) {
      err(sheet, i, `${col} must be a whole number ≥ ${min}, got "${value}"`);
      return fallback;
    }
    return n;
  };

  // Departments come from every name mentioned in Teachers, Rooms and Sections.
  const departments: Department[] = [];
  const deptByKey = new Map<string, Id>();
  const deptIds = new Set<string>();
  const department = (name: string): Id => {
    let id = deptByKey.get(key(name));
    if (!id) {
      id = uniqueId(name, deptIds);
      deptByKey.set(key(name), id);
      departments.push({ id, name: name.trim() });
    }
    return id;
  };

  const teachers: Teacher[] = [];
  const teacherByKey = new Map<string, Id>();
  const teacherIds = new Set<string>();
  sheets.Teachers.forEach((row, i) => {
    const { Name: name, Department: dept } = row;
    if (!name) return err("Teachers", i, "Name is empty");
    if (!dept) return err("Teachers", i, `Department is empty for "${name}"`);
    if (teacherByKey.has(key(name))) return err("Teachers", i, `teacher "${name}" is listed twice`);
    const id = uniqueId(name, teacherIds);
    teacherByKey.set(key(name), id);
    teachers.push({ id, name, departmentId: department(dept) });
  });

  const rooms: Room[] = [];
  const roomByKey = new Map<string, Room>();
  const roomIds = new Set<string>();
  sheets.Rooms.forEach((row, i) => {
    const { Name: name, Type: type, Department: dept } = row;
    if (!name) return err("Rooms", i, "Name is empty");
    const t = type.toLowerCase();
    if (t !== "classroom" && t !== "lab") return err("Rooms", i, `Type must be "classroom" or "lab", got "${type}"`);
    if (roomByKey.has(key(name))) return err("Rooms", i, `room "${name}" is listed twice`);
    const room: Room = { id: uniqueId(name, roomIds), name, type: t, departmentId: dept ? department(dept) : null };
    roomByKey.set(key(name), room);
    rooms.push(room);
  });

  const sections: Section[] = [];
  const sectionByKey = new Map<string, Section>();
  const sectionIds = new Set<string>();
  sheets.Sections.forEach((row, i) => {
    const { Name: name, Department: dept } = row;
    if (!name) return err("Sections", i, "Name is empty");
    if (!dept) return err("Sections", i, `Department is empty for "${name}"`);
    if (sectionByKey.has(key(name))) return err("Sections", i, `section "${name}" is listed twice`);
    const batches = wholeNumber("Sections", i, "Lab Batches", row["Lab Batches"], 1, 1);
    const section: Section = { id: uniqueId(name, sectionIds), name, departmentId: department(dept), batches };
    sectionByKey.set(key(name), section);
    sections.push(section);
  });

  const courses: Course[] = [];
  const courseIds = new Set<string>();
  const seenCourses = new Set<string>();
  sheets.Courses.forEach((row, i) => {
    const before = errors.length;
    const section = sectionByKey.get(key(row.Section));
    if (!row.Section) err("Courses", i, "Section is empty");
    else if (!section) err("Courses", i, `section "${row.Section}" not found in Sections sheet`);
    if (!row.Subject) err("Courses", i, "Subject is empty");
    const teacherId = teacherByKey.get(key(row.Teacher));
    if (!row.Teacher) err("Courses", i, "Teacher is empty");
    else if (!teacherId) err("Courses", i, `teacher "${row.Teacher}" not found in Teachers sheet`);

    const lecturesPerWeek = wholeNumber("Courses", i, "Lectures/Week", row["Lectures/Week"], 0, 0);
    const labSessionsPerWeek = wholeNumber("Courses", i, "Lab Sessions/Week", row["Lab Sessions/Week"], 0, 0);
    const labLength = wholeNumber("Courses", i, "Lab Length", row["Lab Length"], labSessionsPerWeek > 0 ? 2 : 1, 1);
    if (errors.length === before && lecturesPerWeek + labSessionsPerWeek === 0) {
      err("Courses", i, "needs at least one lecture or lab session per week");
    }

    let labRoomId: Id | null = null;
    if (row["Lab Room"]) {
      const room = roomByKey.get(key(row["Lab Room"]));
      if (!room) err("Courses", i, `lab room "${row["Lab Room"]}" not found in Rooms sheet`);
      else if (room.type !== "lab") err("Courses", i, `"${room.name}" is a classroom, not a lab`);
      else if (section && room.departmentId !== null && room.departmentId !== section.departmentId) {
        err("Courses", i, `lab "${room.name}" belongs to another department than section "${section.name}"`);
      } else labRoomId = room.id;
    }

    let batchTeacherIds: Id[] | null = null;
    if (row["Batch Teachers"]) {
      const names = row["Batch Teachers"].split(",").map((s) => s.trim()).filter(Boolean);
      const ids = names.map((n) => {
        const id = teacherByKey.get(key(n));
        if (!id) err("Courses", i, `batch teacher "${n}" not found in Teachers sheet`);
        return id;
      });
      if (section && names.length !== section.batches) {
        err("Courses", i, `Batch Teachers lists ${names.length} name(s) but "${section.name}" has ${section.batches} batch(es)`);
      }
      if (ids.every(Boolean)) batchTeacherIds = ids as Id[];
    }

    if (section && row.Subject) {
      const k = `${section.id}|${key(row.Subject)}`;
      if (seenCourses.has(k)) err("Courses", i, `"${row.Subject}" is listed twice for "${section.name}"`);
      seenCourses.add(k);
    }
    if (errors.length > before || !section || !teacherId) return;
    courses.push({
      id: uniqueId(`${section.id}-${row.Subject}`, courseIds),
      sectionId: section.id,
      subject: row.Subject,
      teacherId,
      lecturesPerWeek,
      labSessionsPerWeek,
      labLength,
      labRoomId,
      batchTeacherIds,
    });
  });

  if (errors.length) return { ok: false, errors };
  return { ok: true, data: { departments, teachers, rooms, sections, courses } };
}

/** Build a workbook from data (used for both the template and "export current data"). */
export function toWorkbook(data: CollegeData): XLSX.WorkBook {
  const name = <T extends { id: Id; name: string }>(list: T[], id: Id | null | undefined) =>
    list.find((x) => x.id === id)?.name ?? "";
  const rows: Record<SheetName, (string | number)[][]> = {
    Teachers: data.teachers.map((t) => [t.name, name(data.departments, t.departmentId)]),
    Rooms: data.rooms.map((r) => [r.name, r.type, name(data.departments, r.departmentId)]),
    Sections: data.sections.map((s) => [s.name, name(data.departments, s.departmentId), s.batches]),
    Courses: data.courses.map((c) => [
      name(data.sections, c.sectionId),
      c.subject,
      name(data.teachers, c.teacherId),
      c.lecturesPerWeek,
      c.labSessionsPerWeek,
      c.labSessionsPerWeek > 0 ? c.labLength : "",
      name(data.rooms, c.labRoomId),
      (c.batchTeacherIds ?? []).map((id) => name(data.teachers, id)).join(", "),
    ]),
  };
  return rowsToWorkbook(rows);
}

export function templateWorkbook(): XLSX.WorkBook {
  return rowsToWorkbook(TEMPLATE_ROWS);
}

function rowsToWorkbook(rows: Record<SheetName, (string | number)[][]>): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  for (const sheet of Object.keys(SHEETS) as SheetName[]) {
    const ws = XLSX.utils.aoa_to_sheet([[...SHEETS[sheet]], ...rows[sheet]]);
    ws["!cols"] = SHEETS[sheet].map((h) => ({ wch: Math.max(14, h.length + 2) }));
    XLSX.utils.book_append_sheet(wb, ws, sheet);
  }
  return wb;
}

/**
 * Read uploaded files into one workbook: an .xlsx/.xls as-is, or CSVs where each file name
 * (e.g. "Teachers.csv") becomes the sheet name. Mixed uploads are merged sheet by sheet.
 */
export async function readFiles(files: { name: string; arrayBuffer: () => Promise<ArrayBuffer> }[]): Promise<XLSX.WorkBook> {
  const wb = XLSX.utils.book_new();
  for (const file of files) {
    const buf = new Uint8Array(await file.arrayBuffer());
    if (/\.csv$/i.test(file.name)) {
      const text = new TextDecoder().decode(buf);
      const csv = XLSX.read(text, { type: "string" });
      const sheetName = file.name.replace(/\.csv$/i, "").replace(/^.*[\\/]/, "");
      XLSX.utils.book_append_sheet(wb, csv.Sheets[csv.SheetNames[0]], sheetName.slice(0, 31));
    } else {
      const book = XLSX.read(buf, { type: "array" });
      for (const n of book.SheetNames) {
        if (!wb.SheetNames.includes(n)) XLSX.utils.book_append_sheet(wb, book.Sheets[n], n);
      }
    }
  }
  return wb;
}

export function downloadWorkbook(wb: XLSX.WorkBook, fileName: string) {
  XLSX.writeFile(wb, fileName);
}
