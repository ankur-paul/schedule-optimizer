import { eligibleRooms, teachingPeriods } from "@/domain/eligibility";
import { expandSessions } from "@/domain/sessions";
import type { Id, Settings } from "@/domain/types";
import type { CollegeData } from "./excel";

export interface Load {
  id: Id;
  name: string;
  required: number;  // periods per week this section/teacher must be busy (lower bound)
  available: number; // teaching periods per week, minus one lunch period per day
}

export interface DataReport {
  /** Problems that make generating impossible or meaningless. Block "Next". */
  errors: string[];
  /** Likely-infeasible input; generating still works but some sessions may stay unplaced. */
  warnings: string[];
  sections: Load[];
  teachers: Load[];
}

/** Check the college data against itself and the week settings. Pure; runs on every render. */
export function checkData(data: CollegeData, settings: Settings): DataReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const deptIds = new Set(data.departments.map((d) => d.id));
  const teacherIds = new Set(data.teachers.map((t) => t.id));
  const sectionById = new Map(data.sections.map((s) => [s.id, s]));
  const roomById = new Map(data.rooms.map((r) => [r.id, r]));

  if (data.courses.length === 0) errors.push("Add at least one course (or load the sample college).");

  for (const t of data.teachers) {
    if (!t.name.trim()) errors.push("A teacher has no name.");
    if (!deptIds.has(t.departmentId)) errors.push(`Teacher "${t.name}" has no department.`);
  }
  for (const r of data.rooms) {
    if (!r.name.trim()) errors.push("A room has no name.");
    if (r.departmentId !== null && !deptIds.has(r.departmentId)) errors.push(`Room "${r.name}" has an unknown department.`);
  }
  for (const s of data.sections) {
    if (!s.name.trim()) errors.push("A section has no name.");
    if (!deptIds.has(s.departmentId)) errors.push(`Section "${s.name}" has no department.`);
    if (!Number.isInteger(s.batches) || s.batches < 1) errors.push(`Section "${s.name}" needs at least 1 lab batch.`);
  }

  let maxLabLength = 0;
  for (let run = 0, i = 0; i < settings.periods.length; i++) {
    run = settings.periods[i].kind === "teaching" ? run + 1 : 0;
    maxLabLength = Math.max(maxLabLength, run);
  }
  const validCourses = data.courses.filter((c) => {
    const section = sectionById.get(c.sectionId);
    const label = `Course "${c.subject || "(no subject)"}"${section ? ` (${section.name})` : ""}`;
    const before = errors.length;
    if (!section) errors.push(`${label} has no section.`);
    if (!c.subject.trim()) errors.push(`${label} has no subject.`);
    if (!teacherIds.has(c.teacherId)) errors.push(`${label} has no teacher.`);
    for (const [n, v] of [["lectures", c.lecturesPerWeek], ["lab sessions", c.labSessionsPerWeek]] as const) {
      if (!Number.isInteger(v) || v < 0) errors.push(`${label}: ${n} per week must be a whole number ≥ 0.`);
    }
    if (!(c.lecturesPerWeek > 0 || c.labSessionsPerWeek > 0)) errors.push(`${label} has no lectures or labs.`);
    if (c.labSessionsPerWeek > 0) {
      if (!Number.isInteger(c.labLength) || c.labLength < 1) errors.push(`${label}: lab length must be at least 1.`);
      else if (c.labLength > maxLabLength) {
        errors.push(`${label}: a ${c.labLength}-period lab can't fit; the longest run without a break is ${maxLabLength}.`);
      }
      const room = c.labRoomId ? roomById.get(c.labRoomId) : undefined;
      if (c.labRoomId && (!room || room.type !== "lab")) errors.push(`${label}: its lab room is missing or not a lab.`);
      for (const id of c.batchTeacherIds ?? []) {
        if (!teacherIds.has(id)) errors.push(`${label}: a batch teacher no longer exists.`);
      }
    }
    return errors.length === before;
  });

  // Room and load checks run on the sessions of courses that passed the checks above.
  const input = { sections: data.sections, courses: validCourses, rooms: data.rooms };
  const sessions = expandSessions(input);
  const noRoom = new Set<string>();
  for (const s of sessions) {
    if (eligibleRooms(input, s).length === 0) {
      const course = data.courses.find((c) => c.id === s.courseId)!;
      const section = sectionById.get(s.sectionId)!;
      const msg = `Course "${course.subject}" (${section.name}): no ${s.roomType} it may use. Add a shared ${s.roomType} or one owned by its department.`;
      if (!noRoom.has(msg)) errors.push(msg);
      noRoom.add(msg);
    }
  }

  const lunchPerDay = settings.lunchCandidates.length > 0 ? 1 : 0;
  const available = settings.days.length * Math.max(0, teachingPeriods(settings).length - lunchPerDay);

  const sections: Load[] = data.sections.map((sec) => {
    const own = sessions.filter((s) => s.sectionId === sec.id);
    const whole = own.filter((s) => s.batch === null).reduce((n, s) => n + s.length, 0);
    // Batch labs can run side by side, so the busiest batch is the lower bound.
    let busiestBatch = 0;
    for (let b = 1; b <= sec.batches; b++) {
      busiestBatch = Math.max(busiestBatch, own.filter((s) => s.batch === b).reduce((n, s) => n + s.length, 0));
    }
    return { id: sec.id, name: sec.name, required: whole + busiestBatch, available };
  });
  const teachers: Load[] = data.teachers.map((t) => ({
    id: t.id,
    name: t.name,
    required: sessions.filter((s) => s.teacherId === t.id).reduce((n, s) => n + s.length, 0),
    available,
  }));

  for (const l of sections) {
    if (l.required > l.available) warnings.push(`Section "${l.name}" needs ${l.required} periods a week but only ${l.available} are free.`);
  }
  for (const l of teachers) {
    if (l.required > l.available) warnings.push(`${l.name} teaches ${l.required} periods a week but only ${l.available} are free.`);
  }

  return { errors, warnings, sections, teachers };
}
