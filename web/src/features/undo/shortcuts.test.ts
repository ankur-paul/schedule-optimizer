import { describe, expect, it } from "vitest";
import { isMac, isTextField, shortcutLabel, undoShortcut } from "./shortcuts";

const key = (key: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) => ({
  key,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...mods,
});

describe("undoShortcut", () => {
  it("reads Ctrl+Z as undo and Ctrl+Shift+Z as redo", () => {
    expect(undoShortcut(key("z", { ctrlKey: true }))).toBe("undo");
    expect(undoShortcut(key("Z", { ctrlKey: true, shiftKey: true }))).toBe("redo");
  });

  it("takes Cmd as well as Ctrl", () => {
    expect(undoShortcut(key("z", { metaKey: true }))).toBe("undo");
    expect(undoShortcut(key("z", { metaKey: true, shiftKey: true }))).toBe("redo");
  });

  it("ignores Z alone, other letters and Alt combinations", () => {
    expect(undoShortcut(key("z"))).toBeNull();
    expect(undoShortcut(key("Z", { shiftKey: true }))).toBeNull();
    expect(undoShortcut(key("y", { ctrlKey: true }))).toBeNull();
    expect(undoShortcut(key("z", { ctrlKey: true, altKey: true }))).toBeNull();
  });
});

describe("isTextField", () => {
  it("is true for inputs, text areas, selects and editable content", () => {
    expect(isTextField({ tagName: "INPUT" })).toBe(true);
    expect(isTextField({ tagName: "TEXTAREA" })).toBe(true);
    expect(isTextField({ tagName: "SELECT" })).toBe(true);
    expect(isTextField({ tagName: "DIV", isContentEditable: true })).toBe(true);
  });

  it("is false for the page, buttons and nothing focused", () => {
    expect(isTextField({ tagName: "BODY", isContentEditable: false })).toBe(false);
    expect(isTextField({ tagName: "BUTTON" })).toBe(false);
    expect(isTextField(null)).toBe(false);
  });
});

describe("shortcutLabel", () => {
  it("spells the keys for the platform", () => {
    expect(shortcutLabel("undo", false)).toBe("Ctrl+Z");
    expect(shortcutLabel("redo", false)).toBe("Ctrl+Shift+Z");
    expect(shortcutLabel("undo", true)).toBe("⌘Z");
    expect(shortcutLabel("redo", true)).toBe("⇧⌘Z");
  });

  it("knows a Mac from its platform string", () => {
    expect(isMac("MacIntel")).toBe(true);
    expect(isMac("iPhone")).toBe(true);
    expect(isMac("Win32")).toBe(false);
    expect(isMac("Linux x86_64")).toBe(false);
  });
});
