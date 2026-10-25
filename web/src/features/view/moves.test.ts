import { describe, expect, it } from "vitest";
import { eligibleRooms } from "@/domain/eligibility";
import { score } from "@/domain/score";
import { expandSessions } from "@/domain/sessions";
import { MON, TUE, at, tinyCollege, tinyValid, tinyWith } from "@/domain/tinyCollege";
import type { Placement, SolveResult } from "@/domain/types";
import { validate } from "@/domain/validator";
import { applyMove, checkMove, dropHint, editedResult, formatDelta, grabOffset, moveSummary, moveTargets, targetUnder, type MoveTarget } from "./moves";

const target = (sessionId: string, day: number, period: number, placements = tinyValid) =>
  moveTargets(tinyCollege, placements, sessionId)[day][period];
const reason = (t: MoveTarget) => (t.ok ? null : t.reason);
const withoutSession = (placements: Placement[], id: string) => placements.filter((p) => p.sessionId !== id);

describe("moveTargets", () => {
  it("has one entry per day and period, breaks included", () => {
    const targets = moveTargets(tinyCollege, tinyValid, "a-m:L1");
    expect(targets).toHaveLength(2);
    expect(targets.every((row) => row.length === 6)).toBe(true);
    expect(targets[TUE][3]).toMatchObject({ day: TUE, period: 3 });
  });

  it("is empty for an unknown session", () => {
    expect(moveTargets(tinyCollege, tinyValid, "nope")).toEqual([]);
  });

  it("marks the current slot ok, in the current room, with no score change", () => {
    expect(target("a-m:L1", MON, 5)).toEqual({ ok: true, day: MON, period: 5, roomId: "cr1", scoreDelta: 0, current: true });
  });

  it("allows a free slot and reports the score change", () => {
    const t = target("b-m:L1", TUE, 0);
    const moved = tinyWith({ "b-m:L1": [TUE, 0, "cr2"] });
    expect(t).toEqual({ ok: true, day: TUE, period: 0, roomId: "cr2", current: false, scoreDelta: score(tinyCollege, moved).total - score(tinyCollege, tinyValid).total });
  });

  it("rejects breaks", () => {
    expect(reason(target("a-m:L1", MON, 4))).toBe("Break: nothing can be placed here");
  });

  it("rejects a lab that would run into a break or off the end of the day", () => {
    expect(reason(target("b-ph:P1", MON, 3))).toBe("This 2-period lab would run into the break");
    expect(reason(target("b-ph:P1", TUE, 5))).toBe("This 2-period lab would run into the end of the day");
  });

  it("H2: rejects a slot where the section is busy, naming what is there", () => {
    expect(reason(target("a-m:L1", MON, 0))).toBe("CSE-2A already has DS lab (B1) at Mon P1");
    // A lab's second period counts too.
    expect(reason(target("a-m:L1", MON, 1))).toBe("CSE-2A already has DS lab (B1) at Mon P2");
  });

  it("H2: lets a batch lab run beside another batch's lab, but not beside a whole-section lecture", () => {
    // B2 at Mon P1 is fine for the section (B1 is in a lab); it fails only on its teacher.
    expect(reason(target("a-ds:P1:B2", MON, 0))).toBe("R. Gupta teaches ECE-2B Physics at Mon P1");
    expect(reason(target("a-ds:P1:B2", MON, 2))).toBe("CSE-2A already has DS at Mon P3");
  });

  it("H1: rejects a slot where the teacher is busy", () => {
    const placements = tinyWith({ "a-m:L1": [TUE, 5, "cr1"] });
    expect(reason(target("b-m:L1", TUE, 5, placements))).toBe("S. Rao teaches CSE-2A Maths at Tue P5");
  });

  it("H3: rejects a slot where every room the session may use is taken", () => {
    // ECE-2B may only use the shared CR-2.
    const placements = tinyWith({ "a-ds:L2": [TUE, 3, "cr2"] });
    expect(reason(target("b-m:L1", TUE, 3, placements))).toBe("CR-2 is in use then");
  });

  it("keeps the current room when it is free, else takes another eligible room", () => {
    const inCr2 = tinyWith({ "a-m:L1": [MON, 5, "cr2"] });
    expect(target("a-m:L1", TUE, 3, inCr2)).toMatchObject({ ok: true, roomId: "cr2" });
    const cr2Taken = tinyWith({ "a-m:L1": [MON, 5, "cr2"], "b-ph:L2": [TUE, 3, "cr2"] });
    expect(target("a-m:L1", TUE, 3, cr2Taken)).toMatchObject({ ok: true, roomId: "cr1" });
  });

  it("H8: rejects a move that leaves the section or the teacher without a lunch period", () => {
    // CSE-2A already has Maths in P5 on Monday; DS in P4 would fill the other lunch candidate.
    expect(reason(target("a-ds:L1", MON, 3))).toBe("CSE-2A would have no free lunch period on Mon");
    const placements = tinyWith({ "a-m:L1": [TUE, 5, "cr1"] });
    expect(reason(target("b-m:L1", TUE, 3, placements))).toBe("S. Rao would have no free lunch period on Tue");
  });

  it("works for an unplaced session: no current slot, score change measured from without it", () => {
    const placements = withoutSession(tinyValid, "b-m:L1");
    const targets = moveTargets(tinyCollege, placements, "b-m:L1");
    expect(targets.flat().some((t) => t.ok && t.current)).toBe(false);
    const t = targets[MON][1];
    expect(t).toMatchObject({ ok: true, roomId: "cr2" });
    if (t.ok) expect(t.scoreDelta).toBe(score(tinyCollege, tinyValid).total - score(tinyCollege, placements).total);
  });

  it("agrees with validate() for every session and slot of the tiny college", () => {
    const input = { ...tinyCollege, locks: [] };
    for (const session of expandSessions(tinyCollege)) {
      const others = withoutSession(tinyValid, session.id);
      for (const t of moveTargets(tinyCollege, tinyValid, session.id).flat()) {
        if (t.ok) {
          const moved = [...others, at(session.id, t.day, t.period, t.roomId)];
          expect(validate(input, moved).violations, `${session.id} → ${t.day}/${t.period}`).toEqual([]);
          expect(t.scoreDelta).toBe(score(tinyCollege, moved).total - score(tinyCollege, tinyValid).total);
        } else {
          for (const room of eligibleRooms(tinyCollege, session)) {
            const moved = [...others, at(session.id, t.day, t.period, room.id)];
            expect(validate(input, moved).ok, `${session.id} → ${t.day}/${t.period} in ${room.id}: ${t.reason}`).toBe(false);
          }
        }
      }
    }
  });
});

