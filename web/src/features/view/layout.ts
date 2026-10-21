import type { Id, Placement, Session, Settings, SolveInput } from "@/domain/types";

export type ViewKind = "section" | "teacher" | "room";

export type ViewData = Pick<SolveInput, "settings" | "departments" | "teachers" | "rooms" | "sections" | "courses">;

export interface Entity {
  id: Id;
  name: string;
}

export interface EntityGroup {
  label: string;
  items: Entity[];
}

export const SHARED_GROUP = "Shared";

/**
 * Sections, teachers or rooms grouped by department (departments in input order, entities in input
 * order). Shared rooms and entities of an unknown department go in a last "Shared" / "Other" group.
 * Empty groups are dropped.
 */
export function entityGroups(data: ViewData, kind: ViewKind): EntityGroup[] {
  const list: { id: Id; name: string; departmentId: Id | null }[] =
    kind === "section" ? data.sections : kind === "teacher" ? data.teachers : data.rooms;
  const known = new Set(data.departments.map((d) => d.id));
  const groups: EntityGroup[] = data.departments.map((d) => ({
    label: d.name,
    items: list.filter((e) => e.departmentId === d.id).map(({ id, name }) => ({ id, name })),
  }));
  const rest = list.filter((e) => e.departmentId === null || !known.has(e.departmentId));
  groups.push({ label: kind === "room" ? SHARED_GROUP : "Other", items: rest.map(({ id, name }) => ({ id, name })) });
  return groups.filter((g) => g.items.length > 0);
}

/** Case-insensitive search on entity name or group label; groups with no match are dropped. */
export function filterGroups(groups: EntityGroup[], query: string): EntityGroup[] {
  const q = query.trim().toLowerCase();
  if (!q) return groups;
  return groups
    .map((g) =>
      g.label.toLowerCase().includes(q) ? g : { ...g, items: g.items.filter((e) => e.name.toLowerCase().includes(q)) },
    )
    .filter((g) => g.items.length > 0);
}

/** The entity `delta` steps away from `currentId` in group order, wrapping around. Unknown id → first. */
export function stepEntity(groups: EntityGroup[], currentId: Id | null, delta: number): Id | null {
  const flat = groups.flatMap((g) => g.items);
  if (flat.length === 0) return null;
  const i = flat.findIndex((e) => e.id === currentId);
  if (i === -1) return flat[0].id;
  return flat[(((i + delta) % flat.length) + flat.length) % flat.length].id;
}

export interface PlacedSession {
  session: Session;
  placement: Placement;
}

/** Placements that belong on one entity's timetable. Placements of unknown sessions are skipped. */
export function placementsFor(
  kind: ViewKind,
  id: Id,
  placements: Placement[],
  sessions: Map<Id, Session>,
): PlacedSession[] {
  const out: PlacedSession[] = [];
  for (const placement of placements) {
    const session = sessions.get(placement.sessionId);
    if (!session) continue;
    const owner = kind === "section" ? session.sectionId : kind === "teacher" ? session.teacherId : placement.roomId;
    if (owner === id) out.push({ session, placement });
  }
  return out;
}

export interface Block extends PlacedSession {
  /** First period id covered. */
  start: number;
  /** Number of periods covered. */
  span: number;
  /** Row inside the day, 0-based. */
  lane: number;
  /** Rows covered, starting at `lane`; a block with nothing below it fills the rest of the day. */
  laneSpan: number;
}

export interface DayLayout {
  blocks: Block[];
  /** Rows the day needs; 1 unless sessions overlap (batches in parallel, or a clash). */
  lanes: number;
}

/**
 * Stack one day's sessions into rows. Overlapping sessions (parallel batch labs, or clashes in an invalid
 * result) go in separate rows, lowest batch first; then each block grows down over rows that are free
 * for its whole span, so a lecture in a split section fills the full height of the day.
 */
