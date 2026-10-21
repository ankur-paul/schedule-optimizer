import { eligibleRooms, occupiedPeriods } from "./eligibility";
import { buildGrid, sessionLabel, slotLabel, type Cell, type Timeline } from "./grid";
import { expandSessions } from "./sessions";
import type { Id, Placement, Session, SolveInput } from "./types";

/** H1–H8 from PLAN.md §2, plus LOCK (a lock missing/moved) and DATA (unknown session, bad day). */
export type RuleId = "H1" | "H2" | "H3" | "H4" | "H5" | "H6" | "H7" | "H8" | "LOCK" | "DATA";

export interface Violation { rule: RuleId; message: string; sessionIds: Id[] }

export interface ValidationResult {
  ok: boolean;              // no violations (missing sessions don't count; see `missing`)
  violations: Violation[];
  missing: Id[];            // H5: sessions with no placement, shown as unplaced in the UI
}

/** Independently re-check a timeline against every hard rule. Does not trust the engine that produced it. */
export function validate(input: SolveInput, placements: Placement[]): ValidationResult {
  const { settings } = input;
  const sessions = expandSessions(input);
  const sessionById = new Map(sessions.map((s) => [s.id, s]));
  const label = (s: Session) => sessionLabel(input, s);
  const labels = (cell: Cell) => [...new Set(cell.map((e) => label(e.session)))].join(", ");
  const violations: Violation[] = [];
  const seen = new Set<string>();
  const report = (v: Violation, key = `${v.rule}|${v.message}`) => {
    if (seen.has(key)) return;
    seen.add(key);
    violations.push(v);
  };

  // Unknown sessions, duplicates (H5), bad days. Only the first placement of each session goes on the grid.
  const placed = new Map<Id, Placement>();
  const counts = new Map<Id, number>();
  for (const p of placements) {
    const session = sessionById.get(p.sessionId);
    if (!session) {
      report({ rule: "DATA", message: `Placement for unknown session ${p.sessionId}`, sessionIds: [p.sessionId] });
      continue;
    }
    if (p.day < 0 || p.day >= settings.days.length || !Number.isInteger(p.day)) {
      report({ rule: "DATA", message: `${label(session)} placed on unknown day ${p.day}`, sessionIds: [session.id] });
      continue;
    }
    counts.set(p.sessionId, (counts.get(p.sessionId) ?? 0) + 1);
    if (!placed.has(p.sessionId)) placed.set(p.sessionId, p);
  }
  for (const [id, n] of counts) {
    if (n > 1) report({ rule: "H5", message: `${label(sessionById.get(id)!)} placed ${n} times`, sessionIds: [id] });
  }
  const missing = sessions.filter((s) => !placed.has(s.id)).map((s) => s.id);

  // Locks must appear unchanged.
  for (const lock of input.locks) {
    const p = placed.get(lock.sessionId);
    if (!p || p.day !== lock.day || p.period !== lock.period || p.roomId !== lock.roomId) {
      const session = sessionById.get(lock.sessionId);
      const what = session ? label(session) : lock.sessionId;
      report({ rule: "LOCK", message: `Locked ${what} (${slotLabel(input, lock.day, lock.period)}) was moved or dropped`, sessionIds: [lock.sessionId] });
    }
  }

  // Per placement: room eligibility (H4), break (H7), consecutive teaching periods (H6).
  for (const p of placed.values()) {
    const session = sessionById.get(p.sessionId)!;
    const slot = slotLabel(input, p.day, p.period);
    const room = input.rooms.find((r) => r.id === p.roomId);
    if (!room) {
      report({ rule: "H4", message: `${label(session)} at ${slot} is in unknown room ${p.roomId}`, sessionIds: [session.id] });
    } else if (!eligibleRooms(input, session).some((r) => r.id === room.id)) {
      report({ rule: "H4", message: `${label(session)} at ${slot} can't use ${room.name}: ${roomProblem(input, session, room.id)}`, sessionIds: [session.id] });
    }
    const start = settings.periods[p.period];
    if (start?.kind === "break") {
      report({ rule: "H7", message: `${label(session)} placed in ${slot}, which is a break`, sessionIds: [session.id] });
    } else if (!start || occupiedPeriods(p, session).some((q) => settings.periods[q]?.kind !== "teaching")) {
      report({ rule: "H6", message: `${label(session)} at ${slot} needs ${session.length} consecutive teaching periods`, sessionIds: [session.id] });
    }
  }

  const grid = buildGrid(input, [...placed.values()], sessions);
  const name = (list: { id: Id; name: string }[], id: Id) => list.find((x) => x.id === id)?.name ?? id;
  const ids = (cell: Cell) => [...new Set(cell.map((e) => e.session.id))].sort();
  const eachCell = (map: Map<Id, Timeline>, fn: (id: Id, day: number, period: number, cell: Cell) => void) => {
    for (const [id, timeline] of map) timeline.forEach((row, d) => row.forEach((cell, p) => fn(id, d, p, cell)));
  };
  // A lab clash spans several periods; report it once (at its first period) per entity + set of sessions.
  const clash = (rule: RuleId, kind: string, id: Id, entity: string, d: number, p: number, cell: Cell) => {
    const sessionIds = ids(cell);
    report({ rule, message: `${kind} ${entity} double-booked ${slotLabel(input, d, p)} (${labels(cell)})`, sessionIds }, `${rule}|${id}|${sessionIds}`);
  };

  // H1 teacher, H3 room: at most one session per cell.
  eachCell(grid.byTeacher, (id, d, p, cell) => {
    if (cell.length > 1) clash("H1", "Teacher", id, name(input.teachers, id), d, p, cell);
  });
  eachCell(grid.byRoom, (id, d, p, cell) => {
    if (cell.length > 1) clash("H3", "Room", id, name(input.rooms, id), d, p, cell);
  });
  // H2 section: whole-section sessions clash with everything; batch sessions only with the same batch.
  eachCell(grid.bySection, (id, d, p, cell) => {
    const conflicting = cell.filter((a) =>
      cell.some((b) => a !== b && (a.session.batch == null || b.session.batch == null || a.session.batch === b.session.batch)),
    );
    if (conflicting.length > 1) clash("H2", "Section", id, name(input.sections, id), d, p, conflicting);
  });

  // H8: every section and teacher has a free lunch candidate every day.
  const lunch = settings.lunchCandidates.filter((p) => p >= 0 && p < settings.periods.length);
  if (lunch.length > 0) {
    const checkLunch = (kind: string, map: Map<Id, Timeline>, list: { id: Id; name: string }[]) => {
      for (const { id, name: entity } of list) {
        const timeline = map.get(id);
        if (!timeline) continue;
        timeline.forEach((row, d) => {
          if (lunch.some((p) => row[p].length === 0)) return;
          const busy = lunch.flatMap((p) => row[p]);
          report({ rule: "H8", message: `${kind} ${entity} has no free lunch period on ${settings.days[d]} (${labels(busy)})`, sessionIds: ids(busy) });
        });
      }
    };
    checkLunch("Section", grid.bySection, input.sections);
    checkLunch("Teacher", grid.byTeacher, input.teachers);
  }

  return { ok: violations.length === 0, violations, missing };
}

function roomProblem(input: SolveInput, session: Session, roomId: Id): string {
  const room = input.rooms.find((r) => r.id === roomId)!;
  if (room.type !== session.roomType) return `needs a ${session.roomType}`;
  if (session.fixedRoomId != null && room.id !== session.fixedRoomId) {
    return `must be in ${input.rooms.find((r) => r.id === session.fixedRoomId)?.name ?? session.fixedRoomId}`;
  }
  const dept = input.departments.find((d) => d.id === room.departmentId)?.name ?? room.departmentId;
  return `room belongs to ${dept}`;
}
