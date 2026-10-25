import pytest

from solver import solve, teaching_runs, valid_starts
from tests.helpers import course, hard_violations, tiny
from tests.test_sessions import load_sample

LAB = {"id": "lab1", "name": "Lab 1", "type": "lab", "departmentId": None}
LAB2 = {"id": "lab2", "name": "Lab 2", "type": "lab", "departmentId": None}
CLASSROOM = {"id": "r1", "name": "R1", "type": "classroom", "departmentId": None}


@pytest.fixture(scope="module")
def sample_result():
    inp = load_sample()
    inp.options.time_limit_sec = 20  # 5 s ran out under load and on 4-vCPU CI runners (T48)
    return inp, solve(inp)


def placed(res):
    return {pl.session_id: pl for pl in res.placements}


# --- Sample college


def test_sample_solves_with_every_session_placed(sample_result):
    inp, res = sample_result
    assert res.engine == "cpsat"
    assert res.status in ("optimal", "feasible"), res.message
    assert len(res.placements) == 210
    assert res.unplaced == []


def test_sample_has_no_hard_violations(sample_result):
    inp, res = sample_result
    assert hard_violations(inp, res) == []


def test_sample_score_is_consistent(sample_result):
    _, res = sample_result
    b = res.score.breakdown
    assert res.score.total == b.subject_repeat + b.teacher_overload + b.section_gaps + b.batch_idle
    assert res.time_ms > 0


# --- Helpers


def test_valid_starts_respect_breaks():
    inp = tiny(periods="TTBTTT")
    assert valid_starts(inp, 1) == [0, 1, 3, 4, 5]
    assert valid_starts(inp, 2) == [0, 3, 4]
    assert valid_starts(inp, 3) == [3]
    assert valid_starts(inp, 4) == []


def test_teaching_runs_split_on_breaks():
    assert teaching_runs(tiny(periods="TTBTTTB")) == [[0, 1], [3, 4, 5]]
    assert teaching_runs(tiny(periods="BTT")) == [[1, 2]]


# --- Hard rules on tiny inputs


def test_overloaded_section_is_infeasible():
    inp = tiny(periods="TT", courses=[course("c1", lectures=2, teacher="t1"), course("c2", lectures=1, teacher="t2")])
    res = solve(inp)
    assert res.status == "infeasible"
    assert res.placements == []
    assert res.message


def test_teacher_double_booking_is_infeasible():
    # Two sections, one teacher, one slot.
    inp = tiny(
        periods="T",
        rooms=[CLASSROOM, {**CLASSROOM, "id": "r2"}],
        sections=[{"id": "s1", "name": "S1", "departmentId": "d1", "batches": 1},
                  {"id": "s2", "name": "S2", "departmentId": "d1", "batches": 1}],
        courses=[course("a", lectures=1, section="s1"), course("b", lectures=1, section="s2")],
    )
    assert solve(inp).status == "infeasible"


def test_room_double_booking_is_infeasible():
    inp = tiny(
        periods="T",
        sections=[{"id": "s1", "name": "S1", "departmentId": "d1", "batches": 1},
                  {"id": "s2", "name": "S2", "departmentId": "d1", "batches": 1}],
        courses=[course("a", lectures=1, section="s1", teacher="t1"),
                 course("b", lectures=1, section="s2", teacher="t2")],
    )
    assert solve(inp).status == "infeasible"


def test_session_without_eligible_room_reports_which():
    other_dept_room = {**CLASSROOM, "departmentId": "d2"}
    res = solve(tiny(rooms=[other_dept_room], courses=[course("c1", lectures=1)]))
    assert res.status == "infeasible"
    assert "no eligible room" in res.message
    assert [d.model_dump() for d in res.diagnosis] == [{"kind": "noSlot", "ids": ["c1:L1"], "detail": "noRoom"}]


def test_lab_longer_than_any_run_is_infeasible():
    res = solve(tiny(periods="TTBTT", rooms=[LAB], courses=[course("c1", labs=1, lab_length=3)]))
    assert res.status == "infeasible"
    assert "consecutive" in res.message


def test_lab_does_not_span_break():
    inp = tiny(periods="TBTT", rooms=[LAB], courses=[course("c1", labs=1, lab_length=2)])
    res = solve(inp)
    assert res.status == "optimal"
    assert placed(res)["c1:P1"].period == 2
    assert hard_violations(inp, res) == []


