/**
 * The consent gate's rules (T24): who may go on after signing in, and what the blocking dialog says. Nobody gets
 * past a sign-in without an acceptance of the current Terms and Privacy Policy on record.
 */

/**
 * The localStorage key for the box ticked in the sign-in dialog. Google and the email link both leave the page, so
 * the tick waits here until the gate can record it.
 */
export const PENDING_CONSENT_KEY = "lattice.pendingConsent";

/** What the gate does: let the user through, record the ticked box first, or ask with the blocking dialog. */
export type GateDecision = "ok" | "record" | "ask";

/**
 * `acceptedMax` is the highest version the user has accepted (`null` for never), `pending` the version ticked in
 * this browser before signing in, if any. A tick for an older version, or one made on another device, doesn't count.
 */
export function gateDecision(acceptedMax: number | null, pending: number | null, current: number): GateDecision {
  if (acceptedMax !== null && acceptedMax >= current) return "ok";
  if (pending === current) return "record";
  return "ask";
}

/** The blocking dialog's title: a first acceptance, or a re-accept after a version bump. */
export function gateTitle(acceptedMax: number | null): string {
  return acceptedMax === null ? "Before you continue" : "We've updated our Terms and Privacy Policy";
}

/** The "what changed" lines for every version after `acceptedMax` up to `current`; none for a first acceptance. */
export function changesSince(acceptedMax: number | null, current: number, changes: Record<number, string[]>): string[] {
  if (acceptedMax === null) return [];
  const lines: string[] = [];
  for (let v = acceptedMax + 1; v <= current; v++) lines.push(...(changes[v] ?? []));
  return lines;
}

/** The value stored under `PENDING_CONSENT_KEY` when the box is ticked. */
export function pendingConsentValue(version: number): string {
  return JSON.stringify({ version });
}

/** The ticked version stored in this browser, or `null` when there is none or it isn't `{ version: <positive int> }`. */
export function parsePendingConsent(raw: string | null): number | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const version = (value as { version?: unknown }).version;
  return Number.isInteger(version) && (version as number) > 0 ? (version as number) : null;
}

/** The highest accepted version among a user's consent rows, or `null` for none. */
export function highestVersion(rows: { version: number }[]): number | null {
  return rows.reduce<number | null>((max, r) => (max === null || r.version > max ? r.version : max), null);
}
