import type { SolveInput, SolveResult, UnplacedCause } from "@/domain/types";
import type { ValidationResult } from "@/domain/validator";
import type { SolveFailure } from "@/engine/solveClient";
import type { FooterNote } from "@/features/footer";
import type { AppData } from "@/store/useAppStore";

export const TIME_LIMIT = { min: 5, max: 120, step: 5, default: 20 } as const;

/** "Try longer" / "Try again with": double the limit, up to the max; null when already at the max. */
export function nextTimeLimit(t: number): number | null {
  return t >= TIME_LIMIT.max ? null : Math.min(2 * t, TIME_LIMIT.max);
}

/** What the engines get: the college data, the current locks, and run options. */
export function buildSolveInput(data: AppData, options: SolveInput["options"]): SolveInput {
  const { settings, departments, teachers, rooms, sections, courses, locks, softRules } = data;
  return { settings, departments, teachers, rooms, sections, courses, locks, options, softRules };
}

/** Reasons the Generate button is disabled (first one is shown). */
export function generateBlockers(data: Pick<AppData, "courses" | "rooms" | "teachers" | "settings">): string[] {
  const out: string[] = [];
  if (data.settings.days.length === 0 || !data.settings.periods.some((p) => p.kind === "teaching")) {
    out.push("Set up working days and teaching periods in step ① first.");
  }
  if (data.courses.length === 0) out.push("Add courses in step ② first (or load the sample college).");
  else if (data.rooms.length === 0) out.push("Add at least one room in step ② first.");
  else if (data.teachers.length === 0) out.push("Add teachers in step ② first.");
  return out;
}

/** "Exact solver" or "Quick draft": the words a coordinator reads (CP-SAT only appears in ⓘ tooltips). */
export function engineLabel(result: Pick<SolveResult, "engine">): string {
  return result.engine === "cpsat" ? "Exact solver" : "Quick draft";
}

/** The verification badge, e.g. "✓ Timetable ready · 0 clashes (independently checked)". */
export function badgeText(result: Pick<SolveResult, "unplaced">, validation: ValidationResult): string {
  const n = validation.violations.length;
  if (n > 0) return `✗ ${n} rule violation${n === 1 ? "" : "s"} found`;
  const u = result.unplaced.length;
  if (u > 0) return `Partial: ${classes(u)} not placed · 0 clashes among placed classes`;
  return "✓ Timetable ready · 0 clashes (independently checked)";
}

export const classes = (n: number) => (n === 1 ? "1 class" : `${n} classes`);

/** Why the stored timetable is a quick draft: the solver was offline, proved it impossible, or couldn't finish. */
export type DraftReason = "offline" | "impossible" | "couldntFinish";

/** The last run, beyond the stored result (not persisted; see `useRunOutcome`). */
export interface RunOutcome {
  /** The last Generate's failure and the input it ran on. Kept after a partial timetable for "Back to the reasons". */
  failed?: { failure: SolveFailure; input: SolveInput };
  /** True: step ③ shows the failure card; false: the stored result. */
  showFailure: boolean;
  /** Set when the stored result is a quick draft made in this session. */
  draft?: DraftReason;
  /** The exact solver's time limit for the stored result, for "best found in 20 s". */
  limitSec?: number;
}

type CouldntFinishKind = Exclude<SolveFailure["kind"], "infeasible">;

/** What step ③ shows below the Generate card. */
export type OutcomeView =
  | { state: "idle" }
  | { state: "running"; draft: boolean }
  | { state: "ready"; quality: "optimal" | "feasible" | "draft"; limitSec: number; tryLonger: number | null }
  | { state: "impossible"; hasTimetable: boolean }
  | { state: "couldntFinish"; kind: CouldntFinishKind; limitSec: number; retryWith: number | null; hasTimetable: boolean }
  | { state: "partial"; unplaced: number; total: number; from: DraftReason | null; backToReasons: boolean };

/** Step ③: the outcome card, whether the solver is offline (banner), and what the main button does. */
export type GenerateView = OutcomeView & { offline: boolean; button: "generate" | "draft" };

export interface GenerateViewInput {
  /** `checking` counts as online: the button shouldn't flip to "quick draft" while /health is in flight. */
  server: "checking" | "online" | "offline";
  running: "exact" | "draft" | null;
  outcome: RunOutcome;
  result: Pick<SolveResult, "engine" | "status" | "placements" | "unplaced"> | null;
  /** The current time limit setting. */
  timeLimitSec: number;
}

