import type { SolveInput } from "@/domain/types";
import { solveHeuristic, type HeuristicOptions } from "./heuristic";

self.onmessage = (e: MessageEvent<{ input: SolveInput; opts: HeuristicOptions }>) => {
  self.postMessage(solveHeuristic(e.data.input, e.data.opts));
};
