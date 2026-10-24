// The pure parts of the help screenshots script (scripts/help-shots.ts), apart so Vitest can test them without Playwright.
import { sampleCollege } from "../src/domain/sampleCollege";
import type { SolveResult } from "../src/domain/types";
import { toDoc } from "../src/features/online/online";
import { initialData, PERSIST_VERSION, type AppData } from "../src/store/useAppStore";
import { START_STATES, type Shot, type Target } from "./help-shots.config";
import { onlineLink } from "./help-shots.supabase";

/** The script warns about PNGs bigger than this. */
export const MAX_PNG_BYTES = 200 * 1024;
export const DEFAULT_PADDING = 8;

const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** What's wrong with the shot list, one line per problem; empty when it is fine. */
export function shotProblems(shots: Shot[], timetable: SolveResult): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  const placed = new Set(timetable.placements.map((p) => p.sessionId));
  for (const shot of shots) {
    const at = `Shot "${shot.name}"`;
    if (!NAME.test(shot.name)) problems.push(`${at}: the name must be lower-case words joined by dashes.`);
    if (seen.has(shot.name)) problems.push(`${at}: the name is used twice.`);
    seen.add(shot.name);
    if (!START_STATES.includes(shot.start)) problems.push(`${at}: unknown starting state "${shot.start}".`);
    if (shot.locks?.length && shot.start !== "timetable") problems.push(`${at}: locks need the "timetable" start.`);
    for (const id of shot.locks ?? []) if (!placed.has(id)) problems.push(`${at}: lock "${id}" is not in the fixed timetable.`);
    if (captureTargets(shot).length === 0) problems.push(`${at}: nothing to capture.`);
  }
  return problems;
}

export function captureTargets(shot: Shot): Target[] {
  return Array.isArray(shot.capture) ? shot.capture : [shot.capture];
}

/** The app's working copy for a shot: the sample college, plus the fixed timetable and its locks when asked. */
export function shotData(shot: Shot, timetable: SolveResult): AppData {
  const { settings, departments, teachers, rooms, sections, courses } = structuredClone(sampleCollege);
  const result = shot.start === "timetable" ? structuredClone(timetable) : null;
  const locks = (shot.locks ?? []).map((id) => {
    const placement = timetable.placements.find((p) => p.sessionId === id);
    if (!placement) throw new Error(`Lock "${id}" is not in the fixed timetable`);
    return placement;
  });
  return {
    ...initialData(),
    settings,
    departments,
    teachers,
    rooms,
    sections,
    courses,
    result,
    locks,
    step: shot.step,
    printHeading: shot.printHeading ?? "",
  };
}

/** The `localStorage` value the app's store reads on start (zustand `persist`, key `timetable-v1`). */
export function persistedState(shot: Shot, timetable: SolveResult): string {
  const data = shotData(shot, timetable);
  const online = shot.signedIn?.online ? onlineLink(toDoc(data), shot.signedIn.online) : null;
  return JSON.stringify({ state: { ...data, online }, version: PERSIST_VERSION });
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One box around all of `boxes` plus `padding`, kept inside the page and on whole pixels, cut to `maxHeight`. */
export function unionClip(boxes: Box[], padding: number, page: { width: number; height: number }, maxHeight = Infinity): Box {
  if (boxes.length === 0) throw new Error("Nothing to capture");
  const left = Math.max(0, Math.floor(Math.min(...boxes.map((b) => b.x)) - padding));
  const top = Math.max(0, Math.floor(Math.min(...boxes.map((b) => b.y)) - padding));
  const right = Math.min(page.width, Math.ceil(Math.max(...boxes.map((b) => b.x + b.width)) + padding));
  const bottom = Math.min(page.height, Math.ceil(Math.max(...boxes.map((b) => b.y + b.height)) + padding));
  return { x: left, y: top, width: right - left, height: Math.min(bottom - top, maxHeight) };
}
