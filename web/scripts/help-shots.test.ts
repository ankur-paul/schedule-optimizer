import { describe, expect, it } from "vitest";
import timetableJson from "../../shared/fixtures/sample-timetable.json";
import { sampleCollege } from "../src/domain/sampleCollege";
import type { SolveResult } from "../src/domain/types";
import { docHash, isDirty } from "../src/features/online/online";
import { PERSIST_VERSION } from "../src/store/useAppStore";
import { SHOTS, type Shot } from "./help-shots.config";
import { captureTargets, persistedState, shotData, shotProblems, unionClip } from "./help-shots.lib";
import { TIMETABLE } from "./help-shots.supabase";

const timetable = timetableJson as SolveResult;
const shot = (over: Partial<Shot> = {}): Shot => ({
  name: "a-shot",
  start: "timetable",
  step: 3,
  solver: "online",
  capture: { text: "Hello" },
  ...over,
});

describe("shot list", () => {
  it("is valid", () => {
    expect(shotProblems(SHOTS, timetable)).toEqual([]);
  });

  it("has the starter shots", () => {
    expect(SHOTS.map((s) => s.name)).toEqual(expect.arrayContaining(["data-checks", "timetable-ready", "grid-locked-class", "print-panel"]));
  });
});

describe("shotProblems", () => {
  it("accepts a good shot", () => {
    expect(shotProblems([shot(), shot({ name: "b2", locks: ["cse-a-ds:L1"] })], timetable)).toEqual([]);
  });

  it("finds a name used twice", () => {
    expect(shotProblems([shot(), shot()], timetable)).toEqual(['Shot "a-shot": the name is used twice.']);
  });

  it.each(["Data", "a_b", "a--b", "-a", "a.png", ""])("rejects the name %j", (name) => {
    expect(shotProblems([shot({ name })], timetable)).toHaveLength(1);
  });

  it("finds an unknown starting state", () => {
    expect(shotProblems([shot({ start: "empty" as Shot["start"] })], timetable)).toEqual(['Shot "a-shot": unknown starting state "empty".']);
  });

  it("finds locks without a timetable or not in it", () => {
    expect(shotProblems([shot({ start: "sample", locks: ["cse-a-ds:L1"] })], timetable)).toEqual(['Shot "a-shot": locks need the "timetable" start.']);
    expect(shotProblems([shot({ locks: ["nope"] })], timetable)).toEqual(['Shot "a-shot": lock "nope" is not in the fixed timetable.']);
  });

  it("finds a shot with nothing to capture", () => {
    expect(shotProblems([shot({ capture: [] })], timetable)).toEqual(['Shot "a-shot": nothing to capture.']);
  });
});

describe("captureTargets", () => {
  it("always gives a list", () => {
    expect(captureTargets(shot())).toEqual([{ text: "Hello" }]);
    expect(captureTargets(shot({ capture: [{ text: "a" }, { css: "b" }] }))).toEqual([{ text: "a" }, { css: "b" }]);
  });
});

describe("shotData", () => {
  it("loads the sample college without a timetable for the sample start", () => {
    const data = shotData(shot({ start: "sample", step: 1 }), timetable);
    expect(data.courses).toEqual(sampleCollege.courses);
    expect(data.settings).toEqual(sampleCollege.settings);
    expect(data).toMatchObject({ result: null, locks: [], step: 1, printHeading: "" });
  });

  it("adds the timetable, the locks at their places and the print heading", () => {
    const data = shotData(shot({ locks: ["cse-a-ds:L2"], printHeading: "GNDEC" }), timetable);
    expect(data.result).toEqual(timetable);
    expect(data.locks).toEqual([timetable.placements.find((p) => p.sessionId === "cse-a-ds:L2")]);
    expect(data.printHeading).toBe("GNDEC");
  });

  it("copies, so a shot can't change the fixture", () => {
    const data = shotData(shot(), timetable);
    expect(data.result).not.toBe(timetable);
    expect(data.courses).not.toBe(sampleCollege.courses);
  });

  it("throws on a lock that isn't in the timetable", () => {
    expect(() => shotData(shot({ locks: ["nope"] }), timetable)).toThrow(/nope/);
  });
});

describe("persistedState", () => {
  it("is what the store's persist middleware reads", () => {
    const saved = JSON.parse(persistedState(shot({ step: 2 }), timetable));
    expect(saved.version).toBe(PERSIST_VERSION);
    expect(saved.state).toMatchObject({ step: 2, online: null, timeLimitSec: 20 });
    expect(saved.state.result.placements).toHaveLength(timetable.placements.length);
  });

  it("links the working copy for a signed-in shot that asks, unchanged since its save", () => {
    const saved = JSON.parse(persistedState(shot({ signedIn: { as: "editor", online: "latest" } }), timetable));
    expect(saved.state.online).toMatchObject({ timetableId: TIMETABLE.id, version: TIMETABLE.latest });
    expect(isDirty(saved.state.online, docHash(saved.state))).toBe(false);
  });

  it("links one version back, with changes, for a conflict", () => {
    const saved = JSON.parse(persistedState(shot({ signedIn: { as: "editor", online: "behind" } }), timetable));
    expect(saved.state.online.version).toBe(TIMETABLE.latest - 1);
    expect(isDirty(saved.state.online, docHash(saved.state))).toBe(true);
  });

  it("stays unlinked when signed in without a timetable", () => {
    expect(JSON.parse(persistedState(shot({ signedIn: { as: "admin" } }), timetable)).state.online).toBeNull();
  });
});

describe("unionClip", () => {
  const page = { width: 1280, height: 800 };

  it("pads one box", () => {
    expect(unionClip([{ x: 100, y: 50, width: 200, height: 100 }], 8, page)).toEqual({ x: 92, y: 42, width: 216, height: 116 });
  });

  it("covers several boxes", () => {
    const boxes = [
      { x: 500, y: 100, width: 100, height: 40 },
      { x: 300, y: 144, width: 320, height: 200 },
    ];
    expect(unionClip(boxes, 0, page)).toEqual({ x: 300, y: 100, width: 320, height: 244 });
  });

  it("rounds outwards to whole pixels", () => {
    expect(unionClip([{ x: 10.4, y: 20.6, width: 5.2, height: 5.2 }], 0, page)).toEqual({ x: 10, y: 20, width: 6, height: 6 });
  });

  it("stays inside the page", () => {
    expect(unionClip([{ x: 4, y: 2, width: 1274, height: 795 }], 8, page)).toEqual({ x: 0, y: 0, width: 1280, height: 800 });
  });

  it("cuts to maxHeight from the top", () => {
    expect(unionClip([{ x: 100, y: 50, width: 200, height: 600 }], 8, page, 300)).toEqual({ x: 92, y: 42, width: 216, height: 300 });
    expect(unionClip([{ x: 100, y: 50, width: 200, height: 100 }], 8, page, 300).height).toBe(116);
  });

  it("throws with nothing to capture", () => {
    expect(() => unionClip([], 8, page)).toThrow();
  });
});
