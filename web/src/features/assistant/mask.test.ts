import { describe, expect, it } from "vitest";
import type { Teacher } from "@/domain/types";
import { teacherCodes } from "@/domain/teacherCodes";
import { maskText, unmaskText } from "./mask";

const teacher = (id: string, name: string): Teacher => ({ id, name, departmentId: "cse" });
const teachers = [teacher("t1", "Ravi"), teacher("t2", "Ravi Kumar"), teacher("dr-anita-sharma", "Dr. Anita Sharma"), teacher("t10", "Meera Iyer")];
const codes = teacherCodes(teachers);
const c = (id: string) => codes.get(id)!;

describe("maskText", () => {
  it("replaces whole names, ignoring case", () => {
    expect(maskText("Is meera iyer free?", teachers)).toBe(`Is ${c("t10")} free?`);
    expect(maskText("MEERA IYER", teachers)).toBe(c("t10"));
  });

  it("tries longer names first, so a name containing another wins", () => {
    expect(maskText("Ravi Kumar and Ravi", teachers)).toBe(`${c("t2")} and ${c("t1")}`);
  });

  it("matches whole words only", () => {
    expect(maskText("Ravindra and Raviraj", teachers)).toBe("Ravindra and Raviraj");
  });

  it("matches names next to punctuation and across extra spaces", () => {
    expect(maskText("(Dr. Anita Sharma), Ravi's lab; Ravi.", teachers)).toBe(`(${c("dr-anita-sharma")}), ${c("t1")}'s lab; ${c("t1")}.`);
    expect(maskText("Ravi   Kumar\nteaches", teachers)).toBe(`${c("t2")}\nteaches`);
  });

  it("replaces ids too, which may be slugs of names", () => {
    expect(maskText("dr-anita-sharma and T10", teachers)).toBe(`${c("dr-anita-sharma")} and ${c("t10")}`);
    expect(maskText("t1 but not t10x or at1", teachers)).toBe(`${c("t1")} but not t10x or at1`);
  });

  it("leaves text without teachers alone, and works with no teachers", () => {
    expect(maskText("Why can't CSE A be built?", teachers)).toBe("Why can't CSE A be built?");
    expect(maskText("Ravi", [])).toBe("Ravi");
    expect(maskText("Ravi", [teacher("x", "  ")])).toBe("Ravi");
  });

  it("masks a name with regex characters in it", () => {
    const odd = [teacher("o", "A. (Bob) Rao+")];
    expect(maskText("ask A. (Bob) Rao+ now", odd)).toBe(`ask ${teacherCodes(odd).get("o")} now`);
  });
});

describe("unmaskText", () => {
  it("turns codes back into names", () => {
    expect(unmaskText(`${c("t2")} teaches 4 in a row; ask ${c("dr-anita-sharma")}.`, teachers)).toBe("Ravi Kumar teaches 4 in a row; ask Dr. Anita Sharma.");
  });

  it("matches whole tokens only, in exact case", () => {
    const code = c("t1");
    expect(unmaskText(`${code}X ${code.toLowerCase()} x${code}`, teachers)).toBe(`${code}X ${code.toLowerCase()} x${code}`);
  });

  it("does not touch ids, so t1 never changes t10", () => {
    expect(unmaskText("t1 and t10", teachers)).toBe("t1 and t10");
  });

  it("round-trips: text without teachers is unchanged, names come back", () => {
    const plain = "CSE A has 3 free periods on Tue: P1, P4 and P8. See /help/generate#no-room.";
    expect(unmaskText(maskText(plain, teachers), teachers)).toBe(plain);
    expect(unmaskText(maskText("Is Ravi Kumar free?", teachers), teachers)).toBe("Is Ravi Kumar free?");
  });
});
