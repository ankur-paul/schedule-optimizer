"""The Python scorers against the web scorer (web/src/domain/score.ts, the source of truth).

shared/fixtures/sample-scores.json holds random sample-college timetables with the web scorer's score under several
soft-rule switch settings (`npm run gen:golden`); solver.py's scorer and the test reference must give the same.
"""

import json

import pytest

from models import Placement, SoftRules, SolveInput
from sessions import expand_sessions
from solver import score_placements
from tests.reference import reference_score
from tests.test_sessions import FIXTURES, load_sample

CASES = json.loads((FIXTURES / "sample-scores.json").read_text())
SCORES = [(case["seed"], i) for case in CASES for i in range(len(case["scores"]))]


def scored(seed: int, i: int) -> tuple[SolveInput, list[Placement], dict]:
    case = next(c for c in CASES if c["seed"] == seed)
    expected = case["scores"][i]
    inp = load_sample()
    inp.soft_rules = SoftRules.model_validate(expected["softRules"])
    return inp, [Placement.model_validate(p) for p in case["placements"]], expected["score"]


@pytest.mark.parametrize(("seed", "i"), SCORES)
def test_solver_scorer_matches_the_web(seed, i):
    inp, placements, expected = scored(seed, i)
    got = score_placements(inp, {s.id: s for s in expand_sessions(inp)}, placements)
    assert got.model_dump() == expected


@pytest.mark.parametrize(("seed", "i"), SCORES)
def test_reference_scorer_matches_the_web(seed, i):
    inp, placements, expected = scored(seed, i)
    ref = reference_score(inp, placements)
    assert ref["total"] == expected["total"]
    assert {k: v for k, v in ref.items() if k != "total"} == {
        k: expected["breakdown"][camel] for k, camel in [
            ("subject_repeat", "subjectRepeat"), ("teacher_overload", "teacherOverload"),
            ("section_gaps", "sectionGaps"), ("batch_idle", "batchIdle"), ("late_finish", "lateFinish")]
    }


def test_cases_cover_every_rule_and_switch():
    """Guard against the fixture drifting into timetables where a switch changes nothing."""
    every = {f"s{i}": True for i in range(1, 6)}
    on = next(s for s in CASES[0]["scores"] if s["softRules"] == every)["score"]["breakdown"]
    assert all(v > 0 for v in on.values()), on
    assert {tuple(sorted(s["softRules"].items())) for s in CASES[0]["scores"]} >= {(("s1", False),), (("s5", True),), ()}
