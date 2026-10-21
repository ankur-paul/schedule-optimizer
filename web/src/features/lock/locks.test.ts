import { describe, expect, it } from "vitest";
import { MON, TUE, at, tinyCollege, tinyValid } from "@/domain/tinyCollege";
import { droppedLocksMessage, isLocked, pruneLocks, regenerateLabel, toggleLock } from "./locks";

const maths = at("a-m:L1", MON, 5, "cr1");
const physics = at("b-ph:L1", MON, 0, "cr2");

describe("toggleLock", () => {
  it("locks a session where it is, then unlocks it", () => {
    const locked = toggleLock([], maths);
    expect(locked).toEqual([maths]);
    expect(isLocked(locked, "a-m:L1")).toBe(true);
    expect(toggleLock(locked, maths)).toEqual([]);
  });

  it("unlocks by session even if the placement passed in has moved", () => {
    expect(toggleLock([maths, physics], at("a-m:L1", TUE, 0, "cr2"))).toEqual([physics]);
  });

  it("does not mutate the input or share the placement object", () => {
    const locks = [physics];
    const next = toggleLock(locks, maths);
    expect(locks).toEqual([physics]);
    expect(next[1]).not.toBe(maths);
  });
});

describe("pruneLocks", () => {
  it("keeps locks taken from a valid timetable", () => {
    expect(pruneLocks(tinyCollege, tinyValid)).toEqual({ kept: tinyValid, dropped: [] });
  });

  it("drops a lock whose session no longer exists", () => {
    const data = { ...tinyCollege, courses: tinyCollege.courses.filter((c) => c.id !== "a-m") };
    const { kept, dropped } = pruneLocks(data, [maths, physics]);
    expect(kept).toEqual([physics]);
    expect(dropped).toEqual([{ lock: maths, reason: "Placement for unknown session a-m:L1" }]);
  });

  it("drops a lock whose room was deleted or is no longer eligible", () => {
    const noRoom = { ...tinyCollege, rooms: tinyCollege.rooms.filter((r) => r.id !== "cr1") };
    expect(pruneLocks(noRoom, [maths]).dropped.map((d) => d.reason)).toEqual(["CSE-2A Maths at Mon P5 is in unknown room cr1"]);

    const ownedByEce = { ...tinyCollege, rooms: tinyCollege.rooms.map((r) => (r.id === "cr1" ? { ...r, departmentId: "ece" } : r)) };
    expect(pruneLocks(ownedByEce, [maths]).dropped.map((d) => d.reason)).toEqual([
      "CSE-2A Maths at Mon P5 can't use CR-1: room belongs to ECE",
    ]);
  });

  it("drops a lock on a break or an unknown day", () => {
    const { kept, dropped } = pruneLocks(tinyCollege, [at("a-m:L1", MON, 4, "cr1"), at("b-m:L1", 7, 0, "cr2")]);
    expect(kept).toEqual([]);
    expect(dropped.map((d) => d.lock.sessionId)).toEqual(["a-m:L1", "b-m:L1"]);
    expect(dropped[0].reason).toMatch(/which is a break$/);
    expect(dropped[1].reason).toBe("ECE-2B Maths placed on unknown day 7");
  });

  it("drops both locks when they clash (a teacher was reassigned)", () => {
    const data = { ...tinyCollege, courses: tinyCollege.courses.map((c) => (c.id === "b-ph" ? { ...c, teacherId: "t3" } : c)) };
    const a = at("a-m:L1", TUE, 0, "cr1");
    const b = at("b-ph:L2", TUE, 0, "cr2");
    const { kept, dropped } = pruneLocks(data, [a, b, physics]);
    expect(dropped.map((d) => d.lock)).toEqual([a, b]);
    expect(dropped[0].reason).toMatch(/^Teacher S. Rao double-booked Tue P1/);
    expect(kept).toEqual([physics]); // also taught by S. Rao now, but alone on Mon P1
  });

  it("keeps the first of two locks for the same session", () => {
    const again = at("a-m:L1", TUE, 0, "cr1");
    const { kept, dropped } = pruneLocks(tinyCollege, [maths, again]);
    expect(kept).toEqual([maths]);
    expect(dropped).toEqual([{ lock: again, reason: "a-m:L1 was locked twice" }]);
  });

  it("keeps every lock when the data is too broken to check", () => {
    const data = { ...tinyCollege, sections: [] };
    expect(pruneLocks(data, [maths])).toEqual({ kept: [maths], dropped: [] });
  });

  it("returns nothing to do for no locks", () => {
    expect(pruneLocks(tinyCollege, [])).toEqual({ kept: [], dropped: [] });
  });
});

describe("labels", () => {
  it("mentions locks only when there are some", () => {
    expect(regenerateLabel(0)).toBe("Regenerate");
    expect(regenerateLabel(3)).toBe("Regenerate (keep 3 locked)");
  });

  it("explains dropped locks with plurals", () => {
    expect(droppedLocksMessage([{ lock: maths, reason: "gone" }])).toBe("Dropped 1 lock that no longer fit the data: gone");
    expect(droppedLocksMessage([{ lock: maths, reason: "x" }, { lock: physics, reason: "y" }])).toBe(
      "Dropped 2 locks that no longer fit the data: x; y",
    );
  });
});
