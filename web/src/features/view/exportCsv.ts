import type { Id, Placement, Session } from "@/domain/types";
import { sessionDetails, type ViewData } from "./layout";

export const CSV_HEADER = ["Section", "Batch", "Day", "Periods", "Time", "Subject", "Kind", "Teacher", "Room"];

/** Quote a CSV field when it contains a comma, quote or newline (RFC 4180). */
export function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Every placement as one CSV row, sorted by section (input order), day, period, then batch.
 * Placements of unknown sessions are skipped. Lines end with CRLF so Excel opens it cleanly.
 */
export function placementsCsv(data: ViewData, placements: Placement[], sessions: Map<Id, Session>): string {
  const sectionRank = new Map(data.sections.map((s, i) => [s.id, i]));
  const rows = placements
    .flatMap((placement) => {
      const session = sessions.get(placement.sessionId);
      return session ? [{ session, placement }] : [];
    })
    .sort(
      (a, b) =>
        (sectionRank.get(a.session.sectionId) ?? Infinity) - (sectionRank.get(b.session.sectionId) ?? Infinity) ||
        a.placement.day - b.placement.day ||
        a.placement.period - b.placement.period ||
        (a.session.batch ?? 0) - (b.session.batch ?? 0),
    )
    .map((entry) => {
      const d = sessionDetails(data, entry);
      return [d.section, d.batch ?? "", d.day, d.periods, d.time, d.subject, d.kind, d.teacher, d.room];
    });
  return [CSV_HEADER, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
