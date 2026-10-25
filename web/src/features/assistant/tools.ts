import definitions from "../../../../shared/agent-tools.json";
import { buildGrid, sessionLabel, type Cell, type PlacedSession } from "@/domain/grid";
import { penalties, score } from "@/domain/score";
import { expandSessions } from "@/domain/sessions";
import { SCORE_ROWS } from "@/domain/stats";
import type { Id, Placement, Session, SolveInput } from "@/domain/types";
import { validate } from "@/domain/validator";
import { checkData } from "@/features/data/dataChecks";
import { causeHelpHref, unplacedHelpHref } from "@/features/generate/causeHelp";
import { explainInfeasible, GENERAL_SUGGESTIONS, topCauses } from "@/features/generate/causes";
import { unplacedGroups, type RunOutcome } from "@/features/generate/generate";
import { helpHref } from "@/help/helpLinks";
import type { AppData } from "@/store/useAppStore";
import { maskTeachers, maskText, teacherCodes } from "./mask";

// The assistant's read-only tools (T37). The panel (T40) runs them when Claude asks, over the working copy, and sends
// the result back. They never throw: a bad call gets `{ error }` the model can act on. Teachers appear only as codes
// (mask.ts): each tool works on a copy of the data whose teacher ids and names are already codes.

/** What the tools read: the working copy, plus the last run's outcome for *Can't be built* (not persisted). */
export type ToolData = Pick<AppData, "settings" | "departments" | "teachers" | "rooms" | "sections" | "courses" | "result" | "locks"> & {
  outcome?: RunOutcome;
};

export type ToolName = "overview" | "schedule" | "free_periods" | "problems" | "score_details" | "find";
export type EntityKind = "section" | "teacher" | "room";

interface PropertySchema { type: "string"; enum?: string[]; description?: string }
/** A tool as the Anthropic API takes it; `shared/agent-tools.json` is the only list. */
export interface ToolDefinition {
  name: string;
  description: string;
  strict: boolean;
  input_schema: { type: "object"; properties: Record<string, PropertySchema>; required: string[]; additionalProperties: boolean };
}
// The JSON import types optional properties as `undefined`; the test checks the file has this shape.
export const TOOL_DEFINITIONS = definitions as unknown as ToolDefinition[];

/** Results longer than this many characters are cut (with a note). */
export const RESULT_LIMIT = 8000;
/** `find` returns at most this many matches. */
export const FIND_LIMIT = 20;

type Result = Record<string, unknown>;
type ErrorResult = { error: string };

/** The masked data every tool reads. `clean` drops courses of missing sections, which would make the grid throw. */
interface Context {
  data: ToolData;
  clean: SolveInput;
  sessions: Session[];
  /** The real teachers, for masking free text (reasons from the solver). */
  teachers: AppData["teachers"];
}

function context(data: ToolData): Context {
  const codes = teacherCodes(data.teachers);
  const masked = maskTeachers(data, codes);
  const sectionIds = new Set(masked.sections.map((s) => s.id));
  const courses = masked.courses.filter((c) => sectionIds.has(c.sectionId));
  const clean: SolveInput = { ...masked, courses, options: { timeLimitSec: 0 } };
  const failed = data.outcome?.failed;
  const outcome = failed ? { ...data.outcome!, failed: { ...failed, input: maskTeachers(failed.input, codes) } } : data.outcome;
  return { data: { ...masked, outcome }, clean, sessions: expandSessions(clean), teachers: data.teachers };
}

// --- overview ---------------------------------------------------------------------------------------------------

type Status = "not generated" | "built" | "partial" | "can't be built" | "couldn't finish";

/** As step ③ shows it: a failure on screen wins over the stored timetable, which is kept. */
function status(data: ToolData): { status: Status; unplaced?: number; timetableKept?: boolean } {
  const failed = data.outcome?.showFailure ? data.outcome.failed : undefined;
  if (failed) {
    return { status: failed.failure.kind === "infeasible" ? "can't be built" : "couldn't finish", timetableKept: data.result !== null };
  }
  if (!data.result) return { status: "not generated" };
  const unplaced = data.result.unplaced.length;
  return unplaced > 0 ? { status: "partial", unplaced } : { status: "built" };
}