describe("formatDelta", () => {
  it("signs the score change", () => {
    expect([formatDelta(4), formatDelta(-2), formatDelta(0)]).toEqual(["+4", "−2", "±0"]);
  });
});

const result = (over: Partial<SolveResult> = {}): SolveResult => ({
  engine: "cpsat",
  status: "optimal",
  placements: tinyValid,
  unplaced: [],
  score: score(tinyCollege, tinyValid),
  timeMs: 10,
  ...over,
});

describe("applyMove", () => {
  const moved = at("b-m:L1", TUE, 0, "cr2");

  it("moves the session and locks it at its new slot, replacing an older lock", () => {
    const oldLock = at("b-m:L1", MON, 1, "cr2");
    const other = at("a-m:L1", MON, 5, "cr1");
    const out = applyMove(result(), [oldLock, other], moved);
    expect(out.placements).toEqual(tinyWith({ "b-m:L1": [TUE, 0, "cr2"] }));
    expect(out.locks).toEqual([other, moved]);
  });

  it("places an unplaced session and drops it from the unplaced list", () => {
    const r = result({ placements: withoutSession(tinyValid, "b-m:L1"), unplaced: [{ sessionId: "b-m:L1", reason: "no room" }] });
    const out = applyMove(r, [], moved);
    expect(out.placements).toHaveLength(tinyValid.length);
    expect(out.placements.at(-1)).toEqual(moved);
    expect(out.unplaced).toEqual([]);
  });

  it("does not mutate its inputs or share the moved object", () => {
    const r = result();
    const locks: Placement[] = [];
    const out = applyMove(r, locks, moved);
    expect(r.placements).toBe(tinyValid);
    expect(tinyValid.find((p) => p.sessionId === "b-m:L1")).toEqual(at("b-m:L1", MON, 1, "cr2"));
    expect(locks).toEqual([]);
    expect(out.locks[0]).not.toBe(moved);
  });
});

describe("checkMove", () => {
  const input = { ...tinyCollege, locks: [] };

  it("passes a valid move, with the new lock in place", () => {
    const moved = at("b-m:L1", TUE, 0, "cr2");
    const after = tinyWith({ "b-m:L1": [TUE, 0, "cr2"] });
    expect(checkMove({ ...input, locks: [moved] }, tinyValid, after, "b-m:L1")).toEqual({ problem: null, rule: null, violations: 0 });
  });

  it("reports a clash the move creates", () => {
    const after = tinyWith({ "a-m:L1": [MON, 0, "cr1"] });
    const check = checkMove(input, tinyValid, after, "a-m:L1");
    expect(check.problem).toMatch(/^Section CSE-2A double-booked Mon P1/);
    expect(check.rule).toBe("H2");
  });

  it("allows a clean move in a timetable that already had an unrelated clash, and counts what is left", () => {
    const broken = tinyWith({ "a-ds:L2": [TUE, 2, "cr2"] }); // CR-2 double-booked Tue P3
    const after = broken.map((p) => (p.sessionId === "b-m:L1" ? at("b-m:L1", TUE, 0, "cr2") : p));
    expect(checkMove(input, broken, after, "b-m:L1")).toEqual({ problem: null, rule: null, violations: 1 });
  });

  it("checks several moved sessions at once (a swap), ignoring their old locks", () => {
    const [m, b] = [at("b-m:L1", TUE, 0, "cr2"), at("a-m:L1", TUE, 3, "cr1")];
    const after = tinyWith({ "b-m:L1": [TUE, 0, "cr2"], "a-m:L1": [TUE, 3, "cr1"] });
    expect(checkMove({ ...input, locks: [m, b] }, tinyValid, after, ["b-m:L1", "a-m:L1"])).toEqual({ problem: null, rule: null, violations: 0 });
    // Only the second one clashes: it is still reported.
    const clash = tinyWith({ "b-m:L1": [TUE, 0, "cr2"], "a-m:L1": [MON, 0, "cr1"] });
    expect(checkMove(input, tinyValid, clash, ["b-m:L1", "a-m:L1"]).rule).toBe("H2");
  });

  it("catches a lock left at the old slot (locks passed in must be the ones after the move)", () => {
    const lock = at("b-m:L1", MON, 1, "cr2");
    const after = tinyWith({ "b-m:L1": [TUE, 0, "cr2"] });
    const check = checkMove({ ...input, locks: [lock] }, tinyValid, after, "b-m:L1");
    expect(check.problem).toMatch(/^Locked ECE-2B Maths/);
    expect(check.rule).toBe("LOCK");
  });
});

