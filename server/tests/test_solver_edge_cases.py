"""Edge cases for the CP-SAT solver, beyond the basics in test_solver.py.

Every feasible result is re-checked with the independent hard-rule checker (`hard_violations`) and re-scored with
the independent scorer (`reference_score`). Tests named in docs/cpsat-test-report.md under "Bugs found" were strict
xfails until those bugs were fixed.
"""

import json
import time

import pytest
from fastapi.testclient import TestClient
from ortools.sat.python import cp_model
from pydantic import ValidationError

import main
import solver as solver_module
from models import Options, Placement, SoftRules, SolveInput
from sessions import expand_sessions
from solver import duplicate_ids, h8_lunch_periods, score_placements, solve, teaching_runs, valid_starts
from tests.helpers import course, hard_violations, tiny
from tests.reference import reference_score
from tests.test_sessions import FIXTURES, load_sample

LAB = {"id": "lab1", "name": "Lab 1", "type": "lab", "departmentId": None}
LAB2 = {"id": "lab2", "name": "Lab 2", "type": "lab", "departmentId": None}
LAB3 = {"id": "lab3", "name": "Lab 3", "type": "lab", "departmentId": None}
ROOM = {"id": "r1", "name": "R1", "type": "classroom", "departmentId": None}


def room(id: str, type: str = "classroom", dept: str | None = None) -> dict:
    return {"id": id, "name": id.upper(), "type": type, "departmentId": dept}


def section(id: str = "s1", batches: int = 1, dept: str = "d1") -> dict:
    return {"id": id, "name": id.upper(), "departmentId": dept, "batches": batches}


def lock(session: str, day: int, period: int, room_id: str = "r1") -> dict:
    return {"sessionId": session, "day": day, "period": period, "roomId": room_id}


def placed(res):
    return {pl.session_id: pl for pl in res.placements}


def rules_off(inp: SolveInput, *rules: str) -> SolveInput:
    """A copy of `inp` with the named soft rules ("s1"…"s5") switched off."""
    return inp.model_copy(update={"soft_rules": inp.soft_rules.model_copy(update={r: False for r in rules})})


def raw(res, inp: SolveInput):
    """The breakdown of `res` with every rule counted, to see a rule's penalty even when it was off."""
    every = inp.model_copy(update={"soft_rules": SoftRules()})
    return score_placements(every, {s.id: s for s in expand_sessions(inp)}, res.placements).breakdown


def solved(inp: SolveInput, status: tuple[str, ...] = ("optimal",)):
    """Solve and check the result is valid: expected status, no hard violations, locks kept, honest score."""
    res = solve(inp)
    assert res.status in status, f"{res.status}: {res.message}"
    assert hard_violations(inp, res) == []
    for lk in inp.locks:
        assert lk in res.placements, f"lock {lk} moved"
    ref = reference_score(inp, res.placements)
    assert res.score.total == ref["total"], f"reported {res.score} but placements score {ref}"
    return res


def infeasible(inp: SolveInput, message_has: str | None = None, diagnosis: list[tuple] | None = None):
    """Solve and check it is infeasible; `diagnosis` lists the expected (kind, ids, detail) entries in order."""
    res = solve(inp)
    assert res.status == "infeasible", f"expected infeasible, got {res.status}"
    assert res.placements == []
    assert res.message
    assert res.diagnosis is not None, "every infeasible result carries a diagnosis, [] when no cause was found"
    if message_has:
        assert message_has in res.message, res.message
    if diagnosis is not None:
        assert [(d.kind, d.ids, d.detail) for d in res.diagnosis] == diagnosis
    return res


# --- Input shape ------------------------------------------------------------------------------------------------


class TestInputShape:
    def test_no_courses_is_optimal_and_empty(self):
        res = solved(tiny(days=3, periods="TTBTT", lunch=[1]))
        assert res.placements == [] and res.score.total == 0

    def test_courses_with_zero_sessions_are_ignored(self):
        res = solved(tiny(courses=[course("c1", lectures=0, labs=0)]))
        assert res.placements == []

    def test_zero_days_with_sessions_is_infeasible(self):
        infeasible(tiny(days=0, courses=[course("c1", lectures=1)]), diagnosis=[("noSlot", ["c1:L1"], "noStart")])

    def test_zero_days_and_no_sessions_is_optimal(self):
        assert solve(tiny(days=0)).status == "optimal"

    def test_only_break_periods_says_why(self):
        infeasible(tiny(periods="BB", courses=[course("c1", lectures=1)]), "not enough consecutive teaching periods",
                   diagnosis=[("noSlot", ["c1:L1"], "noStart")])

    def test_no_periods_at_all(self):
        infeasible(tiny(periods="", courses=[course("c1", lectures=1)]), "cannot be placed anywhere",
                   diagnosis=[("noSlot", ["c1:L1"], "noStart")])

    def test_no_rooms_at_all(self):
        infeasible(tiny(rooms=[], courses=[course("c1", lectures=1)]), "no eligible room",
                   diagnosis=[("noSlot", ["c1:L1"], "noRoom")])

    def test_no_slot_lists_every_session_and_the_message_only_counts(self):
        res = infeasible(tiny(rooms=[], courses=[course("c1", lectures=7)]),
                         diagnosis=[("noSlot", [f"c1:L{i}" for i in range(1, 8)], "noRoom")])
        assert res.message.startswith("7 session(s) cannot be placed anywhere")
        assert "c1:L" not in res.message

    def test_unknown_section_is_an_error_not_a_crash(self):
        res = solve(tiny(courses=[course("c1", lectures=1, section="ghost")]))
        assert res.status == "error" and "ghost" in res.message

    def test_teacher_missing_from_teacher_list_is_still_kept_clash_free(self):
        # Two sections share a teacher id that isn't in `teachers`; H1 must still hold.
        inp = tiny(periods="TT", rooms=[ROOM, room("r2")], sections=[section("s1"), section("s2")],
                   courses=[course("a", lectures=1, teacher="ghost", section="s1"),
                            course("b", lectures=1, teacher="ghost", section="s2")])
        res = solved(inp)
        assert {pl.period for pl in res.placements} == {0, 1}

    def test_section_with_no_courses_gets_no_penalties(self):
        res = solved(tiny(lunch=[1], sections=[section("s1"), section("empty")], courses=[course("c1", lectures=1)]))
        assert res.score.total == 0

    def test_placements_follow_session_order(self):
        inp = tiny(days=2, periods="TTTT", courses=[course("b", lectures=2), course("a", lectures=2, teacher="t2")])
        res = solved(inp)
        assert [pl.session_id for pl in res.placements] == ["b:L1", "b:L2", "a:L1", "a:L2"]

    def test_every_day_of_a_five_day_week_is_used(self):
        res = solved(tiny(days=5, periods="TT", courses=[course("c1", lectures=5)]))
        assert sorted(pl.day for pl in res.placements) == [0, 1, 2, 3, 4]

    def test_negative_counts_produce_no_sessions(self):
        # Pydantic accepts negative ints; expansion yields nothing rather than crashing. (The web app blocks these.)
        assert solve(tiny(courses=[course("c1", lectures=-2, labs=-1)])).placements == []

    def test_zero_batches_silently_drops_labs(self):
        # Input-validation gap: a section with 0 batches gets no lab sessions at all, and the solve "succeeds".
        # The web app refuses batches < 1 before solving, so this only matters for direct API callers.
        res = solve(tiny(rooms=[LAB], sections=[section(batches=0)], courses=[course("c1", labs=1, lab_length=1)]))
        assert res.status == "optimal" and res.placements == []

    def test_zero_lab_length_is_reported_as_unplaceable(self):
        infeasible(tiny(rooms=[LAB], courses=[course("c1", labs=1, lab_length=0)]), diagnosis=[("noSlot", ["c1:P1"], "noStart")])

    def test_duplicate_course_ids_are_reported_as_such(self):
        # Two courses share id c1, so both expand to session c1:L1; their solver variables would collide.
        inp = tiny(periods="TT", courses=[course("c1", lectures=1), course("c1", lectures=1, teacher="t2")])
        res = solve(inp)
        assert res.status == "error"
        assert res.message == "Each course needs its own id; used more than once: c1"

    def test_duplicate_ids_lists_each_repeat_once_in_order(self):
        assert duplicate_ids(["b", "a", "b", "c", "a", "b"]) == ["a", "b"]
        assert duplicate_ids(["a", "b"]) == []
        assert duplicate_ids([]) == []


