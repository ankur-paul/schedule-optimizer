import type { Course, Section, Session, SolveInput } from "./types";

/** Expand courses into schedulable sessions. Deterministic; mirrored exactly in server/sessions.py. */
export function expandSessions(input: Pick<SolveInput, "sections" | "courses">): Session[] {
  const sections = new Map<string, Section>(input.sections.map((s) => [s.id, s]));
  const out: Session[] = [];
  for (const course of input.courses) {
    const section = sections.get(course.sectionId);
    if (!section) throw new Error(`Course ${course.id} references unknown section ${course.sectionId}`);
    for (let i = 1; i <= course.lecturesPerWeek; i++) {
      out.push({
        id: `${course.id}:L${i}`,
        courseId: course.id,
        sectionId: course.sectionId,
        batch: null,
        teacherId: course.teacherId,
        kind: "lecture",
        length: 1,
        roomType: "classroom",
        fixedRoomId: null,
      });
    }
    for (let i = 1; i <= course.labSessionsPerWeek; i++) {
      if (section.batches === 1) {
        out.push(lab(course, `${course.id}:P${i}`, null, course.teacherId));
      } else {
        for (let b = 1; b <= section.batches; b++) {
          const teacherId = course.batchTeacherIds?.[b - 1] ?? course.teacherId;
          out.push(lab(course, `${course.id}:P${i}:B${b}`, b, teacherId));
        }
      }
    }
  }
  return out;
}

function lab(course: Course, id: string, batch: number | null, teacherId: string): Session {
  return {
    id,
    courseId: course.id,
    sectionId: course.sectionId,
    batch,
    teacherId,
    kind: "lab",
    length: course.labLength,
    roomType: "lab",
    fixedRoomId: course.labRoomId ?? null,
  };
}
