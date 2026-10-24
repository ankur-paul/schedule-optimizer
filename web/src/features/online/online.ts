import type { OnlineLink, WorkingCopy } from "@/store/useAppStore";
import type { Membership, Role } from "@/features/account/institutes";

/**
 * One online version (T28): the working copy as a JSON document, stored as `timetable_versions.data`. The keys are
 * the store's own, so the public page (T30) reads `data.settings`, `data.result` and so on.
 */
export type OnlineDoc = WorkingCopy;

/** The working copy as a version document. `step` and `timeLimitSec` stay on the device. */
export function toDoc(state: WorkingCopy): OnlineDoc {
  return {
    settings: state.settings,
    departments: state.departments,
    teachers: state.teachers,
    rooms: state.rooms,
    sections: state.sections,
    courses: state.courses,
    locks: state.locks,
    result: state.result,
    printHeading: state.printHeading,
  };
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const arrayOr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/**
 * A downloaded version as store fields. Throws when it isn't a timetable at all (no settings); missing tables,
 * locks, result or heading become empty, so a document from an older app still opens.
 */
export function fromDoc(doc: unknown): WorkingCopy {
  const settings = isObject(doc) ? doc.settings : undefined;
  if (!isObject(doc) || !isObject(settings) || !Array.isArray(settings.days) || !Array.isArray(settings.periods)) {
    throw new Error("This online timetable's data couldn't be read.");
  }
  return {
    settings: { days: settings.days, periods: settings.periods, lunchCandidates: arrayOr(settings.lunchCandidates) } as WorkingCopy["settings"],
    departments: arrayOr(doc.departments) as WorkingCopy["departments"],
    teachers: arrayOr(doc.teachers) as WorkingCopy["teachers"],
    rooms: arrayOr(doc.rooms) as WorkingCopy["rooms"],
    sections: arrayOr(doc.sections) as WorkingCopy["sections"],
    courses: arrayOr(doc.courses) as WorkingCopy["courses"],
    locks: arrayOr(doc.locks) as WorkingCopy["locks"],
    result: (isObject(doc.result) ? doc.result : null) as WorkingCopy["result"],
    printHeading: typeof doc.printHeading === "string" ? doc.printHeading : "",
  };
}

/**
 * JSON with object keys sorted, so the same data always gives the same text. Postgres `jsonb` reorders keys, and
 * a document must hash the same after a round trip. `undefined` object fields are left out, as `JSON.stringify` does.
 */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((v) => (v === undefined ? "null" : stableStringify(v))).join(",")}]`;
  if (isObject(value)) {
    const keys = Object.keys(value)
      .filter((k) => value[k] !== undefined)
      .sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** cyrb53: a fast 53-bit string hash, as 14 hex digits. Not cryptographic; it only spots changes. */
export function hashText(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0");
}

/** The working copy's fingerprint: equal for equal data, whatever the key order, step or time limit. */
export function docHash(state: WorkingCopy): string {
  return hashText(stableStringify(toDoc(state)));
}

/** Linked, and changed since the last save or open. */
export function isDirty(link: OnlineLink | null, hash: string): boolean {
  return link !== null && link.savedHash !== hash;
}

/**
 * Whether opening another timetable would lose work: linked with unsaved changes, or not linked and different from
 * a fresh start (`emptyHash`, the hash after *Start over*).
 */
export function hasUnsavedWork(link: OnlineLink | null, hash: string, emptyHash: string): boolean {
  return link ? link.savedHash !== hash : hash !== emptyHash;
}

/** The longest name `timetables.name` accepts. */
export const MAX_TIMETABLE_NAME = 120;

/** A new timetable's name: a copy of the linked one, else the print heading, else "Timetable". */
export function defaultName(printHeading: string, linkedName: string | null = null): string {
  const name = linkedName ? `${linkedName} (copy)` : printHeading.trim() || "Timetable";
  return name.slice(0, MAX_TIMETABLE_NAME).trim();
}

/** The user's role in `instituteId`, or `null` when not a member (or the memberships aren't loaded). */
export function roleIn(memberships: Membership[], instituteId: string): Role | null {
  return memberships.find((m) => m.instituteId === instituteId)?.role ?? null;
}

export function canEdit(role: Role | null): boolean {
  return role === "admin" || role === "editor";
}

/** Institutes the user may save into (admin or editor), in the memberships' order. */
export function editableInstitutes(memberships: Membership[]): Membership[] {
  return memberships.filter((m) => canEdit(m.role));
}

/** The save dialog's starting institute: the active one when the user may save there, else the first they may. */
export function defaultInstitute(editable: Membership[], activeId: string | null): string | null {
  return (editable.find((m) => m.instituteId === activeId) ?? editable[0])?.instituteId ?? null;
}

/** The status line's note for a linked copy: "view only" for a viewer of its institute, else "unsaved changes" when dirty. */
export function statusNote(opts: { dirty: boolean; role: Role | null }): string | null {
  if (opts.role === "viewer") return "view only";
  return opts.dirty ? "unsaved changes" : null;
}

/**
 * The header line: "On this device only", or "CSE odd sem 2026 · GNDEC", plus the `statusNote`. Signed out (role
 * unknown), it uses the institute name kept in the link.
 */
export function statusText(link: OnlineLink | null, opts: { dirty: boolean; role: Role | null; instituteName: string | null }): string {
  if (!link) return "On this device only";
  const note = statusNote(opts);
  const base = `${link.name} · ${opts.instituteName ?? link.instituteName}`;
  return note ? `${base} · ${note}` : base;
}

export type OnlineAction = "save" | "signInToSave" | "saveAs" | "open" | "rename" | "delete" | "unlink";

/**
 * The status menu's items. Signed out, *Save online* only says to sign in. A viewer of the linked timetable gets no
 * write actions on it. Without a link, *Save online* is the first save, so there is no separate *Save as new*.
 * `account` is `loading` while signed in but before the institutes (and the consent gate) are through. Hiding items
 * is cosmetic: T27's functions are the rule.
 */
export function onlineMenu(opts: {
  link: OnlineLink | null;
  account: "signedOut" | "loading" | "ready";
  /** The role in the linked timetable's institute; `null` without a link or without access. */
  role: Role | null;
  /** The user is admin or editor somewhere. */
  canCreate: boolean;
  /** There is an active institute to open from. */
  hasActive: boolean;
}): OnlineAction[] {
  const { link, account, role, canCreate, hasActive } = opts;
  const items: OnlineAction[] = [];
  if (account === "signedOut") items.push("signInToSave");
  else if (account === "ready") {
    if (link) {
      if (role !== "viewer") items.push("save");
      if (canCreate) items.push("saveAs");
    } else if (canCreate) items.push("save");
    if (hasActive) items.push("open");
    if (link && canEdit(role)) items.push("rename");
    if (link && role === "admin") items.push("delete");
  }
  if (link) items.push("unlink");
  return items;
}

/** Who saved the newer version and when, from `save_timetable`'s `LT409` detail. */
export interface Conflict {
  latestVersion: number;
  savedByName: string | null;
  savedAt: string | null;
}

/** The `LT409` detail (JSON text); `null` when it is missing or has no usable version. */
export function parseConflict(details: unknown): Conflict | null {
  if (typeof details !== "string") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(details);
  } catch {
    return null;
  }
  if (!isObject(parsed) || !Number.isInteger(parsed.latest_version) || (parsed.latest_version as number) < 1) return null;
  const name = typeof parsed.saved_by_name === "string" && parsed.saved_by_name.trim() ? parsed.saved_by_name.trim() : null;
  const at = typeof parsed.saved_at === "string" && !Number.isNaN(Date.parse(parsed.saved_at)) ? parsed.saved_at : null;
  return { latestVersion: parsed.latest_version as number, savedByName: name, savedAt: at };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A save time in local time: "10:42" today, "23 Oct, 10:42" this year, "23 Oct 2025" before. */
export function formatWhen(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const day = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  if (d.getFullYear() !== now.getFullYear()) return `${day} ${d.getFullYear()}`;
  if (d.getMonth() === now.getMonth() && d.getDate() === now.getDate()) return time;
  return `${day}, ${time}`;
}

/** `formatWhen` for a sentence: "at 10:42", "on 23 Oct, 10:42" or "on 23 Oct 2025". */
export function whenPhrase(iso: string, now = new Date()): string {
  const when = formatWhen(iso, now);
  return `${when.includes(" ") ? "on" : "at"} ${when}`;
}

/** The conflict dialog's line: "Changed online by Meera at 10:42 since you opened it." */
export function conflictText(conflict: Conflict | null, now = new Date()): string {
  if (!conflict) return "Someone saved this timetable online since you opened it.";
  const who = conflict.savedByName ?? "someone";
  if (!conflict.savedAt) return `Changed online by ${who} since you opened it.`;
  return `Changed online by ${who} ${whenPhrase(conflict.savedAt, now)} since you opened it.`;
}
