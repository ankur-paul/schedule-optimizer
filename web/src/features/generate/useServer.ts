import { useCallback, useEffect } from "react";
import { create } from "zustand";
import { checkServer, CONTRACT_VERSION, contractMismatch, type ServerHealth } from "@/engine/solveClient";

export type ServerState = "checking" | "online" | "offline";

/** How often steps ③ and ④ re-check `/health`, so the offline banner goes as soon as the solver is back. */
export const HEALTH_POLL_MS = 5000;

interface ServerStatus {
  server: ServerState;
  /** The server is up but on another contract version than this page (or doesn't say): step ③ warns. */
  contractMismatch: boolean;
}

/** The last `/health` answer, shared by the check on open and every step that polls, so a step opens with it. */
export const useServerStore = create<ServerStatus>(() => ({ server: "checking", contractMismatch: false }));

/** What the store holds after a `/health` answer. */
export function statusFrom(health: ServerHealth): ServerStatus {
  return { server: health.online ? "online" : "offline", contractMismatch: contractMismatch(health) };
}

// The server's version last logged, so a poll every 5 s doesn't repeat the console line.
let logged: number | null | undefined;
// The check under way: a cold start can take as long as the poll interval, so polls join it instead of piling up.
let pending: Promise<void> | null = null;

/**
 * Ask `/health` now and store the answer, or join the check already under way. A version other than this page's is
 * logged to the console once.
 */
export function pollServer(check: () => Promise<ServerHealth> = checkServer): Promise<void> {
  pending ??= check()
    .then((health) => {
      const status = statusFrom(health);
      if (status.contractMismatch && logged !== health.contract) {
        console.warn(`Solver contract version ${health.contract ?? "missing"}, this page expects ${CONTRACT_VERSION}.`);
      }
      logged = status.contractMismatch ? health.contract : undefined;
      useServerStore.setState(status);
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}

/** The check when the site opens (any step): wakes a sleeping solver before step ③ and has the answer ready. */
export function useServerCheckOnOpen(): void {
  useEffect(() => {
    pollServer();
  }, []);
}

/** The exact solver's status, polled every 5 s while the step is open. `recheck` shows "checking…" and asks now. */
export function useServerStatus(): ServerStatus & { recheck: () => void } {
  const status = useServerStore();
  const poll = useCallback(() => pollServer(), []);
  useEffect(() => {
    poll();
    const id = setInterval(poll, HEALTH_POLL_MS);
    return () => clearInterval(id);
  }, [poll]);
  const recheck = () => {
    useServerStore.setState({ server: "checking" });
    poll();
  };
  return { ...status, recheck };
}
