import { buildGrid, type CollegeData } from "./grid";
import type { Id, Placement, Score, ScoreBreakdown } from "./types";

/** Soft-constraint weights (PLAN.md §2). */
export const WEIGHTS = { subjectRepeat: 10, teacherOverload: 5, sectionGaps: 2, batchIdle: 3 } as const;
const MAX_CONSECUTIVE = 3;

/**
 * One soft-rule penalty and where it comes from. `periods` are period ids on `day`; `points` = count × weight.
 * S1: a course's extra lectures on a day (`courseId`, all its lecture periods that day). S2: one teacher's run past 3
 * periods (the periods beyond 3). S3: a section's idle periods on a day. S4: one batch idle during another's labs.
 */
export interface Penalty {
  rule: "S1" | "S2" | "S3" | "S4";
  key: keyof ScoreBreakdown;
  points: number;
  day: number;
  periods: number[];
  sectionId?: Id;
  teacherId?: Id;
  courseId?: Id;
  batch?: number;
}

/** Score a timeline (lower is better). Source of truth for the UI, whichever engine ran. */
export function score(input: CollegeData, placements: Placement[]): Score {
  return walk(input, placements);
}

/** Every penalty behind `score()`, in S1–S4 order; their points add up to its total. */
export function penalties(input: CollegeData, placements: Placement[]): Penalty[] {
  const out: Penalty[] = [];
  walk(input, placements, (p) => out.push(p));
  return out;
}

/** `emit` gets each penalty; without it nothing is allocated for them (drag-and-drop scores on every hover). */
function walk(input: CollegeData, placements: Placement[], emit?: (p: Penalty) => void): Score {
  const { settings } = input;
  const grid = buildGrid(input, placements);
  const teaching = settings.periods.map((p) => p.kind === "teaching");
  const lunch = new Set(settings.lunchCandidates);

  // S1: more than one lecture of the same course on the same day.
  const lectures = new Map<string, Placement[]>();
  for (const p of placements) {
    const s = grid.sessions.get(p.sessionId);
    if (s?.kind !== "lecture") continue;
    const key = `${s.courseId}|${p.day}`;
    const list = lectures.get(key);
    if (list) list.push(p);
    else lectures.set(key, [p]);
  }
  let subjectRepeat = 0;
  for (const list of lectures.values()) {
    const extra = list.length - 1;
    if (extra <= 0) continue;
    subjectRepeat += extra;
    if (emit) {
      const s = grid.sessions.get(list[0].sessionId)!;
      const periods = list.map((p) => p.period).sort((a, b) => a - b);
      emit({ rule: "S1", key: "subjectRepeat", points: extra * WEIGHTS.subjectRepeat, day: list[0].day, periods, sectionId: s.sectionId, courseId: s.courseId });
    }
  }

  // S2: teacher busy for more than 3 consecutive teaching periods (a break or a free period ends the run).
  let teacherOverload = 0;
  for (const [teacherId, timeline] of grid.byTeacher) {
    timeline.forEach((row, day) => {
      let run = 0;
      let beyond: number[] = [];
      const flush = () => {
        if (emit && beyond.length > 0) {
          emit({ rule: "S2", key: "teacherOverload", points: beyond.length * WEIGHTS.teacherOverload, day, periods: beyond, teacherId });
        }
        beyond = [];
      };
      row.forEach((cell, p) => {
        run = teaching[p] && cell.length > 0 ? run + 1 : 0;
        if (run === 0) flush();
        if (run > MAX_CONSECUTIVE) {
          teacherOverload++;
          if (emit) beyond.push(p);
        }
      });
      flush();
    });
  }

  // S3: idle teaching periods between a section's first and last class of a day, lunch candidates excluded.
  let sectionGaps = 0;
  for (const [sectionId, timeline] of grid.bySection) {
    timeline.forEach((row, day) => {
      const busy = row.map((cell, p) => teaching[p] && cell.length > 0);
      const first = busy.indexOf(true);
      const last = busy.lastIndexOf(true);
      const gaps: number[] = [];
      for (let p = first + 1; first >= 0 && p < last; p++) {
        if (teaching[p] && !busy[p] && !lunch.has(p)) {
          sectionGaps++;
          if (emit) gaps.push(p);
        }
      }
      if (emit && gaps.length > 0) emit({ rule: "S3", key: "sectionGaps", points: gaps.length * WEIGHTS.sectionGaps, day, periods: gaps, sectionId });
    });
  }

  // S4: in a split section, a batch idle while another batch is in a lab.
  let batchIdle = 0;
  for (const section of input.sections) {
    if (section.batches <= 1) continue;
    (grid.bySection.get(section.id) ?? []).forEach((row, day) => {
      const idle: number[][] = Array.from({ length: section.batches + 1 }, () => []);
      row.forEach((cell, p) => {
        if (!teaching[p] || !cell.some((e) => e.session.kind === "lab" && e.session.batch != null)) return;
        for (let b = 1; b <= section.batches; b++) {
          if (!cell.some((e) => e.session.batch == null || e.session.batch === b)) {
            batchIdle++;
            if (emit) idle[b].push(p);
          }
        }
      });
      if (!emit) return;
      idle.forEach((periods, batch) => {
        if (periods.length > 0) emit({ rule: "S4", key: "batchIdle", points: periods.length * WEIGHTS.batchIdle, day, periods, sectionId: section.id, batch });
      });
    });
  }

  const breakdown = {
    subjectRepeat: subjectRepeat * WEIGHTS.subjectRepeat,
    teacherOverload: teacherOverload * WEIGHTS.teacherOverload,
    sectionGaps: sectionGaps * WEIGHTS.sectionGaps,
    batchIdle: batchIdle * WEIGHTS.batchIdle,
  };
  const total = breakdown.subjectRepeat + breakdown.teacherOverload + breakdown.sectionGaps + breakdown.batchIdle;
  return { total, breakdown };
}