export function overview(data: ToolData): Result {
  const { clean, sessions, data: masked } = context(data);
  const { settings } = clean;
  const result = masked.result;
  const s = result ? score(clean, result.placements) : null;
  return {
    counts: {
      sections: clean.sections.length,
      teachers: clean.teachers.length,
      rooms: clean.rooms.length,
      courses: masked.courses.length,
      classes: sessions.length,
    },
    week: {
      days: settings.days,
      teachingPeriods: settings.periods.filter((p) => p.kind === "teaching").length,
      lunchCandidates: settings.lunchCandidates.map((p) => settings.periods[p]?.label ?? `#${p}`),
    },
    ...status(masked),
    ...(s && {
      score: { total: s.total, ...Object.fromEntries(SCORE_ROWS.map((r) => [r.rule, s.breakdown[r.key]])) },
      placed: result!.placements.length,
    }),
    locks: masked.locks.length,
    help: helpHref("timetable", "score"),
  };
}

// --- schedule and free_periods ------------------------------------------------------------------------------------

/** The section, teacher or room by id (or, for sections and rooms, by name ignoring case). */
function entity(ctx: Context, kind: EntityKind, id: string): { id: Id; name: string } | ErrorResult {
  const list = kind === "section" ? ctx.clean.sections : kind === "room" ? ctx.clean.rooms : ctx.clean.teachers;
  const found = list.find((e) => e.id === id) ?? (kind === "teacher" ? undefined : list.find((e) => e.name.toLowerCase() === id.trim().toLowerCase()));
  return found ?? { error: `No ${kind} with id ${id}. Use find to look it up.` };
}

const NO_TIMETABLE: ErrorResult = { error: "There is no timetable yet. The user can make one in step 3 (Generate)." };

function timeline(ctx: Context, kind: EntityKind, id: Id, placements: Placement[]) {
  const grid = buildGrid(ctx.clean, placements, ctx.sessions);
  const map = kind === "section" ? grid.bySection : kind === "teacher" ? grid.byTeacher : grid.byRoom;
  return map.get(id)!;
}

const time = (p: { start: string; end: string }) => `${p.start}–${p.end}`;

export function schedule(data: ToolData, input: { kind: EntityKind; id: string }): Result {
  const ctx = context(data);
  const found = entity(ctx, input.kind, input.id);
  if ("error" in found) return found;
  const result = ctx.data.result;
  if (!result) return NO_TIMETABLE;
  const { settings } = ctx.clean;
  const lunch = new Set(settings.lunchCandidates);
  const locked = new Set(ctx.clean.locks.map((l) => l.sessionId));
  const view = (e: PlacedSession) => cellEntry(ctx, input.kind, e, locked);
  const cell = (c: Cell) => (c.length === 0 ? null : c.length === 1 ? view(c[0]) : c.map(view));
  const week = timeline(ctx, input.kind, found.id, result.placements);
  return {
    kind: input.kind,
    id: found.id,
    name: found.name,
    periods: settings.periods.map((p) => ({ p: p.label, time: time(p), ...(p.kind === "break" && { break: true }), ...(lunch.has(p.id) && { lunch: true }) })),
    days: settings.days.map((day, d) => ({ day, cells: settings.periods.map((p) => (p.kind === "break" ? null : cell(week[d][p.id]))) })),
    note: "cells[i] is periods[i]; null is free. A lab fills each period it covers. Teachers are codes. session is the class id that propose_changes takes.",
  };
}

/** One class in a cell, without the field the view is about (a section's week doesn't repeat the section). */
function cellEntry(ctx: Context, kind: EntityKind, { session, placement }: PlacedSession, locked: Set<Id>): Result {
  const course = ctx.clean.courses.find((c) => c.id === session.courseId);
  const section = ctx.clean.sections.find((s) => s.id === session.sectionId);
  const room = ctx.clean.rooms.find((r) => r.id === placement.roomId);
  return {
    session: session.id,
    course: course?.subject ?? session.courseId,
    ...(kind !== "section" && { section: section?.name ?? session.sectionId }),
    ...(session.batch != null && { batch: session.batch }),
    ...(kind !== "teacher" && { teacher: session.teacherId }),
    ...(kind !== "room" && { room: room?.name ?? placement.roomId }),
    ...(session.kind === "lab" && { lab: true }),
    ...(locked.has(session.id) && { locked: true }),
  };
}

export function freePeriods(data: ToolData, input: { kind: EntityKind; id: string; day?: string }): Result {
  const ctx = context(data);
  const found = entity(ctx, input.kind, input.id);
  if ("error" in found) return found;
  const { settings } = ctx.clean;
  let days = settings.days.map((day, d) => ({ day, d }));
  if (input.day !== undefined) {
    const want = input.day.trim().toLowerCase();
    days = days.filter(({ day }) => day.toLowerCase() === want || (want.length >= 3 && want.startsWith(day.toLowerCase())));
    if (days.length === 0) return { error: `No day called ${input.day}. The days are ${settings.days.join(", ")}.` };
  }
  const result = ctx.data.result;
  if (!result) return NO_TIMETABLE;
  const lunch = new Set(settings.lunchCandidates);
  const week = timeline(ctx, input.kind, found.id, result.placements);
  return {
    kind: input.kind,
    id: found.id,
    name: found.name,
    days: days.map(({ day, d }) => ({
      day,
      free: settings.periods
        .filter((p) => p.kind === "teaching" && week[d][p.id].length === 0)
        .map((p) => ({ p: p.label, time: time(p), ...(lunch.has(p.id) && { lunch: true }) })),
    })),
    ...(input.kind === "teacher" && { note: "Free means not teaching in this timetable; there is no availability data." }),
  };
}

