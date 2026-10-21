import { describe, expect, it } from "vitest";
import { eligibleRooms, occupiedPeriods, teachingPeriods, validStarts } from "./eligibility";
import { sampleCollege } from "./sampleCollege";
import { expandSessions } from "./sessions";

const { settings } = sampleCollege;
const sessions = expandSessions(sampleCollege);
const byId = (id: string) => sessions.find((s) => s.id === id)!;

describe("eligibility", () => {
  it("lists teaching periods without the break", () => {
    expect(teachingPeriods(settings)).toEqual([0, 1, 3, 4, 5, 6, 7, 8]);
  });

  it("validStarts(2) excludes the period before the break and the last period", () => {
    const starts = validStarts(settings, 2);
    expect(starts).toEqual([0, 3, 4, 5, 6, 7]);
    expect(starts).not.toContain(1);
    expect(starts).not.toContain(8);
  });

  it("restricts a fixed-room lab to that room", () => {
    expect(eligibleRooms(sampleCollege, byId("cse-a-phy:P1:B1")).map((r) => r.id)).toEqual(["lab-phy"]);
  });

  it("allows owned and shared rooms of the right type", () => {
    const ids = eligibleRooms(sampleCollege, byId("ece-b-ss:L1")).map((r) => r.id);
    expect(ids).toEqual(["cr-ece-a", "cr-ece-b", "cr-ece-c", "sh-1", "sh-2"]);
  });

  it("computes occupied periods of a lab", () => {
    expect(occupiedPeriods({ sessionId: "x", day: 0, period: 3, roomId: "r" }, byId("me-c-mp:P1"))).toEqual([3, 4, 5]);
  });
});
