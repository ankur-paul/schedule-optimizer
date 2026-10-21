import { beforeEach, describe, expect, it } from "vitest";
import { useAppStore } from "./useAppStore";

describe("printHeading", () => {
  beforeEach(() => useAppStore.getState().reset());

  it("starts empty and can be set", () => {
    expect(useAppStore.getState().printHeading).toBe("");
    useAppStore.getState().setPrintHeading("GNDEC · Semester 5");
    expect(useAppStore.getState().printHeading).toBe("GNDEC · Semester 5");
  });

  it("survives loading the sample and settings edits, but not Start over", () => {
    const s = useAppStore.getState();
    s.setPrintHeading("My College");
    s.loadSample();
    s.setSettings({ ...useAppStore.getState().settings, days: ["Mon"] });
    expect(useAppStore.getState().printHeading).toBe("My College");
    useAppStore.getState().reset();
    expect(useAppStore.getState().printHeading).toBe("");
  });
});
