import type { Placement, Room, Session, Settings, SolveInput } from "./types";

/** Ids of teaching (non-break) periods, in time order. */
export function teachingPeriods(settings: Settings): number[] {
  return settings.periods.filter((p) => p.kind === "teaching").map((p) => p.id);
}

/**
 * Start period ids where `length` consecutive teaching periods fit (H6/H7).
 * Consecutive = adjacent period ids, all teaching; a break in between breaks the run.
 */
export function validStarts(settings: Settings, length: number): number[] {
  const { periods } = settings;
  const starts: number[] = [];
  for (let i = 0; i + length <= periods.length; i++) {
    let ok = true;
    for (let k = 0; k < length; k++) {
      if (periods[i + k].kind !== "teaching") {
        ok = false;
        break;
      }
    }
    if (ok) starts.push(periods[i].id);
  }
  return starts;
}

/** Rooms a session may use (H4): right type, shared or owned by the section's department, fixed lab if any. */
export function eligibleRooms(input: Pick<SolveInput, "rooms" | "sections">, session: Session): Room[] {
  const section = input.sections.find((s) => s.id === session.sectionId);
  const departmentId = section?.departmentId;
  return input.rooms.filter(
    (r) =>
      r.type === session.roomType &&
      (r.departmentId === null || r.departmentId === departmentId) &&
      (session.fixedRoomId == null || r.id === session.fixedRoomId),
  );
}

/** Period ids a placed session occupies. */
export function occupiedPeriods(placement: Placement, session: Session): number[] {
  return Array.from({ length: session.length }, (_, k) => placement.period + k);
}
