"""Pydantic mirrors of the data contract in PLAN.md §3 (web/src/domain/types.ts). JSON is camelCase.

Bump the number in shared/contract.json (served by GET /health) when SolveInput, SolveResult or the /agent body
changes in a way the other side must know about.
"""

from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field
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


class SolveInput(Model):
    settings: Settings
    departments: list[Department]
    teachers: list[Teacher]
    rooms: list[Room]
    sections: list[Section]
    courses: list[Course]
    locks: list[Placement] = []
    options: Options = Options()


class ScoreBreakdown(Model):
    subject_repeat: int = 0
    teacher_overload: int = 0
    section_gaps: int = 0
    batch_idle: int = 0


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
