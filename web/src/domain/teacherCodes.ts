import type { Course, Id, Teacher } from "./types";

// Teacher names are the only personal data in the college data, and an imported teacher's id is a slug of the name
// (`dr-anita-sharma`), so neither may reach the server: the solver (/solve) and the assistant's model see a code per
// teacher instead, e.g. `T-K3X9Q`. It is a hash of the id, so it stays the same while teachers are added, removed or
// reordered.

const CODE_LENGTH = 5;

/** FNV-1a, 32 bits: small, sync and stable. Only needs to spread ids, not resist anyone. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function code(id: Id, attempt = 0): string {
  const h = hash(attempt === 0 ? id : `${id}#${attempt}`).toString(36).toUpperCase();
  return `T-${h.padStart(CODE_LENGTH, "0").slice(-CODE_LENGTH)}`;
}

/** Each teacher's code by id. Ids are taken in sorted order, so a rare clash resolves the same way every time. */
export function teacherCodes(teachers: Pick<Teacher, "id">[]): Map<Id, string> {
  const codes = new Map<Id, string>();
  const taken = new Set<string>();
  for (const id of teachers.map((t) => t.id).sort()) {
    if (codes.has(id)) continue;
    let c = code(id);
    for (let attempt = 1; taken.has(c); attempt++) c = code(id, attempt);
    codes.set(id, c);
    taken.add(c);
  }
  return codes;
}

/**
 * The data with every teacher id and name replaced by its code, in teachers and courses alike, so whatever the
 * tools build from it (labels, data checks, causes) carries codes only. A course pointing at a missing teacher gets
 * a code too.
 */
export function maskTeachers<T extends { teachers: Teacher[]; courses: Course[] }>(data: T, codes: Map<Id, string>): T {
  const of = (id: Id) => codes.get(id) ?? code(id);
  return {
    ...data,
    teachers: data.teachers.map((t) => ({ ...t, id: of(t.id), name: of(t.id) })),
    courses: data.courses.map((c) => ({
      ...c,
      teacherId: of(c.teacherId),
      ...(c.batchTeacherIds ? { batchTeacherIds: c.batchTeacherIds.map(of) } : {}),
    })),
  };
}
