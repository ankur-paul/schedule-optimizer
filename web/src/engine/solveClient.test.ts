import { describe, expect, it, vi } from "vitest";
import { sampleCollege } from "@/domain/sampleCollege";
import { score } from "@/domain/score";
import { expandSessions } from "@/domain/sessions";
import { tinyCollege, tinyValid, tinyWith } from "@/domain/tinyCollege";
import type { SolveInput, SolveResult } from "@/domain/types";
import { solveHeuristic, type HeuristicOptions } from "./heuristic";
import { runHeuristic } from "./runHeuristic";
import { teacherCodes } from "@/domain/teacherCodes";
import {
  checkServer,
  CONTRACT_VERSION,
  contractMismatch,
  generate,
  HEALTH_TIMEOUT_MS,
  HEURISTIC_MAX_MS,
  makeDraft,
  SOLVE_GRACE_MS,
  verify,
  withoutPersonalData,
  type GenerateDeps,
} from "./solveClient";

const ZERO = { total: 0, breakdown: { subjectRepeat: 0, teacherOverload: 0, sectionGaps: 0, batchIdle: 0, lateFinish: 0 } };
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
    if (path.endsWith("/health")) return (opts.health ?? (() => json({ ok: true, contract: CONTRACT_VERSION })))();
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

  it("posts the input as JSON to /solve, without teacher names or a health check first", async () => {
    const fetch = server({});
    await generate(tinyCollege, deps(fetch));
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("http://solver.test/solve");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string)).toEqual(withoutPersonalData(tinyCollege));
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("sends no teacher name anywhere in the body", async () => {
    const fetch = server({});
    await generate(sampleCollege, deps(fetch));
    const body = fetch.mock.calls[0][1]?.body as string;
    for (const t of sampleCollege.teachers) expect(body).not.toContain(t.name);
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
    expect(out.failure).toMatchObject({ kind: "timeout", message: "The exact solver did not answer within 20 s." }); // 5 s limit + 15 s
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

// Imported teachers: each id is a slug of the name, and one course has a teacher per batch.
const IMPORTED_IDS: Record<string, string> = { t1: "dr-anita-sharma", t2: "ravi-gupta", t3: "s-rao" };
const imported: SolveInput = {
  ...tinyCollege,
  teachers: [
    { id: "dr-anita-sharma", name: "Dr. Anita Sharma", departmentId: "cse" },
    { id: "ravi-gupta", name: "Ravi Gupta", departmentId: "ece" },
    { id: "s-rao", name: "S. Rao", departmentId: "cse" },
  ],
  courses: tinyCollege.courses.map((c) => ({
    ...c,
    teacherId: IMPORTED_IDS[c.teacherId],
    ...(c.batchTeacherIds ? { batchTeacherIds: c.batchTeacherIds.map((id) => IMPORTED_IDS[id]) } : {}),
  })),
};

describe("withoutPersonalData", () => {
  it("replaces each teacher's id and name with its code, in teachers and courses", () => {
    const codes = teacherCodes(imported.teachers);
    const out = withoutPersonalData(imported);
    expect(out.teachers.map((t) => [t.id, t.name])).toEqual(imported.teachers.map((t) => [codes.get(t.id), codes.get(t.id)]));
    const ds = out.courses.find((c) => c.id === "a-ds")!;
    expect(ds.teacherId).toBe(codes.get("dr-anita-sharma"));
    expect(ds.batchTeacherIds).toEqual([codes.get("dr-anita-sharma"), codes.get("ravi-gupta")]);
  });

  it("leaves no teacher id or name anywhere in the serialised input", () => {
    const body = JSON.stringify(withoutPersonalData(imported)).toLowerCase();
    for (const t of imported.teachers) {
      expect(body).not.toContain(t.id);
      expect(body).not.toContain(t.name.toLowerCase());
    }
    for (const word of ["anita", "sharma", "ravi", "gupta", "rao"]) expect(body).not.toContain(word);
  });

  it("changes nothing but the teachers and the courses' teacher fields", () => {
    const out = withoutPersonalData(imported);
    expect({ ...out, teachers: [], courses: [] }).toEqual({ ...imported, teachers: [], courses: [] });
    const strip = ({ teacherId: _, batchTeacherIds: __, ...rest }: SolveInput["courses"][number]) => rest;
    expect(out.courses.map(strip)).toEqual(imported.courses.map(strip));
    expect(out.teachers.map((t) => t.departmentId)).toEqual(imported.teachers.map((t) => t.departmentId));
  });

  it("gives the same codes every time, whatever the teachers' order", () => {
    const reordered = { ...imported, teachers: [...imported.teachers].reverse() };
    const codeOf = (input: SolveInput) => new Map(withoutPersonalData(input).courses.map((c) => [c.id, c.teacherId]));
    expect(codeOf(reordered)).toEqual(codeOf(imported));
    expect(withoutPersonalData(imported)).toEqual(withoutPersonalData(imported));
  });

  it("keeps the session ids, so locks and results need no mapping back", () => {
    const sessions = (input: SolveInput) => expandSessions(input).map((x) => x.id);
    expect(sessions(withoutPersonalData(imported))).toEqual(sessions(imported));
  });

  it("does not mutate the input", () => {
    const before = structuredClone(imported);
    withoutPersonalData(imported);
    expect(imported).toEqual(before);
  });

  it("works with no teachers", () => {
    const input = { ...tinyCollege, teachers: [], courses: [] };
    expect(withoutPersonalData(input)).toEqual(input);
  });
});

describe("generate with teacher codes", () => {
  it("verifies the result against the real data, the same as a result for real ids", async () => {
    // The server sees only codes; its answer names sessions, rooms and slots, so the client checks it as it is.
    const fetch = server({});
    const out = await generate(imported, deps(fetch));
    expect(out).toEqual(verify(imported, cpsat()));
    expect(out.validation?.ok).toBe(true);
    expect(JSON.parse(fetch.mock.calls[0][1]?.body as string)).toEqual(withoutPersonalData(imported));
  });

  it("an infeasible diagnosis names the real sessions", async () => {
    const diagnosis = [{ kind: "noSlot" as const, ids: ["a-ds:P1:B2"], detail: "noRoom" }];
    const solve = () => json(cpsat({ status: "infeasible", placements: [], diagnosis }));
    const out = await generate(imported, deps(server({ solve })));
    expect(out.failure?.diagnosis).toEqual(diagnosis);
    expect(expandSessions(imported).find((x) => x.id === "a-ds:P1:B2")?.teacherId).toBe("ravi-gupta");
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
  const offlineHealth = { online: false, contract: null };

  it("is online only for a 200 with { ok: true }", async () => {
    expect(await checkServer(deps(server({})))).toEqual({ online: true, contract: CONTRACT_VERSION });
    expect(await checkServer(deps(server({ health: () => json({ ok: false }) })))).toEqual(offlineHealth);
    expect(await checkServer(deps(server({ health: () => json({ ok: true }, 503) })))).toEqual(offlineHealth);
    expect(await checkServer(deps(server({ health: () => new Response("not json") })))).toEqual(offlineHealth);
    expect(await checkServer(deps(offline()))).toEqual(offlineHealth);
  });

  it("reads the server's contract version: matching, different or missing", async () => {
    const health = (body: unknown) => checkServer(deps(server({ health: () => json(body) })));
    expect(await health({ ok: true, contract: CONTRACT_VERSION })).toEqual({ online: true, contract: CONTRACT_VERSION });
    expect(await health({ ok: true, contract: CONTRACT_VERSION + 1 })).toEqual({ online: true, contract: CONTRACT_VERSION + 1 });
    expect(await health({ ok: true })).toEqual({ online: true, contract: null });
    expect(await health({ ok: true, contract: "1" })).toEqual({ online: true, contract: null });
  });

  it("waits 5 s by default, long enough for a cold start", async () => {
    expect(HEALTH_TIMEOUT_MS).toBe(5000);
    const fetch = server({});
    await checkServer(deps(fetch));
    expect(fetch.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("is offline when the server doesn't answer within the timeout", async () => {
    const hang = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal!.reason))),
    );
    expect(await checkServer(deps(hang), 20)).toEqual(offlineHealth);
  });
});

describe("contractMismatch", () => {
  it("only when the server is online on another version, or doesn't say", () => {
    expect(contractMismatch({ online: true, contract: CONTRACT_VERSION })).toBe(false);
    expect(contractMismatch({ online: true, contract: CONTRACT_VERSION + 1 })).toBe(true);
    expect(contractMismatch({ online: true, contract: null })).toBe(true);
    expect(contractMismatch({ online: false, contract: null })).toBe(false);
  });
});

describe("timeouts", () => {
  it("gives a solve 15 s on top of its limit", () => {
    expect(SOLVE_GRACE_MS).toBe(15000);
  });
});
