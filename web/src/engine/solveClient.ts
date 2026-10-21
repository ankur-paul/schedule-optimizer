import { score } from "@/domain/score";
import { sessionLabel } from "@/domain/grid";
import { expandSessions } from "@/domain/sessions";
import type { SolveInput, SolveResult } from "@/domain/types";
import { validate, type ValidationResult } from "@/domain/validator";
import type { HeuristicOptions } from "./heuristic";
import { runHeuristic } from "./runHeuristic";

export type EngineMode = "auto" | "cpsat" | "heuristic";

export const SOLVER_URL: string = import.meta.env?.VITE_SOLVER_URL ?? "http://localhost:8000";
export const HEALTH_TIMEOUT_MS = 1000;
/** Extra time on top of the CP-SAT limit for model building and the network round trip. */
export const SOLVE_GRACE_MS = 5000;
/** The heuristic levels off within a few seconds and runs until its limit, so don't give it the full CP-SAT budget. */
export const HEURISTIC_MAX_MS = 5000;

export interface GenerateOutcome {
  /** Engine output with the score recomputed by the TS scorer and every missing session listed in `unplaced`. */
  result: SolveResult;
  /** Independent re-check of `result.placements`. */
  validation: ValidationResult;
  /** Set when `auto` (or an infeasible CP-SAT run) switched to the heuristic: why. */
  fallbackReason?: string;
}

export interface GenerateDeps {
  fetch?: typeof fetch;
  runHeuristic?: (input: SolveInput, opts: HeuristicOptions, signal?: AbortSignal) => Promise<SolveResult>;
  solverUrl?: string;
  /** Cancels the run: `generate` rejects with the signal's reason and never falls back to another engine. */
  signal?: AbortSignal;
}

/** `GET /health` with a short timeout. Never throws. */
export async function checkServer(deps: GenerateDeps = {}, timeoutMs = HEALTH_TIMEOUT_MS): Promise<boolean> {
  const fetchFn = deps.fetch ?? globalThis.fetch;
  try {
    const res = await fetchFn(`${deps.solverUrl ?? SOLVER_URL}/health`, { signal: AbortSignal.timeout(timeoutMs) });
    return res.ok && (await res.json())?.ok === true;
  } catch {
    return false;
  }
}

/** `POST /solve`. Throws on network errors, timeouts and non-2xx responses. */
export async function solveOnServer(input: SolveInput, deps: GenerateDeps = {}): Promise<SolveResult> {
  const fetchFn = deps.fetch ?? globalThis.fetch;
  const res = await fetchFn(`${deps.solverUrl ?? SOLVER_URL}/solve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal: withCancel(AbortSignal.timeout(input.options.timeLimitSec * 1000 + SOLVE_GRACE_MS), deps.signal),
  });
  if (!res.ok) throw new Error(`Solver server answered HTTP ${res.status}`);
  return (await res.json()) as SolveResult;
}

/**
 * Produce a timetable with the chosen engine and verify it.
 * - `heuristic`: in-browser engine only.
 * - `cpsat`: server only; if it proves the data infeasible, the heuristic still builds a partial timetable.
 * - `auto`: CP-SAT when the server is up and finds a solution, otherwise the heuristic.
 * Whatever runs, the result is re-scored with `score()` and re-checked with `validate()`.
 */
export async function generate(input: SolveInput, mode: EngineMode, deps: GenerateDeps = {}): Promise<GenerateOutcome> {
  const { signal } = deps;
  const heuristic = () =>
    (deps.runHeuristic ?? runHeuristic)(
      input,
      { timeLimitMs: Math.min(input.options.timeLimitSec * 1000, HEURISTIC_MAX_MS), seed: input.options.seed },
      signal,
    );
  signal?.throwIfAborted();

  if (mode === "heuristic") return verify(input, await heuristic());

  const up = mode === "auto" ? await checkServer(deps) : true;
  signal?.throwIfAborted();
  if (!up) return verify(input, await heuristic(), "Solver server is offline, so the in-browser engine was used.");

  let server: SolveResult;
  try {
    server = await solveOnServer(input, deps);
  } catch (e) {
    signal?.throwIfAborted(); // cancelled, not failed: don't fall back
    const why = describeError(e, input.options.timeLimitSec);
    if (mode === "cpsat") return verify(input, failed(why));
    return verify(input, await heuristic(), `${why} The in-browser engine was used instead.`);
  }

  if (server.status === "infeasible") {
    const partial = await heuristic();
    const reason = `CP-SAT: ${server.message ?? "no clash-free timetable exists for this data."}`;
    return verify(input, { ...partial, message: reason }, `${reason} Showing the best partial timetable.`);
  }
  if (server.status === "error" && mode === "auto") {
    return verify(input, await heuristic(), `CP-SAT failed (${server.message ?? "unknown error"}). The in-browser engine was used instead.`);
  }
  return verify(input, server);
}

/** Aborts when either signal does (the request timeout or the user's Cancel). */
function withCancel(timeout: AbortSignal, cancel?: AbortSignal): AbortSignal {
  return cancel ? AbortSignal.any([timeout, cancel]) : timeout;
}

/**
 * Re-score with the TS scorer (source of truth) and list every missing session as unplaced.
 * An engine error returns no timetable at all, so its sessions aren't listed one by one.
 */
export function verify(input: SolveInput, result: SolveResult, fallbackReason?: string): GenerateOutcome {
  const validation = validate(input, result.placements);
  const listed = new Set(result.unplaced.map((u) => u.sessionId));
  const sessions = new Map(expandSessions(input).map((s) => [s.id, s]));
  const missing =
    result.status === "error"
      ? []
      : validation.missing
          .filter((id) => !listed.has(id))
          .map((id) => {
            const s = sessions.get(id);
            return { sessionId: id, reason: `${s ? sessionLabel(input, s) : id}: not placed by the engine` };
          });
  return {
    result: { ...result, unplaced: [...result.unplaced, ...missing], score: score(input, result.placements) },
    validation,
    fallbackReason,
  };
}

function failed(message: string): SolveResult {
  return {
    engine: "cpsat",
    status: "error",
    placements: [],
    unplaced: [],
    score: { total: 0, breakdown: { subjectRepeat: 0, teacherOverload: 0, sectionGaps: 0, batchIdle: 0 } },
    timeMs: 0,
    message,
  };
}

function describeError(e: unknown, timeLimitSec: number): string {
  if (e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError")) {
    return `Solver server did not answer within ${timeLimitSec + SOLVE_GRACE_MS / 1000} s.`;
  }
  if (e instanceof TypeError) return "Could not reach the solver server.";
  return e instanceof Error ? `${e.message}.` : "Solver server request failed.";
}