# --- Periods, breaks and labs (H6, H7) ---------------------------------------------------------------------------


class TestPeriodsAndLabs:
    def test_valid_starts_edge_lengths(self):
        inp = tiny(periods="TTBT")
        assert valid_starts(inp, 0) == []
        assert valid_starts(inp, 1) == [0, 1, 3]
        assert valid_starts(inp, 2) == [0]
        assert valid_starts(inp, 5) == []

    def test_teaching_runs_with_leading_trailing_and_double_breaks(self):
        assert teaching_runs(tiny(periods="BTTBBTB")) == [[1, 2], [5]]
        assert teaching_runs(tiny(periods="BBB")) == []
        assert teaching_runs(tiny(periods="")) == []

    def test_lab_exactly_fills_the_day(self):
        res = solved(tiny(periods="TTT", rooms=[LAB], courses=[course("c1", labs=1, lab_length=3)]))
        assert placed(res)["c1:P1"].period == 0

    def test_lab_fits_only_at_the_end_of_the_day(self):
        res = solved(tiny(periods="TBTTT", rooms=[LAB], courses=[course("c1", labs=1, lab_length=3)]))
        assert placed(res)["c1:P1"].period == 2

    def test_lab_never_runs_off_the_end_of_the_day(self):
        res = solved(tiny(periods="TTT", rooms=[LAB], courses=[course("c1", labs=2, lab_length=2)], days=2))
        assert all(pl.period + 2 <= 3 for pl in res.placements)

    def test_one_period_lab(self):
        res = solved(tiny(periods="BT", rooms=[LAB], courses=[course("c1", labs=1, lab_length=1)]))
        assert placed(res)["c1:P1"].period == 1

    def test_lab_blocks_every_period_it_covers(self):
        # A 2-period lab and 2 lectures for one section in 4 periods: the lectures must avoid both lab periods.
        inp = tiny(periods="TTTT", rooms=[LAB, ROOM],
                   courses=[course("lab", labs=1, lab_length=2), course("lec", lectures=2, teacher="t2")])
        res = solved(inp)
        p = placed(res)["lab:P1"].period
        assert not {pl.period for pl in res.placements if pl.session_id.startswith("lec")} & {p, p + 1}

    def test_whole_section_lab_uses_lab_rooms_only(self):
        res = solved(tiny(rooms=[ROOM, LAB], courses=[course("c1", labs=1, lab_length=1)]))
        assert placed(res)["c1:P1"].room_id == "lab1"

    def test_lecture_with_only_labs_available_is_unplaceable(self):
        infeasible(tiny(rooms=[LAB], courses=[course("c1", lectures=1)]), diagnosis=[("noSlot", ["c1:L1"], "noRoom")])


# --- Rooms (H3, H4) -----------------------------------------------------------------------------------------------


class TestRooms:
    def test_fixed_lab_room_that_does_not_exist(self):
        infeasible(tiny(rooms=[LAB], courses=[course("c1", labs=1, labRoomId="ghost")]), "no eligible room")

    def test_fixed_lab_room_that_is_a_classroom(self):
        infeasible(tiny(rooms=[ROOM, LAB], courses=[course("c1", labs=1, labRoomId="r1")]), "no eligible room")

    def test_fixed_lab_owned_by_another_department(self):
        foreign = room("flab", "lab", "d2")
        infeasible(tiny(rooms=[foreign, LAB], courses=[course("c1", labs=1, labRoomId="flab")]), "no eligible room")

    def test_fixed_lab_room_is_used_even_when_others_are_free(self):
        res = solved(tiny(rooms=[LAB, LAB2, LAB3], courses=[course("c1", labs=2, lab_length=1, labRoomId="lab3")], days=2))
        assert {pl.room_id for pl in res.placements} == {"lab3"}

    def test_two_courses_competing_for_one_fixed_lab_are_serialised(self):
        inp = tiny(periods="TT", rooms=[LAB, LAB2], sections=[section("s1"), section("s2")],
                   courses=[course("a", labs=1, lab_length=1, labRoomId="lab1", section="s1"),
                            course("b", labs=1, lab_length=1, labRoomId="lab1", section="s2", teacher="t2")])
        res = solved(inp)
        assert {pl.period for pl in res.placements} == {0, 1}

    def test_shared_room_is_used_by_two_departments(self):
        inp = tiny(periods="TT", rooms=[ROOM], sections=[section("s1", dept="d1"), section("s2", dept="d2")],
                   courses=[course("a", lectures=1, section="s1"), course("b", lectures=1, section="s2", teacher="t2")])
        res = solved(inp)
        assert {pl.room_id for pl in res.placements} == {"r1"}

    def test_owned_room_is_never_lent_out(self):
        # d2's section has its own room free all day, but it may not use d1's room even when that's free too.
        inp = tiny(periods="TT", rooms=[room("own1", dept="d1"), room("own2", dept="d2")],
                   sections=[section("s1", dept="d1"), section("s2", dept="d2")],
                   courses=[course("a", lectures=2, section="s1"), course("b", lectures=2, section="s2", teacher="t2")])
        res = solved(inp)
        for pl in res.placements:
            assert pl.room_id == ("own1" if pl.session_id.startswith("a") else "own2")

    def test_room_shortage_across_sections_is_infeasible(self):
        # Three sections, one room, two periods: three lectures can't all fit.
        inp = tiny(periods="TT", rooms=[ROOM], teachers=3, sections=[section(f"s{i}") for i in (1, 2, 3)],
                   courses=[course(f"c{i}", lectures=1, section=f"s{i}", teacher=f"t{i}") for i in (1, 2, 3)])
        infeasible(inp)

    def test_room_clash_blocks_overlapping_labs_but_not_adjacent_ones(self):
        # Two 2-period labs in one lab room on a 4-period day: they must be back to back, never overlapping.
        inp = tiny(periods="TTTT", rooms=[LAB], sections=[section("s1"), section("s2")],
                   courses=[course("a", labs=1, section="s1"), course("b", labs=1, section="s2", teacher="t2")])
        res = solved(inp)
        assert sorted(pl.period for pl in res.placements) == [0, 2]


