import { eligibleRooms } from "@/domain/eligibility";
import { buildGrid, slotLabel, type Cell } from "@/domain/grid";
import { score } from "@/domain/score";
import { expandSessions } from "@/domain/sessions";
import type { Id, Placement, Session, SolveInput, SolveResult } from "@/domain/types";
import { validate } from "@/domain/validator";
import type { ViewData } from "./layout";

export type MoveTarget =
  | { ok: true; day: number; period: number; roomId: Id; scoreDelta: number; current: boolean }
  | { ok: false; day: number; period: number; reason: string };

/**
 * Where a session could start instead: `targets[day][periodId]`, one entry per slot (breaks included, so the grid can
 * look up any cell). A slot is ok when the move breaks no hard rule (H1–H4, H6–H8); it then gets a room (the current
 * one if it's free, else the first free eligible room) and the score change. Otherwise it gets the first reason it
 * fails, in words. Same rules as `validate()`, checked directly so a whole week of slots is cheap to compute.
 * An unplaced session works too (no current slot). Unknown session → empty.
 */
export function moveTargets(
  data: ViewData,
  placements: Placement[],
  sessionId: Id,
  sessions: Session[] = expandSessions(data),
): MoveTarget[][] {
  const session = sessions.find((s) => s.id === sessionId);
  if (!session) return [];
  const { settings } = data;
  const current = placements.find((p) => p.sessionId === sessionId);
  const others = placements.filter((p) => p.sessionId !== sessionId);
  const grid = buildGrid(data, others, sessions);
  const sectionRow = grid.bySection.get(session.sectionId);
  const teacherRow = grid.byTeacher.get(session.teacherId);
  const rooms = eligibleRooms(data, session).sort((a, b) => Number(b.id === current?.roomId) - Number(a.id === current?.roomId));
  const baseScore = score(data, placements).total;
  const lunch = settings.lunchCandidates.filter((p) => p >= 0 && p < settings.periods.length); // as in validate()
  const sectionName = data.sections.find((s) => s.id === session.sectionId)?.name ?? session.sectionId;
  const teacherName = data.teachers.find((t) => t.id === session.teacherId)?.name ?? session.teacherId;
  const roomName = (id: Id) => data.rooms.find((r) => r.id === id)?.name ?? id;
  const what = (s: Session) => describe(data, s);
  // Same batch rule as H2: a whole-section session clashes with everything, batches only with themselves.
  const sectionClash = (cell: Cell) =>
    cell.find((e) => session.batch == null || e.session.batch == null || e.session.batch === session.batch);

  const check = (day: number, period: number): MoveTarget => {
    const fail = (reason: string): MoveTarget => ({ ok: false, day, period, reason });
    const span = Array.from({ length: session.length }, (_, k) => period + k);
    if (settings.periods[period]?.kind !== "teaching") return fail("Break: nothing can be placed here");
    const stop = span.find((q) => settings.periods[q]?.kind !== "teaching");
    if (stop !== undefined) {
      const into = settings.periods[stop] ? `the ${settings.periods[stop].label.toLowerCase()}` : "the end of the day";
      return fail(`This ${session.length}-period lab would run into ${into}`);
    }
    for (const q of span) {
      const clash = sectionRow && sectionClash(sectionRow[day][q]);
      if (clash) return fail(`${sectionName} already has ${what(clash.session)} at ${slotLabel(data, day, q)}`);
    }
    for (const q of span) {
      const clash = teacherRow?.[day][q][0];
      if (clash) return fail(`${teacherName} teaches ${sectionNameOf(data, clash.session)} ${what(clash.session)} at ${slotLabel(data, day, q)}`);
    }
    const room = rooms.find((r) => span.every((q) => (grid.byRoom.get(r.id)?.[day][q].length ?? 0) === 0));
    if (!room) {
      if (rooms.length === 0) return fail(`No ${session.roomType} this session is allowed to use`);
      if (rooms.length === 1) return fail(`${roomName(rooms[0].id)} is in use then`);
      return fail(`All ${rooms.length} ${session.roomType === "lab" ? "labs" : "classrooms"} it can use are in use then`);
    }
    if (lunch.some((q) => span.includes(q))) {
      const freeLunch = (row: Cell[][] | undefined) => lunch.some((q) => !span.includes(q) && (row?.[day][q].length ?? 0) === 0);
      const dayName = settings.days[day] ?? `day ${day + 1}`;
      if (!freeLunch(sectionRow)) return fail(`${sectionName} would have no free lunch period on ${dayName}`);
      if (!freeLunch(teacherRow)) return fail(`${teacherName} would have no free lunch period on ${dayName}`);
    }
    const moved = { sessionId, day, period, roomId: room.id };
    const isCurrent = current?.day === day && current.period === period && current.roomId === room.id;
    const scoreDelta = isCurrent ? 0 : score(data, [...others, moved]).total - (current ? baseScore : score(data, others).total);
    return { ok: true, day, period, roomId: room.id, scoreDelta, current: isCurrent };
  };

  return settings.days.map((_, day) => settings.periods.map((p) => check(day, p.id)));
}

