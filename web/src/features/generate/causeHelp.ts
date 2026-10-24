import type { UnplacedCause } from "@/domain/types";
import { helpHref, type HelpAnchor } from "@/help/helpLinks";
import type { Cause, CauseKind, NoSlotDetail } from "./causes";

// Every cause step ③ can show links to the /help/generate section that explains it. The maps are Records, so a new
// cause kind or unplaced cause fails `tsc` until it gets a section; causeHelp.test.ts checks the sections exist.

const CAUSE_ANCHORS: Record<CauseKind | NoSlotDetail, HelpAnchor<"generate">> = {
  noRoom: "no-room",
  noStart: "lab-too-long",
  noSlot: "no-slot",
  badLock: "bad-lock",
  locks: "locks",
  locksLikely: "locks",
  section: "section-load",
  teacher: "teacher-load",
  room: "room-load",
};

const UNPLACED_ANCHORS: Record<UnplacedCause | "other", HelpAnchor<"generate">> = {
  noRoom: "no-room",
  noStart: "lab-too-long",
  teacher: "teacher-busy",
  section: "section-busy",
  room: "no-free-room",
  lunch: "last-lunch",
  other: "other-reasons",
};

/** The help section for a *Can't be built* cause: `noSlot` goes to its detail's section when the server gave one. */
export function causeHelpHref(cause: Pick<Cause, "kind" | "detail">): string {
  const key = cause.kind === "noSlot" && cause.detail ? cause.detail : cause.kind;
  return helpHref("generate", CAUSE_ANCHORS[key]);
}

/** The help section for a group of unplaced classes on a partial timetable. */
export function unplacedHelpHref(cause: UnplacedCause | "other"): string {
  return helpHref("generate", UNPLACED_ANCHORS[cause]);
}

/** Every anchor the maps use, for the test. */
export const CAUSE_HELP_ANCHORS: string[] = [...Object.values(CAUSE_ANCHORS), ...Object.values(UNPLACED_ANCHORS)];