# --- Teachers and sections (H1, H2) ----------------------------------------------------------------------------


class TestClashes:
    def test_teacher_across_three_sections_needs_three_slots(self):
        sections = [section(f"s{i}") for i in (1, 2, 3)]
        rooms = [room(f"r{i}") for i in (1, 2, 3)]
        courses = [course(f"c{i}", lectures=1, section=f"s{i}") for i in (1, 2, 3)]
        assert solved(tiny(periods="TTT", sections=sections, rooms=rooms, courses=courses)).placements
        infeasible(tiny(periods="TT", sections=sections, rooms=rooms, courses=courses))

    def test_batch_teacher_ids_shorter_than_batches_fall_back_to_course_teacher(self):
        # Batch 2 has no listed teacher, so t1 teaches both batch labs: they can't run in parallel.
        inp = tiny(periods="TT", rooms=[LAB, LAB2], sections=[section(batches=2)],
                   courses=[course("c1", labs=1, lab_length=1, batchTeacherIds=["t1"])])
        res = solved(inp)
        assert sorted(pl.period for pl in res.placements) == [0, 1]

    def test_same_teacher_for_both_batches_serialises_their_labs(self):
        inp = tiny(periods="TTTT", rooms=[LAB, LAB2], sections=[section(batches=2)],
                   courses=[course("c1", labs=1, lab_length=2)])
        res = solved(inp)
        assert sorted(pl.period for pl in res.placements) == [0, 2]
        assert res.score.breakdown.batch_idle == 4 * 3  # each batch idles 2 periods while the other is in the lab

    def test_three_batches_in_parallel(self):
        inp = tiny(periods="TT", rooms=[LAB, LAB2, LAB3], sections=[section(batches=3)], teachers=3,
                   courses=[course("c1", labs=1, lab_length=2, batchTeacherIds=["t1", "t2", "t3"])])
        res = solved(inp)
        assert {pl.period for pl in res.placements} == {0} and res.score.total == 0

    def test_different_labs_for_different_batches_run_side_by_side(self):
        # B1 does lab X while B2 does lab Y, then they swap: 4 batch labs in 2 periods with 2 rooms.
        inp = tiny(periods="TT", rooms=[LAB, LAB2], sections=[section(batches=2)], teachers=4,
                   courses=[course("x", labs=1, lab_length=1, batchTeacherIds=["t1", "t2"]),
                            course("y", labs=1, lab_length=1, batchTeacherIds=["t3", "t4"])])
        res = solved(inp)
        assert res.score.breakdown.batch_idle == 0
        assert res.score.total == 2  # S5 only: the two teachers of the second period start late

    def test_whole_section_lecture_cannot_overlap_any_batch(self):
        # Lecture locked at P0; both batch labs must avoid P0.
        inp = tiny(periods="TTT", rooms=[ROOM, LAB, LAB2], sections=[section(batches=2)], teachers=3,
                   courses=[course("lec", lectures=1, teacher="t3"),
                            course("lab", labs=1, lab_length=1, batchTeacherIds=["t1", "t2"])],
                   locks=[lock("lec:L1", 0, 0)])
        res = solved(inp)
        assert all(pl.period != 0 for pl in res.placements if pl.session_id.startswith("lab"))

    def test_lecture_and_batch_labs_cannot_share_the_only_period(self):
        inp = tiny(periods="T", rooms=[ROOM, LAB, LAB2], sections=[section(batches=2)], teachers=3,
                   courses=[course("lec", lectures=1, teacher="t3"),
                            course("lab", labs=1, lab_length=1, batchTeacherIds=["t1", "t2"])])
        infeasible(inp)

    def test_two_sections_sharing_a_teacher_and_a_room(self):
        inp = tiny(days=2, periods="TTT", rooms=[ROOM], sections=[section("s1"), section("s2")],
                   courses=[course("a", lectures=3, section="s1"), course("b", lectures=3, section="s2")])
        solved(inp)


# --- Lunch (H8) ----------------------------------------------------------------------------------------------------


class TestLunch:
    def test_single_lunch_candidate_is_always_free(self):
        res = solved(tiny(days=2, periods="TTT", lunch=[1], courses=[course("c1", lectures=4)]))
        assert all(pl.period != 1 for pl in res.placements)

    def test_one_of_several_candidates_may_be_used(self):
        # 3 periods, candidates P1 and P2; a section with 2 lectures uses exactly one candidate.
        res = solved(tiny(periods="TTT", lunch=[1, 2], courses=[course("a", lectures=1), course("b", lectures=1, teacher="t2")]))
        assert len({pl.period for pl in res.placements} & {1, 2}) == 1

    def test_lunch_applies_every_day_separately(self):
        # Locks fill P0 and P1 on Monday; Monday's only free period is then P2, a candidate, so it must stay free.
        inp = tiny(days=2, periods="TTT", lunch=[1, 2], teachers=4,
                   courses=[course(f"c{i}", lectures=1, teacher=f"t{i}") for i in (1, 2, 3, 4)],
                   locks=[lock("c1:L1", 0, 0), lock("c2:L1", 0, 1)])
        res = solved(inp)
        assert all(not (pl.day == 0 and pl.period == 2) for pl in res.placements)

    def test_lunch_candidate_out_of_range_is_ignored(self):
        res = solved(tiny(periods="TT", lunch=[99], courses=[course("c1", lectures=2)]))
        assert len(res.placements) == 2

    def test_duplicate_lunch_candidates_behave_like_one(self):
        res = solved(tiny(periods="TTT", lunch=[1, 1], courses=[course("a", lectures=1), course("b", lectures=1, teacher="t2")]))
        assert 1 not in {pl.period for pl in res.placements}

    def test_lab_over_every_candidate_is_rejected(self):
        # A 2-period lab covering both lunch candidates would leave no lunch.
        inp = tiny(periods="TTT", lunch=[1, 2], rooms=[LAB], courses=[course("c1", labs=1, lab_length=2)])
        res = solved(inp)
        assert placed(res)["c1:P1"].period == 0  # P0–P1 leaves P2 free

    def test_teacher_lunch_across_sections(self):
        # t1 teaches s1 at P0 and must teach s2 too; candidates P1/P2. t1 can't take both P1 and P2.
        inp = tiny(periods="TTT", lunch=[1, 2], rooms=[ROOM, room("r2")], sections=[section("s1"), section("s2")],
                   courses=[course("a", lectures=1, section="s1"), course("b", lectures=1, section="s2")],
                   locks=[lock("a:L1", 0, 1)])
        res = solved(inp)
        assert placed(res)["b:L1"].period != 2

    def test_break_period_lunch_candidate_counts_as_free(self):
        # Like validator.ts: a break candidate is always free, so H8 holds and P0 may be used.
        res = solved(tiny(periods="TB", lunch=[0, 1], courses=[course("c1", lectures=1)]))
        assert placed(res)["c1:L1"].period == 0

    def test_teaching_lunch_candidate_is_still_not_a_gap_when_a_break_switches_h8_off(self):
        # Candidates P1 (teaching) and P3 (break): H8 is off, but a free P1 between classes is still lunch, not a gap.
        locks = [lock("a:L1", 0, 0), lock("b:L1", 0, 2)]
        inp = tiny(periods="TTTB", lunch=[1, 3], courses=[course("a", lectures=1), course("b", lectures=1, teacher="t2")], locks=locks)
        assert solved(inp).score.breakdown.section_gaps == 0

    def test_h8_lunch_periods(self):
        assert h8_lunch_periods(tiny(periods="TTT", lunch=[2, 1, 1])) == [1, 2]  # sorted, duplicates dropped
        assert h8_lunch_periods(tiny(periods="TTT", lunch=[1, 99, -1])) == [1]  # out of range ignored
        assert h8_lunch_periods(tiny(periods="TTB", lunch=[1, 2])) == []  # a break candidate: H8 always holds
        assert h8_lunch_periods(tiny(periods="TTT", lunch=[99])) == []
        assert h8_lunch_periods(tiny(periods="TTT")) == []


