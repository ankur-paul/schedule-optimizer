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
}

export interface ScoreBreakdown { subjectRepeat: number; teacherOverload: number; sectionGaps: number; batchIdle: number }
export interface Score { total: number; breakdown: ScoreBreakdown }

export interface SolveResult {
  engine: "cpsat" | "heuristic";
  status: "optimal" | "feasible" | "partial" | "infeasible" | "error";
  placements: Placement[];
  unplaced: { sessionId: Id; reason: string }[];
  score: Score;
  timeMs: number;
  message?: string;
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
