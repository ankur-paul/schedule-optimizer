import { validStarts } from "./eligibility";
import { rng } from "./rng";
import { score } from "./score";
import { expandSessions } from "./sessions";
import type { Placement, Score, SoftRules, SolveInput } from "./types";

/**
 * Golden scores for the Python scorers to match (shared/fixtures/sample-scores.json, written by `npm run
 * gen:golden`): random timetables of a college, each scored under several soft-rule switch settings.
 */
export interface ScoreCase {
  seed: number;
  placements: Placement[];
  scores: { softRules: Partial<SoftRules>; score: Score }[];
}

/** Missing (the defaults: S5 off), all on, all off, each rule alone switched off, and S5 alone switched on. */
export const SWITCH_SETTINGS: Partial<SoftRules>[] = [
  {},
  { s1: true, s2: true, s3: true, s4: true, s5: true },
  { s1: false, s2: false, s3: false, s4: false, s5: false },
  { s1: false },
  { s2: false },
  { s3: false },
  { s4: false },
  { s5: false },
  { s5: true },
];

/**
 * Every session at a random day, start and room. Starts respect breaks (H6, H7); nothing else does, so clashes are
 * common and every soft rule has something to count.
 */
export function randomTimetable(input: SolveInput, seed: number): Placement[] {
  const next = rng(seed);
  const pick = <T>(list: T[]): T => list[Math.floor(next() * list.length)];
  const days = input.settings.days.map((_, d) => d);
  return expandSessions(input).map((s) => ({
    sessionId: s.id,
    day: pick(days),
    period: pick(validStarts(input.settings, s.length)),
    roomId: pick(input.rooms).id,
  }));
}

export function scoreCases(input: SolveInput, seeds = [1, 2, 3]): ScoreCase[] {
  return seeds.map((seed) => {
    const placements = randomTimetable(input, seed);
    const scores = SWITCH_SETTINGS.map((softRules) => ({ softRules, score: score({ ...input, softRules }, placements) }));
    return { seed, placements, scores };
  });
}
