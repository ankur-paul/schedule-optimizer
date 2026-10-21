import { describe, expect, it } from "vitest";
import { sampleCollege } from "@/domain/sampleCollege";
import { buildSubjectColors, hashString, PALETTE, subjectColor } from "./colors";

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
