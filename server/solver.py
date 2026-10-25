"""CP-SAT timetable solver. Rules H1–H8 / S1–S4 as in PLAN.md §2."""

import time
from collections import defaultdict

from ortools.sat.python import cp_model

from models import Diagnosis, Placement, Room, Score, ScoreBreakdown, Session, SolveInput, SolveResult
from sessions import expand_sessions

W_SUBJECT_REPEAT = 10
W_TEACHER_OVERLOAD = 5
W_SECTION_GAPS = 2
W_BATCH_IDLE = 3
W_LATE_FINISH = 1
MAX_CONSECUTIVE = 3
PROBE_TIME_LIMIT_SEC = 5.0  # locks probe, on top of the main time limit (the web client's SOLVE_GRACE_MS covers it)


def valid_starts(inp: SolveInput, length: int) -> list[int]:
    """Start period ids where `length` consecutive teaching periods fit (H6/H7). Mirrors eligibility.ts."""
    periods = inp.settings.periods
    return [
        periods[i].id
        for i in range(len(periods) - length + 1)
        if length > 0 and all(periods[i + k].kind == "teaching" for k in range(length))
    ]


def eligible_rooms(inp: SolveInput, session: Session) -> list[Room]:
    """Rooms a session may use (H4). Mirrors eligibility.ts."""
    dept = next((s.department_id for s in inp.sections if s.id == session.section_id), None)
    return [
        r
        for r in inp.rooms
        if r.type == session.room_type
        and (r.department_id is None or r.department_id == dept)
        and (session.fixed_room_id is None or r.id == session.fixed_room_id)
    ]


def teaching_runs(inp: SolveInput) -> list[list[int]]:
    """Maximal runs of consecutive teaching period ids (breaks split runs)."""
    runs: list[list[int]] = []
    current: list[int] = []
    for p in inp.settings.periods:
        if p.kind == "teaching":
            current.append(p.id)
        elif current:
            runs.append(current)
            current = []
    if current:
        runs.append(current)
    return runs


def solve(inp: SolveInput) -> SolveResult:
    t0 = time.perf_counter()

    def result(**kw) -> SolveResult:
        return SolveResult(engine="cpsat", time_ms=round((time.perf_counter() - t0) * 1000), **kw)

    try:
        sessions = expand_sessions(inp)
    except ValueError as e:
        return result(status="error", message=str(e))
    duplicates = duplicate_ids([c.id for c in inp.courses]) or duplicate_ids([s.id for s in sessions])
    if duplicates:
        return result(status="error", message="Each course needs its own id; used more than once: " + ", ".join(duplicates[:5]))

    # Proven before solving: sessions with no slot at all, locks that are not valid placements.
    diagnosis = no_slot_diagnosis(inp, sessions) + bad_lock_diagnosis(inp, sessions)
    if diagnosis:
        return result(status="infeasible", message=describe(diagnosis), diagnosis=diagnosis)

    m, x = build_model(inp, sessions)
    solver = new_solver(inp, float(inp.options.time_limit_sec or 30))
    status = solver.solve(m)

    if status == cp_model.INFEASIBLE:
        diagnosis = locks_probe(inp, sessions) if inp.locks else []
        return result(status="infeasible", message=describe(diagnosis), diagnosis=diagnosis)
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return result(
            status="error",
            message=f"CP-SAT found no solution in {solver.parameters.max_time_in_seconds:g}s "
            f"({solver.status_name(status)}).",
        )

    placements = [
        Placement(session_id=sid, day=d, period=p, room_id=r)
        for (sid, d, p, r), v in x.items()
        if solver.value(v)
    ]
    order = {s.id: i for i, s in enumerate(sessions)}
    placements.sort(key=lambda pl: order[pl.session_id])

    # Scored from the placements, not read back from the penalty variables: those are only bounded from below, so
    # in a solution found before the search finishes they can be higher than the placements deserve.
    return result(
        status="optimal" if status == cp_model.OPTIMAL else "feasible",
        placements=placements,
        score=score_placements(inp, {s.id: s for s in sessions}, placements),
    )


