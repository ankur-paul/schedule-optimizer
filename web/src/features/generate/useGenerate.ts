import { useEffect, useState } from "react";
import { toast } from "sonner";
import { create } from "zustand";
import type { SolveInput, SolveResult } from "@/domain/types";
import { fillSoftRules } from "@/domain/score";
import { checkServer, generate, makeDraft, type SolveFailure } from "@/engine/solveClient";
import { droppedLocksMessage, pruneLocks } from "@/features/lock/locks";
import { useAppStore } from "@/store/useAppStore";
import { buildSolveInput, newSeed, rememberLimit, type DraftReason, type RunOutcome } from "./generate";

/**
 * The run in progress and the last run's outcome, shared by steps ③ and ④ and the footer. Not persisted: after a
 * reload step ③ shows the stored timetable, not an old failure.
 */
const useRun = create<{ controller: AbortController | null; kind: "exact" | "draft" | null; limitSec: number | null; outcome: RunOutcome }>(() => ({
  controller: null,
  kind: null,
  limitSec: null,
  outcome: { showFailure: false },
}));

/** True while any engine run is going. */
export const useGenerating = () => useRun((s) => s.controller !== null);
export const useRunKind = () => useRun((s) => s.kind);
/** The exact solver's limit for the run in progress, for "7 s of up to 40 s". */
export const useRunLimit = () => useRun((s) => s.limitSec);
export const useRunOutcome = () => useRun((s) => s.outcome);
/** The last run's outcome outside React, for the assistant's tools. */
export const runOutcome = () => useRun.getState().outcome;

/** Switch step ③ between the last failure ("Back to the reasons") and the stored timetable. */
export function showFailure(show: boolean) {
  useRun.setState((s) => ({ outcome: { ...s.outcome, showFailure: show } }));
}

/** How a run ended. null: another run was already going. */
export type RunEnd = { kind: "done" } | { kind: "failed"; failure: SolveFailure } | { kind: "cancelled" } | null;

/** Current store data as solver input. Locks that no longer fit the data are dropped first, with a toast. */
function currentInput(timeLimitSec: number): SolveInput {
  const state = useAppStore.getState();
  const { kept, dropped } = pruneLocks(state, state.locks);
  if (dropped.length > 0) {
    state.setLocks(kept);
    toast.warning(droppedLocksMessage(dropped));
  }
  return buildSolveInput({ ...state, locks: kept }, { timeLimitSec, seed: newSeed() });
}

/** Store a finished run's timetable with the switches it was made with, which clears "Preferences changed". */
const store = (input: SolveInput, result: SolveResult) => useAppStore.getState().setRunResult(result, fillSoftRules(input.softRules));

/** Run `work` as the one active run; a cancel resolves to `cancelled` with the stored timetable untouched. */
async function exclusive(kind: "exact" | "draft", limitSec: number | null, work: (signal: AbortSignal) => Promise<RunEnd>): Promise<RunEnd> {
  if (useRun.getState().controller) return null;
  const controller = new AbortController();
  useRun.setState({ controller, kind, limitSec });
  try {
    return await work(controller.signal);
  } catch (e) {
    if (controller.signal.aborted) return { kind: "cancelled" };
    throw e;
  } finally {
    useRun.setState({ controller: null, kind: null, limitSec: null });
  }
}

/**
 * Generate with the exact solver only, at the remembered limit or a retry's `retryLimit` ("Try again with 40 s"). A
 * retry that finishes with a timetable becomes the remembered limit.
 */
export const runExact = (retryLimit?: number) => {
  const { timeLimitSec } = useAppStore.getState();
  return exclusive("exact", retryLimit ?? timeLimitSec, async (signal) => {
    const input = currentInput(retryLimit ?? timeLimitSec);
    const out = await generate(input, { signal });
    useAppStore.getState().setTimeLimitSec(rememberLimit(timeLimitSec, retryLimit, !out.failure));
    if (out.failure) {
      const failed = { failure: out.failure, input };
      useRun.setState((s) => ({ outcome: { ...s.outcome, failed, showFailure: true } }));
      return { kind: "failed", failure: out.failure };
    }
    store(input, out.result);
    useRun.setState({ outcome: { showFailure: false, limitSec: input.options.timeLimitSec } });
    return { kind: "done" };
  });
};

/** A quick draft. Keeps the last failure when the draft answers it, so a partial result can lead "Back to the reasons". */
export const runDraft = (reason: DraftReason) =>
  exclusive("draft", null, async (signal) => {
    const input = currentInput(useAppStore.getState().timeLimitSec);
    const out = await makeDraft(input, { signal });
    store(input, out.result);
    useRun.setState((s) => ({
      outcome: { failed: reason === "offline" ? undefined : s.outcome.failed, showFailure: false, draft: reason },
    }));
    return { kind: "done" };
  });

/** Step ④'s *Regenerate*, for callers without the polled server state (the assistant's cards, T44): the exact solver, or a quick draft while it is offline. */
export async function regenerate(): Promise<RunEnd> {
  return (await checkServer()).online ? runExact() : runDraft("offline");
}

/**
 * Step ③ Generate and step ④ Regenerate. `generate` asks the exact solver only; on failure the stored timetable stays
 * and the failure is kept for step ③'s card. `draft` makes a quick draft, only ever from a button that says so.
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

  const cancel = () => useRun.getState().controller?.abort();

  return { running, elapsed, generate: runExact, draft: runDraft, cancel };
}

/** Toast for a cancelled run. */
export function cancelledToast() {
  const hasResult = useAppStore.getState().result !== null;
  toast.info(hasResult ? "Generation cancelled. The previous timetable is unchanged." : "Generation cancelled.");
}
