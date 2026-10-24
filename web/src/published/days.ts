import type { Id } from "@/domain/types";
import { otherLines, sessionDetails, type PlacedSession, type ViewData, type ViewKind } from "@/features/view/layout";

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/**
 * The day tab the phone layout opens on: today, matched on the first three letters of the day's name ("Mon",
 * "Monday"), or the first day when today isn't a teaching day.
 */
export function todayTab(days: string[], today: Date): number {
  const name = WEEKDAYS[today.getDay()];
  return Math.max(0, days.findIndex((d) => d.trim().toLowerCase().slice(0, 3) === name));
}

/** One class in the phone layout's list. */
export interface DayItem {
  id: Id;
  entry: PlacedSession;
  /** "11:00–12:40" */
  time: string;
  /** "P3–P4" */
  periods: string;
  subject: string;
  lab: boolean;
  /** "B2", or null for the whole section. */
  batch: string | null;
  /** Teacher or section, then room or teacher: what the view doesn't already say. */
  lines: string[];
}

/** One entity's classes on one day, in time order (batches in parallel by batch number). */
export function dayItems(data: ViewData, kind: ViewKind, entries: PlacedSession[], day: number): DayItem[] {
  return entries
    .filter((e) => e.placement.day === day)
    .sort(
      (a, b) =>
        a.placement.period - b.placement.period ||
        (a.session.batch ?? 0) - (b.session.batch ?? 0) ||
        a.session.id.localeCompare(b.session.id),
    )
    .map((entry) => {
      const info = sessionDetails(data, entry);
      return {
        id: entry.session.id,
        entry,
        time: info.time,
        periods: info.periods,
        subject: info.subject,
        lab: info.kind === "lab",
        batch: info.batch,
        lines: otherLines(kind, info),
      };
    });
}
