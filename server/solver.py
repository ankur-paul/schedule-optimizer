"""CP-SAT timetable solver. Rules H1–H8 / S1–S4 as in PLAN.md §2."""

import time
from collections import defaultdict

from ortools.sat.python import cp_model

from models import Placement, Room, Score, ScoreBreakdown, Session, SolveInput, SolveResult
from sessions import expand_sessions

W_SUBJECT_REPEAT = 10
W_TEACHER_OVERLOAD = 5
W_SECTION_GAPS = 2
W_BATCH_IDLE = 3
MAX_CONSECUTIVE = 3


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

    settings = inp.settings
    days = range(len(settings.days))
    teaching = [p.id for p in settings.periods if p.kind == "teaching"]
    lunch = [p for p in settings.lunch_candidates if p in teaching]
    sections = {s.id: s for s in inp.sections}
    by_id = {s.id: s for s in sessions}

    m = cp_model.CpModel()

    # --- Decision variables: x[s, d, p, r] for valid starts and eligible rooms only (H4, H6, H7).
    x: dict[tuple[str, int, int, str], cp_model.IntVar] = {}
    y: dict[tuple[str, int, int], cp_model.IntVar] = {}  # session s starts at (d, p), any room
    y_day: dict[tuple[str, int], list] = defaultdict(list)  # (session, d) -> y vars
    occ: dict[tuple[str, int, int], list] = defaultdict(list)  # (session, d, t) -> y vars covering t
    room_occ: dict[tuple[str, int, int], list] = defaultdict(list)  # (room, d, t) -> x vars covering t
    no_slot: list[str] = []
    for s in sessions:
        starts = valid_starts(inp, s.length)
        rooms = eligible_rooms(inp, s)
        if not starts or not rooms:
            why = "no eligible room" if not rooms else f"no {s.length} consecutive teaching periods"
            no_slot.append(f"{s.id} ({why})")
            continue
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

    if no_slot:
        return result(
            status="infeasible",
            message=f"{len(no_slot)} session(s) cannot be placed anywhere: " + ", ".join(no_slot[:5])
            + ("…" if len(no_slot) > 5 else ""),
        )

    # --- H5: every session placed exactly once.
    starts_of: dict[str, list] = defaultdict(list)
    for (sid, _d, _p), v in y.items():
        starts_of[sid].append(v)
    for s in sessions:
        m.add_exactly_one(starts_of[s.id])

    # Symmetry breaking: interchangeable sessions (e.g. L1..L3 of a course) take slots in increasing order.
    # Skipped for groups with a locked session, since the lock may pin a later copy to an early slot.
    locked = {lock.session_id for lock in inp.locks}
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
    bad_locks = []
    for lock in inp.locks:
        v = x.get((lock.session_id, lock.day, lock.period, lock.room_id))
        if v is None:
            bad_locks.append(lock.session_id)
        else:
            m.add(v == 1)
    if bad_locks:
        return result(
            status="infeasible",
            message="Locked cell(s) are not valid placements (unknown session, bad slot or ineligible room): "
            + ", ".join(bad_locks[:5]),
        )

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
    lunch_set = set(lunch)
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

                if batches > 1:
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

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = float(inp.options.time_limit_sec or 30)
    solver.parameters.num_workers = 8
    if inp.options.seed is not None:
        solver.parameters.random_seed = inp.options.seed
    solver.parameters.cp_model_probing_level = 0  # probing costs ~5s of presolve on the sample for no gain
    status = solver.solve(m)

    if status == cp_model.INFEASIBLE:
        return result(
            status="infeasible",
            message="No clash-free timetable exists for this data (check teacher/section/room loads, "
            "lunch periods and locks).",
        )
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
    order = {sid: i for i, sid in enumerate(by_id)}
    placements.sort(key=lambda pl: order[pl.session_id])

    def total(terms) -> int:
        return int(sum(solver.value(v) for v in terms))

    breakdown = ScoreBreakdown(
        subject_repeat=W_SUBJECT_REPEAT * total(repeat_terms),
        teacher_overload=W_TEACHER_OVERLOAD * total(overload_terms),
        section_gaps=W_SECTION_GAPS * total(gap_terms),
        batch_idle=W_BATCH_IDLE * total(idle_terms),
    )
    score = Score(
        total=breakdown.subject_repeat + breakdown.teacher_overload + breakdown.section_gaps + breakdown.batch_idle,
        breakdown=breakdown,
    )
    return result(
        status="optimal" if status == cp_model.OPTIMAL else "feasible",
        placements=placements,
        score=score,
    )