# --- Locks -----------------------------------------------------------------------------------------------------------


class TestLocks:
    def test_lock_on_later_copy_at_earliest_slot(self):
        # Symmetry breaking would order L1 < L2 < L3; with a lock on L3 at the very first slot it must be skipped.
        inp = tiny(days=3, periods="TT", courses=[course("c1", lectures=3)], locks=[lock("c1:L3", 0, 0)])
        res = solved(inp)
        assert placed(res)["c1:L3"].day == 0

    def test_locks_on_every_copy_in_reverse_order(self):
        locks = [lock("c1:L1", 2, 0), lock("c1:L2", 1, 0), lock("c1:L3", 0, 0)]
        solved(tiny(days=3, periods="TT", courses=[course("c1", lectures=3)], locks=locks))

    def test_lock_with_unknown_day(self):
        infeasible(tiny(courses=[course("c1", lectures=1)], locks=[lock("c1:L1", 5, 0)]), diagnosis=[("badLock", ["c1:L1"], None)])

    def test_lock_with_negative_period(self):
        infeasible(tiny(courses=[course("c1", lectures=1)], locks=[lock("c1:L1", 0, -1)]), diagnosis=[("badLock", ["c1:L1"], None)])

    def test_lock_in_wrong_room_type(self):
        infeasible(tiny(rooms=[ROOM, LAB], courses=[course("c1", lectures=1)], locks=[lock("c1:L1", 0, 0, "lab1")]), diagnosis=[("badLock", ["c1:L1"], None)])

    def test_lock_in_another_departments_room(self):
        inp = tiny(rooms=[ROOM, room("foreign", dept="d2")], courses=[course("c1", lectures=1)],
                   locks=[lock("c1:L1", 0, 0, "foreign")])
        infeasible(inp, "not valid placements", diagnosis=[("badLock", ["c1:L1"], None)])

    def test_lock_of_lab_that_would_cross_a_break(self):
        # The lab can start at P0 (P0–P1), but a lock at P1 would run it into the break.
        inp = tiny(periods="TTBT", rooms=[LAB], courses=[course("c1", labs=1, lab_length=2)],
                   locks=[lock("c1:P1", 0, 1, "lab1")])
        infeasible(inp, diagnosis=[("badLock", ["c1:P1"], None)])

    def test_lock_of_lab_mid_run_start(self):
        # A 2-period lab may start at P1 of a 3-period run; locking it there is valid.
        inp = tiny(periods="TTT", rooms=[LAB], courses=[course("c1", labs=1, lab_length=2)], locks=[lock("c1:P1", 0, 1, "lab1")])
        solved(inp)

    def test_same_lock_twice_is_harmless(self):
        inp = tiny(courses=[course("c1", lectures=1)], locks=[lock("c1:L1", 0, 2), lock("c1:L1", 0, 2)])
        assert placed(solved(inp))["c1:L1"].period == 2

    def test_two_different_locks_for_one_session_are_infeasible(self):
        infeasible(tiny(courses=[course("c1", lectures=1)], locks=[lock("c1:L1", 0, 0), lock("c1:L1", 0, 1)]),
                   diagnosis=[("locks", ["c1:L1"], None)])

    def test_lock_that_starves_another_session_is_infeasible(self):
        # One room, two periods: locking a's lecture in P0 is fine, but locking b's there too leaves a without a slot.
        inp = tiny(periods="TT", sections=[section("s1"), section("s2")],
                   courses=[course("a", lectures=1, section="s1"), course("b", lectures=1, section="s2", teacher="t2")],
                   locks=[lock("a:L1", 0, 0), lock("b:L1", 0, 0)])
        infeasible(inp, diagnosis=[("locks", ["a:L1", "b:L1"], None)])

    def test_lock_breaking_lunch_is_infeasible(self):
        infeasible(tiny(lunch=[1], courses=[course("c1", lectures=1)], locks=[lock("c1:L1", 0, 1)]),
                   diagnosis=[("locks", ["c1:L1"], None)])

    def test_lock_that_forces_a_penalty_is_still_optimal(self):
        # Locks put both lectures of c1 on Monday: S1 = 10 is the best possible.
        inp = tiny(days=2, courses=[course("c1", lectures=2)], locks=[lock("c1:L1", 0, 0), lock("c1:L2", 0, 2)])
        res = solved(inp)
        assert res.score.breakdown.subject_repeat == 10 and res.score.breakdown.section_gaps == 2

    def test_locked_batch_lab_keeps_its_batch_partner_parallel(self):
        inp = tiny(periods="TTT", rooms=[LAB, LAB2], sections=[section(batches=2)],
                   courses=[course("c1", labs=1, lab_length=1, batchTeacherIds=["t1", "t2"])],
                   locks=[lock("c1:P1:B1", 0, 2, "lab2")])
        res = solved(inp)
        assert placed(res)["c1:P1:B2"].period == 2 and placed(res)["c1:P1:B2"].room_id == "lab1"


# --- Infeasibility diagnosis --------------------------------------------------------------------------------------------


class SolveSpy(cp_model.CpSolver):
    """CpSolver that records each solve (time limit, has objective) and can fake the probe's status."""

    calls: list[tuple[float, bool]] = []
    probe_status = None  # set to a cp_model status to return it for solves without an objective

    def solve(self, model, *args, **kwargs):
        SolveSpy.calls.append((self.parameters.max_time_in_seconds, model.has_objective()))
        if SolveSpy.probe_status is not None and not model.has_objective():
            return SolveSpy.probe_status
        return super().solve(model, *args, **kwargs)


@pytest.fixture
def spy(monkeypatch):
    SolveSpy.calls, SolveSpy.probe_status = [], None
    monkeypatch.setattr(solver_module.cp_model, "CpSolver", SolveSpy)
    return SolveSpy


