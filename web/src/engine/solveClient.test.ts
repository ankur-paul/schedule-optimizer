import { describe, expect, it, vi } from "vitest";
import { sampleCollege } from "@/domain/sampleCollege";
import { score } from "@/domain/score";
import { tinyCollege, tinyValid, tinyWith } from "@/domain/tinyCollege";
import type { SolveInput, SolveResult } from "@/domain/types";
import { solveHeuristic, type HeuristicOptions } from "./heuristic";
import { runHeuristic } from "./runHeuristic";
import { checkServer, generate, HEURISTIC_MAX_MS, makeDraft, verify, type GenerateDeps } from "./solveClient";

const ZERO = { total: 0, breakdown: { subjectRepeat: 0, teacherOverload: 0, sectionGaps: 0, batchIdle: 0 } };
const cpsat = (patch: Partial<SolveResult> = {}): SolveResult => ({
  engine: "cpsat",
  status: "optimal",
  placements: tinyValid,
  unplaced: [],
  score: ZERO, // the server may send zeros; the client re-scores
  timeMs: 42,
  ...patch,
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

/** Mock server: `health` and `solve` decide each endpoint's response (a thrown error = network failure). */
function server(opts: { health?: () => Response; solve?: () => Response }) {
  return vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
    const path = String(url);
    if (path.endsWith("/health")) return (opts.health ?? (() => json({ ok: true })))();
    if (path.endsWith("/solve")) return (opts.solve ?? (() => json(cpsat())))();
    throw new Error(`unexpected ${path}`);
  });
}

const offline = () =>
  vi.fn(async () => {
    throw new TypeError("Failed to fetch");
  });

function deps(fetch: GenerateDeps["fetch"]) {
  const runHeuristic = vi.fn(async (input: SolveInput, o: HeuristicOptions, _signal?: AbortSignal) =>
    solveHeuristic(input, { ...o, timeLimitMs: Math.min(o.timeLimitMs, 150) }),
  );
  return { fetch: fetch as typeof globalThis.fetch, runHeuristic, solverUrl: "http://solver.test" };
}

describe("generate: exact solver only", () => {
  it("returns the server's timetable, re-scored and verified", async () => {
    const d = deps(server({}));
    const out = await generate(tinyCollege, d);
    expect(out.failure).toBeUndefined();
    expect(out.result).toMatchObject({ engine: "cpsat", status: "optimal", unplaced: [] });
    expect(out.result?.score).toEqual(score(tinyCollege, tinyValid));
    expect(out.result?.score.total).toBeGreaterThan(0);
    expect(out.validation).toEqual({ ok: true, violations: [], missing: [] });
    expect(d.runHeuristic).not.toHaveBeenCalled();
  });

  it("posts the input as JSON to /solve, without a health check first", async () => {
    const fetch = server({});
    await generate(tinyCollege, deps(fetch));
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("http://solver.test/solve");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string)).toEqual(tinyCollege);
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("infeasible: a failure with the diagnosis, and no quick draft", async () => {
    const diagnosis = [{ kind: "locks" as const, ids: ["a-m:L1"] }];
    const d = deps(server({ solve: () => json(cpsat({ status: "infeasible", placements: [], message: "locks", diagnosis })) }));
    const out = await generate(tinyCollege, d);
    expect(out).toEqual({ failure: { kind: "infeasible", message: "locks", diagnosis } });
    expect(d.runHeuristic).not.toHaveBeenCalled();
  });

  it("infeasible with no cause found: an empty diagnosis and a default message", async () => {
    const out = await generate(tinyCollege, deps(server({ solve: () => json(cpsat({ status: "infeasible", placements: [] })) })));
    expect(out.failure).toEqual({ kind: "infeasible", message: expect.stringMatching(/No clash-free/), diagnosis: [] });
  });

  it("unreachable: a network error", async () => {
    const d = deps(offline());
    const out = await generate(tinyCollege, d);
    expect(out.failure).toEqual({ kind: "unreachable", message: "Could not reach the exact solver." });
    expect(d.runHeuristic).not.toHaveBeenCalled();
  });

  it("timeout: the request outlived the limit plus the grace", async () => {
    const d = deps(server({ solve: () => { throw new DOMException("timed out", "TimeoutError"); } }));
    const out = await generate(tinyCollege, d);
    expect(out.failure).toMatchObject({ kind: "timeout", message: expect.stringMatching(/did not answer within 15 s/) });
    expect(d.runHeuristic).not.toHaveBeenCalled();
  });

  it("timeout: CP-SAT ran out of time without a solution", async () => {
    const solve = () => json(cpsat({ status: "error", placements: [], message: "CP-SAT found no solution in 5s (UNKNOWN)." }));
    const out = await generate(tinyCollege, deps(server({ solve })));
    expect(out.failure).toEqual({ kind: "timeout", message: "CP-SAT found no solution in 5s (UNKNOWN)." });
  });

  it("serverError: the server's own error, or an HTTP error", async () => {
    const crash = () => json(cpsat({ status: "error", placements: [], message: "Solver crashed: boom" }));
    expect((await generate(tinyCollege, deps(server({ solve: crash })))).failure).toEqual({ kind: "serverError", message: "Solver crashed: boom" });
    const http = await generate(tinyCollege, deps(server({ solve: () => json({}, 500) })));
    expect(http.failure).toEqual({ kind: "serverError", message: "The exact solver answered with an error (HTTP 500)." });
  });
});

