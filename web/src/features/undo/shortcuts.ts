/** The keys of a keydown that matter for Undo and Redo. */
export interface ShortcutKey {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

/** Ctrl+Z undoes and Ctrl+Shift+Z redoes, with Cmd in place of Ctrl on a Mac (either works everywhere). */
export function undoShortcut(e: ShortcutKey): "undo" | "redo" | null {
  if (!(e.ctrlKey || e.metaKey) || e.altKey || e.key.toLowerCase() !== "z") return null;
  return e.shiftKey ? "redo" : "undo";
}

/** Fields that keep the browser's own text undo, so the shortcuts leave them alone. */
export function isTextField(el: { tagName?: string; isContentEditable?: boolean } | null): boolean {
  if (!el) return false;
  return el.isContentEditable === true || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName ?? "");
}

/** How the tooltips spell the shortcuts. */
export function shortcutLabel(action: "undo" | "redo", mac: boolean): string {
  if (mac) return action === "undo" ? "⌘Z" : "⇧⌘Z";
  return action === "undo" ? "Ctrl+Z" : "Ctrl+Shift+Z";
}

export const isMac = (platform: string) => /mac|iphone|ipad/i.test(platform);
