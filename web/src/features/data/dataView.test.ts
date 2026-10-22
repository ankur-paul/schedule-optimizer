import { beforeEach, describe, expect, it } from "vitest";
import { useDataView } from "./dataView";

describe("useDataView", () => {
  beforeEach(() => useDataView.getState().open({ tab: "courses" }));

  it("starts on Courses with no filter", () => {
    expect(useDataView.getState()).toMatchObject({ tab: "courses", filter: { sectionId: "", teacherId: "" } });
  });

  it("setFilter changes one filter and keeps the other", () => {
    useDataView.getState().setFilter({ sectionId: "s1" });
    useDataView.getState().setFilter({ teacherId: "t1" });
    expect(useDataView.getState().filter).toEqual({ sectionId: "s1", teacherId: "t1" });
  });

  it("open jumps to a tab and replaces the filters with the link's", () => {
    useDataView.getState().setFilter({ sectionId: "s1" });
    useDataView.getState().open({ tab: "courses", teacherId: "t2" });
    expect(useDataView.getState()).toMatchObject({ tab: "courses", filter: { sectionId: "", teacherId: "t2" } });
    useDataView.getState().open({ tab: "rooms" });
    expect(useDataView.getState()).toMatchObject({ tab: "rooms", filter: { sectionId: "", teacherId: "" } });
  });
});
