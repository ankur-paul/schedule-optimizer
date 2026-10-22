import { useCallback, useEffect, useState } from "react";
import { checkServer } from "@/engine/solveClient";

export type ServerState = "checking" | "online" | "offline";

/** How often steps ③ and ④ re-check `/health`, so the offline banner goes as soon as the solver is back. */
export const HEALTH_POLL_MS = 5000;

/** The exact solver's status, polled every 5 s while the step is open. `recheck` shows "checking…" and asks now. */
export function useServerStatus(): { server: ServerState; recheck: () => void } {
  const [server, setServer] = useState<ServerState>("checking");
  const poll = useCallback(() => checkServer().then((up) => setServer(up ? "online" : "offline")), []);
  useEffect(() => {
    poll();
    const id = setInterval(poll, HEALTH_POLL_MS);
    return () => clearInterval(id);
  }, [poll]);
  const recheck = () => {
    setServer("checking");
    poll();
  };
  return { server, recheck };
}