def new_solver(inp: SolveInput, time_limit_sec: float) -> cp_model.CpSolver:
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = time_limit_sec
    solver.parameters.num_workers = 8
    if inp.options.seed is not None:
        solver.parameters.random_seed = inp.options.seed
    solver.parameters.cp_model_probing_level = 0  # probing costs ~5s of presolve on the sample for no gain
    return solver


def no_slot_diagnosis(inp: SolveInput, sessions: list[Session]) -> list[Diagnosis]:
    """Sessions with no (day, start, room) at all. A session with neither a room nor a start is in both entries."""
    no_room = [s.id for s in sessions if not eligible_rooms(inp, s)]
    no_start = [s.id for s in sessions if not inp.settings.days or not valid_starts(inp, s.length)]
    return [
        Diagnosis(kind="noSlot", ids=ids, detail=detail)
        for detail, ids in (("noRoom", no_room), ("noStart", no_start))
        if ids
    ]


def bad_lock_diagnosis(inp: SolveInput, sessions: list[Session]) -> list[Diagnosis]:
    """Locks that are not valid placements: unknown session, day out of range, bad start or ineligible room."""
    by_id = {s.id: s for s in sessions}
    bad: list[str] = []
    for lock in inp.locks:
        s = by_id.get(lock.session_id)
        ok = (
            s is not None
            and 0 <= lock.day < len(inp.settings.days)
            and lock.period in valid_starts(inp, s.length)
            and any(r.id == lock.room_id for r in eligible_rooms(inp, s))
        )
        if not ok and lock.session_id not in bad:
            bad.append(lock.session_id)
    return [Diagnosis(kind="badLock", ids=bad)] if bad else []


def locks_probe(inp: SolveInput, sessions: list[Session]) -> list[Diagnosis]:
    """After an infeasible solve with locks: solve again without them, feasibility only, to see if they are the cause."""
    m, _ = build_model(inp, sessions, use_locks=False, objective=False)
    status = new_solver(inp, PROBE_TIME_LIMIT_SEC).solve(m)
    if status == cp_model.INFEASIBLE:
        return []  # infeasible without the locks too, so they are not the cause
    locked = list(dict.fromkeys(lock.session_id for lock in inp.locks))
    kind = "locks" if status in (cp_model.OPTIMAL, cp_model.FEASIBLE) else "locksLikely"
    return [Diagnosis(kind=kind, ids=locked)]


def describe(diagnosis: list[Diagnosis]) -> str:
    """Human fallback for `message`: counts only, the UI names the sessions from `diagnosis`."""
    parts = []
    for d in diagnosis:
        n = len(d.ids)
        if d.kind == "noSlot" and d.detail == "noRoom":
            parts.append(f"{n} session(s) cannot be placed anywhere: no eligible room.")
        elif d.kind == "noSlot":
            parts.append(f"{n} session(s) cannot be placed anywhere: not enough consecutive teaching periods.")
        elif d.kind == "badLock":
            parts.append(f"{n} locked cell(s) are not valid placements (unknown session, bad slot or ineligible room).")
        elif d.kind == "locks":
            parts.append(f"The {n} locked session(s) make it impossible; without them a timetable exists.")
        else:
            parts.append(f"The {n} locked session(s) probably make it impossible (the check without them ran out of time).")
    return " ".join(parts) or (
        "No clash-free timetable exists for this data (check teacher/section/room loads, lunch periods and locks)."
    )


