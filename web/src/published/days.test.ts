import { describe, expect, it } from "vitest";
import { sampleCollege } from "@/domain/sampleCollege";
import { expandSessions } from "@/domain/sessions";
import type { Placement } from "@/domain/types";
import { placementsFor } from "@/features/view/layout";
import { dayItems, todayTab } from "./days";

/** 18 Oct 2026 is a Sunday, so this is the date of weekday `n` (0 = Sunday) that week, at local noon. */
const weekday = (n: number) => new Date(2026, 9, 18 + n, 12);

describe("todayTab", () => {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];

  it("opens on today for each teaching day", () => {
    expect([1, 2, 3, 4, 5].map((n) => todayTab(days, weekday(n)))).toEqual([0, 1, 2, 3, 4]);
  });

  it("opens on the first day when today isn't a teaching day", () => {
    expect(todayTab(days, weekday(0))).toBe(0);
    expect(todayTab(days, weekday(6))).toBe(0);
  });

  it("matches full names, other cases and stray spaces", () => {
    expect(todayTab(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"], weekday(6))).toBe(5);
    expect(todayTab([" mon", "TUE", "wed"], weekday(2))).toBe(1);
  });

  it("falls back to the first day for names it can't read", () => {
    expect(todayTab(["Day 1", "Day 2"], weekday(1))).toBe(0);
    expect(todayTab([], weekday(1))).toBe(0);
  });
});

describe("dayItems", () => {
  const data = sampleCollege;
  const sessions = new Map(expandSessions(data).map((s) => [s.id, s]));
  const placements: Placement[] = [
    { sessionId: "cse-a-dbms:L1", day: 1, period: 5, roomId: "cr-cse-a" },
    { sessionId: "cse-a-ds:P1:B2", day: 1, period: 3, roomId: "lab-cse1" },
    { sessionId: "cse-a-ds:P1:B1", day: 1, period: 3, roomId: "lab-cse2" },
    { sessionId: "cse-a-ds:L1", day: 1, period: 0, roomId: "cr-cse-a" },
    { sessionId: "cse-a-ds:L2", day: 2, period: 0, roomId: "cr-cse-a" },
  ];
  const entries = placementsFor("section", "cse-a", placements, sessions);

  it("lists one day's classes in time order, parallel batches by batch number", () => {
    const items = dayItems(data, "section", entries, 1);
    expect(items.map((i) => i.id)).toEqual(["cse-a-ds:L1", "cse-a-ds:P1:B1", "cse-a-ds:P1:B2", "cse-a-dbms:L1"]);
  });

  it("gives each class its time, periods, subject, batch and the other names", () => {
    const [lecture, lab] = dayItems(data, "section", entries, 1);
    expect(lecture).toMatchObject({ time: "09:00–09:50", periods: "P1", subject: "Data Structures", lab: false, batch: null });
    expect(lecture.lines).toEqual(["Dr. Anita Sharma", "CSE Room A"]);
    expect(lab).toMatchObject({ time: "11:00–12:40", periods: "P3–P4", lab: true, batch: "B1" });
    expect(lab.entry.placement.roomId).toBe("lab-cse2");
  });

  it("names the section in the teacher and room views", () => {
    const byTeacher = placementsFor("teacher", "t-c1", placements, sessions);
    expect(dayItems(data, "teacher", byTeacher, 2)[0].lines).toEqual(["CSE A", "CSE Room A"]);
    const byRoom = placementsFor("room", "cr-cse-a", placements, sessions);
    expect(dayItems(data, "room", byRoom, 1).map((i) => i.lines)).toEqual([
      ["CSE A", "Dr. Anita Sharma"],
      ["CSE A", "Dr. Meera Iyer"],
    ]);
  });

  it("is empty on a day without classes", () => {
    expect(dayItems(data, "section", entries, 4)).toEqual([]);
  });
});