// --- problems -------------------------------------------------------------------------------------------------

export function problems(data: ToolData): Result {
  const ctx = context(data);
  const masked = ctx.data;
  const report = checkData(masked, masked.settings);
  const sessions = new Map(ctx.sessions.map((s) => [s.id, s]));
  const label = (id: Id) => {
    const s = sessions.get(id);
    return s ? sessionLabel(ctx.clean, s) : id;
  };
  const out: Result = {
    dataChecks: { errors: report.errors, warnings: report.warnings, help: helpHref("data", "data-checks") },
  };

  const result = masked.result;
  if (result) {
    const groups = unplacedGroups(result.unplaced);
    if (groups.length > 0) {
      out.unplaced = groups.map((g) => ({
        cause: g.label,
        help: unplacedHelpHref(g.cause),
        // "Other reasons" has only the solver's words, which may name a teacher.
        classes: g.items.map((u) => ({
          session: u.sessionId,
          name: label(u.sessionId),
          ...(g.cause === "other" && { reason: maskText(u.reason, ctx.teachers) }),
        })),
      }));
    }
    const { violations } = validate(ctx.clean, result.placements);
    if (violations.length > 0) out.ruleViolations = violations.map((v) => ({ rule: v.rule, message: v.message }));
  }

  const failed = masked.outcome?.failed;
  if (failed?.failure.kind === "infeasible") {
    const causes = explainInfeasible(failed.input, failed.failure.diagnosis, checkData(failed.input, failed.input.settings));
    const { shown, more } = topCauses(causes, 10);
    out.cantBeBuilt = {
      onScreen: masked.outcome?.showFailure ?? false,
      causes: shown.map((c) => ({ text: c.text, fix: c.fix, proven: c.proven, help: causeHelpHref(c) })),
      ...(more > 0 && { more }),
      ...(causes.length === 0 && { noSingleCause: GENERAL_SUGGESTIONS, help: helpHref("generate", "no-single-cause") }),
    };
  } else if (failed) {
    out.couldntFinish = {
      onScreen: masked.outcome?.showFailure ?? false,
      message: maskText(failed.failure.message, ctx.teachers),
      help: helpHref("generate", "couldnt-finish"),
    };
  }
  return out;
}

// --- score_details ----------------------------------------------------------------------------------------------

export function scoreDetails(data: ToolData, input: { rule?: "S1" | "S2" | "S3" | "S4" }): Result {
  const ctx = context(data);
  const result = ctx.data.result;
  if (!result) return NO_TIMETABLE;
  const { settings } = ctx.clean;
  const s = score(ctx.clean, result.placements);
  const list = penalties(ctx.clean, result.placements)
    .filter((p) => !input.rule || p.rule === input.rule)
    .sort((a, b) => b.points - a.points);
  return {
    total: s.total,
    rules: SCORE_ROWS.filter((r) => !input.rule || r.rule === input.rule).map((r) => ({ rule: r.rule, label: r.label, points: s.breakdown[r.key], how: r.tip })),
    penalties: list.map((p) => ({
      rule: p.rule,
      points: p.points,
      day: settings.days[p.day],
      periods: p.periods.map((q) => settings.periods[q]?.label ?? `#${q}`),
      ...(p.sectionId && { section: ctx.clean.sections.find((x) => x.id === p.sectionId)?.name ?? p.sectionId }),
      ...(p.batch && { batch: p.batch }),
      ...(p.courseId && { course: ctx.clean.courses.find((x) => x.id === p.courseId)?.subject ?? p.courseId }),
      ...(p.teacherId && { teacher: p.teacherId }),
    })),
    help: helpHref("timetable", "score"),
  };
}

// --- find -------------------------------------------------------------------------------------------------------