describe("editedResult", () => {
  it("re-scores and drops the optimal claim", () => {
    const placements = tinyWith({ "b-m:L1": [TUE, 0, "cr2"] });
    const out = editedResult(result(), placements, [], tinyCollege);
    expect(out).toMatchObject({ engine: "cpsat", status: "feasible", placements, score: score(tinyCollege, placements) });
  });

  it("turns a partial result feasible once nothing is unplaced, and keeps it partial otherwise", () => {
    const unplaced = [{ sessionId: "b-m:L1", reason: "x" }];
    expect(editedResult(result({ status: "partial" }), tinyValid, [], tinyCollege).status).toBe("feasible");
    expect(editedResult(result({ status: "partial" }), tinyValid, unplaced, tinyCollege).status).toBe("partial");
    expect(editedResult(result({ status: "feasible", engine: "heuristic" }), tinyValid, [], tinyCollege).status).toBe("feasible");
  });
});

describe("grabOffset", () => {
  it("is the period of the card under the pointer", () => {
    expect(grabOffset(110, 100, 200, 2)).toBe(0);
    expect(grabOffset(250, 100, 200, 2)).toBe(1);
    expect(grabOffset(299, 100, 300, 3)).toBe(1);
  });

  it("is 0 for one-period cards and clamps to the card", () => {
    expect(grabOffset(250, 100, 200, 1)).toBe(0);
    expect(grabOffset(50, 100, 200, 2)).toBe(0);
    expect(grabOffset(900, 100, 200, 2)).toBe(1);
    expect(grabOffset(150, 100, 0, 2)).toBe(0);
  });
});

describe("targetUnder", () => {
  const targets = moveTargets(tinyCollege, tinyValid, "b-ph:P1");

  it("shifts the start back by the grab offset", () => {
    expect(targetUnder(targets, TUE, 1, 0)).toBe(targets[TUE][1]);
    expect(targetUnder(targets, TUE, 1, 1)).toBe(targets[TUE][0]);
  });

  it("fails a start before the first period and ignores cells off the grid", () => {
    expect(targetUnder(targets, MON, 0, 1)).toEqual({ ok: false, day: MON, period: -1, reason: "This lab would start before the first period" });
    expect(targetUnder(targets, 5, 0, 0)).toBeNull();
    expect(targetUnder(targets, MON, 9, 0)).toBeNull();
  });
});

describe("moveSummary", () => {
  it("names the session, slot, room and score change", () => {
    const session = expandSessions(tinyCollege).find((s) => s.id === "a-ds:P1:B1")!;
    expect(moveSummary(tinyCollege, session, at("a-ds:P1:B1", TUE, 2, "lab1"), { before: 18, after: 20 }, 0)).toEqual({
      title: "Moved DS lab (B1) to Tue P3 · Lab-1 · locked",
      description: "Score 18 → 20 · ✓ Verified: 0 clashes",
    });
  });

  it("does not claim a clean check when earlier violations remain", () => {
    const session = expandSessions(tinyCollege).find((s) => s.id === "b-m:L1")!;
    expect(moveSummary(tinyCollege, session, at("b-m:L1", TUE, 0, "cr2"), { before: 5, after: 5 }, 2).description).toBe(
      "Score 5 → 5 · 2 earlier rule violations still to fix",
    );
  });
});

describe("dropHint", () => {
  const targets = moveTargets(tinyCollege, tinyValid, "b-m:L1");

  it("says where a valid drop goes and what it does to the score", () => {
    const t = targets[TUE][0];
    if (!t.ok) throw new Error("expected a valid slot");
    expect(dropHint(tinyCollege, t)).toEqual({ ok: true, text: `Tue P1 · CR-2 · score ${formatDelta(t.scoreDelta)}` });
  });

  it("gives the reason for an invalid drop, and neutral text off the grid or on the current slot", () => {
    expect(dropHint(tinyCollege, targets[MON][4])).toEqual({ ok: false, text: "Break: nothing can be placed here" });
    expect(dropHint(tinyCollege, null)).toEqual({ ok: null, text: "Drop on a green slot" });
    expect(dropHint(tinyCollege, targets[MON][1])).toEqual({ ok: null, text: "Its current slot" });
  });
});
