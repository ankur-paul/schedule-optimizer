"""Independent reference for checking the CP-SAT solver: a scorer and a brute-force optimiser for tiny inputs.

Written from the rules in PLAN.md §2 and the web scorer (web/src/domain/score.ts), not from solver.py, so the
two can't share a bug. Only `expand_sessions` is shared (it has its own golden-file test).
"""

from collections import defaultdict
from dataclasses import dataclass

from models import Placement, SolveInput
from sessions import expand_sessions

WEIGHTS = {"subject_repeat": 10, "teacher_overload": 5, "section_gaps": 2, "batch_idle": 3, "late_finish": 1}
SWITCH = {"subject_repeat": "s1", "teacher_overload": "s2", "section_gaps": "s3", "batch_idle": "s4", "late_finish": "s5"}


def reference_score(inp: SolveInput, placements: list[Placement]) -> dict[str, int | None]:
    """Weighted S1–S5 breakdown (None for a rule that's off) plus "total", computed the way score.ts does."""
    sessions = {s.id: s for s in expand_sessions(inp)}
    periods = inp.settings.periods
    teaching = [p.kind == "teaching" for p in periods]
    lunch = set(inp.settings.lunch_candidates)
    days = len(inp.settings.days)

    teacher_busy = defaultdict(set)  # (teacher, day) -> period ids
    section_cells = defaultdict(list)  # (section, day, period) -> sessions
    for pl in placements:
        s = sessions[pl.session_id]
        for k in range(s.length):
            teacher_busy[s.teacher_id, pl.day].add(pl.period + k)
            section_cells[s.section_id, pl.day, pl.period + k].append(s)

    # S1: lectures of one course beyond the first on a day.
    per_course_day = defaultdict(int)
    for pl in placements:
        s = sessions[pl.session_id]
        if s.kind == "lecture":
            per_course_day[s.course_id, pl.day] += 1
    subject_repeat = sum(max(0, n - 1) for n in per_course_day.values())

    # S2: each busy teaching period that is the 4th+ in an unbroken run.
    teacher_overload = 0
    for busy in teacher_busy.values():
        run = 0
        for p in range(len(periods)):
            run = run + 1 if teaching[p] and p in busy else 0
            if run > 3:
                teacher_overload += 1

    # S3: idle teaching periods strictly between a section's first and last class, lunch candidates excluded.
    section_gaps = 0
    for sec in inp.sections:
        for d in range(days):
            busy = [teaching[p] and bool(section_cells.get((sec.id, d, p))) for p in range(len(periods))]
            if True not in busy:
                continue
            first, last = busy.index(True), len(busy) - 1 - busy[::-1].index(True)
            section_gaps += sum(1 for p in range(first + 1, last) if teaching[p] and not busy[p] and p not in lunch)

    # S4: in a split section, each batch with nothing on while some batch is in a lab.
    batch_idle = 0
    for sec in inp.sections:
        if sec.batches <= 1:
            continue
        for d in range(days):
            for p in range(len(periods)):
                cell = section_cells.get((sec.id, d, p), [])
                if not teaching[p] or not any(s.kind == "lab" and s.batch is not None for s in cell):
                    continue
                for b in range(1, sec.batches + 1):
                    if not any(s.batch is None or s.batch == b for s in cell):
                        batch_idle += 1

    # S5: per section-day and teacher-day, free teaching periods before the last class; a free lunch candidate among
    # them is excused (only one, however many there are).
    def late(busy_at) -> int:
        taught = [p for p in range(len(periods)) if teaching[p] and busy_at(p)]
        if not taught:
            return 0
        free = [p for p in range(taught[-1]) if teaching[p] and not busy_at(p)]
        return len(free) - min(1, len([p for p in free if p in lunch]))

    late_finish = 0
    for d in range(days):
        for sec in inp.sections:
            late_finish += late(lambda p: bool(section_cells.get((sec.id, d, p))))
        for tid in {s.teacher_id for s in sessions.values()}:
            late_finish += late(lambda p: p in teacher_busy.get((tid, d), set()))

    counts = {
        "subject_repeat": subject_repeat,
        "teacher_overload": teacher_overload,
        "section_gaps": section_gaps,
        "batch_idle": batch_idle,
        "late_finish": late_finish,
    }
    on = inp.soft_rules.model_dump(by_alias=False)
    out = {k: n * WEIGHTS[k] if on[SWITCH[k]] else None for k, n in counts.items()}
    out["total"] = sum(v or 0 for v in out.values())
    return out


