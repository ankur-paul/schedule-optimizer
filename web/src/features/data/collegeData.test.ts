import { describe, expect, it } from "vitest";
import { sampleCollege } from "@/domain/sampleCollege";
import { countsLabel, plural } from "./collegeData";

describe("labels", () => {
  it("pluralises counts", () => {
    expect([plural(0, "room"), plural(1, "room"), plural(2, "room")]).toEqual(["0 rooms", "1 room", "2 rooms"]);
  });

  it("summarises the sample college", () => {
    expect(countsLabel(sampleCollege)).toBe("9 sections, 25 teachers, 18 rooms, 54 courses");
    expect(countsLabel({ ...sampleCollege, sections: [sampleCollege.sections[0]], rooms: [] })).toBe("1 section, 25 teachers, 0 rooms, 54 courses");
  });
});
