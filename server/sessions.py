"""Expand courses into schedulable sessions. Mirrors web/src/domain/sessions.ts exactly."""

from models import Course, Session, SolveInput


def expand_sessions(inp: SolveInput) -> list[Session]:
    sections = {s.id: s for s in inp.sections}
    out: list[Session] = []
    for course in inp.courses:
        section = sections.get(course.section_id)
        if section is None:
            raise ValueError(f"Course {course.id} references unknown section {course.section_id}")
        for i in range(1, course.lectures_per_week + 1):
            out.append(
                Session(
                    id=f"{course.id}:L{i}",
                    course_id=course.id,
                    section_id=course.section_id,
                    batch=None,
                    teacher_id=course.teacher_id,
                    kind="lecture",
                    length=1,
                    room_type="classroom",
                    fixed_room_id=None,
                )
            )
        for i in range(1, course.lab_sessions_per_week + 1):
            if section.batches == 1:
                out.append(_lab(course, f"{course.id}:P{i}", None, course.teacher_id))
            else:
                for b in range(1, section.batches + 1):
                    ids = course.batch_teacher_ids
                    teacher_id = ids[b - 1] if ids and b - 1 < len(ids) and ids[b - 1] is not None else course.teacher_id
                    out.append(_lab(course, f"{course.id}:P{i}:B{b}", b, teacher_id))
    return out


def _lab(course: Course, id: str, batch: int | None, teacher_id: str) -> Session:
    return Session(
        id=id,
        course_id=course.id,
        section_id=course.section_id,
        batch=batch,
        teacher_id=teacher_id,
        kind="lab",
        length=course.lab_length,
        room_type="lab",
        fixed_room_id=course.lab_room_id,
    )
