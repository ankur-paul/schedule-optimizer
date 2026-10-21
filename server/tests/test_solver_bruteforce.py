"""CP-SAT vs brute force on hundreds of random tiny colleges.

For each instance: CP-SAT and an exhaustive search must agree on whether a clash-free timetable exists and on the
best score; CP-SAT's placements must pass the independent hard-rule check, and the score it reports must equal the
reference scorer's score of those placements (so the objective encodes S1–S4 exactly as the web app scores them).
"""

import random
from functools import cache

import pytest

from models import Placement, SolveInput
from sessions import expand_sessions
from solver import solve
from tests.helpers import hard_violations
from tests.reference import BruteForce, brute_force, reference_score

PERIOD_PATTERNS = ["TTT", "TTTT", "TTBT", "TBTT", "TTBTT", "TTTTT"]
SEEDS = range(300)


def random_college(seed: int) -> SolveInput:
    """A small random college: ≤ 7 sessions, 1–2 days, 2–5 periods, so brute force stays fast. Dense on purpose,
    so many instances are infeasible or can only be solved with soft-rule penalties."""
    rng = random.Random(seed)
    periods = rng.choice(PERIOD_PATTERNS)
    days = rng.choice([1, 2])
    teaching = [i for i, c in enumerate(periods) if c == "T"]
    lunch = rng.sample(teaching, k=rng.choice([0, 0, 1, 2]) if len(teaching) > 1 else 0)

    sections = [
        {"id": f"s{i}", "name": f"S{i}", "departmentId": rng.choice(["d1", "d2"]), "batches": rng.choice([1, 1, 2])}
        for i in range(rng.choice([1, 1, 2]))
    ]
    teachers = [{"id": f"t{i}", "name": f"T{i}", "departmentId": "d1"} for i in range(rng.choice([1, 2, 3]))]
    rooms = [{"id": "shared", "name": "Shared", "type": "classroom", "departmentId": None}]
    if rng.random() < 0.85:
        rooms.append({"id": "lab", "name": "Lab", "type": "lab", "departmentId": None})
    for i in range(rng.choice([0, 1, 2])):
        rooms.append({"id": f"r{i}", "name": f"R{i}", "type": rng.choice(["classroom", "classroom", "lab"]),
                      "departmentId": rng.choice([None, None, "d1", "d2"])})
    labs = [r["id"] for r in rooms if r["type"] == "lab"]

    courses = []
    budget = 6  # sessions in total, so brute force stays fast
    # Periods a section can fill in a week (like the web data check): no instance is infeasible just by counting.
    room_left = {sec["id"]: days * (len(teaching) - (1 if lunch else 0)) for sec in sections}
    for i in range(rng.choice([2, 3, 3, 4])):
        sec = rng.choice(sections)
        lectures = rng.choice([0, 1, 2, 2])
        lab_sessions = rng.choice([0, 0, 1])
        lab_length = rng.choice([1, 2])
        per_lab = sec["batches"]
        while lectures + lab_sessions * per_lab > budget or lectures + lab_sessions * lab_length > room_left[sec["id"]]:
            if lab_sessions:
                lab_sessions -= 1
            elif lectures:
                lectures -= 1
        budget -= lectures + lab_sessions * per_lab
        room_left[sec["id"]] -= lectures + lab_sessions * lab_length
        if lectures + lab_sessions == 0:
            continue
        course = {
            "id": f"c{i}", "sectionId": sec["id"], "subject": f"C{i}", "teacherId": rng.choice(teachers)["id"],
            "lecturesPerWeek": lectures, "labSessionsPerWeek": lab_sessions, "labLength": lab_length,
        }
        if lab_sessions and labs and rng.random() < 0.3:
            course["labRoomId"] = rng.choice(labs)
        if lab_sessions and per_lab > 1 and rng.random() < 0.5:
            course["batchTeacherIds"] = [rng.choice(teachers)["id"] for _ in range(per_lab)]
        courses.append(course)
        if budget <= 0:
            break

    inp = SolveInput.model_validate({
        "settings": {
            "days": ["Mon", "Tue"][:days],
            "periods": [{"id": i, "label": f"P{i + 1}", "start": "09:00", "end": "10:00",
                         "kind": "teaching" if c == "T" else "break"} for i, c in enumerate(periods)],
            "lunchCandidates": lunch,
        },
        "departments": [{"id": "d1", "name": "D1"}, {"id": "d2", "name": "D2"}],
        "teachers": teachers, "rooms": rooms, "sections": sections, "courses": courses,
        "locks": [], "options": {"timeLimitSec": 10, "seed": seed},
    })

    # Sometimes lock one session at a random slot (valid or not), to exercise lock handling.
    sessions = expand_sessions(inp)
    if sessions and rng.random() < 0.25:
        s = rng.choice(sessions)
        inp.locks = [Placement(session_id=s.id, day=rng.randrange(days), period=rng.randrange(len(periods)),
                               room_id=rng.choice(rooms)["id"])]
    return inp


SEARCH_LIMIT = 300_000  # brute-force nodes; bigger instances are swapped for the next one


@cache
def instance(seed: int) -> tuple[SolveInput, BruteForce]:
    """The first random college from `seed` onwards (seed, seed + 10_000, …) that brute force can settle quickly."""
    for k in range(50):
        inp = random_college(seed + 10_000 * k)
        try:
            return inp, brute_force(inp, limit=SEARCH_LIMIT)
        except RuntimeError:
            continue
    raise RuntimeError(f"no small enough instance for seed {seed}")


@pytest.mark.parametrize("seed", SEEDS)
def test_cpsat_matches_brute_force(seed):
    inp, expected = instance(seed)
    res = solve(inp)

    if expected.best is None:
        assert res.status == "infeasible", f"brute force found no timetable but CP-SAT said {res.status}"
        assert res.placements == []
        return

    assert res.status == "optimal", f"{res.status}: {res.message}"
    assert hard_violations(inp, res) == []
    for lock in inp.locks:
        assert lock in res.placements
    ref = reference_score(inp, res.placements)
    reported = res.score.breakdown.model_dump(by_alias=False)
    assert reported == {k: v for k, v in ref.items() if k != "total"}, "solver's breakdown differs from reference"
    assert res.score.total == ref["total"]
    assert res.score.total == expected.best, f"CP-SAT claims optimal {res.score.total}, brute force found {expected.best}"


def test_generator_covers_the_interesting_cases():
    """Guard against the random generator drifting into only trivial instances."""
    insts = [instance(s)[0] for s in SEEDS]
    results = [instance(s)[1].best for s in SEEDS]
    assert sum(r is None for r in results) >= 20, "too few infeasible instances"
    assert sum(r is not None and r > 0 for r in results) >= 20, "too few instances with a non-zero optimum"
    assert sum(bool(i.locks) for i in insts) >= 40, "too few instances with locks"
    assert sum(any(s.batches > 1 for s in i.sections) for i in insts) >= 60, "too few split sections"
    assert sum(bool(i.settings.lunch_candidates) for i in insts) >= 60, "too few instances with lunch candidates"
    assert sum(r is not None and r % 10 != 0 for r in results) >= 10, "too few optima with S2–S4 penalties"
    assert sum(any(c.lab_sessions_per_week for c in i.courses) for i in insts) >= 60, "too few labs"
