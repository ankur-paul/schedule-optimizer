import { activeInstitute, type Membership, type Role } from "@/features/account/institutes";

// Which screen the assistant panel shows (T40). Plan: docs/discussions/2026-10-24-ai-agent.md, "What changes for the
// user".

/** An institute's `agent_access` row, as members may read it. */
export interface Access {
  questionsLeft: number;
  /** ISO timestamp. */
  expiresAt: string;
}

/** A state the server reported that the access row can't show: the monthly stop, or no key on the server. */
export type Blocked = "paused" | "notConfigured";

export type LockReason = "none" | "expired" | "usedUp";

export type PanelState =
  | { kind: "loading" }
  | { kind: "signedOut" }
  | { kind: "noInstitute" }
  | { kind: "locked"; role: Role; reason: LockReason }
  | { kind: "paused" }
  | { kind: "notConfigured" }
  | { kind: "open" };

export interface PanelInput {
  signedIn: boolean;
  /** The memberships are loaded (they load after the Terms are accepted). */
  loaded: boolean;
  /** The institute the assistant works for (`chooseInstitute`). */
  institute: Membership | null;
  /** That institute's access: `undefined` while loading, `null` when it has none. */
  access: Access | null | undefined;
  blocked: Blocked | null;
  now: Date;
}

/** Why an institute can't ask, or null when it can. */
export function lockReason(access: Access | null, now: Date): LockReason | null {
  if (!access) return "none";
  if (new Date(access.expiresAt).getTime() <= now.getTime()) return "expired";
  if (access.questionsLeft <= 0) return "usedUp";
  return null;
}

export function panelState({ signedIn, loaded, institute, access, blocked, now }: PanelInput): PanelState {
  if (!signedIn) return { kind: "signedOut" };
  if (!loaded) return { kind: "loading" };
  if (!institute) return { kind: "noInstitute" };
  if (blocked === "notConfigured") return { kind: "notConfigured" };
  if (access === undefined) return { kind: "loading" };
  const reason = lockReason(access, now);
  if (reason) return { kind: "locked", role: institute.role, reason };
  if (blocked === "paused") return { kind: "paused" };
  return { kind: "open" };
}

export interface InstituteChoice {
  institute: Membership | null;
  /** Show the picker: the working copy isn't linked to one of your institutes, and you have more than one. */
  picker: boolean;
}

/**
 * The working copy's linked institute when you're a member of it; otherwise the one picked in the panel, else the
 * active institute from the account menu.
 */
export function chooseInstitute(memberships: Membership[], linkedId: string | null, pickedId: string | null, activeId: string | null): InstituteChoice {
  const linked = memberships.find((m) => m.instituteId === linkedId);
  if (linked) return { institute: linked, picker: false };
  const picked = memberships.find((m) => m.instituteId === pickedId);
  return { institute: picked ?? activeInstitute(memberships, activeId), picker: memberships.length >= 2 };
}