@dataclass
class BruteForce:
    best: int | None  # None = no valid timetable
    placements: list[Placement]
    explored: int  # complete hard-valid timetables scored


def brute_force(inp: SolveInput, limit: int = 2_000_000) -> BruteForce:
    """Try every placement of every session (backtracking on H1–H4, H6, H7, locks; H8 checked at the leaves).

    Lunch semantics follow the web validator: a lunch candidate that is a break period always counts as free.
    Raises if the search would visit more than `limit` nodes, so a test can't silently hang.
    """
    sessions = expand_sessions(inp)
    periods = inp.settings.periods
    days = len(inp.settings.days)
    dept_of = {s.id: s.department_id for s in inp.sections}
    locks = {lock.session_id: lock for lock in inp.locks}
    lunch = [p for p in inp.settings.lunch_candidates if 0 <= p < len(periods)]

    def options(s):
        rooms = [
            r for r in inp.rooms
            if r.type == s.room_type
            and r.department_id in (None, dept_of[s.section_id])
            and (s.fixed_room_id is None or r.id == s.fixed_room_id)
        ]
        starts = [
            p for p in range(len(periods))
            if s.length > 0 and p + s.length <= len(periods)
            and all(periods[p + k].kind == "teaching" for k in range(s.length))
        ]
        opts = [(d, p, r.id) for d in range(days) for p in starts for r in rooms]
        if s.id in locks:
            lk = locks[s.id]
            opts = [o for o in opts if o == (lk.day, lk.period, lk.room_id)]
        return opts

    opts = {s.id: options(s) for s in sessions}
    # Identical sessions (e.g. lectures L1, L2 of one course) are interchangeable, so only try them in increasing
    # option order. Groups with a locked member are left alone (the lock may pin a later copy to an early slot).
    group = {s.id: (s.course_id, s.kind, s.batch, s.teacher_id) for s in sessions}
    locked_groups = {group[sid] for sid in locks if sid in group}
    # Most constrained first keeps the tree small; group members stay together, in id order.
    order = sorted(sessions, key=lambda s: (len(opts[s.id]), group[s.id], s.id))
    prev_in_group = {}
    for a, b in zip(order, order[1:]):
        if group[a.id] == group[b.id] and group[b.id] not in locked_groups:
            prev_in_group[b.id] = a.id
    chosen_index: dict[str, int] = {}
    if any(lock_id not in opts for lock_id in locks):
        return BruteForce(None, [], 0)

    teacher, room = set(), set()
    section = defaultdict(list)  # (section, d, t) -> batches
    chosen: list[Placement] = []
    best = BruteForce(None, [], 0)
    nodes = 0

    def lunch_ok() -> bool:
        if not lunch:
            return True
        for d in range(days):
            for sec in inp.sections:
                if all(section.get((sec.id, d, t)) for t in lunch):
                    return False
            for tid in {s.teacher_id for s in sessions}:
                if all((tid, d, t) in teacher for t in lunch):
                    return False
        return True

    def go(i: int) -> None:
        nonlocal nodes
        nodes += 1
        if nodes > limit:
            raise RuntimeError("brute force search too large; shrink the instance")
        if i == len(order):
            if not lunch_ok():
                return
            best.explored += 1
            total = reference_score(inp, chosen)["total"]
            if best.best is None or total < best.best:
                best.best = total
                best.placements = list(chosen)
            return
        s = order[i]
        first = chosen_index[prev_in_group[s.id]] + 1 if s.id in prev_in_group else 0
        for idx in range(first, len(opts[s.id])):
            d, p, r = opts[s.id][idx]
            span = range(p, p + s.length)
            if any((s.teacher_id, d, t) in teacher or (r, d, t) in room for t in span):
                continue
            clash = False
            for t in span:
                for other in section.get((s.section_id, d, t), []):
                    if s.batch is None or other is None or other == s.batch:
                        clash = True
            if clash:
                continue
            for t in span:
                teacher.add((s.teacher_id, d, t))
                room.add((r, d, t))
                section[s.section_id, d, t].append(s.batch)
            chosen.append(Placement(session_id=s.id, day=d, period=p, room_id=r))
            chosen_index[s.id] = idx
            go(i + 1)
            chosen.pop()
            for t in span:
                teacher.discard((s.teacher_id, d, t))
                room.discard((r, d, t))
                section[s.section_id, d, t].pop()

    go(0)
    return best
