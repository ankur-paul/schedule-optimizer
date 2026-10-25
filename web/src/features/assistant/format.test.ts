import { describe, expect, it } from "vitest";
import { allowanceLine, answerBlocks, askAdminLine, inlineParts, safeHref, toolLabel, trialMailto, trialRequestText } from "./format";
import { teacherCodes } from "./mask";

const now = new Date("2026-10-25T12:00:00Z");

describe("allowanceLine", () => {
  it("shows the questions left and the expiry date", () => {
    expect(allowanceLine({ questionsLeft: 143, expiresAt: "2026-11-23T12:00:00Z" }, now)).toEqual({
      text: "143 questions left · until 23 Nov",
      low: false,
    });
  });

  it("says 1 question", () => {
    expect(allowanceLine({ questionsLeft: 1, expiresAt: "2026-11-23T12:00:00Z" }, now).text).toMatch(/^1 question left/);
  });

  it("turns amber under 20 questions", () => {
    expect(allowanceLine({ questionsLeft: 20, expiresAt: "2026-11-23T12:00:00Z" }, now).low).toBe(false);
    expect(allowanceLine({ questionsLeft: 19, expiresAt: "2026-11-23T12:00:00Z" }, now).low).toBe(true);
  });

  it("turns amber under 3 days left", () => {
    expect(allowanceLine({ questionsLeft: 100, expiresAt: "2026-10-28T12:00:00Z" }, now).low).toBe(false);
    expect(allowanceLine({ questionsLeft: 100, expiresAt: "2026-10-28T11:59:00Z" }, now).low).toBe(true);
  });
});

describe("trialMailto", () => {
  it("encodes the address, subject and body", () => {
    const href = trialMailto("ops+lattice@example.org", { name: "GNDEC & Co", handle: "gndec" });
    expect(href).toBe(
      "mailto:ops%2Blattice%40example.org?subject=Lattice%20assistant%20trial&body=" +
        "Institute%3A%20GNDEC%20%26%20Co%0AHandle%3A%20gndec%0A%0AWhat%20will%20you%20use%20it%20for%3F%0A",
    );
  });

  it("round-trips through a URL parser", () => {
    const url = new URL(trialMailto("a@b.org", { name: "Tom's \"Institute\" #1?", handle: null }));
    expect(url.searchParams.get("subject")).toBe("Lattice assistant trial");
    expect(url.searchParams.get("body")).toBe('Institute: Tom\'s "Institute" #1?\nHandle: (not set)\n\nWhat will you use it for?\n');
  });
});

describe("trialRequestText", () => {
  it("has the address, subject and the mailto's body, unencoded", () => {
    expect(trialRequestText("ops+lattice@example.org", { name: "GNDEC & Co", handle: "gndec" })).toBe(
      "To: ops+lattice@example.org\nSubject: Lattice assistant trial\n\nInstitute: GNDEC & Co\nHandle: gndec\n\nWhat will you use it for?\n",
    );
  });

  it("says when the link name isn't set", () => {
    expect(trialRequestText("a@b.org", { name: "Tom's \"Institute\" #1?", handle: null })).toContain('Institute: Tom\'s "Institute" #1?\nHandle: (not set)\n');
  });

  it("matches the body the mailto sends", () => {
    const institute = { name: "Punjab Engg", handle: "pec" };
    const body = new URL(trialMailto("a@b.org", institute)).searchParams.get("body")!;
    expect(trialRequestText("a@b.org", institute).split("\n\n").slice(1).join("\n\n")).toBe(body);
  });
});

describe("toolLabel", () => {
  const teachers = [{ id: "t1", name: "Ravi Kumar" }];
  const names = { sections: [{ id: "s1", name: "CSE-3A" }], rooms: [{ id: "r1", name: "Lab 2" }], teachers };
  const code = teacherCodes(teachers).get("t1")!;

  it("names the section, room or teacher looked at", () => {
    expect(toolLabel("schedule", { kind: "section", id: "s1" }, names)).toBe("Looked at CSE-3A's week");
    expect(toolLabel("schedule", { kind: "room", id: "r1" }, names)).toBe("Looked at Lab 2's week");
    expect(toolLabel("schedule", { kind: "teacher", id: code }, names)).toBe("Looked at Ravi Kumar's week");
  });

  it("accepts a section by name and falls back to the id", () => {
    expect(toolLabel("schedule", { kind: "section", id: "cse-3a" }, names)).toBe("Looked at CSE-3A's week");
    expect(toolLabel("schedule", { kind: "section", id: "zzz" }, names)).toBe("Looked at zzz's week");
  });

  it("labels free periods with the day", () => {
    expect(toolLabel("free_periods", { kind: "teacher", id: code, day: "Mon" }, names)).toBe("Checked when Ravi Kumar is free on Mon");
    expect(toolLabel("free_periods", { kind: "room", id: "r1" }, names)).toBe("Checked when Lab 2 is free");
  });

  it("labels the other tools", () => {
    expect(toolLabel("overview", {}, names)).toBe("Looked at the overview");
    expect(toolLabel("problems", {}, names)).toBe("Looked at the problems");
    expect(toolLabel("score_details", {}, names)).toBe("Looked at the score");
    expect(toolLabel("score_details", { rule: "S3" }, names)).toBe("Looked at the S3 penalties");
    expect(toolLabel("find", { text: "CSE" }, names)).toBe('Searched for "CSE"');
    expect(toolLabel("find", { text: code }, names)).toBe('Searched for "Ravi Kumar"');
    expect(toolLabel("nope", null, names)).toBe("Used nope");
  });
});