describe("makeDraft", () => {
  it("runs the heuristic, re-scores and verifies, and never calls the server", async () => {
    const d = deps(server({}));
    const out = await makeDraft(sampleCollege, d);
    expect(d.fetch).not.toHaveBeenCalled();
    expect(out.result.engine).toBe("heuristic");
    expect(out.result.score).toEqual(score(sampleCollege, out.result.placements));
    expect(out.validation.violations).toEqual([]);
  });

  it("re-scores what the heuristic sent", async () => {
    const d = { ...deps(offline()), runHeuristic: vi.fn(async () => cpsat({ engine: "heuristic", status: "feasible" })) };
    const out = await makeDraft(tinyCollege, d);
    expect(out.result.score).toEqual(score(tinyCollege, tinyValid));
  });

  it("caps the heuristic's time budget and passes the seed and signal", async () => {
    const controller = new AbortController();
    const d = { ...deps(offline()), signal: controller.signal };
    await makeDraft({ ...tinyCollege, options: { timeLimitSec: 60, seed: 9 } }, d);
    expect(d.runHeuristic.mock.calls[0][1]).toEqual({ timeLimitMs: HEURISTIC_MAX_MS, seed: 9 });
    expect(d.runHeuristic.mock.calls[0][2]).toBe(controller.signal);
  });
});

describe("generate: cancel", () => {
  /** A /solve that only settles when its request is aborted, like a long CP-SAT run cut short. */
  const hangingSolve = () =>
    vi.fn(async (_url: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_, reject) => init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason))),
    );

  it("rejects straight away when already cancelled, without calling the server", async () => {
    const d = { ...deps(server({})), signal: AbortSignal.abort() };
    await expect(generate(tinyCollege, d)).rejects.toMatchObject({ name: "AbortError" });
    expect(d.fetch).not.toHaveBeenCalled();
  });

  it("aborts a running request: rejects (no failure card) and never runs the quick draft", async () => {
    const controller = new AbortController();
    const d = { ...deps(hangingSolve()), signal: controller.signal };
    const run = generate(tinyCollege, d);
    setTimeout(() => controller.abort(), 10);
    await expect(run).rejects.toMatchObject({ name: "AbortError" });
    expect(d.runHeuristic).not.toHaveBeenCalled();
  });
});

describe("runHeuristic", () => {
  it("rejects with the signal's reason when already cancelled", async () => {
    await expect(runHeuristic(tinyCollege, { timeLimitMs: 50, seed: 1 }, AbortSignal.abort())).rejects.toMatchObject({ name: "AbortError" });
  });

  it("runs normally with a live signal", async () => {
    const out = await runHeuristic(tinyCollege, { timeLimitMs: 50, seed: 1 }, new AbortController().signal);
    expect(out.engine).toBe("heuristic");
  });
});

describe("verify", () => {
  it("lists sessions the engine silently dropped as unplaced", () => {
    const out = verify(tinyCollege, cpsat({ placements: tinyValid.filter((p) => p.sessionId !== "a-m:L1") }));
    expect(out.validation.missing).toEqual(["a-m:L1"]);
    expect(out.result.unplaced).toEqual([{ sessionId: "a-m:L1", reason: "CSE-2A Maths: not placed by the engine" }]);
  });

  it("keeps the engine's own reasons and doesn't duplicate them", () => {
    const placements = tinyValid.filter((p) => p.sessionId !== "a-m:L1");
    const unplaced = [{ sessionId: "a-m:L1", reason: "teacher busy" }];
    expect(verify(tinyCollege, cpsat({ placements, unplaced })).result.unplaced).toEqual(unplaced);
  });

  it("reports clashes from a bad engine", () => {
    const out = verify(tinyCollege, cpsat({ placements: tinyWith({ "a-m:L1": [0, 0, "cr1"] }) }));
    expect(out.validation.ok).toBe(false);
    expect(out.validation.violations.map((v) => v.rule)).toContain("H2");
  });

  it("does not list every session as unplaced for an engine error", () => {
    const out = verify(tinyCollege, cpsat({ status: "error", placements: [] }));
    expect(out.result.unplaced).toEqual([]);
    expect(out.result.score).toEqual(ZERO);
  });
});

describe("checkServer", () => {
  it("is true only for a 200 with { ok: true }", async () => {
    expect(await checkServer(deps(server({})))).toBe(true);
    expect(await checkServer(deps(server({ health: () => json({ ok: false }) })))).toBe(false);
    expect(await checkServer(deps(server({ health: () => json({ ok: true }, 503) })))).toBe(false);
    expect(await checkServer(deps(server({ health: () => new Response("not json") })))).toBe(false);
    expect(await checkServer(deps(offline()))).toBe(false);
  });
});
