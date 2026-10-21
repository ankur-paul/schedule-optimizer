import { buildGrid } from "./grid";
import type { Placement, Score, SolveInput } from "./types";

/** Soft-constraint weights (PLAN.md §2). */
export const WEIGHTS = { subjectRepeat: 10, teacherOverload: 5, sectionGaps: 2, batchIdle: 3 } as const;
const MAX_CONSECUTIVE = 3;

/** Score a timeline (lower is better). Source of truth for the UI, whichever engine ran. */
export function score(input: SolveInput, placements: Placement[]): Score {
  const { settings } = input;
  const grid = buildGrid(input, placements);
  const teaching = settings.periods.map((p) => p.kind === "teaching");
  const lunch = new Set(settings.lunchCandidates);

  // S1: more than one lecture of the same course on the same day.
  const lectures = new Map<string, number>();
  for (const p of placements) {
    const s = grid.sessions.get(p.sessionId);
    if (s?.kind !== "lecture") continue;
    const key = `${s.courseId}|${p.day}`;
    lectures.set(key, (lectures.get(key) ?? 0) + 1);
  }
  let subjectRepeat = 0;
  for (const n of lectures.values()) subjectRepeat += Math.max(0, n - 1);

  // S2: teacher busy for more than 3 consecutive teaching periods (a break or a free period ends the run).
  let teacherOverload = 0;
  for (const timeline of grid.byTeacher.values()) {
    for (const row of timeline) {
      let run = 0;
      row.forEach((cell, p) => {
        run = teaching[p] && cell.length > 0 ? run + 1 : 0;
        if (run > MAX_CONSECUTIVE) teacherOverload++;
      });
    }
  }

  // S3: idle teaching periods between a section's first and last class of a day, lunch candidates excluded.
  let sectionGaps = 0;
  for (const timeline of grid.bySection.values()) {
    for (const row of timeline) {
      const busy = row.map((cell, p) => teaching[p] && cell.length > 0);
      const first = busy.indexOf(true);
      const last = busy.lastIndexOf(true);
      for (let p = first + 1; first >= 0 && p < last; p++) {
        if (teaching[p] && !busy[p] && !lunch.has(p)) sectionGaps++;
      }
    }
  }

  // S4: in a split section, a batch idle while another batch is in a lab.
  let batchIdle = 0;
  for (const section of input.sections) {
    if (section.batches <= 1) continue;
    for (const row of grid.bySection.get(section.id) ?? []) {
      row.forEach((cell, p) => {
        if (!teaching[p] || !cell.some((e) => e.session.kind === "lab" && e.session.batch != null)) return;
        for (let b = 1; b <= section.batches; b++) {
          if (!cell.some((e) => e.session.batch == null || e.session.batch === b)) batchIdle++;
        }
      });
    }
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