def starved(locks: list[dict]) -> SolveInput:
    """One room, one period, two sections: solvable alone; locking a:L1 or b:L1 is harmless, locking both clashes."""
    return tiny(periods="TT", sections=[section("s1"), section("s2")],
                courses=[course("a", lectures=1, section="s1"), course("b", lectures=1, section="s2", teacher="t2")],
                locks=locks)


class TestDiagnosis:
    def test_no_room_and_no_start_each_list_every_session(self):
        courses = [
            course("a", labs=6, lab_length=1, labRoomId="ghost"),  # no room
            course("b", labs=6, lab_length=3, teacher="t2"),  # no 3-period run
            course("c", labs=1, lab_length=3, labRoomId="ghost"),  # neither
        ]
        res = infeasible(tiny(periods="TTBTT", rooms=[LAB], courses=courses))
        by_detail = {d.detail: d.ids for d in res.diagnosis}
        assert [d.kind for d in res.diagnosis] == ["noSlot", "noSlot"]
        assert by_detail["noRoom"] == [f"a:P{i}" for i in range(1, 7)] + ["c:P1"]
        assert by_detail["noStart"] == [f"b:P{i}" for i in range(1, 7)] + ["c:P1"]
        assert "7 session(s)" in res.message and ":P" not in res.message

    def test_bad_locks_are_listed_once_each_and_valid_locks_are_not(self):
        locks = [lock("ghost:L1", 0, 0), lock("c1:L1", 0, 1, "nowhere"), lock("c1:L1", 0, 1, "nowhere"), lock("c1:L2", 0, 0)]
        res = infeasible(tiny(days=2, courses=[course("c1", lectures=2)], locks=locks),
                         diagnosis=[("badLock", ["ghost:L1", "c1:L1"], None)])
        assert res.message.startswith("2 locked cell(s)")

    def test_no_slot_and_bad_locks_are_reported_together(self):
        inp = tiny(rooms=[ROOM], courses=[course("a", labs=1, lab_length=1), course("b", lectures=1, teacher="t2")],
                   locks=[lock("b:L1", 0, 9)])
        infeasible(inp, diagnosis=[("noSlot", ["a:P1"], "noRoom"), ("badLock", ["b:L1"], None)])

    def test_lock_that_makes_a_solvable_college_infeasible_is_blamed(self, spy):
        assert solve(starved([])).status == "optimal"
        res = infeasible(starved([lock("a:L1", 0, 0), lock("b:L1", 0, 0)]),
                         diagnosis=[("locks", ["a:L1", "b:L1"], None)])
        assert "without them a timetable exists" in res.message and "a:L1" not in res.message
        # Main solve with the objective, then the feasibility-only probe with its own short limit.
        assert spy.calls[-2:] == [(5, True), (solver_module.PROBE_TIME_LIMIT_SEC, False)]

    def test_infeasible_without_locks_has_an_empty_diagnosis_and_no_probe(self, spy):
        res = infeasible(tiny(periods="TT", courses=[course("c1", lectures=3)]), diagnosis=[])
        assert "No clash-free timetable exists" in res.message
        assert len(spy.calls) == 1

    def test_innocent_lock_is_not_blamed(self, spy):
        # Three lectures never fit two periods, lock or not: the probe proves it and adds nothing.
        res = infeasible(tiny(periods="TT", courses=[course("c1", lectures=3)], locks=[lock("c1:L1", 0, 0)]), diagnosis=[])
        assert "No clash-free timetable exists" in res.message
        assert len(spy.calls) == 2

    def test_probe_that_runs_out_of_time_only_suspects_the_locks(self, spy):
        spy.probe_status = cp_model.UNKNOWN
        res = infeasible(starved([lock("a:L1", 0, 0), lock("b:L1", 0, 0)]), diagnosis=[("locksLikely", ["a:L1", "b:L1"], None)])
        assert "probably" in res.message

    def test_feasible_result_has_no_diagnosis(self):
        assert solve(starved([lock("a:L1", 0, 0)])).diagnosis is None

    def test_build_model_without_locks_or_objective(self):
        inp = starved([lock("a:L1", 0, 0), lock("b:L1", 0, 0)])
        sessions = expand_sessions(inp)
        full, _ = solver_module.build_model(inp, sessions)
        probe, x = solver_module.build_model(inp, sessions, use_locks=False, objective=False)
        assert full.has_objective() and not probe.has_objective()
        assert cp_model.CpSolver().solve(full) == cp_model.INFEASIBLE
        assert cp_model.CpSolver().solve(probe) in (cp_model.OPTIMAL, cp_model.FEASIBLE)
        assert set(x) == {(sid, 0, p, "r1") for sid in ("a:L1", "b:L1") for p in (0, 1)}


# --- Soft rules (S1–S5), their switches and optimality ---------------------------------------------------------------------------------


