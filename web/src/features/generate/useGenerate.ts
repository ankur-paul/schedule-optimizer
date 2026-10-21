import { useEffect, useState } from "react";
import { toast } from "sonner";
import { generate } from "@/engine/solveClient";
import { droppedLocksMessage, pruneLocks } from "@/features/lock/locks";
import { useAppStore } from "@/store/useAppStore";
import { buildSolveInput, newSeed, outcomeNotice, type Notice } from "./generate";

/**
 * Runs the chosen engine on the current store data (step ③ Generate and step ④ Regenerate share it).
 * Locks that no longer fit the data are dropped first, with a toast. Returns null if a run is already going.
 */
export function useGenerate() {
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!running) return;
    const t0 = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 250);
    return () => clearInterval(id);
  }, [running]);

  const run = async (): Promise<Notice | null> => {
    if (running) return null;
    const state = useAppStore.getState();
    const { kept, dropped } = pruneLocks(state, state.locks);
    if (dropped.length > 0) {
      state.setLocks(kept);
      toast.warning(droppedLocksMessage(dropped));
    }
    setElapsed(0);
    setRunning(true);
    try {
      const input = buildSolveInput({ ...state, locks: kept }, { timeLimitSec: state.timeLimitSec, seed: newSeed() });
      const outcome = await generate(input, state.engineMode);
      const notice = outcomeNotice(outcome.result, outcome.fallbackReason);
      // An engine error has no timetable: keep the previous result rather than wiping it.
      if (!notice.error) useAppStore.getState().setResult(outcome.result);
      return notice;
    } finally {
      setRunning(false);
    }
  };

  return { running, elapsed, run };
}
