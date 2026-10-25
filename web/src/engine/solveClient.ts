import contract from "../../../shared/contract.json";
import { score } from "@/domain/score";
import { sessionLabel } from "@/domain/grid";
import { expandSessions } from "@/domain/sessions";
import { maskTeachers, teacherCodes } from "@/domain/teacherCodes";
import type { Diagnosis, SolveInput, SolveResult } from "@/domain/types";
import { validate, type ValidationResult } from "@/domain/validator";
import type { HeuristicOptions } from "./heuristic";
import { runHeuristic } from "./runHeuristic";

export const SOLVER_URL: string = import.meta.env?.VITE_SOLVER_URL ?? "http://localhost:8000";
/** The data contract this page was built with (`shared/contract.json`); the server reports its own in `/health`. */
export const CONTRACT_VERSION: number = contract.version;
/** Long enough for a cold start on Lambda (1–3 s plus importing the server), so a sleeping solver isn't "offline". */
export const HEALTH_TIMEOUT_MS = 5000;
/**
 * Extra time on top of the CP-SAT limit: a cold start, model building, the network round trip, and the server's locks
 * probe (up to 5 s more when the data with locks is infeasible). Always 15 s, locks or not, so the timeout is one
 * number to explain.
 */
export const SOLVE_GRACE_MS = 15000;
/** The heuristic levels off within a few seconds and runs until its limit, so don't give it the full CP-SAT budget. */
export const HEURISTIC_MAX_MS = 5000;

/** An engine result the client has checked. */
export interface Verified {
  /** Engine output with the score recomputed by the TS scorer and every missing session listed in `unplaced`. */
  result: SolveResult;
  /** Independent re-check of `result.placements`. */
  validation: ValidationResult;
}

/**
 * Why the exact solver gave no timetable. `infeasible`: it proved none exists (`diagnosis` says why, `[]` when it
 * found no single cause). `timeout`: no timetable within the time limit. `serverError`: the server failed.
 * `unreachable`: no answer at all.
 */
export interface SolveFailure {
  kind: "infeasible" | "timeout" | "serverError" | "unreachable";
  message: string;
  diagnosis?: Diagnosis[];
}

/** What Generate gives: a verified timetable, or a failure and no timetable (the stored one stays). */
export type GenerateOutcome = (Verified & { failure?: undefined }) | { failure: SolveFailure; result?: undefined; validation?: undefined };

export interface GenerateDeps {
  fetch?: typeof fetch;
  runHeuristic?: (input: SolveInput, opts: HeuristicOptions, signal?: AbortSignal) => Promise<SolveResult>;
  solverUrl?: string;
  /** Cancels the run: `generate` / `makeDraft` reject with the signal's reason. */
  signal?: AbortSignal;
}

/** What `/health` said. `contract`: the server's contract version, `null` when it didn't send one (or is offline). */
export interface ServerHealth {
  online: boolean;
  contract: number | null;
}

/** `GET /health` with a timeout that outlasts a cold start. Never throws. */
export async function checkServer(deps: GenerateDeps = {}, timeoutMs = HEALTH_TIMEOUT_MS): Promise<ServerHealth> {
  const fetchFn = deps.fetch ?? globalThis.fetch;
  try {
    const res = await fetchFn(`${deps.solverUrl ?? SOLVER_URL}/health`, { signal: AbortSignal.timeout(timeoutMs) });
    const body = res.ok ? await res.json() : null;
    if (body?.ok !== true) return { online: false, contract: null };
    return { online: true, contract: typeof body.contract === "number" ? body.contract : null };
  } catch {
    return { online: false, contract: null };
  }
}

/** True when the server is up but on another contract version than this page, or doesn't say which. */
export function contractMismatch(health: ServerHealth): boolean {
  return health.online && health.contract !== CONTRACT_VERSION;
}

/**
 * The input with each teacher's id and name replaced by its code, in teachers and courses alike: names are the only
 * personal data in it, and an imported id is a slug of the name. Nothing maps back: a result names sessions
 * (`<course id>:L1`), rooms and slots, never a teacher, and the UI labels teachers from the local store.
 */
export function withoutPersonalData(input: SolveInput): SolveInput {
  return maskTeachers(input, teacherCodes(input.teachers));
}

/** `POST /solve` with teacher names stripped. Throws on network errors, timeouts and non-2xx responses. */
export async function solveOnServer(input: SolveInput, deps: GenerateDeps = {}): Promise<SolveResult> {
  const fetchFn = deps.fetch ?? globalThis.fetch;
  const res = await fetchFn(`${deps.solverUrl ?? SOLVER_URL}/solve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(withoutPersonalData(input)),
    signal: withCancel(AbortSignal.timeout(input.options.timeLimitSec * 1000 + SOLVE_GRACE_MS), deps.signal),
  });
  if (!res.ok) throw new Error(`The exact solver answered with an error (HTTP ${res.status})`);
  return (await res.json()) as SolveResult;
}

/**
 * Ask the exact solver (CP-SAT on the server) for a timetable and verify it. Never runs the quick draft: when the
 * solver can't produce a timetable the outcome says why, and the user decides what to do next.
 */
export async function generate(input: SolveInput, deps: GenerateDeps = {}): Promise<GenerateOutcome> {
  deps.signal?.throwIfAborted();
  let server: SolveResult;
  try {
    server = await solveOnServer(input, deps);
  } catch (e) {
    deps.signal?.throwIfAborted(); // cancelled, not failed
    return { failure: requestFailure(e, input.options.timeLimitSec) };
  }
  if (server.status === "infeasible") {
    return { failure: { kind: "infeasible", message: server.message ?? "No clash-free timetable exists for this data.", diagnosis: server.diagnosis ?? [] } };
  }
  if (server.status === "error" || server.status === "partial") {
    const message = server.message ?? "The exact solver failed.";
    // The server reports a search that ran out of time as an error: "CP-SAT found no solution in 20s (UNKNOWN)."
    const kind = /found no solution in/.test(message) ? "timeout" : "serverError";
    return { failure: { kind, message } };
  }
  return verify(input, server);
}

/** The quick draft: the in-browser heuristic, verified. Only runs when the user asks for it. */
export async function makeDraft(input: SolveInput, deps: GenerateDeps = {}): Promise<Verified> {
  const opts = { timeLimitMs: Math.min(input.options.timeLimitSec * 1000, HEURISTIC_MAX_MS), seed: input.options.seed };
  return verify(input, await (deps.runHeuristic ?? runHeuristic)(input, opts, deps.signal));
}

/** Aborts when either signal does (the request timeout or the user's Cancel). */
function withCancel(timeout: AbortSignal, cancel?: AbortSignal): AbortSignal {
  return cancel ? AbortSignal.any([timeout, cancel]) : timeout;
}

/**
 * Re-score with the TS scorer (source of truth) and list every missing session as unplaced.
 * An engine error returns no timetable at all, so its sessions aren't listed one by one.
 */
export function verify(input: SolveInput, result: SolveResult): Verified {
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
  };
}

function requestFailure(e: unknown, timeLimitSec: number): SolveFailure {
  if (e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError")) {
    return { kind: "timeout", message: `The exact solver did not answer within ${timeLimitSec + SOLVE_GRACE_MS / 1000} s.` };
  }
  if (e instanceof TypeError) return { kind: "unreachable", message: "Could not reach the exact solver." };
  return { kind: "serverError", message: e instanceof Error ? `${e.message}.` : "The request to the exact solver failed." };
}
