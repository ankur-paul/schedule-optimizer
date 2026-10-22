import { sessionLabel, slotLabel } from "@/domain/grid";
import { expandSessions } from "@/domain/sessions";
import type { Diagnosis, Id, SolveInput } from "@/domain/types";
import { plural } from "@/features/data/collegeData";
import { roomTypeLabel, type DataReport, type Load, type RoomLoad } from "@/features/data/dataChecks";

/** Where a fix button goes: a step ② tab (with the Courses filters set), or step ④ to clear the locks. */
export type CauseLink =
  | { step: 2; tab: "courses" | "rooms" | "teachers"; sectionId?: Id; teacherId?: Id }
  | { step: 4; action: "clearLocks" };

export type CauseKind = Diagnosis["kind"] | "section" | "teacher" | "room";

/** One reason a timetable can't be built, in the coordinator's words, with what to do about it. */
export interface Cause {
  kind: CauseKind;
  text: string;
  fix: string;
  link: CauseLink;
  /** False only for `locksLikely`: the check without locks ran out of time. Load causes are arithmetic, so proven. */
  proven: boolean;
  /** Periods over capacity (`required − available`) for load causes; 0 for the solver's own causes. */
  over: number;
}

/** Shown when nothing specific explains it: the rules only conflict in combination. */
export const GENERAL_SUGGESTIONS: string[] = [
  "Fewer lab sessions: each needs a run of free periods in a free lab, for every batch.",
  "More lunch candidate periods (step ①), so lunch can move out of the way.",
  "Fewer required lab rooms: let labs use any eligible lab.",
];

const MAX_NAMES = 3;

/** "A, B and C" or "A, B, C and 4 more". */
function nameList(names: string[]): string {
  if (names.length <= 1) return names.join("");
  if (names.length <= MAX_NAMES) return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  return `${names.slice(0, MAX_NAMES).join(", ")} and ${names.length - MAX_NAMES} more`;
}

const classes = (n: number) => (n === 1 ? "1 class" : `${n} classes`);

/**
 * Why the exact solver found the timetable impossible, most useful first: its proven causes (no slot, bad lock,
 * locks), then section, teacher and room loads by how far over they are, then suspected locks.
 * `diagnosis` comes from the server (T16); `report` from `checkData()` on the same data.
 */
export function explainInfeasible(input: SolveInput, diagnosis: Diagnosis[] | undefined, report: DataReport): Cause[] {
  const sessions = new Map(expandSessions(input).map((s) => [s.id, s]));
  const label = (id: Id) => {
    const s = sessions.get(id);
    return s ? sessionLabel(input, s) : id;
  };
  const locks = new Map(input.locks.map((l) => [l.sessionId, l]));
  // A link can narrow step ② to one section when every session is from it.
  const sectionOf = (ids: Id[]) => {
    const found = new Set(ids.map((id) => sessions.get(id)?.sectionId));
    const [only] = found;
    return found.size === 1 && only ? { sectionId: only } : {};
  };

  const proven: Cause[] = [];
  const likely: Cause[] = [];
  for (const d of diagnosis ?? []) {
    if (d.ids.length === 0) continue;
    const n = d.ids.length;
    const names = nameList(d.ids.map(label));
    const base = { kind: d.kind, proven: true, over: 0 };
    switch (d.kind) {
      case "noSlot":
        if (d.detail === "noRoom") {
          proven.push({ ...base, text: `No room may host ${classes(n)}: ${names}.`, fix: "Add a room they may use, or share one", link: { step: 2, tab: "rooms" } });
        } else if (d.detail === "noStart") {
          proven.push({
            ...base,
            text: `${n === 1 ? "A lab is" : `${n} labs are`} longer than any run of teaching periods without a break: ${names}.`,
            fix: "Shorten the labs, or move a break in step ①",
            link: { step: 2, tab: "courses", ...sectionOf(d.ids) },
          });
        } else {
          proven.push({ ...base, text: `${classes(n)} can't be placed anywhere: ${names}.`, fix: "Check their course and lab room", link: { step: 2, tab: "courses", ...sectionOf(d.ids) } });
        }
        break;
      case "badLock": {
        const where = nameList(d.ids.map((id) => {
          const l = locks.get(id);
          return l ? `${label(id)} at ${slotLabel(input, l.day, l.period)}` : label(id);
        }));
        proven.push({ ...base, text: `${n === 1 ? "A locked class is in a slot it" : `${n} locked classes are in slots they`} can't use: ${where}.`, fix: "Clear all locks", link: { step: 4, action: "clearLocks" } });
        break;
      }
      case "locks":
        proven.push({
          ...base,
          text: `Your ${n === 1 ? "locked class makes" : `${n} locked classes make`} it impossible; without locks the timetable can be built.`,
          fix: "Clear all locks",
          link: { step: 4, action: "clearLocks" },
        });
        break;
      case "locksLikely":
        likely.push({
          ...base,
          proven: false,
          text: `Your ${n === 1 ? "locked class" : `${n} locked classes`} may be the cause; the check without locks ran out of time.`,
          fix: "Clear all locks and try again",
          link: { step: 4, action: "clearLocks" },
        });
        break;
    }
  }
  return [...proven, ...preflightWarnings(report), ...likely];
}

