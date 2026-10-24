import type { Course, Id, Teacher } from "@/domain/types";

// Teacher names are the only personal data (as for /solve), and an imported teacher's id is a slug of the name
// (`dr-anita-sharma`), so neither may reach the model. It sees a code per teacher instead, e.g. `T-K3X9Q`: a hash of
// the id, so it stays the same for the whole chat while teachers are added, removed or reordered.

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

// A whole word or token: not touching a letter, digit or underscore on either side.
const BEFORE = "(?<![\\p{L}\\p{N}_])";
const AFTER = "(?![\\p{L}\\p{N}_])";

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** One regex over `terms`, longest first so "Ravi Kumar" wins over "Ravi". Spaces in a term match any whitespace. */
function wholeTerms(terms: string[], flags: string): RegExp | null {
  const unique = [...new Set(terms.filter((t) => t.trim() !== ""))].sort((a, b) => b.length - a.length);
  if (unique.length === 0) return null;
  const alternatives = unique.map((t) => t.trim().split(/\s+/).map(escape).join("\\s+"));
  return new RegExp(`${BEFORE}(?:${alternatives.join("|")})${AFTER}`, `gu${flags}`);
}

/**
 * Text going to the model: each teacher name or id (whole words, any case) becomes the teacher's code. A misspelt
 * or partial name isn't caught.
 */
export function maskText(text: string, teachers: Teacher[]): string {
  const codes = teacherCodes(teachers);
  const byTerm = new Map<string, string>();
  for (const t of teachers) {
    const c = codes.get(t.id)!;
    // The first teacher with a name keeps it; a second teacher of the same name is masked to the first one's code.
    for (const term of [t.name, t.id]) {
      const key = normalise(term);
      if (key && !byTerm.has(key)) byTerm.set(key, c);
    }
  }
  const re = wholeTerms([...teachers.map((t) => t.name), ...teachers.map((t) => t.id)], "i");
  return re ? text.replace(re, (m) => byTerm.get(normalise(m)) ?? m) : text;
}

/** Text from the model, for display: each teacher code (a whole token, exact case) becomes the teacher's name. */
export function unmaskText(text: string, teachers: Teacher[]): string {
  const codes = teacherCodes(teachers);
  const names = new Map(teachers.map((t) => [codes.get(t.id)!, t.name.trim() || t.id]));
  const re = wholeTerms([...names.keys()], "");
  return re ? text.replace(re, (m) => names.get(m) ?? m) : text;
}

function normalise(term: string): string {
  return term.trim().replace(/\s+/g, " ").toLowerCase();
}