export function find(data: ToolData, input: { text: string }): Result {
  const q = input.text.trim().toLowerCase();
  if (!q) return { error: "Give some text to look for." };
  const { clean, data: masked } = context(data);
  const has = (...fields: string[]) => fields.some((f) => f.toLowerCase().includes(q));
  const sectionName = (id: Id) => clean.sections.find((s) => s.id === id)?.name ?? id;
  const matches: Result[] = [
    ...clean.sections.filter((s) => has(s.name, s.id)).map((s) => ({ kind: "section", id: s.id, name: s.name })),
    ...clean.rooms.filter((r) => has(r.name, r.id)).map((r) => ({ kind: "room", id: r.id, name: r.name, type: r.type })),
    ...masked.courses.filter((c) => has(c.subject, c.id)).map((c) => ({ kind: "course", id: c.id, name: `${c.subject} (${sectionName(c.sectionId)})` })),
    // Teachers by code only: their names never reach the model.
    ...clean.teachers.filter((t) => has(t.id)).map((t) => ({ kind: "teacher", id: t.id })),
  ];
  return {
    matches: matches.slice(0, FIND_LIMIT),
    ...(matches.length > FIND_LIMIT && { more: matches.length - FIND_LIMIT, note: "Use longer text to narrow it down." }),
    ...(matches.length === 0 && { note: "Nothing matches. Teachers can only be found by their code." }),
  };
}

// --- running a tool -------------------------------------------------------------------------------------------

type Input = Record<string, string>;

const HANDLERS: Record<ToolName, (data: ToolData, input: Input) => Result> = {
  overview: (data) => overview(data),
  schedule: (data, input) => schedule(data, input as { kind: EntityKind; id: string }),
  free_periods: (data, input) => freePeriods(data, input as { kind: EntityKind; id: string; day?: string }),
  problems: (data) => problems(data),
  score_details: (data, input) => scoreDetails(data, input as { rule?: "S1" | "S2" | "S3" | "S4" }),
  find: (data, input) => find(data, input as { text: string }),
};

/** What to say when a result is cut, per tool. */
const NARROW: Record<ToolName, string> = {
  overview: "Ask a more specific tool.",
  schedule: "Use free_periods with a day, or look at a section instead of a busy room.",
  free_periods: "Ask about one day.",
  problems: "Fix the first problems and ask again, or look at one section with schedule.",
  score_details: "Ask for one rule (S1, S2, S3 or S4).",
  find: "Use longer text.",
};

export interface ToolOutput {
  /** JSON text for the tool_result block, at most `RESULT_LIMIT` characters. */
  content: string;
  /** Send as an error tool result. */
  isError: boolean;
}

const isToolName = (name: string): name is ToolName => Object.hasOwn(HANDLERS, name);

/** Check `input` against a tool's schema (the subset `agent-tools.json` uses); the problem in words, or null. */
export function inputProblem(schema: ToolDefinition["input_schema"], input: unknown): string | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return "The input must be an object.";
  const fields = Object.keys(schema.properties);
  const list = fields.length > 0 ? fields.join(", ") : "none";
  for (const key of Object.keys(input)) {
    if (!schema.properties[key]) return `Unknown field "${key}". Fields: ${list}.`;
  }
  for (const key of schema.required) {
    if (!(key in input)) return `Missing field "${key}".`;
  }
  for (const [key, value] of Object.entries(input)) {
    const prop = schema.properties[key];
    if (typeof value !== prop.type) return `"${key}" must be a ${prop.type}.`;
    if (prop.enum && !prop.enum.includes(value as string)) return `"${key}" must be one of ${prop.enum.join(", ")}.`;
  }
  return null;
}

/** Run one tool for the model. Never throws: an unknown tool, a bad input or an unknown id comes back as `{ error }`. */
export function runTool(name: string, input: unknown, data: ToolData): ToolOutput {
  const definition = TOOL_DEFINITIONS.find((d) => d.name === name);
  if (!definition || !isToolName(name)) {
    return output({ error: `No tool named ${name}. The tools are ${TOOL_DEFINITIONS.map((d) => d.name).join(", ")}.` }, null);
  }
  const problem = inputProblem(definition.input_schema, input);
  if (problem) return output({ error: `${problem} Check the ${name} tool's schema.` }, name);
  let result: Result;
  try {
    result = HANDLERS[name](data, input as Input);
  } catch (e) {
    result = { error: maskText(`The ${name} tool failed: ${e instanceof Error ? e.message : String(e)}`, data.teachers) };
  }
  return output(result, name);
}

function output(result: Result, name: ToolName | null): ToolOutput {
  const isError = "error" in result;
  const text = JSON.stringify(result);
  if (text.length <= RESULT_LIMIT) return { content: text, isError };
  const note = `\n[Cut: the full result is ${text.length} characters, over the ${RESULT_LIMIT} limit. ${name ? NARROW[name] : ""}]`;
  return { content: text.slice(0, RESULT_LIMIT - note.length) + note, isError };
}
