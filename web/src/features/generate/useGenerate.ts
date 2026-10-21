import { useEffect, useState } from "react";
import { toast } from "sonner";
import { create } from "zustand";
import { generate } from "@/engine/solveClient";
import { droppedLocksMessage, pruneLocks } from "@/features/lock/locks";
import { useAppStore } from "@/store/useAppStore";
import { buildSolveInput, newSeed, outcomeNotice, type Notice } from "./generate";

/** The run in progress, shared by steps ③ and ④ and the footer (not persisted). */
const useRun = create<{ controller: AbortController | null }>(() => ({ controller: null }));

/** True while any engine run is going. */
export const useGenerating = () => useRun((s) => s.controller !== null);

/**
 * Runs the chosen engine on the current store data (step ③ Generate and step ④ Regenerate share it).
 * Locks that no longer fit the data are dropped first, with a toast. `run` returns null if a run is already
 * going; `cancel` stops it, and the run then resolves to `{ cancelled: true }` with the previous result kept.
 */
export function useGenerate() {
  const running = useGenerating();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!running) return;
    setElapsed(0);
    const t0 = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 250);
    return () => clearInterval(id);
  }, [running]);

  const run = async (): Promise<Notice | null> => {
    if (useRun.getState().controller) return null;
    const controller = new AbortController();
    const state = useAppStore.getState();
    const { kept, dropped } = pruneLocks(state, state.locks);
    if (dropped.length > 0) {
      state.setLocks(kept);
      toast.warning(droppedLocksMessage(dropped));
    }
    useRun.setState({ controller });
    try {
      const input = buildSolveInput({ ...state, locks: kept }, { timeLimitSec: state.timeLimitSec, seed: newSeed() });
      const outcome = await generate(input, state.engineMode, { signal: controller.signal });
      const notice = outcomeNotice(outcome.result, outcome.fallbackReason);
      // An engine error has no timetable: keep the previous result rather than wiping it.
      if (!notice.error) useAppStore.getState().setResult(outcome.result);
      return notice;
    } catch (e) {
      if (controller.signal.aborted) return { cancelled: true };
      throw e;
    } finally {
      useRun.setState({ controller: null });
    }
  };

  const cancel = () => useRun.getState().controller?.abort();

  return { running, elapsed, run, cancel };
}

/** Toast for a cancelled run. */
export function cancelledToast() {
  const hasResult = useAppStore.getState().result !== null;
  toast.info(hasResult ? "Generation cancelled. The previous timetable is unchanged." : "Generation cancelled.");
}