/** "Maths", "DS lab", "DS lab (B1)". */
function describe(data: Pick<ViewData, "courses">, s: Session): string {
  const subject = data.courses.find((c) => c.id === s.courseId)?.subject ?? s.courseId;
  return `${subject}${s.kind === "lab" ? " lab" : ""}${s.batch != null ? ` (B${s.batch})` : ""}`;
}

function sectionNameOf(data: Pick<ViewData, "sections">, s: Session): string {
  return data.sections.find((x) => x.id === s.sectionId)?.name ?? s.sectionId;
}

/** dnd-kit ids for a draggable class card and a drop slot. */
export const dragId = (sessionId: Id) => `session:${sessionId}`;
export const slotId = (day: number, period: number) => `slot:${day}:${period}`;

/** "+4", "−2", "±0" for the score change of a move (lower is better). */
export function formatDelta(delta: number): string {
  if (delta === 0) return "±0";
  return delta > 0 ? `+${delta}` : `−${-delta}`;
}

/**
 * Move (or place) a session and lock it at its new slot. Any older lock on that session is replaced.
 * The session leaves `unplaced` if it was there.
 */
export function applyMove(
  result: SolveResult,
  locks: Placement[],
  moved: Placement,
): { placements: Placement[]; unplaced: SolveResult["unplaced"]; locks: Placement[] } {
  const placements = result.placements.some((p) => p.sessionId === moved.sessionId)
    ? result.placements.map((p) => (p.sessionId === moved.sessionId ? { ...moved } : p))
    : [...result.placements, { ...moved }];
  return {
    placements,
    unplaced: result.unplaced.filter((u) => u.sessionId !== moved.sessionId),
    locks: [...locks.filter((l) => l.sessionId !== moved.sessionId), { ...moved }],
  };
}

/**
 * The validator's last word on a move. `problem` is set if the moved timetable breaks a hard rule that involves the
 * moved session, or has more violations than before (so a result that was already broken can still be edited).
 * `violations` counts everything left after the move. `input.locks` must be the locks after the move.
 */
export function checkMove(
  input: SolveInput,
  before: Placement[],
  after: Placement[],
  sessionId: Id,
): { problem: string | null; violations: number } {
  const was = validate({ ...input, locks: input.locks.filter((l) => l.sessionId !== sessionId) }, before).violations.length;
  const { violations } = validate(input, after);
  const own = violations.find((v) => v.sessionIds.includes(sessionId));
  const problem = own?.message ?? (violations.length > was ? violations[violations.length - 1].message : null);
  return { problem, violations: violations.length };
}

/** A result edited by hand is no longer known to be optimal; everything else about it stays. */
export function editedResult(result: SolveResult, placements: Placement[], unplaced: SolveResult["unplaced"], data: ViewData): SolveResult {
  const status = result.status === "optimal" ? "feasible" : result.status === "partial" && unplaced.length === 0 ? "feasible" : result.status;
  return { ...result, status, placements, unplaced, score: score(data, placements) };
}

/** Which period of a `span`-period card the pointer grabbed, from where it pressed (0 = first period). */
export function grabOffset(pointerX: number, cardLeft: number, cardWidth: number, span: number): number {
  if (span <= 1 || cardWidth <= 0) return 0;
  return Math.min(span - 1, Math.max(0, Math.floor(((pointerX - cardLeft) / cardWidth) * span)));
}

/**
 * The move for dropping on (`day`, `period`) when the card was grabbed `offset` periods in: the session then starts
 * `offset` periods earlier. Off the start of the day → a failed target with a reason; unknown day/period → null.
 */
export function targetUnder(targets: MoveTarget[][], day: number, period: number, offset: number): MoveTarget | null {
  if (!targets[day]?.[period]) return null;
  const start = period - offset;
  return targets[day][start] ?? { ok: false, day, period: start, reason: "This lab would start before the first period" };
}

/** Toast after a drop: "Moved DS lab (B1) to Tue P3 · CR-2 · locked" + "Score 18 → 20 · ✓ Verified: 0 clashes". */
export function moveSummary(
  data: ViewData,
  session: Session,
  moved: Placement,
  score: { before: number; after: number },
  violations: number,
): { title: string; description: string } {
  const room = data.rooms.find((r) => r.id === moved.roomId)?.name ?? moved.roomId;
  const check = violations === 0 ? "✓ Verified: 0 clashes" : `${violations} earlier rule violation${violations === 1 ? "" : "s"} still to fix`;
  return {
    title: `Moved ${describe(data, session)} to ${slotLabel(data, moved.day, moved.period)} · ${room} · locked`,
    description: `Score ${score.before} → ${score.after} · ${check}`,
  };
}

/** What the dragged card says about the slot under the pointer. */
export function dropHint(data: ViewData, target: MoveTarget | null): { ok: boolean | null; text: string } {
  if (!target) return { ok: null, text: "Drop on a green slot" };
  if (!target.ok) return { ok: false, text: target.reason };
  if (target.current) return { ok: null, text: "Its current slot" };
  const room = data.rooms.find((r) => r.id === target.roomId)?.name ?? target.roomId;
  return { ok: true, text: `${slotLabel(data, target.day, target.period)} · ${room} · score ${formatDelta(target.scoreDelta)}` };
}
