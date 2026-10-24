import { describe, expect, it } from "vitest";
import { tinyCollege } from "@/domain/tinyCollege";
import type { Diagnosis, UnplacedCause } from "@/domain/types";
import type { DataReport } from "@/features/data/dataChecks";
import { parseHelpPage } from "@/help/helpText";
import generateMd from "@/help/generate.md?raw";
import { CAUSE_HELP_ANCHORS, causeHelpHref, unplacedHelpHref } from "./causeHelp";
import { explainInfeasible } from "./causes";
import { unplacedGroups } from "./generate";

// Checked against the markdown itself, not anchors.gen.ts, so a stale generated list can't hide a missing section.
const sections = new Set(parseHelpPage("generate", generateMd).headings.map((h) => h.id));
const anchorOf = (href: string) => {
  expect(href).toMatch(/^\/help\/generate#/);
  return href.split("#")[1];
};

const report: DataReport = {
  errors: [],
  warnings: [],
  sections: [{ id: "a", name: "CSE-2A", required: 40, available: 35 }],
  teachers: [{ id: "t1", name: "Dr. Rao", required: 40, available: 35 }],
  rooms: [
    { scope: "labRoom", id: "lab1", name: "Lab 1", roomType: "lab", rooms: 1, required: 50, available: 40 },
    { scope: "department", id: "cse:lab", name: "CSE", departmentId: "cse", roomType: "lab", rooms: 1, required: 50, available: 40 },
    { scope: "college", id: "all:classroom", name: "All classrooms", roomType: "classroom", rooms: 1, required: 50, available: 40 },
  ],
  lunchReserved: true,
};

describe("cause → help section", () => {
  it("every section the maps name exists in generate.md", () => {
    for (const anchor of CAUSE_HELP_ANCHORS) expect(sections).toContain(anchor);
  });

  it("every cause step ③ can show links to an existing section", () => {
    const diagnosis: Diagnosis[] = [
      { kind: "noSlot", detail: "noRoom", ids: ["a-ds:P1:B1"] },
      { kind: "noSlot", detail: "noStart", ids: ["b-ph:P1"] },
      { kind: "noSlot", ids: ["b-ph:P1"] },
      { kind: "badLock", ids: ["b-ph:P1"] },
      { kind: "locks", ids: ["b-ph:P1"] },
      { kind: "locksLikely", ids: ["b-ph:P1"] },
    ];
    const causes = explainInfeasible(tinyCollege, diagnosis, report);
    expect(new Set(causes.map((c) => c.kind))).toEqual(new Set(["noSlot", "badLock", "locks", "locksLikely", "section", "teacher", "room"]));
    for (const c of causes) expect(sections).toContain(anchorOf(causeHelpHref(c)));
  });

  it("a noSlot cause goes to its detail's section, or the general one without a detail", () => {
    expect(causeHelpHref({ kind: "noSlot", detail: "noRoom" })).toBe("/help/generate#no-room");
    expect(causeHelpHref({ kind: "noSlot", detail: "noStart" })).toBe("/help/generate#lab-too-long");
    expect(causeHelpHref({ kind: "noSlot" })).toBe("/help/generate#no-slot");
  });

  it("both lock causes share the locks section; loads have one each", () => {
    expect(causeHelpHref({ kind: "locks" })).toBe(causeHelpHref({ kind: "locksLikely" }));
    expect(causeHelpHref({ kind: "section" })).toBe("/help/generate#section-load");
    expect(causeHelpHref({ kind: "teacher" })).toBe("/help/generate#teacher-load");
    expect(causeHelpHref({ kind: "room" })).toBe("/help/generate#room-load");
  });
});

describe("unplaced cause → help section", () => {
  // The Record in causeHelp.ts makes tsc fail when UnplacedCause grows; this list keeps the runtime check in step.
  const all: (UnplacedCause | undefined)[] = ["noRoom", "noStart", "teacher", "section", "room", "lunch", undefined];

  it("every group on the partial card links to an existing section", () => {
    const groups = unplacedGroups(all.map((cause, i) => ({ sessionId: `s${i}`, reason: "", cause })));
    expect(groups).toHaveLength(all.length);
    for (const g of groups) expect(sections).toContain(anchorOf(unplacedHelpHref(g.cause)));
  });

  it("can't-ever-place causes share the Can't be built sections", () => {
    expect(unplacedHelpHref("noRoom")).toBe(causeHelpHref({ kind: "noSlot", detail: "noRoom" }));
    expect(unplacedHelpHref("noStart")).toBe(causeHelpHref({ kind: "noSlot", detail: "noStart" }));
    expect(unplacedHelpHref("other")).toBe("/help/generate#other-reasons");
  });
});
