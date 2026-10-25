export type Id = string;

export interface Period {
  id: number;                 // index in Settings.periods, 0-based
  label: string;              // "P1", "Break"
  start: string;              // "09:00"
  end: string;                // "09:50"
  kind: "teaching" | "break";
}

export interface Settings {
  days: string[];             // ["Mon","Tue","Wed","Thu","Fri"]
  periods: Period[];          // in time order, breaks included
  lunchCandidates: number[];  // Period ids (must be teaching periods)
}

export interface Department { id: Id; name: string }
export interface Teacher    { id: Id; name: string; departmentId: Id }
export interface Room       { id: Id; name: string; type: "classroom" | "lab"; departmentId: Id | null } // null = shared
export interface Section    { id: Id; name: string; departmentId: Id; batches: number }                // 1 = no split

export interface Course {
  id: Id;
  sectionId: Id;
  subject: string;            // "Data Structures"
  teacherId: Id;              // lecture teacher; default lab teacher
  lecturesPerWeek: number;    // 1-period whole-section sessions in a classroom
  labSessionsPerWeek: number; // per batch
  labLength: number;          // consecutive periods per lab session (ignored if labSessionsPerWeek = 0)
  labRoomId?: Id | null;      // specific lab required, else any eligible lab
  batchTeacherIds?: Id[] | null; // length = section.batches; missing → teacherId for all batches
}

export interface Placement {
  sessionId: Id;
  day: number;                // index into Settings.days
  period: number;             // starting Period id
  roomId: Id;
}

export interface SolveInput {
  settings: Settings;
  departments: Department[];
  teachers: Teacher[];
  rooms: Room[];
  sections: Section[];
  courses: Course[];
  locks: Placement[];         // must appear unchanged in the output
  options: { timeLimitSec: number; seed?: number };
  /** Which soft rules count (PLAN.md §2). Missing, or a missing key, means the default (`DEFAULT_SOFT_RULES`). */
  softRules?: Partial<SoftRules>;
}

/** On/off per soft rule; a rule that's off adds nothing to the score. */
export interface SoftRules { s1: boolean; s2: boolean; s3: boolean; s4: boolean; s5: boolean }

/** Points per soft rule (S1–S5); `null` when the rule is switched off, so "off" never reads as 0. */
export interface ScoreBreakdown {
  subjectRepeat: number | null;
  teacherOverload: number | null;
  sectionGaps: number | null;
  batchIdle: number | null;
  lateFinish: number | null;
}
export interface Score { total: number; breakdown: ScoreBreakdown }

/** Why a session has no slot. `noRoom` / `noStart`: it can never be placed; the rest: what blocked it most. */
export type UnplacedCause = "noRoom" | "noStart" | "teacher" | "section" | "room" | "lunch";

/**
 * A structured reason the exact solver gives for `infeasible` (contract T15, filled by the server in T16). The client turns these into sentences,
 * fixes and links, so the server never writes user-facing copy here.
 * - noSlot: these sessions have no valid (day, start, room) at all.
 * - badLock: these locks are not valid placements.
 * - locks: proven: without the locks the data solves. `ids` = locked session ids.
 * - locksLikely: same probe, but it ran out of time, so the locks are only suspected.
 */
export interface Diagnosis {
  kind: "noSlot" | "badLock" | "locks" | "locksLikely";
  ids: Id[];                  // session ids
  detail?: string;            // noSlot: "noRoom" | "noStart"
}

export interface SolveResult {
  engine: "cpsat" | "heuristic";
  status: "optimal" | "feasible" | "partial" | "infeasible" | "error";
  placements: Placement[];
  unplaced: { sessionId: Id; reason: string; cause?: UnplacedCause }[];
  score: Score;
  timeMs: number;
  message?: string;           // human-readable fallback; the UI renders `diagnosis` when present
  diagnosis?: Diagnosis[];    // only with status "infeasible"
}

export interface Session {
  id: Id;
  courseId: Id;
  sectionId: Id;
  batch: number | null;       // null = whole section; 1..n for batch sessions
  teacherId: Id;
  kind: "lecture" | "lab";
  length: number;             // 1 for lectures, course.labLength for labs
  roomType: "classroom" | "lab";
  fixedRoomId: Id | null;     // course.labRoomId for labs
}
