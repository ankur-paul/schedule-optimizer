import { describe, expect, it, vi } from "vitest";
import { score } from "@/domain/score";
import { tinyCollege, tinyValid, tinyWith } from "@/domain/tinyCollege";
import type { SolveInput, SolveResult } from "@/domain/types";
import { solveHeuristic, type HeuristicOptions } from "./heuristic";
import { runHeuristic } from "./runHeuristic";
import { checkServer, generate, HEURISTIC_MAX_MS, verify, type GenerateDeps } from "./solveClient";

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

describe("generate: auto", () => {
  it("falls back to the heuristic when the server is unreachable", async () => {
    const d = deps(offline());
    const out = await generate(tinyCollege, "auto", d);
    expect(out.result.engine).toBe("heuristic");
    expect(out.fallbackReason).toMatch(/offline/);
    expect(out.validation.ok).toBe(true);
    expect(d.runHeuristic).toHaveBeenCalledOnce();
  });

  it("uses CP-SAT when the server is up and re-scores its result", async () => {
    const d = deps(server({}));
    const out = await generate(tinyCollege, "auto", d);
    expect(out.result).toMatchObject({ engine: "cpsat", status: "optimal", unplaced: [] });
    expect(out.result.score).toEqual(score(tinyCollege, tinyValid));
    expect(out.result.score.total).toBeGreaterThan(0);
    expect(out.validation).toEqual({ ok: true, violations: [], missing: [] });
    expect(out.fallbackReason).toBeUndefined();
    expect(d.runHeuristic).not.toHaveBeenCalled();
  });

  it("posts the input as JSON to /solve", async () => {
    const fetch = server({});
    await generate(tinyCollege, "auto", deps(fetch));
    const [url, init] = fetch.mock.calls[1];
    expect(url).toBe("http://solver.test/solve");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string)).toEqual(tinyCollege);
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("falls back when /health answers but /solve fails", async () => {
    const d = deps(server({ solve: () => { throw new TypeError("Failed to fetch"); } }));
    const out = await generate(tinyCollege, "auto", d);
    expect(out.result.engine).toBe("heuristic");
    expect(out.fallbackReason).toMatch(/Could not reach/);
  });

  it("falls back on an HTTP error", async () => {
    const out = await generate(tinyCollege, "auto", deps(server({ solve: () => json({}, 500) })));
    expect(out.result.engine).toBe("heuristic");
    expect(out.fallbackReason).toMatch(/HTTP 500/);
  });

  it("falls back on a timeout", async () => {
    const d = deps(server({ solve: () => { throw new DOMException("timed out", "TimeoutError"); } }));
    const out = await generate(tinyCollege, "auto", d);
    expect(out.result.engine).toBe("heuristic");
    expect(out.fallbackReason).toMatch(/did not answer within 15 s/);
  });

  it("falls back when CP-SAT finds no solution in time", async () => {
    const d = deps(server({ solve: () => json(cpsat({ status: "error", placements: [], message: "no solution in 5s" })) }));
    const out = await generate(tinyCollege, "auto", d);
    expect(out.result.engine).toBe("heuristic");
    expect(out.fallbackReason).toMatch(/no solution in 5s/);
  });

  it("runs the heuristic for a partial result when CP-SAT says infeasible, keeping its message", async () => {
    const d = deps(server({ solve: () => json(cpsat({ status: "infeasible", placements: [], message: "too many lectures" })) }));
    const out = await generate(tinyCollege, "auto", d);
    expect(out.result.engine).toBe("heuristic");
    expect(out.result.message).toBe("CP-SAT: too many lectures");
    expect(out.fallbackReason).toMatch(/too many lectures.*partial/);
  });

  it("caps the heuristic's time budget", async () => {
    const d = deps(offline());
    await generate({ ...tinyCollege, options: { timeLimitSec: 60, seed: 9 } }, "auto", d);
    expect(d.runHeuristic.mock.calls[0][1]).toEqual({ timeLimitMs: HEURISTIC_MAX_MS, seed: 9 });
  });
});

describe("generate: manual engines", () => {
  it("heuristic mode never calls the server", async () => {
    const fetch = server({});
    const out = await generate(tinyCollege, "heuristic", deps(fetch));
    expect(out.result.engine).toBe("heuristic");
    expect(fetch).not.toHaveBeenCalled();
    expect(out.fallbackReason).toBeUndefined();
  });

  it("cpsat mode reports an error instead of falling back when the server is down", async () => {
    const d = deps(offline());
    const out = await generate(tinyCollege, "cpsat", d);
    expect(out.result).toMatchObject({ engine: "cpsat", status: "error", placements: [], unplaced: [] });
    expect(out.result.message).toMatch(/Could not reach/);
    expect(d.runHeuristic).not.toHaveBeenCalled();
  });

  it("cpsat mode skips the health check", async () => {
    const fetch = server({});
    await generate(tinyCollege, "cpsat", deps(fetch));
    expect(fetch).toHaveBeenCalledOnce();
    expect(String(fetch.mock.calls[0][0])).toMatch(/\/solve$/);
  });

  it("cpsat mode still builds a partial timetable when the data is infeasible", async () => {
    const out = await generate(tinyCollege, "cpsat", deps(server({ solve: () => json(cpsat({ status: "infeasible", placements: [] })) })));
    expect(out.result.engine).toBe("heuristic");
    expect(out.result.message).toMatch(/^CP-SAT: no clash-free/);
  });
});

describe("generate: cancel", () => {
  /** A /solve that only settles when its request is aborted, like a long CP-SAT run cut short. */
  const hangingSolve = () =>
    vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).endsWith("/health")) return json({ ok: true });
      return new Promise<Response>((_, reject) => init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason)));
    });

  it("rejects straight away when already cancelled, without calling any engine", async () => {
    const d = { ...deps(server({})), signal: AbortSignal.abort() };
    await expect(generate(tinyCollege, "auto", d)).rejects.toMatchObject({ name: "AbortError" });
    expect(d.fetch).not.toHaveBeenCalled();
    expect(d.runHeuristic).not.toHaveBeenCalled();
  });

  it("aborts a running CP-SAT request and does not fall back to the heuristic", async () => {
    const controller = new AbortController();
    const d = { ...deps(hangingSolve()), signal: controller.signal };
    const run = generate(tinyCollege, "auto", d);
    setTimeout(() => controller.abort(), 10);
    await expect(run).rejects.toMatchObject({ name: "AbortError" });
    expect(d.runHeuristic).not.toHaveBeenCalled();
  });

  it("passes the signal to the heuristic", async () => {
    const controller = new AbortController();
    const d = { ...deps(offline()), signal: controller.signal };
    await generate(tinyCollege, "heuristic", d);
    expect(d.runHeuristic.mock.calls[0][2]).toBe(controller.signal);
  });

  it("stops before the heuristic when cancelled during the health check", async () => {
    const controller = new AbortController();
    const fetch = vi.fn(async () => {
      controller.abort();
      throw new TypeError("Failed to fetch");
    });
    const d = { ...deps(fetch), signal: controller.signal };
    await expect(generate(tinyCollege, "auto", d)).rejects.toMatchObject({ name: "AbortError" });
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
