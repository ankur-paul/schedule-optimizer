import json

import pytest
from pydantic import ValidationError

from models import DEFAULT_SOFT_RULES, Diagnosis, Options, Score, ScoreBreakdown, SolveInput, SolveResult, SoftRules, Unplaced


def test_diagnosis_and_unplaced_cause_round_trip_as_camelcase():
    res = SolveResult(
        status="infeasible",
        unplaced=[Unplaced(session_id="c1:P1", reason="No lab is free", cause="noRoom")],
        diagnosis=[
            Diagnosis(kind="noSlot", ids=["c1:P1"], detail="noRoom"),
            Diagnosis(kind="locksLikely", ids=["c2:L1", "c2:L2"]),
        ],
    )
    data = res.model_dump(exclude_none=True)
    assert data["unplaced"] == [{"sessionId": "c1:P1", "reason": "No lab is free", "cause": "noRoom"}]
    assert data["diagnosis"] == [
        {"kind": "noSlot", "ids": ["c1:P1"], "detail": "noRoom"},
        {"kind": "locksLikely", "ids": ["c2:L1", "c2:L2"]},
    ]
    assert SolveResult.model_validate_json(res.model_dump_json()) == res


def test_new_fields_are_optional():
    res = SolveResult.model_validate(
        {"status": "partial", "unplaced": [{"sessionId": "c1:L1", "reason": "No free slot"}]}
    )
    assert res.diagnosis is None
    assert res.unplaced[0].cause is None
    assert "diagnosis" not in res.model_dump(exclude_none=True)


@pytest.mark.parametrize("cause", ["noRoom", "noStart", "teacher", "section", "room", "lunch"])
def test_every_unplaced_cause_parses(cause):
    assert Unplaced.model_validate({"sessionId": "s", "reason": "r", "cause": cause}).cause == cause


def test_unknown_cause_and_kind_are_rejected():
    with pytest.raises(ValidationError):
        Unplaced.model_validate({"sessionId": "s", "reason": "r", "cause": "weather"})
    with pytest.raises(ValidationError):
        Diagnosis.model_validate({"kind": "tooHard", "ids": []})


@pytest.mark.parametrize("limit", [0.5, 30, 120])
def test_time_limit_within_the_cap_passes(limit):
    assert Options(time_limit_sec=limit).time_limit_sec == limit


@pytest.mark.parametrize("limit", [0, -1, 120.5, 121])
def test_time_limit_outside_the_cap_is_refused(limit):
    with pytest.raises(ValidationError):
        Options.model_validate({"timeLimitSec": limit})


def test_time_limit_defaults_to_30():
    assert Options().time_limit_sec == 30


EMPTY = {"settings": {"days": [], "periods": [], "lunchCandidates": []},
         "departments": [], "teachers": [], "rooms": [], "sections": [], "courses": []}


def test_soft_rules_default_when_missing_or_partial():
    assert SolveInput.model_validate(EMPTY).soft_rules == DEFAULT_SOFT_RULES == SoftRules(s1=True, s2=True, s3=True, s4=True, s5=False)
    partial = SolveInput.model_validate({**EMPTY, "softRules": {"s2": False}}).soft_rules
    assert partial == SoftRules(s1=True, s2=False, s3=True, s4=True, s5=False)


def test_an_off_rule_serialises_as_null_even_when_nones_are_dropped():
    # /solve uses response_model_exclude_none; an off rule must still reach the client, as null, not missing.
    res = SolveResult(status="optimal", score=Score(total=6, breakdown=ScoreBreakdown(subject_repeat=None, batch_idle=6)))
    data = json.loads(res.model_dump_json(exclude_none=True))
    assert data["score"]["breakdown"] == {
        "subjectRepeat": None, "teacherOverload": 0, "sectionGaps": 0, "batchIdle": 6, "lateFinish": 0}
    assert "message" not in data
    assert ScoreBreakdown(subject_repeat=None).model_dump(by_alias=False)["subject_repeat"] is None
    assert SolveResult.model_validate(data) == res
