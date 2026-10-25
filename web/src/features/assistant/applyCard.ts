import { regenerateFailedText } from "@/features/generate/generate";
import type { RunEnd } from "@/features/generate/useGenerate";
import { scoreLine, changesWorkingCopy, stepStates, type Card } from "./chat";
import { applyChanges, isOnlineChange, type Change, type ChangeData, type OnlineChange, type OnlineRun, type Proposal } from "./changes";
import { maskText } from "./mask";
import { findCard, updateCard, useAssistant } from "./useAssistant";

// *Apply* on a change card (T44): check the card again on the working copy as it is now, take an undo snapshot, make
// the working-copy changes, run Generate if the card has it, then the online changes in order. The first failure
// stops it; the steps already made stay, and the card shows which step failed and why.

export interface ApplyDeps {
  /** The working copy now. */
  data: () => ChangeData;
  setData: (data: ChangeData) => void;
  pushUndo: (label: string) => void;
  /** Generate as the button does: the exact solver, or a quick draft while it is offline. */
  regenerate: () => Promise<RunEnd>;
  runOnline: (change: OnlineChange) => Promise<OnlineRun>;
}

/** Why a Generate that didn't finish stopped the card. */
function regenerateFailure(end: RunEnd, locks: number): string {
  if (!end) return "Another Generate is running. Try again when it's done.";
  if (end.kind === "cancelled") return "Generate was cancelled.";
  if (end.kind === "failed") return regenerateFailedText(end.failure, locks);
  return "";
}

export async function applyCard(n: number, deps: ApplyDeps): Promise<void> {
  const start = useAssistant.getState();
  const card = findCard(n);
  if (!card || card.status !== "proposed" || start.applying !== null || start.busy) return;
  const generation = start.generation;
  const live = () => useAssistant.getState().generation === generation;
  const update = (patch: Partial<Card>) => {
    if (live()) updateCard(n, patch);
  };
  useAssistant.setState({ applying: n });
  update({ status: "applying" });

  try {
    const changes = (card.input as Proposal).changes;
    const local = changes.filter((c: Change) => !isOnlineChange(c) && c.op !== "regenerate").length;
    const online = changes.filter(isOnlineChange);
    const count = card.lines.length;

    let next: ChangeData;
    try {
      next = applyChanges(card.input, deps.data());
    } catch {
      update({ status: "outOfDate" });
      return;
    }

    // The score line compares with the timetable the user had before the card, not the one its moves left.
    const { result: before, softRules: rulesBefore } = deps.data();
    if (changesWorkingCopy(card)) deps.pushUndo(`assistant changes #${n}`);
    // open_online is an online change that replaces the working copy, so it runs below, after the snapshot.
    if (local > 0) deps.setData(next);
    let done = local;
    update({ steps: stepStates(count, done) });

    const stop = (step: number, reason: string, conflict?: boolean) =>
      update({ status: "stopped", steps: stepStates(count, step, step), failure: { step, reason: maskText(reason, deps.data().teachers), ...(conflict && { conflict }) } });

    if (card.regenerate) {
      const end = await deps.regenerate();
      const after = deps.data().result;
      if (end?.kind !== "done" || !after) {
        const reason = regenerateFailure(end, deps.data().locks.length);
        // Only a solver failure has reasons to see in step ③.
        if (end?.kind === "failed") update({ after: { text: reason, failed: true } });
        stop(done, reason);
        return;
      }
      update({ after: { text: scoreLine(before, after, { before: rulesBefore, after: deps.data().softRules }), failed: false } });
      done++;
      update({ steps: stepStates(count, done) });
    }

    for (const change of online) {
      const out = await deps.runOnline(change);
      if (!out.ok) {
        stop(done, out.reason, out.conflict);
        return;
      }
      done++;
      update({ steps: stepStates(count, done) });
    }
    update({ status: "applied" });
  } finally {
    // Also after *New chat*, which leaves a running card to finish.
    if (useAssistant.getState().applying === n) useAssistant.setState({ applying: null });
  }
}