def build_model(
    inp: SolveInput, sessions: list[Session], use_locks: bool = True, objective: bool = True
) -> tuple[cp_model.CpModel, dict[tuple[str, int, int, str], cp_model.IntVar]]:
    """CP-SAT model for H1–H8 (plus S1–S4 when `objective`); returns it with the x[session, day, start, room] vars.

    Assumes every session has a slot and every lock is valid (see no_slot_diagnosis / bad_lock_diagnosis).
    """
    settings = inp.settings
    days = range(len(settings.days))
    teaching = [p.id for p in settings.periods if p.kind == "teaching"]
    lunch = h8_lunch_periods(inp)
    sections = {s.id: s for s in inp.sections}
    by_id = {s.id: s for s in sessions}
    locks = inp.locks if use_locks else []

    m = cp_model.CpModel()

    # --- Decision variables: x[s, d, p, r] for valid starts and eligible rooms only (H4, H6, H7).
    x: dict[tuple[str, int, int, str], cp_model.IntVar] = {}
    y: dict[tuple[str, int, int], cp_model.IntVar] = {}  # session s starts at (d, p), any room
    y_day: dict[tuple[str, int], list] = defaultdict(list)  # (session, d) -> y vars
    occ: dict[tuple[str, int, int], list] = defaultdict(list)  # (session, d, t) -> y vars covering t
    room_occ: dict[tuple[str, int, int], list] = defaultdict(list)  # (room, d, t) -> x vars covering t
    for s in sessions:
        starts = valid_starts(inp, s.length)
        rooms = eligible_rooms(inp, s)
        for d in days:
            for p in starts:
                xs = []
                for r in rooms:
                    v = m.new_bool_var(f"x[{s.id},{d},{p},{r.id}]")
                    x[s.id, d, p, r.id] = v
                    xs.append(v)
                    for k in range(s.length):
                        room_occ[r.id, d, p + k].append(v)
                yv = m.new_bool_var(f"y[{s.id},{d},{p}]")
                m.add(yv == sum(xs))
                y[s.id, d, p] = yv
                y_day[s.id, d].append(yv)
                for k in range(s.length):
                    occ[s.id, d, p + k].append(yv)

    # --- H5: every session placed exactly once.
    starts_of: dict[str, list] = defaultdict(list)
    for (sid, _d, _p), v in y.items():
        starts_of[sid].append(v)
    for s in sessions:
        m.add_exactly_one(starts_of[s.id])

    # Symmetry breaking: interchangeable sessions (e.g. L1..L3 of a course) take slots in increasing order.
    # Skipped for groups with a locked session, since the lock may pin a later copy to an early slot.
    locked = {lock.session_id for lock in locks}
    n_periods = len(settings.periods)
    groups: dict[tuple, list[str]] = defaultdict(list)
    for s in sessions:
        groups[s.course_id, s.kind, s.batch, s.teacher_id].append(s.id)
    for sids in groups.values():
        if len(sids) < 2 or locked.intersection(sids):
            continue
        slot = [sum((d * n_periods + p) * y[sid, d, p] for d in days for p in valid_starts(inp, by_id[sid].length))
                for sid in sids]
        for a, b in zip(slot, slot[1:]):
            m.add(a < b)

    # --- Locks.
    for lock in locks:
        m.add(x[lock.session_id, lock.day, lock.period, lock.room_id] == 1)

    def occ_vars(sids: list[str], d: int, t: int) -> list:
        return [v for sid in sids for v in occ.get((sid, d, t), [])]

    def at_most(vs: list, k: int) -> None:
        if len(vs) > k:
            m.add(sum(vs) <= k)

    by_teacher: dict[str, list[str]] = defaultdict(list)
    by_section: dict[str, list[Session]] = defaultdict(list)
    for s in sessions:
        by_teacher[s.teacher_id].append(s.id)
        by_section[s.section_id].append(s)

    # --- H3: one session per room per slot.
    for vs in room_occ.values():
        if len(vs) > 1:
            m.add_at_most_one(vs)

    # --- H1 + H8 (teachers), S2 teacher overload.
    overload_terms = []
    runs = teaching_runs(inp)
    for sids in by_teacher.values():
        for d in days:
            busy = {t: occ_vars(sids, d, t) for t in teaching}
            for t in teaching:
                at_most(busy[t], 1)
            if lunch:
                at_most([v for t in lunch for v in busy[t]], len(lunch) - 1)
            if not objective:
                continue
            for run in runs:
                for i in range(len(run) - MAX_CONSECUTIVE):
                    window = [v for t in run[i : i + MAX_CONSECUTIVE + 1] for v in busy[t]]
                    if len(window) > MAX_CONSECUTIVE:
                        pen = m.new_bool_var("")
                        m.add(pen >= sum(window) - MAX_CONSECUTIVE)
                        overload_terms.append(pen)

    # --- H2 + H8 (sections), S3 section gaps, S4 batch idle.
    gap_terms = []
    idle_terms = []
    lunch_set = set(settings.lunch_candidates)  # S3 never counts a lunch candidate as a gap, even when H8 is off
    for sec_id, sec_sessions in by_section.items():
        batches = sections[sec_id].batches
        whole = [s.id for s in sec_sessions if s.batch is None]
        per_batch = {b: [s.id for s in sec_sessions if s.batch == b] for b in range(1, batches + 1)}
        for d in days:
            busy = {}
            for t in teaching:
                whole_occ = occ_vars(whole, d, t)
                if batches == 1:
                    at_most(whole_occ, 1)
                else:
                    for b in range(1, batches + 1):
                        at_most(whole_occ + occ_vars(per_batch[b], d, t), 1)
                # busy[t] == "section or any batch busy": bool sandwiched between max and sum of occupancies.
                covering = [v for s in sec_sessions for v in occ.get((s.id, d, t), [])]
                b_t = m.new_bool_var("")
                for v in covering:
                    m.add(b_t >= v)
                m.add(b_t <= sum(covering))
                busy[t] = b_t

                if objective and batches > 1:
                    batch_vars = [v for b in per_batch.values() for sid in b for v in occ.get((sid, d, t), [])]
                    if batch_vars:
                        lab_active = m.new_bool_var("")
                        for v in batch_vars:
                            m.add(lab_active >= v)
                        for b in range(1, batches + 1):
                            idle = m.new_bool_var("")
                            m.add(idle >= lab_active - sum(whole_occ + occ_vars(per_batch[b], d, t)))
                            idle_terms.append(idle)
            if lunch:
                m.add(sum(busy[t] for t in lunch) <= len(lunch) - 1)
            if not objective:
                continue

            # S3: gap at t if idle with a class before and after (lunch candidates don't count).
            before, after = {}, {}
            for i, t in enumerate(teaching):
                before[t] = m.new_bool_var("")
                if i > 0:
                    prev = teaching[i - 1]
                    m.add(before[t] >= before[prev])
                    m.add(before[t] >= busy[prev])
            for i in reversed(range(len(teaching))):
                t = teaching[i]
                after[t] = m.new_bool_var("")
                if i < len(teaching) - 1:
                    nxt = teaching[i + 1]
                    m.add(after[t] >= after[nxt])
                    m.add(after[t] >= busy[nxt])
            for t in teaching:
                if t in lunch_set:
                    continue
                gap = m.new_bool_var("")
                m.add(gap >= before[t] + after[t] - busy[t] - 1)
                gap_terms.append(gap)

    if not objective:
        return m, x

    # --- S1: more than one lecture of a course on the same day.
    repeat_terms = []
    lectures_of: dict[str, list[str]] = defaultdict(list)
    for s in sessions:
        if s.kind == "lecture":
            lectures_of[s.course_id].append(s.id)
    for sids in lectures_of.values():
        if len(sids) < 2:
            continue
        for d in days:
            extra = m.new_int_var(0, len(sids), "")
            m.add(extra >= sum(v for sid in sids for v in y_day[sid, d]) - 1)
            repeat_terms.append(extra)

    m.minimize(
        W_SUBJECT_REPEAT * sum(repeat_terms)
        + W_TEACHER_OVERLOAD * sum(overload_terms)
        + W_SECTION_GAPS * sum(gap_terms)
        + W_BATCH_IDLE * sum(idle_terms)
    )
    return m, x


