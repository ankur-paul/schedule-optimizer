import { describe, expect, it } from "vitest";
import type { Teacher } from "@/domain/types";
import { askText, MAX_UNPLACED } from "./askAbout";
import { maskText, teacherCodes } from "./mask";

const teachers: Teacher[] = [{ id: "dr-anita-sharma", name: "Dr Anita Sharma", departmentId: "cse" } as Teacher];
const code = teacherCodes(teachers).get("dr-anita-sharma")!;

describe("askText", () => {
  it("asks about a Can't be built cause with its fix and help link, masked", () => {
    const text = askText({
      kind: "cause",
      cause: { kind: "teacher", text: "Dr Anita Sharma teaches 34 periods but the week has 30.", fix: "Move a course" },
    });
    expect(text).toContain('"Dr Anita Sharma teaches 34 periods but the week has 30."');
    expect(text).toContain("Its suggested fix: Move a course. Help: /help/generate#teacher-load");
    const masked = maskText(text, teachers);
    expect(masked).not.toMatch(/Anita|Sharma/);
    expect(masked).toContain(`"${code} teaches 34 periods`);
  });

  it("links a noSlot cause to its detail's section", () => {
    expect(askText({ kind: "cause", cause: { kind: "noSlot", detail: "noRoom", text: "x", fix: "y" } })).toContain("/help/generate#no-room");
  });

  it("asks about Couldn't finish", () => {
    const text = askText({ kind: "couldntFinish", title: "No timetable in 20 s", body: "The search ran out of time." });
    expect(text).toContain('"No timetable in 20 s. The search ran out of time."');
    expect(text).toContain("/help/generate#couldnt-finish");
  });

  it("lists an unplaced group's classes, masked, up to the limit", () => {
    const reasons = Array.from({ length: MAX_UNPLACED + 3 }, (_, i) => `CSE-3A DBMS #${i}: Dr Anita Sharma is busy`);
    const text = askText({ kind: "unplaced", cause: "teacher", label: "Teacher busy", reasons });
    expect(text).toContain('The reason given: "Teacher busy" (13):');
    expect(text).toContain("- CSE-3A DBMS #9: Dr Anita Sharma is busy");
    expect(text).not.toContain("#10:");
    expect(text).toContain("- and 3 more");
    expect(text).toContain("/help/generate#teacher-busy");
    expect(maskText(text, teachers)).not.toMatch(/Anita/);
  });

  it("counts repeated reasons instead of listing them again", () => {
    const text = askText({ kind: "unplaced", cause: "teacher", label: "Teacher busy", reasons: ["same", "same", "same", "other"] });
    expect(text).toContain("(4):\n- same (3 classes)\n- other\n");
    expect(text).not.toContain("more");
  });

  it("has no 'more' line when every class fits", () => {
    expect(askText({ kind: "unplaced", cause: "other", label: "Other", reasons: ["a"] })).not.toContain("more");
  });

  it("asks about a data check, error or warning", () => {
    const error = askText({ kind: "dataCheck", tone: "error", text: "Course DBMS has no teacher." });
    expect(error).toContain("must be fixed before generating");
    expect(error).toContain('"Course DBMS has no teacher."');
    expect(error).toContain("/help/data#data-checks");
    expect(askText({ kind: "dataCheck", tone: "warning", text: "Dr Anita Sharma is over." })).toContain("A data check warns:");
    expect(maskText(askText({ kind: "dataCheck", tone: "warning", text: "Dr Anita Sharma is over." }), teachers)).toContain(code);
  });
});
