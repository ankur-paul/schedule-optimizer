/**
 * Email confirmation for *Make admin* and *Leave institute* (T26). Postgres refuses both unless the caller signed in
 * by email link in the last 10 minutes; this module decides when to ask for that link, and remembers what to finish
 * once the user comes back through it.
 */

/** Matches `private.email_confirmed_recently()` in the T26 migration. */
export const CONFIRM_WINDOW_SEC = 10 * 60;
/** Ask for a fresh link this long before the window ends, so the action doesn't race the database's clock. */
const MARGIN_SEC = 30;
/** A pending action is dropped after this long; the email link itself expires after an hour. */
export const PENDING_TTL_MS = 60 * 60 * 1000;

/** The payload of a JWT, or `null` if it isn't one. The signature isn't checked: Postgres does the real check. */
export function tokenClaims(token: string | undefined | null): Record<string, unknown> | null {
  const part = token?.split(".")[1];
  if (!part) return null;
  try {
    const binary = atob(part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "="));
    const json = new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
    const claims: unknown = JSON.parse(json);
    return claims && typeof claims === "object" ? (claims as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** When (epoch seconds) the session last signed in by email link, from the token's `amr`; `null` if never. */
export function emailSignInAt(token: string | undefined | null): number | null {
  const amr = tokenClaims(token)?.amr;
  if (!Array.isArray(amr)) return null;
  let latest: number | null = null;
  for (const entry of amr) {
    const { method, timestamp } = (entry ?? {}) as { method?: unknown; timestamp?: unknown };
    if ((method === "otp" || method === "magiclink") && typeof timestamp === "number" && (latest === null || timestamp > latest)) latest = timestamp;
  }
  return latest;
}

/** Whether the database will accept the action now without another email link. */
export function confirmedRecently(token: string | undefined | null, nowMs: number): boolean {
  const at = emailSignInAt(token);
  return at !== null && nowMs / 1000 - at < CONFIRM_WINDOW_SEC - MARGIN_SEC;
}

/** An action waiting for its email link. `by` is the user who asked, so another account never finishes it. */
export type PendingAction =
  | { kind: "make_admin"; instituteId: string; instituteName: string; userId: string; userLabel: string; by: string; at: number }
  | { kind: "leave"; instituteId: string; instituteName: string; by: string; at: number };

/** What the action does, as asked before it runs: "Make Bela Kaur the admin of GNDEC? You'll become an editor." */
export function actionQuestion(action: PendingAction): string {
  return action.kind === "make_admin"
    ? `Make ${action.userLabel} the admin of ${action.instituteName}? You'll become an editor.`
    : `Leave ${action.instituteName}? You'll need a new invite from the admin to come back.`;
}

/** The toast once it's done. */
export function actionDone(action: PendingAction): string {
  return action.kind === "make_admin" ? `${action.userLabel} is now the admin. You're an editor.` : `You left ${action.instituteName}.`;
}

/** The localStorage key for a user's pending action. */
export function pendingKey(userId: string): string {
  return `lattice-pending-confirm:${userId}`;
}

/** The stored pending action for `userId`, if it is theirs, well formed and under an hour old. */
export function parsePending(raw: string | null, userId: string, nowMs: number): PendingAction | null {
  if (!raw) return null;
  try {
    const action = JSON.parse(raw) as PendingAction;
    if (action.by !== userId || typeof action.at !== "number" || nowMs - action.at > PENDING_TTL_MS || nowMs < action.at) return null;
    if (action.kind === "make_admin" && typeof action.userId === "string" && typeof action.instituteId === "string") return action;
    if (action.kind === "leave" && typeof action.instituteId === "string") return action;
    return null;
  } catch {
    return null;
  }
}

/** T26's refusal, recognised by its hint so the UI offers the email link instead of an error. */
export function needsEmailConfirmation(error: { hint?: string | null }): boolean {
  return error.hint === "email_confirmation_required";
}

/** Why the confirmation email couldn't be sent, in plain words. */
export function sendErrorMessage(error: { code?: string; message?: string; status?: number }): string {
  if (error.code === "over_email_send_rate_limit" || error.code === "over_request_rate_limit" || error.status === 429) {
    return "Too many emails for now. Wait a while and try again.";
  }
  return error.message ? `Couldn't send the email: ${error.message}` : "Couldn't send the email. Try again.";
}