class TestSoftRules:
    def test_s1_counts_every_extra_lecture(self):
        res = solved(tiny(days=1, periods="TTTT", courses=[course("c1", lectures=3)]))
        assert res.score.breakdown.subject_repeat == 20

    def test_s1_ignores_labs(self):
        inp = tiny(days=1, periods="TTTT", rooms=[ROOM, LAB], courses=[course("c1", lectures=1, labs=1, lab_length=2)])
        assert solved(inp).score.breakdown.subject_repeat == 0

    def test_s1_spreads_when_possible_even_with_other_courses(self):
        res = solved(tiny(days=2, periods="TTT", courses=[course("a", lectures=2), course("b", lectures=2, teacher="t2")]))
        assert res.score.breakdown.subject_repeat == 0

    def test_s2_long_lab_counts_toward_a_teachers_run(self):
        # t1 teaches a 3-period lab and then a lecture to another section: 4 in a row → 5 points unless avoided.
        inp = tiny(periods="TTTT", rooms=[ROOM, LAB], sections=[section("s1"), section("s2")],
                   courses=[course("lab", labs=1, lab_length=3, section="s1"), course("lec", lectures=1, section="s2")])
        res = solved(inp)
        assert res.score.breakdown.teacher_overload == 5  # the only arrangement on a 4-period day

    def test_s2_counts_each_period_beyond_three(self):
        sections = [section(f"s{i}") for i in range(1, 6)]
        rooms = [room(f"r{i}") for i in range(1, 6)]
        res = solved(tiny(periods="TTTTT", sections=sections, rooms=rooms,
                          courses=[course(f"c{i}", lectures=1, section=f"s{i}") for i in range(1, 6)]))
        assert res.score.breakdown.teacher_overload == 10

    def test_s2_a_free_period_resets_the_run(self):
        sections = [section(f"s{i}") for i in range(1, 5)]
        rooms = [room(f"r{i}") for i in range(1, 5)]
        res = solved(tiny(periods="TTTTT", sections=sections, rooms=rooms,
                          courses=[course(f"c{i}", lectures=1, section=f"s{i}") for i in range(1, 5)]))
        assert res.score.breakdown.teacher_overload == 0  # 4 lectures in 5 periods: a free period splits the run

    def test_s3_counts_multiple_gaps(self):
        locks = [lock("a:L1", 0, 0), lock("b:L1", 0, 4)]
        inp = tiny(periods="TTTTT", courses=[course("a", lectures=1), course("b", lectures=1, teacher="t2")], locks=locks)
        assert solved(inp).score.breakdown.section_gaps == 3 * 2

    def test_s3_break_periods_are_not_gaps(self):
        locks = [lock("a:L1", 0, 0), lock("b:L1", 0, 2)]
        inp = tiny(periods="TBT", courses=[course("a", lectures=1), course("b", lectures=1, teacher="t2")], locks=locks)
        assert solved(inp).score.breakdown.section_gaps == 0

    def test_s3_free_periods_before_first_and_after_last_class_are_not_gaps(self):
        locks = [lock("a:L1", 0, 1), lock("b:L1", 0, 2)]
        inp = tiny(periods="TTTT", courses=[course("a", lectures=1), course("b", lectures=1, teacher="t2")], locks=locks)
        assert solved(inp).score.breakdown.section_gaps == 0

    def test_s3_counts_per_day(self):
        locks = [lock("a:L1", 0, 0), lock("a:L2", 1, 0), lock("b:L1", 0, 2), lock("b:L2", 1, 2)]
        inp = tiny(days=2, courses=[course("a", lectures=2), course("b", lectures=2, teacher="t2")], locks=locks)
        assert solved(inp).score.breakdown.section_gaps == 2 * 2

    def test_s3_lab_closes_a_gap(self):
        # Lecture at P0, 2-period lab at P1–P2, lecture at P3: no gaps.
        inp = tiny(periods="TTTT", rooms=[ROOM, LAB], teachers=3,
                   courses=[course("a", lectures=1), course("lab", labs=1, lab_length=2, teacher="t2"),
                            course("b", lectures=1, teacher="t3")],
                   locks=[lock("a:L1", 0, 0), lock("b:L1", 0, 3)])
        res = solved(inp)
        assert placed(res)["lab:P1"].period == 1 and res.score.breakdown.section_gaps == 0

    def test_s4_counts_per_idle_batch_per_period(self):
        # 3 batches, 1 lab room, 1-period labs: each lab period has 2 idle batches, 3 periods → 6 idle × 3.
        inp = tiny(periods="TTT", rooms=[LAB], sections=[section(batches=3)], teachers=3,
                   courses=[course("c1", labs=1, lab_length=1, batchTeacherIds=["t1", "t2", "t3"])])
        assert solved(inp).score.breakdown.batch_idle == 6 * 3

    def test_s4_two_period_lab_counts_both_periods(self):
        inp = tiny(periods="TTTT", rooms=[LAB], sections=[section(batches=2)],
                   courses=[course("c1", labs=1, lab_length=2, batchTeacherIds=["t1", "t2"])])
        assert solved(inp).score.breakdown.batch_idle == 4 * 3

    def test_s4_is_zero_for_unsplit_sections(self):
        inp = tiny(periods="TTTT", rooms=[LAB], courses=[course("c1", labs=2, lab_length=1)])
        assert solved(inp).score.breakdown.batch_idle == 0

    def test_weights_add_up_in_the_total(self):
        # Force S1 (10) + S3 (2) + S5 (1 for the section, 1 for t1) with locks.
        inp = tiny(days=1, periods="TTT", courses=[course("c1", lectures=2)], locks=[lock("c1:L1", 0, 0), lock("c1:L2", 0, 2)])
        score = solved(inp).score
        b = score.breakdown
        assert (score.total, b.subject_repeat, b.section_gaps, b.late_finish) == (14, 10, 2, 2)

    def test_unavoidable_penalty_does_not_bring_avoidable_ones(self):
        # 2 lectures of c1 on a 1-day, 3-period week: S1 = 10 is unavoidable, but the lectures sit side by side (no gap).
        res = solved(tiny(days=1, periods="TTT", courses=[course("c1", lectures=2)]))
        assert res.score.total == 10

    def test_s5_starts_the_day_at_the_first_period(self):
        # With S5 off any two periods score 0; with it on the section starts at P0 and only t2's free P0 is left.
        courses = [course("a", lectures=1), course("b", lectures=1, teacher="t2")]
        res = solved(tiny(periods="TTTT", courses=courses))
        assert {pl.period for pl in res.placements} == {0, 1} and res.score.total == 1
        late = [lock("a:L1", 0, 2), lock("b:L1", 0, 3)]
        assert solved(tiny(periods="TTTT", courses=courses, locks=late, soft_rules={"s5": False})).score.total == 0

    def test_s5_counts_teachers_too(self):
        # s1 has a (t1) and c (t2) in P0–P1 either way round; t1 is free at P1 or P0 because of s2 at P2. Only t2's
        # day tells them apart: c goes first.
        inp = tiny(periods="TTT", rooms=[ROOM, room("r2")], sections=[section("s1"), section("s2")],
                   courses=[course("a", lectures=1), course("c", lectures=1, teacher="t2"),
                            course("b", lectures=1, section="s2")],
                   locks=[lock("b:L1", 0, 2, "r2")])
        res = solved(inp)
        assert (placed(res)["c:L1"].period, placed(res)["a:L1"].period) == (0, 1)
        assert res.score.total == 3  # s2 free at P0 and P1, t1 at P0

    def test_s5_excuses_one_free_lunch_candidate(self):
        # H8 keeps P1 (the only candidate) free; three classes fill P0, P2, P3 and nothing is late.
        courses = [course(c, lectures=1) for c in ("a", "b", "c")]
        res = solved(tiny(periods="TTTT", lunch=[1], courses=courses))
        assert res.score.total == 0

    def test_s5_excuses_only_one_lunch_candidate(self):
        # Both candidates free before the last class: one is excused, the other counts (for s1 and for t1).
        res = solved(tiny(periods="TTTT", lunch=[1, 2], courses=[course("a", lectures=1)], locks=[lock("a:L1", 0, 3)]))
        assert res.score.breakdown.late_finish == 2 * 2

    def test_s1_off_lets_a_subject_repeat(self):
        # Spreading c1 puts its second lecture after t2's on day 2, so t1 starts late (S5: 1) instead of S1's 10.
        courses = [course("c1", lectures=2), course("b", lectures=1, teacher="t2")]
        inp = tiny(days=2, periods="TTT", courses=courses, locks=[lock("b:L1", 1, 0)])
        assert raw(solved(inp), inp).subject_repeat == 0
        assert raw(solved(rules_off(inp, "s1")), inp).subject_repeat == 10

    def test_s2_off_lets_a_teacher_run_on(self):
        # Four lectures by t1: a free period to break the run costs S3 2 + S5 2, less than S2's 5.
        inp = tiny(periods="TTTTT", courses=[course(c, lectures=1) for c in ("a", "b", "c", "d")])
        assert raw(solved(inp), inp).teacher_overload == 0
        assert raw(solved(rules_off(inp, "s2")), inp).teacher_overload == 5

    @staticmethod
    def labs_or_gaps(other_lab: int) -> SolveInput:
        """s1's batches can do their 1-period labs together only after s2's lab leaves lab2 (P1..`other_lab`), leaving
        `other_lab` gaps after s1's P0 lecture; one after the other in lab1 costs S4 6 and no gaps. S5 is off."""
        return tiny(periods="T" * (other_lab + 2), rooms=[ROOM, LAB, LAB2], teachers=5,
                    sections=[section("s1", batches=2), section("s2")],
                    courses=[course("a", lectures=1), course("lab", labs=1, lab_length=1, batchTeacherIds=["t2", "t3"]),
                             course("m", labs=1, lab_length=other_lab, teacher="t4", section="s2", labRoomId="lab2")],
                    locks=[lock("a:L1", 0, 0), lock("m:P1", 0, 1, "lab2")], soft_rules={"s5": False})

    def test_s3_off_lets_gaps_in(self):
        inp = self.labs_or_gaps(4)  # 4 gaps (S3 8) or S4 6
        assert raw(solved(inp), inp).section_gaps == 0
        assert raw(solved(rules_off(inp, "s3")), inp).section_gaps == 8

    def test_s4_off_lets_batches_wait(self):
        inp = self.labs_or_gaps(1)  # 1 gap (S3 2) or S4 6
        assert raw(solved(inp), inp).batch_idle == 0
        assert raw(solved(rules_off(inp, "s4")), inp).batch_idle == 6

    def test_a_rule_that_is_off_adds_nothing_to_the_objective(self):
        # The sample's saved timetable, every session locked: the objective is exactly the score, whatever is off.
        inp = load_sample()
        timetable = json.loads((FIXTURES / "sample-timetable.json").read_text())
        inp.locks = [Placement.model_validate(p) for p in timetable["placements"]]
        sessions = expand_sessions(inp)
        for off in [(), ("s1",), ("s2",), ("s3",), ("s4",), ("s5",), ("s1", "s3", "s5"), ("s1", "s2", "s3", "s4", "s5")]:
            locked = rules_off(inp, *off)
            m, _ = solver_module.build_model(locked, sessions)
            cp = cp_model.CpSolver()
            assert cp.solve(m) == cp_model.OPTIMAL
            assert round(cp.objective_value) == reference_score(locked, inp.locks)["total"], off


