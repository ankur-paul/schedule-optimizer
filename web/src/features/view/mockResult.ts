// Temporary stand-in for a real engine result until T07 lands. Delete after integration.
import { eligibleRooms, validStarts } from "@/domain/eligibility";
import { sampleCollege } from "@/domain/sampleCollege";
import { expandSessions } from "@/domain/sessions";
import type { Placement, SolveInput, SolveResult } from "@/domain/types";

/** Greedy first-fit (labs first) that respects teacher/section/room clashes (H1–H4, H6, H7). No soft rules. */
export function mockSolve(input: SolveInput): SolveResult {
  const sessions = expandSessions(input).sort((a, b) => b.length - a.length);
  const sectionBatches = new Map(input.sections.map((s) => [s.id, s.batches]));
  const busy = new Set<string>();
  const placements: Placement[] = [];
  const unplaced: SolveResult["unplaced"] = [];

  for (const session of sessions) {
    // A whole-section session blocks every batch; a batch session blocks only its own batch.
    const batches = session.batch == null ? [...range(sectionBatches.get(session.sectionId) ?? 1)] : [session.batch];
    const keys = (day: number, p: number, roomId: string) => [
      `t:${session.teacherId}:${day}:${p}`,
      `r:${roomId}:${day}:${p}`,
      ...batches.map((b) => `s:${session.sectionId}:${b}:${day}:${p}`),
    ];
    let placed = false;
    // Spread sessions over the week: start the day search at a session-dependent offset.
    const offset = placements.length % input.settings.days.length;
    search: for (let d = 0; d < input.settings.days.length; d++) {
      const day = (d + offset) % input.settings.days.length;
      for (const start of validStarts(input.settings, session.length)) {
        for (const room of eligibleRooms(input, session)) {
          const all = range(session.length).flatMap((k) => keys(day, start + k - 1, room.id));
          if (all.some((k) => busy.has(k))) continue;
          all.forEach((k) => busy.add(k));
          placements.push({ sessionId: session.id, day, period: start, roomId: room.id });
          placed = true;
          break search;
        }
      }
    }
    if (!placed) unplaced.push({ sessionId: session.id, reason: "No free slot (mock solver)" });
  }

  return {
    engine: "heuristic",
    status: unplaced.length ? "partial" : "feasible",
    placements,
    unplaced,
    score: { total: 0, breakdown: { subjectRepeat: 0, teacherOverload: 0, sectionGaps: 0, batchIdle: 0 } },
    timeMs: 0,
    message: "Mock result (development only)",
  };
}

/** 1..n */
function range(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i + 1);
}

export const mockResult = (): SolveResult => mockSolve(sampleCollege);
