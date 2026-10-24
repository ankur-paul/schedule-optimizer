import { describe, expect, it } from "vitest";
import timetableJson from "../../shared/fixtures/sample-timetable.json";
import { sampleCollege } from "../src/domain/sampleCollege";
import type { SolveResult } from "../src/domain/types";
import { validate } from "../src/domain/validator";

const timetable = timetableJson as SolveResult;

// Fails when the sample college changes: run `npm run gen:timetable` (see gen-sample-timetable.ts) and `npm run help:shots`.
describe("sample timetable fixture", () => {
  it("is the exact solver's clash-free timetable for the current sample college", () => {
    const v = validate({ ...sampleCollege, locks: [] }, timetable.placements);
    expect(timetable).toMatchObject({ engine: "cpsat", status: "optimal", unplaced: [] });
    expect(v.violations).toEqual([]);
    expect(v.missing).toEqual([]);
  });
});