/** Section, teacher and room loads over capacity, largest overrun first. Never blocks; T18's "Before you start". */
export function preflightWarnings(report: DataReport): Cause[] {
  const lunch = report.lunchReserved ? " after one lunch period a day" : "";
  const over = (l: Load) => l.required - l.available;
  const causes: Cause[] = [];
  for (const l of report.sections.filter((l) => over(l) > 0)) {
    causes.push({
      kind: "section",
      text: `${l.name} needs ${l.required} periods a week; only ${l.available} are free${lunch}.`,
      fix: `Cut ${plural(over(l), "period")} of its lectures or labs`,
      link: { step: 2, tab: "courses", sectionId: l.id },
      proven: true,
      over: over(l),
    });
  }
  for (const l of report.teachers.filter((l) => over(l) > 0)) {
    causes.push({
      kind: "teacher",
      text: `${l.name} teaches ${l.required} periods a week; only ${l.available} are free${lunch}.`,
      fix: `Move ${plural(over(l), "period")} to another teacher`,
      link: { step: 2, tab: "courses", teacherId: l.id },
      proven: true,
      over: over(l),
    });
  }
  for (const l of report.rooms.filter((l) => over(l) > 0)) causes.push(roomCause(l, over(l)));
  return causes.sort((a, b) => b.over - a.over);
}

function roomCause(l: RoomLoad, over: number): Cause {
  const base = { kind: "room" as const, proven: true, over };
  const pool = `${l.rooms} ${roomTypeLabel(l.roomType, l.rooms)}`;
  const have = `${l.rooms === 1 ? "has" : "have"} only ${l.available}`;
  // Each extra room of the type adds available / rooms periods.
  const more = Math.ceil(over / (l.available / l.rooms));
  const add = `${more} more ${roomTypeLabel(l.roomType, more)}`;
  switch (l.scope) {
    case "labRoom":
      return {
        ...base,
        text: `${l.name} is required for ${l.required} lab periods a week; it has only ${l.available}.`,
        fix: `Let ${plural(over, "lab period")} use any eligible lab`,
        link: { step: 2, tab: "courses" },
      };
    case "department":
      return {
        ...base,
        text: `${l.name} sections need ${l.required} ${l.roomType} periods a week; the ${pool} they may use ${have}.`,
        fix: `Add ${add} for ${l.name}, or share one`,
        link: { step: 2, tab: "rooms" },
      };
    case "college":
      return {
        ...base,
        text: `All sections need ${l.required} ${l.roomType} periods a week; the ${pool} ${have}.`,
        fix: `Add ${add}`,
        link: { step: 2, tab: "rooms" },
      };
  }
}

/** The first `n` causes and how many more there are, for the "+N more" line. */
export function topCauses(causes: Cause[], n = 5): { shown: Cause[]; more: number } {
  return { shown: causes.slice(0, n), more: Math.max(0, causes.length - n) };
}
