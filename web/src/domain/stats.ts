import { buildGrid, type CollegeData } from "./grid";
import { WEIGHTS } from "./score";
import type { Id, Placement, ScoreBreakdown, SolveInput } from "./types";

export type StatsData = CollegeData & Pick<SolveInput, "departments">;

/** Plain-English rows for the score card, in PLAN.md §2 order (S1–S4). */
export const SCORE_ROWS: { key: keyof ScoreBreakdown; rule: string; label: string; tip: string }[] = [
  {
    key: "subjectRepeat",
    rule: "S1",
    label: "Same subject twice in a day",
    tip: `${WEIGHTS.subjectRepeat} points for each extra lecture of a course on the same day.`,
  },
  {
    key: "teacherOverload",
    rule: "S2",
    label: "Teachers with long runs",
    tip: `${WEIGHTS.teacherOverload} points for each period a teacher teaches beyond 3 in a row (a break ends the run).`,
  },
  {
    key: "sectionGaps",
    rule: "S3",
    label: "Free periods between classes",
    tip: `${WEIGHTS.sectionGaps} points per idle period between a section's first and last class of the day. Lunch periods don't count.`,
  },
  {
    key: "batchIdle",
    rule: "S4",
    label: "Batches waiting during labs",
    tip: `${WEIGHTS.batchIdle} points per period where one batch of a split section is in a lab and another batch has nothing.`,
  },
];

export interface TeacherLoad {
  teacherId: Id;
  name: string;
  department: string;
  perDay: number[];   // busy teaching periods per day (a 2-period lab counts 2)
  total: number;      // periods per week
}

/** Teaching periods per day and per week for every teacher in the input (teachers with nothing get zeros). */
export function teacherLoads(data: StatsData, placements: Placement[]): TeacherLoad[] {
  const grid = buildGrid(data, placements);
  const teaching = data.settings.periods.map((p) => p.kind === "teaching");
  return data.teachers.map((t) => {
    const perDay = (grid.byTeacher.get(t.id) ?? []).map((row) => row.filter((cell, p) => teaching[p] && cell.length > 0).length);
    return {
      teacherId: t.id,
      name: t.name,
      department: data.departments.find((d) => d.id === t.departmentId)?.name ?? t.departmentId,
      perDay,
      total: perDay.reduce((a, b) => a + b, 0),
    };
  });
}

export type LoadSortKey = "name" | "department" | "total";

/** Sorted copy; ties fall back to name so the order is stable. */
export function sortLoads(loads: TeacherLoad[], key: LoadSortKey, dir: "asc" | "desc"): TeacherLoad[] {
  const sign = dir === "asc" ? 1 : -1;
  const byName = (a: TeacherLoad, b: TeacherLoad) => a.name.localeCompare(b.name);
  return [...loads].sort((a, b) => {
    const primary = key === "total" ? a.total - b.total : a[key].localeCompare(b[key]);
    return primary !== 0 ? sign * primary : byName(a, b);
  });
}

/** Highest and lowest weekly load; null when there are no teachers. */
export function loadRange(loads: TeacherLoad[]): { max: number; min: number } | null {
  if (loads.length === 0) return null;
  const totals = loads.map((l) => l.total);
  return { max: Math.max(...totals), min: Math.min(...totals) };
}

export interface RoomUsage {
  roomId: Id;
  name: string;
  type: "classroom" | "lab";
  shared: boolean;
  used: number;       // occupied (day, teaching period) slots
  capacity: number;   // days × teaching periods
  rate: number;       // used / capacity, 0 when capacity is 0
}

export interface Utilisation {
  rooms: RoomUsage[];       // sorted busiest first
  shared: number | null;    // utilisation of shared rooms together; null if there are none
  overall: number;          // utilisation of all rooms together
}

/** Share of teaching slots each room is in use, plus combined rates for shared rooms and all rooms. */
export function roomUtilisation(data: StatsData, placements: Placement[]): Utilisation {
  const grid = buildGrid(data, placements);
  const teaching = data.settings.periods.map((p) => p.kind === "teaching");
  const capacity = data.settings.days.length * teaching.filter(Boolean).length;
  const rate = (used: number, cap: number) => (cap > 0 ? used / cap : 0);
  const rooms: RoomUsage[] = data.rooms.map((r) => {
    const used = (grid.byRoom.get(r.id) ?? []).reduce(
      (n, row) => n + row.filter((cell, p) => teaching[p] && cell.length > 0).length,
      0,
    );
    return { roomId: r.id, name: r.name, type: r.type, shared: r.departmentId === null, used, capacity, rate: rate(used, capacity) };
  });
  const combined = (list: RoomUsage[]) => rate(list.reduce((n, r) => n + r.used, 0), list.length * capacity);
  const shared = rooms.filter((r) => r.shared);
  return {
    rooms: [...rooms].sort((a, b) => b.rate - a.rate || a.name.localeCompare(b.name)),
    shared: shared.length > 0 ? combined(shared) : null,
    overall: combined(rooms),
  };
}