# --- Symmetry breaking -----------------------------------------------------------------------------------------------


class TestSymmetryBreaking:
    def test_copies_are_placed_in_increasing_slot_order(self):
        res = solved(tiny(days=3, periods="TT", courses=[course("c1", lectures=3)]))
        slots = [(placed(res)[f"c1:L{i}"].day, placed(res)[f"c1:L{i}"].period) for i in (1, 2, 3)]
        assert slots == sorted(slots)

    def test_batch_labs_of_different_batches_are_not_ordered_against_each_other(self):
        # B2 locked earlier than B1 would be impossible if batches were (wrongly) grouped together.
        inp = tiny(periods="TTT", rooms=[LAB], sections=[section(batches=2)],
                   courses=[course("c1", labs=1, lab_length=1, batchTeacherIds=["t1", "t2"])],
                   locks=[lock("c1:P1:B2", 0, 0, "lab1")])
        solved(inp)

    def test_same_teacher_batch_labs_are_not_treated_as_interchangeable(self):
        # X's B1 and B2 labs share teacher t1. Y's B1 lab is locked at P0, so the only timetable is
        # P0: Y-B1 + X-B2, P1: X-B1 + Y-B2. Ordering X's labs B1-before-B2 (as if they were copies) would lose it.
        inp = tiny(periods="TT", rooms=[LAB, LAB2], sections=[section(batches=2)], teachers=3,
                   courses=[course("x", labs=1, lab_length=1),
                            course("y", labs=1, lab_length=1, batchTeacherIds=["t2", "t3"])],
                   locks=[lock("y:P1:B1", 0, 0, "lab1")])
        res = solved(inp)
        assert (placed(res)["x:P1:B2"].period, placed(res)["x:P1:B1"].period) == (0, 1)

    def test_tight_instance_still_finds_the_only_arrangement(self):
        # Every slot of a 2-day × 2-period week is needed by 4 copies; symmetry breaking must not cut it off.
        res = solved(tiny(days=2, periods="TT", courses=[course("c1", lectures=4)]))
        assert len(res.placements) == 4


# --- Time limits, options and results -------------------------------------------------------------------------------


class TestRunOptions:
    def test_too_short_time_limit_on_the_sample_is_an_error_with_a_message(self):
        inp = load_sample()
        inp.options.time_limit_sec = 0.3
        t = time.perf_counter()
        res = solve(inp)
        elapsed = time.perf_counter() - t
        assert res.status == "error" and "found no solution in 0.3s" in res.message
        assert elapsed < 0.3 + 3  # model building is not counted by CP-SAT; allow for it

    def test_zero_time_limit_is_refused(self):
        # Before T45, 0 meant the default; now the time limit must be over 0 (and at most 120).
        with pytest.raises(ValidationError):
            Options(time_limit_sec=0)

    def test_same_seed_gives_the_same_optimal_score(self):
        inp = tiny(days=2, periods="TTTT", lunch=[2], courses=[course("a", lectures=3), course("b", lectures=3, teacher="t2")])
        scores = {solve(inp).score.total for _ in range(3)}
        assert len(scores) == 1

    def test_time_ms_is_reported(self):
        assert solve(tiny(courses=[course("c1", lectures=1)])).time_ms >= 0

    def test_result_is_never_partial_and_never_lists_unplaced(self):
        # CP-SAT is all-or-nothing; partial results come from the web heuristic only.
        for inp in (tiny(courses=[course("c1", lectures=1)]), tiny(periods="T", courses=[course("c1", lectures=2)])):
            res = solve(inp)
            assert res.status != "partial" and res.unplaced == []

    def test_feasible_result_reports_the_true_score(self, monkeypatch):
        # Stopping at the first solution leaves the penalty variables loose; the score must come from the placements.
        class FirstSolution(cp_model.CpSolver):
            def solve(self, model, *args, **kwargs):
                self.parameters.stop_after_first_solution = True
                return super().solve(model, *args, **kwargs)

        monkeypatch.setattr(solver_module.cp_model, "CpSolver", FirstSolution)
        inp = load_sample()
        inp.options.time_limit_sec = 30
        res = solve(inp)
        assert res.status == "feasible"
        assert hard_violations(inp, res) == []
        assert res.score.total == reference_score(inp, res.placements)["total"]


# --- Scoring a finished timetable ------------------------------------------------------------------------------------