/** Pick step ③'s state. A failure shows until the next run, over any older timetable, which stays stored. */
export function generateView({ server, running, outcome, result, timeLimitSec }: GenerateViewInput): GenerateView {
  const offline = server === "offline";
  const base = { offline, button: offline ? ("draft" as const) : ("generate" as const) };
  if (running) return { ...base, state: "running", draft: running === "draft" };
  const { failed } = outcome;
  if (failed && (outcome.showFailure || !result)) {
    const hasTimetable = result !== null;
    const { kind } = failed.failure;
    if (kind === "infeasible") return { ...base, state: "impossible", hasTimetable };
    const limitSec = failed.input.options.timeLimitSec;
    const retryWith = kind === "timeout" ? nextTimeLimit(limitSec) : null;
    return { ...base, state: "couldntFinish", kind, limitSec, retryWith, hasTimetable };
  }
  if (!result) return { ...base, state: "idle" };
  if (result.unplaced.length > 0) {
    return {
      ...base,
      state: "partial",
      unplaced: result.unplaced.length,
      total: result.placements.length + result.unplaced.length,
      from: outcome.draft ?? null,
      backToReasons: failed?.failure.kind === "infeasible",
    };
  }
  const limitSec = outcome.limitSec ?? timeLimitSec;
  if (result.engine !== "cpsat") return { ...base, state: "ready", quality: "draft", limitSec, tryLonger: null };
  const quality = result.status === "optimal" ? "optimal" : "feasible";
  return { ...base, state: "ready", quality, limitSec, tryLonger: quality === "feasible" ? nextTimeLimit(limitSec) : null };
}

/** How a partial timetable was made, for the amber card. */
export function partialHow(from: DraftReason | null): string {
  switch (from) {
    case "impossible":
      return "Made as a quick draft in your browser, because the full timetable can't be built.";
    case "couldntFinish":
      return "Made as a quick draft in your browser, because the exact solver couldn't finish.";
    case "offline":
      return "Made as a quick draft in your browser, because the exact solver was offline.";
    case null:
      return "Made as a quick draft in your browser.";
  }
}

/** Headline and explanation for the "Couldn't finish" card. */
export function couldntFinishText(kind: CouldntFinishKind, limitSec: number): { title: string; body: string } {
  switch (kind) {
    case "timeout":
      return { title: "No timetable found in time", body: `The exact solver didn't find a timetable within ${limitSec} s. More time may be enough.` };
    case "unreachable":
      return { title: "Couldn't reach the exact solver", body: "The solver service didn't answer. It may have stopped." };
    case "serverError":
      return { title: "The exact solver failed", body: "Something went wrong on the solver service." };
  }
}

const CAUSE_GROUPS: Record<UnplacedCause | "other", string> = {
  noRoom: "No room they may use",
  noStart: "Lab longer than any run of teaching periods",
  teacher: "Teacher already busy",
  section: "Section already busy",
  room: "No free room at those times",
  lunch: "Would take the last free lunch period",
  other: "Other reasons",
};

/** Unplaced classes grouped by cause, biggest group first, for the partial card. */
export function unplacedGroups<U extends { cause?: UnplacedCause }>(unplaced: U[]): { cause: UnplacedCause | "other"; label: string; items: U[] }[] {
  const groups = new Map<UnplacedCause | "other", U[]>();
  for (const u of unplaced) {
    const key = u.cause ?? "other";
    groups.set(key, [...(groups.get(key) ?? []), u]);
  }
  return [...groups]
    .map(([cause, items]) => ({ cause, label: CAUSE_GROUPS[cause], items }))
    .sort((a, b) => b.items.length - a.items.length);
}

/** Step ④'s toast when Regenerate failed; the timetable is kept. */
export function regenerateFailedText(failure: SolveFailure, locks: number): string {
  if (failure.kind === "infeasible") return locks > 0 ? "Can't be built with these locks." : "This timetable can't be built.";
  return failure.kind === "timeout" ? "Couldn't finish in time." : "Couldn't reach the exact solver.";
}

/** One-line toast after Regenerate in step ④, e.g. "New timetable: 210 sessions placed · score 18". */
export function regenerateSummary(result: Pick<SolveResult, "placements" | "unplaced" | "score">): string {
  const n = result.placements.length;
  const unplaced = result.unplaced.length > 0 ? ` · ${result.unplaced.length} unplaced` : "";
  return `New timetable: ${n} session${n === 1 ? "" : "s"} placed${unplaced} · score ${result.score.total}`;
}

/** A fresh seed per run so "Generate" again can give a different timetable. Fits CP-SAT's int32 seed. */
export function newSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

/** Step ③ footer: Next waits for a timetable. Not an error, the user just hasn't generated yet. */
export function generateFooterNote(result: SolveResult | null): FooterNote | null {
  return result ? null : { text: "Generate a timetable to continue.", tone: "hint" };
}