describe("safeHref", () => {
  it("allows the app's pages and https", () => {
    expect(safeHref("/help")).toBe("/help");
    expect(safeHref("/help/data#lab-batches")).toBe("/help/data#lab-batches");
    expect(safeHref("/privacy")).toBe("/privacy");
    expect(safeHref("https://example.org/x")).toBe("https://example.org/x");
  });

  it("refuses anything else", () => {
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("http://example.org")).toBeNull();
    expect(safeHref("/helpful")).toBeNull();
    expect(safeHref("//evil.example/help")).toBeNull();
    expect(safeHref("data:text/html,x")).toBeNull();
  });
});

describe("inlineParts", () => {
  it("finds links, bold, code and bare help paths", () => {
    expect(inlineParts("See [Lab batches](/help/data#lab-batches), **lock** it with `L`, or /help/generate#no-room.")).toEqual([
      { kind: "text", text: "See " },
      { kind: "link", text: "Lab batches", href: "/help/data#lab-batches" },
      { kind: "text", text: ", " },
      { kind: "bold", text: "lock" },
      { kind: "text", text: " it with " },
      { kind: "code", text: "L" },
      { kind: "text", text: ", or " },
      { kind: "link", text: "/help/generate#no-room", href: "/help/generate#no-room" },
      { kind: "text", text: "." },
    ]);
  });

  it("keeps an unsafe link as its text", () => {
    expect(inlineParts("[click](javascript:alert(1))")).toEqual([{ kind: "text", text: "click)" }]);
    expect(inlineParts("[site](http://x.org) ok")).toEqual([{ kind: "text", text: "site ok" }]);
  });

  it("doesn't link a path inside a longer URL", () => {
    expect(inlineParts("https://x.org/help/data")).toEqual([{ kind: "text", text: "https://x.org/help/data" }]);
  });

  it("returns plain text as one part", () => {
    expect(inlineParts("Just text.")).toEqual([{ kind: "text", text: "Just text." }]);
    expect(inlineParts("")).toEqual([]);
  });
});

describe("answerBlocks", () => {
  const item = (text: string) => ({ parts: [{ kind: "text" as const, text }], sub: [] });

  it("splits paragraphs, lists and headings", () => {
    expect(answerBlocks("## Why\nThe lab needs\ntwo periods.\n\n- one\n- **two**\n\n1. first\n2) second")).toEqual([
      { kind: "p", parts: [{ kind: "bold", text: "Why" }] },
      { kind: "p", parts: [{ kind: "text", text: "The lab needs\ntwo periods." }] },
      { kind: "ul", items: [item("one"), { parts: [{ kind: "bold", text: "two" }], sub: [] }] },
      { kind: "ol", items: [item("first"), item("second")] },
    ]);
  });

  it("nests indented bullets under the item before", () => {
    expect(answerBlocks("- **S1: 70 points.** Seven sections:\n  - CSE A\n    - CSE B\n- S3: 6 points")).toEqual([
      {
        kind: "ul",
        items: [
          { parts: [{ kind: "bold", text: "S1: 70 points." }, { kind: "text", text: " Seven sections:" }], sub: [[{ kind: "text", text: "CSE A" }], [{ kind: "text", text: "CSE B" }]] },
          item("S3: 6 points"),
        ],
      },
    ]);
  });

  it("nests indented bullets under a numbered item, and keeps an indented first bullet at the top", () => {
    expect(answerBlocks("1. Open step ②\n   - Courses tab")).toEqual([{ kind: "ol", items: [{ ...item("Open step ②"), sub: [[{ kind: "text", text: "Courses tab" }]] }] }]);
    expect(answerBlocks("  - alone")).toEqual([{ kind: "ul", items: [item("alone")] }]);
  });

  it("starts a new list when the kind changes", () => {
    expect(answerBlocks("- a\n1. b").map((b) => b.kind)).toEqual(["ul", "ol"]);
  });

  it("returns nothing for empty text", () => {
    expect(answerBlocks("\n\n")).toEqual([]);
  });
});

describe("askAdminLine", () => {
  it("names the admin with their email", () => {
    expect(askAdminLine({ name: "Asha Admin", email: "asha@example.org" })).toBe("Your institute's admin, Asha Admin (asha@example.org), can unlock it.");
  });

  it("uses whichever of name and email there is", () => {
    expect(askAdminLine({ name: null, email: "asha@example.org" })).toBe("Your institute's admin, asha@example.org, can unlock it.");
    expect(askAdminLine({ name: " Asha ", email: null })).toBe("Your institute's admin, Asha, can unlock it.");
  });

  it("falls back when the admin isn't known", () => {
    expect(askAdminLine(null)).toBe("Your institute's admin can unlock it.");
    expect(askAdminLine({ name: "", email: null })).toBe("Your institute's admin can unlock it.");
  });
});
