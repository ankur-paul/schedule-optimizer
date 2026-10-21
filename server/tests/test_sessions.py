import json
from pathlib import Path

from models import SolveInput
from sessions import expand_sessions

FIXTURES = Path(__file__).resolve().parents[2] / "shared" / "fixtures"


def load_sample() -> SolveInput:
    return SolveInput.model_validate_json((FIXTURES / "sample-college.json").read_text())


def test_matches_golden_file():
    golden = json.loads((FIXTURES / "sample-sessions.json").read_text())
    got = [s.model_dump() for s in expand_sessions(load_sample())]
    assert got == golden
