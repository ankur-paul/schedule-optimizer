import { describe, expect, it } from "vitest";
import { MON, TUE, at, tinyCollege, tinyValid, tinyWith } from "./tinyCollege";
import { validate } from "./validator";

const rules = (placements = tinyValid, input = tinyCollege) => validate(input, placements).violations.map((v) => v.rule);

describe("validate", () => {
  it("passes a clash-free timetable", () => {
    expect(validate(tinyCollege, tinyValid)).toEqual({ ok: true, violations: [], missing: [] });
  });

  it("H1: teacher double-booked, with a readable message", () => {
    const result = validate(tinyCollege, tinyWith({ "a-m:L1": [TUE, 5, "cr1"], "b-m:L1": [TUE, 5, "cr2"] }));
    expect(result.violations).toEqual([
      { rule: "H1", message: "Teacher S. Rao double-booked Tue P5 (CSE-2A Maths, ECE-2B Maths)", sessionIds: ["a-m:L1", "b-m:L1"] },
    ]);
  });

  it("H2: whole-section lecture during a batch lab", () => {
    expect(rules(tinyWith({ "a-m:L1": [MON, 0, "cr1"] }))).toEqual(["H2"]);
  });

  it("H2: different batches in parallel are not a section clash", () => {
    expect(rules(tinyWith({ "a-ds:P1:B2": [MON, 0, "lab1"] }))).not.toContain("H2");
  });

  it("H3: room double-booked", () => {
    expect(rules(tinyWith({ "a-ds:L2": [TUE, 2, "cr2"] }))).toEqual(["H3"]);
  });

  it("H4: section in another department's room", () => {
    const result = validate(tinyCollege, tinyWith({ "b-m:L1": [MON, 1, "cr1"] }));
    expect(result.violations.map((v) => [v.rule, v.message])).toEqual([
      ["H4", "ECE-2B Maths at Mon P2 can't use CR-1: room belongs to CSE"],
    ]);
  });

  it("H6: lab spanning the break", () => {
    expect(rules(tinyWith({ "b-ph:P1": [MON, 3, "lab1"] }))).toEqual(["H6"]);
  });

  it("H7: lecture in a break", () => {
    expect(rules(tinyWith({ "b-m:L1": [MON, 4, "cr2"] }))).toEqual(["H7"]);
  });

  it("H8: section with no free lunch period", () => {
    const result = validate(tinyCollege, tinyWith({ "b-m:L1": [MON, 5, "cr2"], "a-m:L1": [TUE, 3, "cr1"] }));
    expect(result.violations.map((v) => [v.rule, v.message])).toEqual([
      ["H8", "Section ECE-2B has no free lunch period on Mon (ECE-2B Physics Lab, ECE-2B Maths)"],
    ]);
  });

  it("reports missing sessions separately (H5) without failing", () => {
    const result = validate(tinyCollege, tinyValid.filter((p) => p.sessionId !== "b-m:L1"));
    expect(result).toMatchObject({ ok: true, missing: ["b-m:L1"] });
  });

  it("flags duplicates, unknown sessions and moved locks", () => {
    const input = { ...tinyCollege, locks: [at("a-m:L1", TUE, 5, "cr1")] };
    expect(rules([...tinyValid, tinyValid[0], at("nope", MON, 0, "cr1")], input)).toEqual(["DATA", "H5", "LOCK"]);
  });
});
