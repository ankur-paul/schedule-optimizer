"""Pydantic mirrors of the data contract in PLAN.md §3 (web/src/domain/types.ts). JSON is camelCase."""

from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict
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
    time_limit_sec: float = 30
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


class Unplaced(Model):
    session_id: Id
    reason: str


class SolveResult(Model):
    engine: Literal["cpsat", "heuristic"] = "cpsat"
    status: Literal["optimal", "feasible", "partial", "infeasible", "error"]
    placements: list[Placement] = []
    unplaced: list[Unplaced] = []
    score: Score = Score()
    time_ms: int = 0
    message: Optional[str] = None


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
