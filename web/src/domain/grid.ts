import { occupiedPeriods } from "./eligibility";
import { expandSessions } from "./sessions";
import type { Id, Placement, Session, SolveInput } from "./types";

export interface PlacedSession { session: Session; placement: Placement }
/** Everything occupying one (day, period) for one teacher/section/room. A lab appears in each period it covers. */
export type Cell = PlacedSession[];
/** `timeline[day][periodId]` */
export type Timeline = Cell[][];

/** The parts of a SolveInput that describe the college (no locks/options), plus the soft-rule switches. */
export type CollegeData = Pick<SolveInput, "settings" | "teachers" | "sections" | "rooms" | "courses" | "softRules">;

export interface Grid {
  sessions: Map<Id, Session>;
  byTeacher: Map<Id, Timeline>;
  bySection: Map<Id, Timeline>; // includes batch sessions of that section
  byRoom: Map<Id, Timeline>;
}

/**
 * Occupancy lookups for a set of placements. Placements with an unknown session, an out-of-range day,
 * or periods past the end of the day are skipped (the validator reports them).
 * Every teacher/section/room in the input gets a timeline, even if empty.
 */
export function buildGrid(input: CollegeData, placements: Placement[], sessions: Session[] = expandSessions(input)): Grid {
  const days = input.settings.days.length;
  const periods = input.settings.periods.length;
  const emptyTimeline = (): Timeline => Array.from({ length: days }, () => Array.from({ length: periods }, () => []));
  const lookup = (ids: Id[]) => new Map<Id, Timeline>(ids.map((id) => [id, emptyTimeline()]));
  const grid: Grid = {
    sessions: new Map(sessions.map((s) => [s.id, s])),
    byTeacher: lookup(input.teachers.map((t) => t.id)),
    bySection: lookup(input.sections.map((s) => s.id)),
    byRoom: lookup(input.rooms.map((r) => r.id)),
  };
  const add = (map: Map<Id, Timeline>, id: Id, day: number, period: number, entry: PlacedSession) => {
    let timeline = map.get(id);
    if (!timeline) map.set(id, (timeline = emptyTimeline()));
    timeline[day][period].push(entry);
  };

  for (const placement of placements) {
    const session = grid.sessions.get(placement.sessionId);
    if (!session || placement.day < 0 || placement.day >= days) continue;
    const entry = { session, placement };
    for (const p of occupiedPeriods(placement, session)) {
      if (p < 0 || p >= periods) continue;
      add(grid.byTeacher, session.teacherId, placement.day, p, entry);
      add(grid.bySection, session.sectionId, placement.day, p, entry);
      add(grid.byRoom, placement.roomId, placement.day, p, entry);
    }
  }
  return grid;
}

/** Human label for a session, e.g. "CSE-2A Physics Lab (B1)". */
export function sessionLabel(input: Pick<SolveInput, "sections" | "courses">, session: Session): string {
  const section = input.sections.find((s) => s.id === session.sectionId);
  const course = input.courses.find((c) => c.id === session.courseId);
  const lab = session.kind === "lab" ? " Lab" : "";
  const batch = session.batch != null ? ` (B${session.batch})` : "";
  return `${section?.name ?? session.sectionId} ${course?.subject ?? session.courseId}${lab}${batch}`;
}

/** Human label for a slot, e.g. "Tue P3". */
export function slotLabel(input: Pick<SolveInput, "settings">, day: number, period: number): string {
  const { days, periods } = input.settings;
  return `${days[day] ?? `Day ${day + 1}`} ${periods[period]?.label ?? `#${period}`}`;
}
