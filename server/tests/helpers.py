"""Tiny-input builder and an independent hard-rule checker for solver tests."""

from collections import defaultdict

from models import SolveInput, SolveResult
from sessions import expand_sessions


def tiny(
    periods: str = "TTT",
    days: int = 1,
    lunch: list[int] | None = None,
    rooms: list[dict] | None = None,
    sections: list[dict] | None = None,
    courses: list[dict] | None = None,
    teachers: int = 2,
    locks: list[dict] | None = None,
) -> SolveInput:
    """Build a small SolveInput. `periods` is a string of T (teaching) / B (break), one char per period."""
    return SolveInput.model_validate(
        {
            "settings": {
                "days": ["Mon", "Tue", "Wed", "Thu", "Fri"][:days],
                "periods": [
                    {"id": i, "label": f"P{i}", "start": "09:00", "end": "10:00",
                     "kind": "teaching" if c == "T" else "break"}
                    for i, c in enumerate(periods)
                ],
                "lunchCandidates": lunch or [],
            },
            "departments": [{"id": "d1", "name": "D1"}, {"id": "d2", "name": "D2"}],
            "teachers": [{"id": f"t{i}", "name": f"T{i}", "departmentId": "d1"} for i in range(1, teachers + 1)],
            "rooms": rooms if rooms is not None else [{"id": "r1", "name": "R1", "type": "classroom", "departmentId": None}],
            "sections": sections or [{"id": "s1", "name": "S1", "departmentId": "d1", "batches": 1}],
            "courses": courses or [],
            "locks": locks or [],
            "options": {"timeLimitSec": 5, "seed": 1},
        }
    )


def course(id: str, lectures: int = 0, labs: int = 0, lab_length: int = 2, teacher: str = "t1",
           section: str = "s1", **extra) -> dict:
    return {"id": id, "sectionId": section, "subject": id, "teacherId": teacher, "lecturesPerWeek": lectures,
            "labSessionsPerWeek": labs, "labLength": lab_length, **extra}


def hard_violations(inp: SolveInput, res: SolveResult) -> list[str]:
    """Re-check H1–H8 from scratch (does not share code with the solver beyond session expansion)."""
    sessions = {s.id: s for s in expand_sessions(inp)}
    sections = {s.id: s for s in inp.sections}
    rooms = {r.id: r for r in inp.rooms}
    periods = inp.settings.periods
    errors: list[str] = []

    seen = defaultdict(int)
    for pl in res.placements:
        seen[pl.session_id] += 1
    for sid in sessions:
        if seen[sid] != 1:
            errors.append(f"H5 {sid} placed {seen[sid]} times")

    teacher_slots, room_slots = defaultdict(list), defaultdict(list)
    section_slots = defaultdict(list)  # (section, d, t) -> batches (None = whole)
    for pl in res.placements:
        s = sessions[pl.session_id]
        room = rooms[pl.room_id]
        dept = sections[s.section_id].department_id
        if room.type != s.room_type or room.department_id not in (None, dept) or (
            s.fixed_room_id and room.id != s.fixed_room_id
        ):
            errors.append(f"H4 {s.id} in {room.id}")
        for k in range(s.length):
            t = pl.period + k
            if t >= len(periods) or periods[t].kind != "teaching":
                errors.append(f"H6/H7 {s.id} covers non-teaching period {t}")
            teacher_slots[s.teacher_id, pl.day, t].append(s.id)
            room_slots[pl.room_id, pl.day, t].append(s.id)
            section_slots[s.section_id, pl.day, t].append(s.batch)

    errors += [f"H1 {k}: {v}" for k, v in teacher_slots.items() if len(v) > 1]
    errors += [f"H3 {k}: {v}" for k, v in room_slots.items() if len(v) > 1]
    for k, batches in section_slots.items():
        if len(batches) > 1 and (None in batches or len(set(batches)) < len(batches)):
            errors.append(f"H2 {k}: {batches}")

    lunch = inp.settings.lunch_candidates
    if lunch:
        for d in range(len(inp.settings.days)):
            for sec in inp.sections:
                if all(section_slots.get((sec.id, d, t)) for t in lunch):
                    errors.append(f"H8 section {sec.id} day {d}")
            for teacher in inp.teachers:
                if all(teacher_slots.get((teacher.id, d, t)) for t in lunch):
                    errors.append(f"H8 teacher {teacher.id} day {d}")
    return errors