def duplicate_ids(ids: list[str]) -> list[str]:
    seen: set[str] = set()
    return sorted({i for i in ids if i in seen or seen.add(i)})


def h8_lunch_periods(inp: SolveInput) -> list[int]:
    """Lunch candidates H8 has to keep one of free each day; [] when H8 can't be broken.

    Mirrors validator.ts: out-of-range candidates are ignored, and a break candidate is always free (nothing is ever
    placed in a break), so then every section and teacher already has their lunch period.
    """
    periods = inp.settings.periods
    lunch = sorted({p for p in inp.settings.lunch_candidates if 0 <= p < len(periods)})
    if any(periods[p].kind != "teaching" for p in lunch):
        return []
    return lunch


def score_placements(inp: SolveInput, sessions: dict[str, Session], placements: list[Placement]) -> Score:
    """S1–S5 of a finished timetable, computed the way the web app does (web/src/domain/score.ts)."""
    periods = inp.settings.periods
    teaching = [p.kind == "teaching" for p in periods]
    lunch = set(inp.settings.lunch_candidates)
    days = len(inp.settings.days)

    teacher_busy: dict[tuple[str, int], set[int]] = defaultdict(set)
    section_cells: dict[tuple[str, int, int], list[Session]] = defaultdict(list)
    lectures: dict[tuple[str, int], int] = defaultdict(int)
    for pl in placements:
        s = sessions[pl.session_id]
        if s.kind == "lecture":
            lectures[s.course_id, pl.day] += 1
        for k in range(s.length):
            teacher_busy[s.teacher_id, pl.day].add(pl.period + k)
            section_cells[s.section_id, pl.day, pl.period + k].append(s)

    subject_repeat = sum(n - 1 for n in lectures.values() if n > 1)

    teacher_overload = 0
    for busy in teacher_busy.values():
        run = 0
        for t in range(len(periods)):
            run = run + 1 if teaching[t] and t in busy else 0
            teacher_overload += run > MAX_CONSECUTIVE

    section_gaps = 0
    batch_idle = 0
    late_finish = 0
    for sec in inp.sections:
        for d in range(days):
            busy = [teaching[t] and bool(section_cells.get((sec.id, d, t))) for t in range(len(periods))]
            late_finish += late_finish_periods(busy, teaching, lunch)
            if any(busy):
                first, last = busy.index(True), len(busy) - 1 - busy[::-1].index(True)
                section_gaps += sum(1 for t in range(first + 1, last) if teaching[t] and not busy[t] and t not in lunch)
            if sec.batches > 1:
                for t in range(len(periods)):
                    cell = section_cells.get((sec.id, d, t), [])
                    if teaching[t] and any(s.kind == "lab" and s.batch is not None for s in cell):
                        batch_idle += sum(
                            1 for b in range(1, sec.batches + 1) if not any(s.batch in (None, b) for s in cell)
                        )

    for taught in teacher_busy.values():
        late_finish += late_finish_periods([teaching[t] and t in taught for t in range(len(periods))], teaching, lunch)

    on = inp.soft_rules
    breakdown = ScoreBreakdown(
        subject_repeat=W_SUBJECT_REPEAT * subject_repeat if on.s1 else None,
        teacher_overload=W_TEACHER_OVERLOAD * teacher_overload if on.s2 else None,
        section_gaps=W_SECTION_GAPS * section_gaps if on.s3 else None,
        batch_idle=W_BATCH_IDLE * batch_idle if on.s4 else None,
        late_finish=W_LATE_FINISH * late_finish if on.s5 else None,
    )
    total = sum(v or 0 for v in breakdown.model_dump().values())
    return Score(total=total, breakdown=breakdown)


def late_finish_periods(busy: list[bool], teaching: list[bool], lunch: set[int]) -> int:
    """S5 for one section or teacher on one day: free teaching periods before the last class, one free lunch
    candidate among them excused. `busy[t]`: they have a class in teaching period t."""
    if True not in busy:
        return 0
    last = len(busy) - 1 - busy[::-1].index(True)
    free = [t for t in range(last) if teaching[t] and not busy[t]]
    return len(free) - (1 if any(t in lunch for t in free) else 0)