export function layoutDay(entries: PlacedSession[]): DayLayout {
  const sorted = [...entries].sort(
    (a, b) =>
      a.placement.period - b.placement.period ||
      (a.session.batch ?? 0) - (b.session.batch ?? 0) ||
      a.session.id.localeCompare(b.session.id),
  );
  const laneEnds: number[] = []; // last period id + 1 used in each lane
  const blocks: Block[] = sorted.map((entry) => {
    const start = entry.placement.period;
    const span = Math.max(1, entry.session.length);
    let lane = laneEnds.findIndex((end) => end <= start);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = start + span;
    return { ...entry, start, span, lane, laneSpan: 1 };
  });
  const lanes = Math.max(1, laneEnds.length);
  const overlaps = (a: Block, b: Block) => a.start < b.start + b.span && b.start < a.start + a.span;
  for (const block of blocks) {
    while (
      block.lane + block.laneSpan < lanes &&
      !blocks.some((o) => o !== block && o.lane === block.lane + block.laneSpan && overlaps(o, block))
    ) {
      block.laneSpan++;
    }
  }
  return { blocks, lanes };
}

/** One layout per day for an entity's placements. Placements on days that don't exist are dropped. */
export function layoutWeek(settings: Settings, entries: PlacedSession[]): DayLayout[] {
  return settings.days.map((_, day) => layoutDay(entries.filter((e) => e.placement.day === day)));
}

/** "11:00–12:40" for `span` periods starting at `start`. */
export function timeRange(settings: Settings, start: number, span: number): string {
  const first = settings.periods[start];
  const last = settings.periods[start + span - 1] ?? first;
  return first ? `${first.start}–${last.end}` : "";
}

export interface SessionDetails {
  subject: string;
  kind: "lecture" | "lab";
  section: string;
  batch: string | null;
  teacher: string;
  room: string;
  day: string;
  periods: string;
  time: string;
}

/** Human-readable names for everything about one placed session. Unknown ids fall back to the id. */
export function sessionDetails(data: ViewData, { session, placement }: PlacedSession): SessionDetails {
  const { settings } = data;
  const first = settings.periods[placement.period];
  const last = settings.periods[placement.period + session.length - 1] ?? first;
  return {
    subject: data.courses.find((c) => c.id === session.courseId)?.subject ?? session.courseId,
    kind: session.kind,
    section: data.sections.find((s) => s.id === session.sectionId)?.name ?? session.sectionId,
    batch: session.batch == null ? null : `B${session.batch}`,
    teacher: data.teachers.find((t) => t.id === session.teacherId)?.name ?? session.teacherId,
    room: data.rooms.find((r) => r.id === placement.roomId)?.name ?? placement.roomId,
    day: settings.days[placement.day] ?? `Day ${placement.day + 1}`,
    periods: !first ? `#${placement.period}` : first === last ? first.label : `${first.label}–${last.label}`,
    time: timeRange(settings, placement.period, session.length),
  };
}

/** What a screen reader hears for a grid card (the card itself only shows part of this). */
export function cellLabel(info: SessionDetails, locked: boolean): string {
  return [
    `${info.subject}${info.kind === "lab" ? " lab" : ""}${info.batch ? ` (${info.batch})` : ""}`,
    info.section,
    info.teacher,
    info.room,
    `${info.day} ${info.periods}, ${info.time}`,
    locked ? "locked" : "",
  ]
    .filter(Boolean)
    .join(", ");
}

/** Unplaced sessions of one section or teacher (rooms have none: an unplaced session has no room). */
export function unplacedFor(
  kind: ViewKind,
  id: Id,
  unplaced: { sessionId: Id; reason: string }[],
  sessions: Map<Id, Session>,
): { session: Session; reason: string }[] {
  if (kind === "room") return [];
  return unplaced.flatMap(({ sessionId, reason }) => {
    const session = sessions.get(sessionId);
    if (!session) return [];
    const owner = kind === "section" ? session.sectionId : session.teacherId;
    return owner === id ? [{ session, reason }] : [];
  });
}

/** One line about the entity: "Computer Science & Engineering · 2 batches", "Electronics & Communication", "Lab · Shared". */
export function entitySubtitle(data: ViewData, kind: ViewKind, id: Id): string {
  const dept = (deptId: Id | null) => data.departments.find((d) => d.id === deptId)?.name;
  if (kind === "section") {
    const s = data.sections.find((x) => x.id === id);
    return [dept(s?.departmentId ?? null), s && s.batches > 1 ? `${s.batches} batches` : null].filter(Boolean).join(" · ");
  }
  if (kind === "teacher") return dept(data.teachers.find((x) => x.id === id)?.departmentId ?? null) ?? "";
  const r = data.rooms.find((x) => x.id === id);
  return `${r?.type === "lab" ? "Lab" : "Classroom"} · ${r?.departmentId ? (dept(r.departmentId) ?? r.departmentId) : "Shared"}`;
}
