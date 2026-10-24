import type { Role } from "@/features/account/institutes";
import { publishedPath } from "@/published/path";
import { formatWhen } from "./online";

/** Words T27's `handle_problem` refuses as a handle: the site's own paths. */
export const RESERVED_HANDLES = ["assets", "privacy", "terms", "api", "published", "admin", "login", "static", "www"];

/** The handle as `set_institute_handle` stores it: trimmed and lower-cased. */
export function cleanHandle(handle: string): string {
  return handle.trim().toLowerCase();
}

/** Why a handle can't be saved, after `cleanHandle`, by the same rules as T27; `null` when it's fine. */
export function handleError(handle: string): string | null {
  const clean = cleanHandle(handle);
  if (!clean) return "Enter a link name.";
  if (!/^[a-z0-9-]+$/.test(clean)) return "Use only letters, digits and hyphens.";
  if (clean.length < 3 || clean.length > 30) return "Use 3–30 characters.";
  if (clean.startsWith("-") || clean.endsWith("-")) return "Start and end with a letter or digit.";
  if (RESERVED_HANDLES.includes(clean)) return "That name is reserved.";
  return null;
}

/** The public link, `https://lattice.app/gndec/k7f3q9xa2m`, from the page's own origin. */
export function publicUrl(origin: string, handle: string, publicId: string): string {
  return `${origin.replace(/\/+$/, "")}${publishedPath(handle, publicId)}`;
}

/** One row of the Versions dialog. */
export interface VersionSummary {
  version: number;
  savedBy: string | null;
  savedAt: string;
}

/** "Version 7 · Meera · 24 Oct, 10:42"; a saver whose profile is gone is left out. */
export function versionLabel(row: VersionSummary, now = new Date()): string {
  return [`Version ${row.version}`, row.savedBy, formatWhen(row.savedAt, now)].filter(Boolean).join(" · ");
}

/** The toast after opening a version: an older one says how to restore it, if the user may save. */
export function openedMessage(name: string, opened: number, latest: number, canSave: boolean): string {
  if (opened === latest) return `Opened ${name} (version ${opened}).`;
  return `Opened version ${opened} of ${name}.${canSave ? " Save online to restore it as the newest version." : ""}`;
}

export type PublishState =
  /** Disabled, with the reason as a tooltip. */
  | { kind: "noResult"; reason: string }
  /** "Save online first?" */
  | { kind: "dirty" }
  /** The admin sets the handle, then publishing continues. */
  | { kind: "needsHandle" }
  /** An editor without a handle: ask the admin. */
  | { kind: "askAdmin"; message: string }
  | { kind: "ready" };

/** "Ask your admin (Meera) to set the institute's link name." */
export function askAdminText(admin: string | null): string {
  return `Ask your admin${admin ? ` (${admin})` : ""} to set the institute's link name.`;
}

/**
 * What *Publish* does for the linked timetable. A working copy without a result can't be published; one with
 * unsaved changes is saved first, since publishing points the link at a saved version; and the link needs the
 * institute's handle, which only the admin sets. An editor without a handle hears that before being asked to save.
 */
export function publishState(opts: { hasResult: boolean; dirty: boolean; role: Role | null; handle: string | null; admin: string | null }): PublishState {
  if (!opts.hasResult) return { kind: "noResult", reason: "Generate the timetable first: publishing needs one." };
  if (!opts.handle && opts.role !== "admin") return { kind: "askAdmin", message: askAdminText(opts.admin) };
  if (opts.dirty) return { kind: "dirty" };
  return opts.handle ? { kind: "ready" } : { kind: "needsHandle" };
}
