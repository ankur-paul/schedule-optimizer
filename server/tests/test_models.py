import pytest
from pydantic import ValidationError

from models import Diagnosis, SolveResult, Unplaced


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