def test_department_room_ownership_and_fixed_lab():
    rooms = [
        {"id": "own", "name": "Own", "type": "classroom", "departmentId": "d1"},
        {"id": "foreign", "name": "Foreign", "type": "classroom", "departmentId": "d2"},
        LAB,
        LAB2,
    ]
    inp = tiny(rooms=rooms, courses=[course("c1", lectures=1), course("c2", labs=1, teacher="t2", labRoomId="lab2")])
    res = solve(inp)
    assert res.status == "optimal"
    p = placed(res)
    assert p["c1:L1"].room_id == "own"
    assert p["c2:P1"].room_id == "lab2"


def test_batch_labs_run_in_parallel_but_not_over_lectures():
    # 2 batches, 2 labs rooms; 2 teaching periods. Lab of length 2 for both batches must run in parallel,
    # so the lecture can't fit anywhere.
    sections = [{"id": "s1", "name": "S1", "departmentId": "d1", "batches": 2}]
    labs = course("c1", labs=1, lab_length=2, batchTeacherIds=["t1", "t2"])
    ok = tiny(periods="TT", rooms=[LAB, LAB2], sections=sections, teachers=3, courses=[labs])
    res = solve(ok)
    assert res.status == "optimal"
    assert {pl.period for pl in res.placements} == {0}
    assert hard_violations(ok, res) == []

    with_lecture = tiny(periods="TT", rooms=[LAB, LAB2, CLASSROOM], sections=sections, teachers=3,
                        courses=[labs, course("c2", lectures=1, teacher="t3")])
    assert solve(with_lecture).status == "infeasible"


def test_same_batch_cannot_double_up():
    sections = [{"id": "s1", "name": "S1", "departmentId": "d1", "batches": 2}]
    inp = tiny(periods="TT", rooms=[LAB, LAB2], sections=sections, teachers=4,
               courses=[course("c1", labs=1, lab_length=2, batchTeacherIds=["t1", "t2"]),
                        course("c2", labs=1, lab_length=1, batchTeacherIds=["t3", "t4"])])
    assert solve(inp).status == "infeasible"


def test_lunch_rule_for_sections():
    # 3 periods, lunch candidate P1: a section with 3 lectures can't take lunch.
    full = tiny(lunch=[1], courses=[course("c1", lectures=1), course("c2", lectures=1, teacher="t2"),
                                    course("c3", lectures=1, teacher="t3")], teachers=3)
    assert solve(full).status == "infeasible"
    two = tiny(lunch=[1], courses=[course("c1", lectures=1), course("c2", lectures=1, teacher="t2")])
    res = solve(two)
    assert res.status == "optimal"
    assert 1 not in {pl.period for pl in res.placements}


def test_lunch_rule_for_teachers():
    # One teacher teaching 3 sections in 3 periods: no lunch for the teacher.
    sections = [{"id": f"s{i}", "name": f"S{i}", "departmentId": "d1", "batches": 1} for i in (1, 2, 3)]
    rooms = [{**CLASSROOM, "id": f"r{i}"} for i in (1, 2, 3)]
    inp = tiny(lunch=[1], sections=sections, rooms=rooms,
               courses=[course(f"c{i}", lectures=1, section=f"s{i}") for i in (1, 2, 3)])
    assert solve(inp).status == "infeasible"


def test_lunch_counts_batch_sessions_as_busy():
    sections = [{"id": "s1", "name": "S1", "departmentId": "d1", "batches": 2}]
    inp = tiny(periods="TT", lunch=[0, 1], rooms=[LAB], sections=sections, teachers=2,
               courses=[course("c1", labs=1, lab_length=1, batchTeacherIds=["t1", "t2"])])
    # Only one lab room: B1 and B2 take P0 and P1 → section busy in every lunch candidate.
    assert solve(inp).status == "infeasible"


def test_unknown_section_returns_error():
    res = solve(tiny(courses=[course("c1", lectures=1, section="nope")]))
    assert res.status == "error"
    assert "nope" in res.message


def test_empty_input_is_optimal_with_no_placements():
    res = solve(tiny())
    assert res.status == "optimal"
    assert res.placements == []


# --- Locks


def test_lock_is_kept():
    inp = tiny(days=2, courses=[course("c1", lectures=3)],
               locks=[{"sessionId": "c1:L2", "day": 1, "period": 2, "roomId": "r1"}])
    res = solve(inp)
    assert res.status in ("optimal", "feasible")
    assert placed(res)["c1:L2"].model_dump() == {"sessionId": "c1:L2", "day": 1, "period": 2, "roomId": "r1"}
    assert hard_violations(inp, res) == []


