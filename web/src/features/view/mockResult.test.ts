import { describe, expect, it } from "vitest";
import { occupiedPeriods } from "@/domain/eligibility";
import { sampleCollege } from "@/domain/sampleCollege";
import { expandSessions } from "@/domain/sessions";
import { mockResult } from "./mockResult";

describe("mockResult (temporary)", () => {
  it("places sample sessions with no teacher, room or section clash", () => {
    const result = mockResult();
    const sessions = new Map(expandSessions(sampleCollege).map((s) => [s.id, s]));
    expect(result.placements.length).toBeGreaterThan(sessions.size * 0.9);
    const seen = new Set<string>();
    for (const p of result.placements) {
      const s = sessions.get(p.sessionId)!;
      for (const period of occupiedPeriods(p, s)) {
        expect(sampleCollege.settings.periods[period].kind).toBe("teaching");
        for (const key of [`t:${s.teacherId}`, `r:${p.roomId}`, `s:${s.sectionId}:${s.batch ?? "all"}`]) {
          const k = `${key}:${p.day}:${period}`;
          expect(seen.has(k), k).toBe(false);
          seen.add(k);
        }
      }
    }
    // whole-section vs batch overlap
    for (const p of result.placements) {
      const s = sessions.get(p.sessionId)!;
      if (s.batch == null) continue;
      for (const period of occupiedPeriods(p, s)) expect(seen.has(`s:${s.sectionId}:all:${p.day}:${period}`)).toBe(false);
    }
  });
});
