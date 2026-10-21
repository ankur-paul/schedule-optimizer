import type { Placement, SolveInput } from "./types";

/**
 * Hand-written test college: 2 days × (P1–P4, Break, P5), lunch candidates P4/P5.
 * CSE-2A (dept cse, 2 batches) and ECE-2B (dept ece, unsplit); 3 teachers; rooms CR-1 (cse), CR-2 (shared), Lab-1 (shared).
 */
export const tinyCollege: SolveInput = {
  settings: {
    days: ["Mon", "Tue"],
    periods: [
      { id: 0, label: "P1", start: "09:00", end: "09:50", kind: "teaching" },
      { id: 1, label: "P2", start: "09:50", end: "10:40", kind: "teaching" },
      { id: 2, label: "P3", start: "10:40", end: "11:30", kind: "teaching" },
      { id: 3, label: "P4", start: "11:30", end: "12:20", kind: "teaching" },
      { id: 4, label: "Break", start: "12:20", end: "12:40", kind: "break" },
      { id: 5, label: "P5", start: "12:40", end: "13:30", kind: "teaching" },
    ],
    lunchCandidates: [3, 5],
  },
  departments: [
    { id: "cse", name: "CSE" },
    { id: "ece", name: "ECE" },
  ],
  teachers: [
    { id: "t1", name: "A. Sharma", departmentId: "cse" },
    { id: "t2", name: "R. Gupta", departmentId: "ece" },
    { id: "t3", name: "S. Rao", departmentId: "cse" },
  ],
  rooms: [
    { id: "cr1", name: "CR-1", type: "classroom", departmentId: "cse" },
    { id: "cr2", name: "CR-2", type: "classroom", departmentId: null },
    { id: "lab1", name: "Lab-1", type: "lab", departmentId: null },
  ],
  sections: [
    { id: "a", name: "CSE-2A", departmentId: "cse", batches: 2 },
    { id: "b", name: "ECE-2B", departmentId: "ece", batches: 1 },
  ],
  courses: [
    { id: "a-ds", sectionId: "a", subject: "DS", teacherId: "t1", lecturesPerWeek: 2, labSessionsPerWeek: 1, labLength: 2, batchTeacherIds: ["t1", "t2"] },
    { id: "a-m", sectionId: "a", subject: "Maths", teacherId: "t3", lecturesPerWeek: 1, labSessionsPerWeek: 0, labLength: 0 },
    { id: "b-ph", sectionId: "b", subject: "Physics", teacherId: "t2", lecturesPerWeek: 2, labSessionsPerWeek: 1, labLength: 2, labRoomId: "lab1" },
    { id: "b-m", sectionId: "b", subject: "Maths", teacherId: "t3", lecturesPerWeek: 1, labSessionsPerWeek: 0, labLength: 0 },
  ],
  locks: [],
  options: { timeLimitSec: 5 },
};

const MON = 0;
const TUE = 1;
const at = (sessionId: string, day: number, period: number, roomId: string): Placement => ({ sessionId, day, period, roomId });

/** A complete, clash-free timetable for `tinyCollege` (score: batchIdle 12, everything else 0). */
export const tinyValid: Placement[] = [
  at("a-ds:P1:B1", MON, 0, "lab1"),
  at("a-ds:L1", MON, 2, "cr1"),
  at("a-m:L1", MON, 5, "cr1"),
  at("b-ph:L1", MON, 0, "cr2"),
  at("b-m:L1", MON, 1, "cr2"),
  at("b-ph:P1", MON, 2, "lab1"),
  at("a-ds:P1:B2", TUE, 0, "lab1"),
  at("a-ds:L2", TUE, 2, "cr1"),
  at("b-ph:L2", TUE, 2, "cr2"),
];

/** `tinyValid` with some sessions moved: `{ sessionId: [day, period, roomId] }`. */
export function tinyWith(moves: Record<string, [number, number, string]>): Placement[] {
  return tinyValid.map((p) => (moves[p.sessionId] ? at(p.sessionId, ...moves[p.sessionId]) : p));
}

export { at, MON, TUE };