def test_invalid_lock_is_infeasible():
    for lock in (
        {"sessionId": "ghost:L1", "day": 0, "period": 0, "roomId": "r1"},
        {"sessionId": "c1:L1", "day": 0, "period": 0, "roomId": "no-room"},
        {"sessionId": "c1:L1", "day": 0, "period": 1, "roomId": "r1"},  # break period
    ):
        res = solve(tiny(periods="TBT", courses=[course("c1", lectures=1)], locks=[lock]))
        assert res.status == "infeasible", lock
        assert "not valid placements" in res.message
        assert [(d.kind, d.ids) for d in res.diagnosis] == [("badLock", [lock["sessionId"]])]


def test_clashing_locks_are_infeasible():
    locks = [{"sessionId": f"c1:L{i}", "day": 0, "period": 0, "roomId": "r1"} for i in (1, 2)]
    assert solve(tiny(courses=[course("c1", lectures=2)], locks=locks)).status == "infeasible"


# --- Soft rules


def test_s1_spreads_lectures_across_days():
    res = solve(tiny(days=3, courses=[course("c1", lectures=3)]))
    assert res.status == "optimal"
    assert sorted(pl.day for pl in res.placements) == [0, 1, 2]
    assert res.score.total == 0


def test_s1_penalised_when_unavoidable():
    res = solve(tiny(days=1, courses=[course("c1", lectures=2)]))
    assert res.status == "optimal"
    assert res.score.breakdown.subject_repeat == 10


def test_s2_teacher_overload():
    # 4 consecutive periods, one teacher, 4 different courses: 1 period beyond 3.
    sections = [{"id": f"s{i}", "name": f"S{i}", "departmentId": "d1", "batches": 1} for i in range(1, 5)]
    rooms = [{**CLASSROOM, "id": f"r{i}"} for i in range(1, 5)]
    res = solve(tiny(periods="TTTT", sections=sections, rooms=rooms,
                     courses=[course(f"c{i}", lectures=1, section=f"s{i}") for i in range(1, 5)]))
    assert res.status == "optimal"
    assert res.score.breakdown.teacher_overload == 5


def test_s2_break_resets_run():
    sections = [{"id": f"s{i}", "name": f"S{i}", "departmentId": "d1", "batches": 1} for i in range(1, 5)]
    rooms = [{**CLASSROOM, "id": f"r{i}"} for i in range(1, 5)]
    res = solve(tiny(periods="TTBTT", sections=sections, rooms=rooms,
                     courses=[course(f"c{i}", lectures=1, section=f"s{i}") for i in range(1, 5)]))
    assert res.status == "optimal"
    assert res.score.breakdown.teacher_overload == 0


def test_s3_avoids_gaps_and_ignores_lunch():
    # Lectures locked at P0 and P2 on a 4-period day: P1 is a gap unless it is a lunch candidate.
    locks = [{"sessionId": "a:L1", "day": 0, "period": 0, "roomId": "r1"},
             {"sessionId": "b:L1", "day": 0, "period": 2, "roomId": "r1"}]
    courses = [course("a", lectures=1), course("b", lectures=1, teacher="t2")]
    assert solve(tiny(periods="TTTT", courses=courses, locks=locks)).score.breakdown.section_gaps == 2
    assert solve(tiny(periods="TTTT", lunch=[1], courses=courses, locks=locks)).score.breakdown.section_gaps == 0


def test_s4_batch_idle():
    # One lab room, so B1 and B2 take their 1-period labs one after the other; each batch idles while the
    # other is in the lab: 2 idle batch-periods x 3.
    sections = [{"id": "s1", "name": "S1", "departmentId": "d1", "batches": 2}]
    inp = tiny(periods="TT", rooms=[LAB], sections=sections,
               courses=[course("c1", labs=1, lab_length=1, batchTeacherIds=["t1", "t2"])])
    res = solve(inp)
    assert res.status == "optimal"
    assert res.score.breakdown.batch_idle == 6


def test_s4_zero_when_batch_labs_run_in_parallel():
    sections = [{"id": "s1", "name": "S1", "departmentId": "d1", "batches": 2}]
    inp = tiny(periods="TT", rooms=[LAB, LAB2], sections=sections,
               courses=[course("c1", labs=1, lab_length=1, batchTeacherIds=["t1", "t2"])])
    res = solve(inp)
    assert res.status == "optimal"
    assert res.score.total == 0
