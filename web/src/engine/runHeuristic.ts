import type { SolveInput, SolveResult } from "@/domain/types";
import { solveHeuristic, type HeuristicOptions } from "./heuristic";

/**
 * Run the heuristic in a Web Worker so the UI stays responsive. Falls back to the main thread without Worker support.
 * Aborting `signal` terminates the worker and rejects with the signal's reason.
 */
export function runHeuristic(input: SolveInput, opts: HeuristicOptions, signal?: AbortSignal): Promise<SolveResult> {
  if (signal?.aborted) return Promise.reject(signal.reason);
  if (typeof Worker === "undefined") return Promise.resolve(solveHeuristic(input, opts));
  const worker = new Worker(new URL("./heuristic.worker.ts", import.meta.url), { type: "module" });
  let onAbort = () => {};
  return new Promise<SolveResult>((resolve, reject) => {
    worker.onmessage = (e: MessageEvent<SolveResult>) => resolve(e.data);
    worker.onerror = (e) => reject(new Error(e.message || "Heuristic worker failed"));
    onAbort = () => reject(signal!.reason);
    signal?.addEventListener("abort", onAbort, { once: true });
    worker.postMessage({ input, opts });
  }).finally(() => {
    signal?.removeEventListener("abort", onAbort);
    worker.terminate();
  });
}
