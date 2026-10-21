import type { SolveInput, SolveResult } from "@/domain/types";
import { solveHeuristic, type HeuristicOptions } from "./heuristic";

/** Run the heuristic in a Web Worker so the UI stays responsive. Falls back to the main thread without Worker support. */
export function runHeuristic(input: SolveInput, opts: HeuristicOptions): Promise<SolveResult> {
  if (typeof Worker === "undefined") return Promise.resolve(solveHeuristic(input, opts));
  const worker = new Worker(new URL("./heuristic.worker.ts", import.meta.url), { type: "module" });
  return new Promise<SolveResult>((resolve, reject) => {
    worker.onmessage = (e: MessageEvent<SolveResult>) => resolve(e.data);
    worker.onerror = (e) => reject(new Error(e.message || "Heuristic worker failed"));
    worker.postMessage({ input, opts });
  }).finally(() => worker.terminate());
}
