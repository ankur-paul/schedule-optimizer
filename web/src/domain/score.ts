import { buildGrid, type Cell, type CollegeData } from "./grid";
import type { Id, Placement, Score, ScoreBreakdown, SoftRules } from "./types";

/** Soft-constraint weights (PLAN.md §2). */
export const WEIGHTS = { subjectRepeat: 10, teacherOverload: 5, sectionGaps: 2, batchIdle: 3, lateFinish: 1 } as const;
const MAX_CONSECUTIVE = 3;

/** The switches when the data doesn't say (models.py's `SoftRules` has the same defaults). */
export const DEFAULT_SOFT_RULES: SoftRules = { s1: true, s2: true, s3: true, s4: true, s5: true };

/** Every switch, the defaults filling any that `rules` leaves out. */
export function fillSoftRules(rules?: Partial<SoftRules> | null): SoftRules {
  const out = { ...DEFAULT_SOFT_RULES };
  for (const k of Object.keys(out) as (keyof SoftRules)[]) {
    if (typeof rules?.[k] === "boolean") out[k] = rules[k];
  }
  return out;
}

/** The switch behind each breakdown key. */
export const RULE_SWITCH: Record<keyof ScoreBreakdown, keyof SoftRules> = {
  subjectRepeat: "s1",
  teacherOverload: "s2",
  sectionGaps: "s3",
  batchIdle: "s4",
  lateFinish: "s5",
};

/**
 * One soft-rule penalty and where it comes from. `periods` are period ids on `day`; `points` = count × weight.
 * S1: a course's extra lectures on a day (`courseId`, all its lecture periods that day). S2: one teacher's run past 3
 * periods (the periods beyond 3). S3: a section's idle periods on a day. S4: one batch idle during another's labs.
 * S5: a section's or a teacher's free periods before their last class of a day, less the excused lunch period.
 */
export interface Penalty {
  rule: "S1" | "S2" | "S3" | "S4" | "S5";
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

/** Every penalty behind `score()`, in S1–S5 order, for the rules that are on; their points add up to its total. */
export function penalties(input: CollegeData, placements: Placement[]): Penalty[] {
  const out: Penalty[] = [];
  walk(input, placements, (p) => out.push(p));
  return out;
}

/** `emit` gets each penalty; without it nothing is allocated for them (drag-and-drop scores on every hover). */
function walk(input: CollegeData, placements: Placement[], emitAll?: (p: Penalty) => void): Score {
  const { settings } = input;
  const on = fillSoftRules(input.softRules);
  const emit = emitAll && ((p: Penalty) => on[RULE_SWITCH[p.key]] && emitAll(p));
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

  // S5: free teaching periods before a section's or a teacher's last class of the day, one free lunch candidate
  // excused (H8 keeps one free). A section is busy when it or any of its batches is.
  let lateFinish = 0;
  const finish = (timelines: Map<Id, Cell[][]>, who: "sectionId" | "teacherId") => {
    for (const [id, timeline] of timelines) {
      timeline.forEach((row, day) => {
        const busy = row.map((cell, p) => teaching[p] && cell.length > 0);
        const free = lateFinishPeriods(busy, teaching, lunch);
        lateFinish += free.length;
        if (emit && free.length > 0) emit({ rule: "S5", key: "lateFinish", points: free.length * WEIGHTS.lateFinish, day, periods: free, [who]: id });
      });
    }
  };
  finish(grid.bySection, "sectionId");
  finish(grid.byTeacher, "teacherId");

  const counts: Record<keyof ScoreBreakdown, number> = { subjectRepeat, teacherOverload, sectionGaps, batchIdle, lateFinish };
  const breakdown = {} as ScoreBreakdown;
  let total = 0;
  for (const key of Object.keys(RULE_SWITCH) as (keyof ScoreBreakdown)[]) {
    const points = on[RULE_SWITCH[key]] ? counts[key] * WEIGHTS[key] : null;
    breakdown[key] = points;
    total += points ?? 0;
  }
  return { total, breakdown };
}

/**
 * S5 for one section or teacher on one day: the free teaching periods before their last class, less the first free
 * lunch candidate among them. `busy[p]`: they have a class in teaching period `p`.
 */
export function lateFinishPeriods(busy: boolean[], teaching: boolean[], lunch: Set<number>): number[] {
  const last = busy.lastIndexOf(true);
  const free: number[] = [];
  for (let p = 0; p < last; p++) if (teaching[p] && !busy[p]) free.push(p);
  const excused = free.findIndex((p) => lunch.has(p));
  if (excused >= 0) free.splice(excused, 1);
  return free;
}
