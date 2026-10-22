import { describe, expect, it } from "vitest";
import { sampleCollege } from "@/domain/sampleCollege";
import { buildSubjectColors, hashString, hueDistance, PALETTE, subjectColor } from "./colors";

describe("subject colours", () => {
  it("hash is stable and non-negative", () => {
    expect(hashString("Data Structures")).toBe(hashString("Data Structures"));
    expect(hashString("")).toBe(5381);
    for (const s of ["a", "Physics", "x".repeat(500)]) expect(hashString(s)).toBeGreaterThanOrEqual(0);
  });

  it("gives every subject of a section its own colour in the sample college", () => {
    const colors = buildSubjectColors(sampleCollege.courses);
    for (const section of sampleCollege.sections) {
      const subjects = [...new Set(sampleCollege.courses.filter((c) => c.sectionId === section.id).map((c) => c.subject))];
      const used = subjects.map((s) => colors.get(s));
      expect(new Set(used).size).toBe(subjects.length);
    }
  });

  it("keeps a section's subjects far apart on the hue wheel in the sample college", () => {
    const colors = buildSubjectColors(sampleCollege.courses);
    for (const section of sampleCollege.sections) {
      const used = [...new Set(sampleCollege.courses.filter((c) => c.sectionId === section.id).map((c) => colors.get(c.subject)!))];
      for (const a of used) for (const b of used) if (a !== b) expect(hueDistance(a, b)).toBeGreaterThanOrEqual(40);
    }
  });

  it("gives a second subject the hue farthest from the first", () => {
    const colors = buildSubjectColors([
      { sectionId: "s", subject: "Art" },
      { sectionId: "s", subject: "Biology" },
    ]);
    const farthest = Math.max(...PALETTE.map((_, i) => hueDistance(colors.get("Art")!, i)));
    expect(hueDistance(colors.get("Art")!, colors.get("Biology")!)).toBe(farthest);
  });

  it("measures hue distance the short way round the wheel", () => {
    for (let a = 0; a < PALETTE.length; a++) {
      expect(hueDistance(a, a)).toBe(0);
      for (let b = 0; b < PALETTE.length; b++) {
        expect(hueDistance(a, b)).toBe(hueDistance(b, a));
        expect(hueDistance(a, b)).toBeLessThanOrEqual(180);
      }
    }
  });

  it("same subject in different sections gets one colour", () => {
    const colors = buildSubjectColors([
      { sectionId: "a", subject: "Maths" },
      { sectionId: "b", subject: "Maths" },
    ]);
    expect(colors.size).toBe(1);
  });

  it("does not depend on course order", () => {
    const courses = sampleCollege.courses;
    expect(buildSubjectColors([...courses].reverse())).toEqual(buildSubjectColors(courses));
  });

  it("reuses colours once a section has more subjects than the palette", () => {
    const courses = Array.from({ length: PALETTE.length + 3 }, (_, i) => ({ sectionId: "s", subject: `Subject ${i}` }));
    const colors = buildSubjectColors(courses);
    expect(new Set(colors.values()).size).toBe(PALETTE.length);
    for (const index of colors.values()) expect(index).toBeLessThan(PALETTE.length);
  });

  it("falls back to the hash for an unknown subject", () => {
    expect(subjectColor(new Map(), "Art")).toBe(PALETTE[hashString("Art") % PALETTE.length]);
    expect(subjectColor(new Map([["Art", 3]]), "Art")).toBe(PALETTE[3]);
  });
});
