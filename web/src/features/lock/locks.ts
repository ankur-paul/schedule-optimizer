import type { Id, Placement, SolveInput } from "@/domain/types";
import { validate } from "@/domain/validator";

export function isLocked(locks: Placement[], sessionId: Id): boolean {
  return locks.some((l) => l.sessionId === sessionId);
}

/** Lock `placement` where it is now, or unlock it if its session is already locked. */
export function toggleLock(locks: Placement[], placement: Placement): Placement[] {
  if (isLocked(locks, placement.sessionId)) return locks.filter((l) => l.sessionId !== placement.sessionId);
  return [...locks, { ...placement }];
}

export interface DroppedLock { lock: Placement; reason: string }

/**
 * Locks that can still be honoured after the data changed. A lock is dropped when its session is gone, its room is
 * missing or no longer eligible, it lands on a break or off the week, or it clashes with another lock (both go).
 */
export function pruneLocks(
  input: Omit<SolveInput, "locks" | "options">,
  locks: Placement[],
): { kept: Placement[]; dropped: DroppedLock[] } {
  // Two locks for one session can't both hold; keep the first.
  const unique: Placement[] = [];
  const dropped: DroppedLock[] = [];
  for (const lock of locks) {
    if (isLocked(unique, lock.sessionId)) dropped.push({ lock, reason: `${lock.sessionId} was locked twice` });
    else unique.push(lock);
  }

  let violations;
  try {
    violations = validate({ ...input, locks: [], options: { timeLimitSec: 0 } }, unique).violations;
  } catch {
    return { kept: unique, dropped }; // broken data (e.g. a course with a missing section); step ② reports it
  }
  const reasons = new Map<Id, string>();
  for (const v of violations) for (const id of v.sessionIds) if (!reasons.has(id)) reasons.set(id, v.message);

  const kept: Placement[] = [];
  for (const lock of unique) {
    const reason = reasons.get(lock.sessionId);
    if (reason) dropped.push({ lock, reason });
    else kept.push(lock);
  }
  return { kept, dropped };
}

/** "Regenerate" or "Regenerate (keep 3 locked)". */
export function regenerateLabel(lockCount: number): string {
  return lockCount === 0 ? "Regenerate" : `Regenerate (keep ${lockCount} locked)`;
}

/** Toast text for locks pruned before a run. */
export function droppedLocksMessage(dropped: DroppedLock[]): string {
  const n = dropped.length;
  return `Dropped ${n} lock${n === 1 ? "" : "s"} that no longer fit the data: ${dropped.map((d) => d.reason).join("; ")}`;
}
