"""Pydantic mirrors of the data contract in PLAN.md §3 (web/src/domain/types.ts). JSON is camelCase.

Bump the number in shared/contract.json (served by GET /health) when SolveInput, SolveResult or the /agent body
changes in a way the other side must know about.
"""

from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_serializer
from pydantic.alias_generators import to_camel

Id = str


class Model(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, serialize_by_alias=True)


class Period(Model):
    id: int
    label: str
    start: str
    end: str
    kind: Literal["teaching", "break"]


class Settings(Model):
    days: list[str]
    periods: list[Period]
    lunch_candidates: list[int]


class Department(Model):
    id: Id
    name: str


class Teacher(Model):
    id: Id
    name: str
    department_id: Id


class Room(Model):
    id: Id
    name: str
    type: Literal["classroom", "lab"]
    department_id: Optional[Id] = None  # None = shared


class Section(Model):
    id: Id
    name: str
    department_id: Id
    batches: int = 1


class Course(Model):
    id: Id
    section_id: Id
    subject: str
    teacher_id: Id
    lectures_per_week: int
    lab_sessions_per_week: int
    lab_length: int
    lab_room_id: Optional[Id] = None
    batch_teacher_ids: Optional[list[Id]] = None


class Placement(Model):
    session_id: Id
    day: int
    period: int
    room_id: Id


class Options(Model):
    time_limit_sec: float = Field(30, gt=0, le=120)  # the UI's Advanced max is 120
    seed: Optional[int] = None


class SoftRules(Model):
    """Which soft rules count (PLAN.md §2). A missing key takes its default, as in score.ts's DEFAULT_SOFT_RULES."""

    s1: bool = True
    s2: bool = True
    s3: bool = True
    s4: bool = True
    s5: bool = True


DEFAULT_SOFT_RULES = SoftRules()


class SolveInput(Model):
    settings: Settings
    departments: list[Department]
    teachers: list[Teacher]
    rooms: list[Room]
    sections: list[Section]
    courses: list[Course]
    locks: list[Placement] = []
    options: Options = Options()
    soft_rules: SoftRules = DEFAULT_SOFT_RULES


class ScoreBreakdown(Model):
    """Points per soft rule (S1–S5); None when the rule is switched off, so "off" never reads as 0."""

    subject_repeat: Optional[int] = 0
    teacher_overload: Optional[int] = 0
    section_gaps: Optional[int] = 0
    batch_idle: Optional[int] = 0
    late_finish: Optional[int] = 0

    @model_serializer(mode="wrap")
    def _keep_off_rules(self, handler, info):
        # /solve drops None fields (response_model_exclude_none), but a rule that's off must still arrive, as null.
        out = handler(self)
        keys = [name if info.by_alias is False else to_camel(name) for name in type(self).model_fields]
        return {k: out.get(k) for k in keys}


class Score(Model):
    total: int = 0
    breakdown: ScoreBreakdown = ScoreBreakdown()


# Why a session has no slot. noRoom / noStart: it can never be placed; the rest: what blocked it most.
UnplacedCause = Literal["noRoom", "noStart", "teacher", "section", "room", "lunch"]


class Unplaced(Model):
    session_id: Id
    reason: str
    cause: Optional[UnplacedCause] = None


class Diagnosis(Model):
    """A structured reason for `infeasible`; the client writes the user-facing copy (see Diagnosis in types.ts)."""

    kind: Literal["noSlot", "badLock", "locks", "locksLikely"]
    ids: list[Id]  # session ids
    detail: Optional[str] = None  # noSlot: "noRoom" | "noStart"


class SolveResult(Model):
    engine: Literal["cpsat", "heuristic"] = "cpsat"
    status: Literal["optimal", "feasible", "partial", "infeasible", "error"]
    placements: list[Placement] = []
    unplaced: list[Unplaced] = []
    score: Score = Score()
    time_ms: int = 0
    message: Optional[str] = None  # human-readable fallback; the UI renders `diagnosis` when present
    diagnosis: Optional[list[Diagnosis]] = None  # only with status "infeasible"


class Session(Model):
    id: Id
    course_id: Id
    section_id: Id
    batch: Optional[int]  # None = whole section
    teacher_id: Id
    kind: Literal["lecture", "lab"]
    length: int
    room_type: Literal["classroom", "lab"]
    fixed_room_id: Optional[Id]
