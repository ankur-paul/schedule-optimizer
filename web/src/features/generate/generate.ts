import type { SolveInput, SolveResult } from "@/domain/types";
import type { ValidationResult } from "@/domain/validator";
import type { EngineMode } from "@/engine/solveClient";
import type { FooterNote } from "@/features/footer";
import type { AppData } from "@/store/useAppStore";

export const ENGINE_OPTIONS: { value: EngineMode; title: string; description: string }[] = [
  { value: "auto", title: "Auto (recommended)", description: "Exact solver when the server is running, otherwise the in-browser engine." },
  { value: "cpsat", title: "Exact – CP-SAT", description: "Best possible timetable. Needs the Python solver server." },
  { value: "heuristic", title: "Fast – in-browser", description: "Good timetable in a few seconds. Works offline." },
];

export const TIME_LIMIT = { min: 5, max: 60, step: 5, default: 20 } as const;

/** What the engines get: the college data, the current locks, and run options. */
export function buildSolveInput(data: AppData, options: SolveInput["options"]): SolveInput {
  const { settings, departments, teachers, rooms, sections, courses, locks } = data;
  return { settings, departments, teachers, rooms, sections, courses, locks, options };
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

export function engineLabel(result: Pick<SolveResult, "engine" | "status">): string {
  const name = result.engine === "cpsat" ? "CP-SAT" : "in-browser heuristic";
  return `${name} (${result.status})`;
}

/** The verification badge text, e.g. "✓ Verified: 0 clashes · engine: CP-SAT (optimal)". */
export function badgeText(result: Pick<SolveResult, "engine" | "status">, validation: ValidationResult): string {
  const n = validation.violations.length;
  const head = n === 0 ? "✓ Verified: 0 clashes" : `✗ ${n} rule violation${n === 1 ? "" : "s"} found`;
  return `${head} · engine: ${engineLabel(result)}`;
}

/** False for an engine error that produced nothing; such a result must not replace the stored one. */
export function hasTimetable(result: Pick<SolveResult, "status" | "placements">): boolean {
  return !(result.status === "error" && result.placements.length === 0);
}

/** What the last run said, beyond the stored result: why it fell back, or why nothing was produced. */
export interface Notice { fallbackReason?: string; error?: string }

export function outcomeNotice(result: Pick<SolveResult, "status" | "placements" | "message">, fallbackReason?: string): Notice {
  return hasTimetable(result) ? { fallbackReason } : { error: result.message ?? "The engine failed." };
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