class TestScorePlacements:
    def test_matches_the_reference_on_a_hand_made_timetable(self):
        # S1: 3 lectures of a on Monday (2 extra × 10); S4: B2 idles during B1's lab at P0 and B1 during B2's at P1 (2 × 3).
        # S5: t2 is free at P0 before their lab at P1, t3 at P0–P1 before lecturing P2–P4 (3 × 1).
        inp = tiny(periods="TTTTT", rooms=[ROOM, LAB], sections=[section(batches=2)], teachers=3, soft_rules={},
                   courses=[course("a", lectures=3, teacher="t3"), course("lab", labs=1, lab_length=1, batchTeacherIds=["t1", "t2"])])
        placements = [Placement(session_id=sid, day=0, period=p, room_id=r) for sid, p, r in [
            ("lab:P1:B1", 0, "lab1"), ("lab:P1:B2", 1, "lab1"), ("a:L1", 2, "r1"), ("a:L2", 4, "r1"), ("a:L3", 3, "r1")]]
        sessions = {s.id: s for s in expand_sessions(inp)}
        got = score_placements(inp, sessions, placements)
        assert got.breakdown.model_dump(by_alias=False) == {
            "subject_repeat": 20, "teacher_overload": 0, "section_gaps": 0, "batch_idle": 6, "late_finish": 3}
        ref = reference_score(inp, placements)
        assert got.total == ref["total"] == 29

    def test_switched_off_rules_are_none_and_left_out_of_the_total(self):
        inp = tiny(periods="TTTTT", rooms=[ROOM, LAB], sections=[section(batches=2)], teachers=3,
                   soft_rules={"s1": False, "s5": False},
                   courses=[course("a", lectures=3, teacher="t3"), course("lab", labs=1, lab_length=1, batchTeacherIds=["t1", "t2"])])
        placements = [Placement(session_id=sid, day=0, period=p, room_id=r) for sid, p, r in [
            ("lab:P1:B1", 0, "lab1"), ("lab:P1:B2", 1, "lab1"), ("a:L1", 2, "r1"), ("a:L2", 4, "r1"), ("a:L3", 3, "r1")]]
        got = score_placements(inp, {s.id: s for s in expand_sessions(inp)}, placements)
        assert got.breakdown.model_dump(by_alias=False) == {
            "subject_repeat": None, "teacher_overload": 0, "section_gaps": 0, "batch_idle": 6, "late_finish": None}
        assert got.total == reference_score(inp, placements)["total"] == 6

    @pytest.mark.parametrize(("periods", "lunch", "at", "expected"), [
        # (section, teacher t1, teacher t2) free periods before their last class; c1 is t1's, c2 is t2's.
        ("TTTTT", [1], {"c1:L1": 0, "c2:L1": 2}, (0, 0, 1)),  # the free P1 is a lunch candidate: excused
        ("TTTTT", [], {"c1:L1": 0, "c2:L1": 4}, (3, 0, 4)),  # P1–P3 free, none a lunch candidate
        ("TTTT", [], {"c1:L1": 2, "c2:L1": 3}, (2, 2, 3)),  # a late start counts too
        ("TTTTTT", [], {"c2:L1": 5}, (5, 0, 5)),  # one class in the last period
        ("TTTTTT", [3], {"c2:L1": 5}, (4, 0, 4)),
        ("TTTTT", [1, 2], {"c2:L1": 4}, (3, 0, 3)),  # only one lunch candidate is excused
        ("TTBTT", [], {"c2:L1": 4}, (3, 0, 3)),  # the break isn't a teaching period
        ("TTTTT", [], {}, (0, 0, 0)),  # a day with no classes
    ])
    def test_late_finish_hand_worked(self, periods, lunch, at, expected):
        inp = tiny(periods=periods, lunch=lunch, soft_rules={},
                   courses=[course("c1", lectures=1), course("c2", lectures=1, teacher="t2")])
        placements = [Placement(session_id=sid, day=0, period=p, room_id="r1") for sid, p in at.items()]
        got = score_placements(inp, {s.id: s for s in expand_sessions(inp)}, placements)
        assert got.breakdown.late_finish == sum(expected)
        assert reference_score(inp, placements)["late_finish"] == sum(expected)

    def test_late_finish_counts_a_section_busy_while_one_batch_is(self):
        # B1's 2-period lab at P2–P3: the section and t1 are both free at P0–P1; B2 has nothing all day.
        inp = tiny(periods="TTTT", rooms=[ROOM, LAB], sections=[section(batches=2)], soft_rules={},
                   courses=[course("lab", labs=1, lab_length=2)])
        placements = [Placement(session_id="lab:P1:B1", day=0, period=2, room_id="lab1")]
        got = score_placements(inp, {s.id: s for s in expand_sessions(inp)}, placements)
        assert got.breakdown.late_finish == 2 + 2
        assert reference_score(inp, placements)["late_finish"] == 4

    def test_teacher_overload_counts_across_sections_and_labs(self):
        inp = tiny(periods="TTTTT", rooms=[ROOM, LAB], sections=[section("s1"), section("s2")],
                   courses=[course("lab", labs=1, lab_length=3, section="s1"), course("lec", lectures=2, section="s2")])
        placements = [Placement(session_id="lab:P1", day=0, period=0, room_id="lab1"),
                      Placement(session_id="lec:L1", day=0, period=3, room_id="r1"),
                      Placement(session_id="lec:L2", day=0, period=4, room_id="r1")]
        got = score_placements(inp, {s.id: s for s in expand_sessions(inp)}, placements)
        assert got.breakdown.teacher_overload == 2 * 5
        assert got.total == reference_score(inp, placements)["total"]

    def test_empty_timetable_scores_zero(self):
        inp = tiny(courses=[course("c1", lectures=1)])
        assert score_placements(inp, {s.id: s for s in expand_sessions(inp)}, []).total == 0


# --- API ----------------------------------------------------------------------------------------------------------------


class TestApi:
    client = TestClient(main.app)

    def body(self, inp: SolveInput) -> dict:
        return inp.model_dump()

    def test_locks_and_options_are_optional(self):
        body = self.body(tiny(courses=[course("c1", lectures=1)]))
        del body["locks"], body["options"]
        res = self.client.post("/solve", json=body)
        assert res.status_code == 200 and res.json()["status"] == "optimal"

    def test_unknown_fields_are_ignored(self):
        body = self.body(tiny(courses=[course("c1", lectures=1)]))
        body["somethingNew"] = 1
        body["courses"][0]["colour"] = "red"
        assert self.client.post("/solve", json=body).json()["status"] == "optimal"

    def test_bad_enum_value_is_a_422(self):
        body = self.body(tiny())
        body["rooms"][0]["type"] = "auditorium"
        assert self.client.post("/solve", json=body).status_code == 422

    def test_unknown_section_is_a_200_error_result(self):
        body = self.body(tiny(courses=[course("c1", lectures=1, section="ghost")]))
        res = self.client.post("/solve", json=body)
        assert res.status_code == 200 and res.json()["status"] == "error"

    def test_solver_crash_becomes_an_error_result(self, monkeypatch):
        def boom(_inp):
            raise RuntimeError("kaboom")

        monkeypatch.setattr(main, "solve", boom)
        res = self.client.post("/solve", json=self.body(tiny()))
        assert res.status_code == 200
        assert res.json() == {**res.json(), "status": "error", "engine": "cpsat", "message": "Solver crashed: kaboom"}

    def test_result_round_trips_into_the_web_contract(self):
        res = self.client.post("/solve", json=self.body(tiny(days=2, courses=[course("c1", lectures=2)]))).json()
        required = {"engine", "status", "placements", "unplaced", "score", "timeMs"}
        assert required <= set(res) <= required | {"message", "diagnosis"}
        assert set(res["score"]) == {"total", "breakdown"}
