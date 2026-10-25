import definitions from "../../../../shared/agent-tools.json";
import { eligibleRooms } from "@/domain/eligibility";
import { buildGrid, sessionLabel, slotLabel } from "@/domain/grid";
import { sampleCollege } from "@/domain/sampleCollege";
import { expandSessions } from "@/domain/sessions";
import type { Course, Department, Id, Period, Placement, Room, Section, Session, Settings, SolveInput, Teacher } from "@/domain/types";
import type { RuleId } from "@/domain/validator";
import { checkData } from "@/features/data/dataChecks";
import { nextId } from "@/features/data/dataEdit";
import { regenerateLabel } from "@/features/lock/locks";
import { periodErrors, settingsErrors } from "@/features/setup/periods";
import { applyMove, checkMove, editedResult } from "@/features/view/moves";
import type { Role } from "@/features/account/institutes";
import { canEdit, MAX_TIMETABLE_NAME } from "@/features/online/online";
import { SaveConflict, type OnlineApi } from "@/features/online/onlineApi";
import { createOnline, openOnline, pointLink, renameOnline, saveVersion, useOnline } from "@/features/online/useOnline";
import { currentInstitute, failureMessage, useInstitutes } from "@/features/account/useInstitutes";
import { useAppStore, type AppData } from "@/store/useAppStore";
import { maskTeachers, teacherCodes } from "@/domain/teacherCodes";
import { maskText } from "./mask";
import { saveAsInstitute, type OnlineSnapshot } from "./onlineState";

// The assistant's working-copy changes (T42): the `propose_changes` tool's operations as pure functions. `dryRun`
// checks a whole proposal on a copy, in order, so later changes see earlier ones; `applyChanges` runs the same steps
// for the store. Teachers are referred to by their codes (mask.ts) and resolved here; lines, errors and data checks
// carry codes too, so they are safe to send back to the model, and the panel unmasks them for display (T44).
// The online changes (T43) are checked here against the user's role and an `OnlineSnapshot`, then made one by one
// with `runOnline` after the working-copy changes and regenerate.

/** What a change can touch: the working copy without the print heading, step or time limit. */
export type ChangeData = Pick<AppData, "settings" | "departments" | "teachers" | "rooms" | "sections" | "courses" | "result" | "locks">;

export interface ChangeContext {
  /** Replacing the working copy would lose work (`hasUnsavedWork` in features/online). */
  hasUnsavedWork: boolean;
  /**
   * Where the working copy stands online, for checking online changes. Without it they are checked only for their
   * order (`applyChanges`, which leaves them to `runOnline`).
   */
  online?: OnlineSnapshot;
}

interface FieldSet<F extends string> { field: F; value: string }
type CourseField = "sectionId" | "subject" | "teacherId" | "lecturesPerWeek" | "labSessionsPerWeek" | "labLength" | "labRoomId" | "batchTeacherIds";

export type Change =
  | { op: "add_department"; id: Id; name: string }
  | { op: "update_department"; id: Id; set: FieldSet<"name">[] }
  | { op: "remove_department"; id: Id }
  | { op: "add_teacher"; id: string; name: string; departmentId: Id }
  | { op: "update_teacher"; id: string; set: FieldSet<"name" | "departmentId">[] }
  | { op: "remove_teacher"; id: string }
  | { op: "add_room"; id: Id; name: string; type: Room["type"]; departmentId: string }
  | { op: "update_room"; id: Id; set: FieldSet<"name" | "type" | "departmentId">[] }
  | { op: "remove_room"; id: Id }
  | { op: "add_section"; id: Id; name: string; departmentId: Id; batches: number }
  | { op: "update_section"; id: Id; set: FieldSet<"name" | "departmentId" | "batches">[] }
  | { op: "remove_section"; id: Id }
  | {
      op: "add_course";
      id: Id;
      sectionId: Id;
      subject: string;
      teacherId: string;
      lecturesPerWeek: number;
      labSessionsPerWeek: number;
      labLength: number;
      labRoomId: string;
      batchTeacherIds: string[];
    }
  | { op: "update_course"; id: Id; set: FieldSet<CourseField>[] }
  | { op: "remove_course"; id: Id }
  | { op: "set_settings"; days: string[]; periods: Omit<Period, "id">[]; lunchCandidates: string[] }
  | { op: "move"; sessionId: Id; day: string; period: string; roomId: string }
  | { op: "swap"; a: Id; b: Id }
  | { op: "lock"; sessionId: Id }
  | { op: "unlock"; sessionId: Id }
  | { op: "regenerate" }
  | { op: "load_sample" }
  | OnlineChange;

/** The changes made online, by `runOnline`. A `version` of 0 means the newest, after any save before it. */
export type OnlineChange =
  | { op: "open_online"; timetableId: string; version: number }
  | { op: "save_online" }
  | { op: "save_as_new"; name: string }
  | { op: "rename_online"; name: string }
  | { op: "publish"; version: number }
  | { op: "make_live"; version: number };

export type ChangeOp = Change["op"];

const ONLINE_OPS = new Set<ChangeOp>(["open_online", "save_online", "save_as_new", "rename_online", "publish", "make_live"]);

export const isOnlineChange = (change: Change): change is OnlineChange => ONLINE_OPS.has(change.op);

/** The tool's input. */
export interface Proposal { summary: string; changes: Change[] }

/** One line of the change card. `warning` says what the change costs (cleared timetable, lost work). */
export interface ChangeLine { op: ChangeOp; text: string; warning?: string }

/** A step ② data check that the changes cause and that wasn't there before. */
export interface NewCheck { level: "error" | "warning"; text: string }

export type DryRun =
  | {
      ok: true;
      summary: string;
      lines: ChangeLine[];
      /** New data-check errors and warnings. They don't stop *Apply*: the tables accept bad data by hand too. */
      warnings: NewCheck[];
      /** The proposal has Generate, which the panel runs after the working-copy changes. */
      regenerate: boolean;
      /** The online changes, in order, for `runOnline` after the rest. */
      online: OnlineChange[];
      /** The working copy after the changes. */
      data: ChangeData;
    }
  | { ok: false; errors: string[] };

/** At most this many changes per proposal. */
export const MAX_CHANGES = 100;
/** At most this many schema problems are listed. */
const MAX_ERRORS = 10;

// --- the tool definition --------------------------------------------------------------------------------------

/** The JSON-schema subset `propose_changes` uses. */
export interface Schema {
  type?: "object" | "array" | "string" | "integer";
  const?: string;
  enum?: string[];
  description?: string;
  properties?: Record<string, Schema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: Schema;
  minItems?: number;
  anyOf?: Schema[];
}

export interface ChangeToolDefinition { name: string; description: string; strict: boolean; input_schema: Schema }

const DEFINITIONS = definitions as unknown as ChangeToolDefinition[];
export const CHANGE_TOOL = DEFINITIONS.find((d) => d.name === "propose_changes")!;

/** Each operation's schema by its `op`. */
const OP_SCHEMAS = new Map((CHANGE_TOOL.input_schema.properties!.changes.items!.anyOf ?? []).map((s) => [s.properties!.op.const!, s]));

/** The ops the definition lists, in its order. */
export const SCHEMA_OPS = [...OP_SCHEMAS.keys()];

/** The first way `value` doesn't fit `schema`, in words, or null. `path` names the value ("day", "set[0].field"). */
export function schemaProblem(schema: Schema, value: unknown, path: string): string | null {
  const at = path ? `"${path}"` : "The input";
  switch (schema.type) {
    case "object": {
      if (typeof value !== "object" || value === null || Array.isArray(value)) return `${at} must be an object.`;
      const props = schema.properties ?? {};
      for (const key of Object.keys(value)) {
        if (!Object.hasOwn(props, key)) return `${path ? `${at} has an` : "An"} unknown field "${key}". Fields: ${Object.keys(props).join(", ")}.`;
      }
      for (const key of schema.required ?? []) {
        if (!(key in value)) return `Missing field "${path ? `${path}.` : ""}${key}".`;
      }
      for (const [key, v] of Object.entries(value)) {
        const problem = schemaProblem(props[key], v, path ? `${path}.${key}` : key);
        if (problem) return problem;
      }
      return null;
    }
    case "array": {
      if (!Array.isArray(value)) return `${at} must be a list.`;
      if (schema.minItems && value.length < schema.minItems) return `${at} needs at least ${schema.minItems} item.`;
      for (let i = 0; i < value.length; i++) {
        const problem = schemaProblem(schema.items ?? {}, value[i], `${path}[${i}]`);
        if (problem) return problem;
      }
      return null;
    }
    case "string":
      if (typeof value !== "string") return `${at} must be a string.`;
      if (schema.const !== undefined && value !== schema.const) return `${at} must be "${schema.const}".`;
      if (schema.enum && !schema.enum.includes(value)) return `${at} must be one of ${schema.enum.join(", ")}.`;
      return null;
    case "integer":
      return Number.isInteger(value) ? null : `${at} must be a whole number.`;
    default:
      return null;
  }
}

/** The input checked against the definition: the proposal, or every problem found (at most `MAX_ERRORS`). */
export function parseProposal(input: unknown): { proposal: Proposal } | { errors: string[] } {
  const top = CHANGE_TOOL.input_schema;
  const shape: Schema = { ...top, properties: { ...top.properties, changes: { type: "array" } } };
  const problem = schemaProblem(shape, input, "");
  if (problem) return { errors: [problem] };
  const { changes } = input as { changes: unknown[] };
  if (changes.length === 0) return { errors: ["Give at least one change."] };
  if (changes.length > MAX_CHANGES) {
    return { errors: [`${changes.length} changes is too many: at most ${MAX_CHANGES} per proposal. Propose the rest after these are applied.`] };
  }
  const errors: string[] = [];
  changes.forEach((change, i) => {
    const op = (change as { op?: unknown } | null)?.op;
    const schema = typeof op === "string" ? OP_SCHEMAS.get(op) : undefined;
    if (!schema) {
      const got = typeof op === "string" ? `unknown op "${op}"` : `no "op"`;
      errors.push(`Change ${i + 1}: ${got}. Ops: ${SCHEMA_OPS.join(", ")}.`);
      return;
    }
    const problem = schemaProblem(schema, change, "");
    if (problem) errors.push(`Change ${i + 1} (${op}): ${problem}`);
  });
  if (errors.length > 0) return { errors: errors.length > MAX_ERRORS ? [...errors.slice(0, MAX_ERRORS), `…and ${errors.length - MAX_ERRORS} more.`] : errors };
  return { proposal: input as Proposal };
}

// --- running the changes --------------------------------------------------------------------------------------

/** A change that can't be made: the message goes to the model after "Change N: ". */
class ChangeError extends Error {}

function fail(message: string): never {
  throw new ChangeError(message);
}

interface Env {
  ctx: ChangeContext;
  /** Each teacher's code by real id: the ones the model saw, plus new teachers. */
  codes: Map<Id, string>;
  /** A new teacher's id in the proposal → its real id. */
  aliases: Map<string, Id>;
  /** Index of the `regenerate` change, once seen. */
  regenerateAt: number | null;
  /** Index of the first online change, once seen. */
  onlineAt: number | null;
  /** How many changes the proposal has. */
  count: number;
  /** The online state as the changes so far leave it; `null` when there is no snapshot to check against. */
  online: OnlineSim | null;
}

type Step = { data: ChangeData; line: Omit<ChangeLine, "op"> };

/** Run the proposal on `data`. The first change that fails stops it. */
function run(proposal: Proposal, data: ChangeData, ctx: ChangeContext): DryRun {
  const env: Env = {
    ctx,
    codes: teacherCodes(data.teachers),
    aliases: new Map(),
    regenerateAt: null,
    onlineAt: null,
    count: proposal.changes.length,
    online: ctx.online ? simulate(ctx.online) : null,
  };
  let state = data;
  const lines: ChangeLine[] = [];
  for (const [i, change] of proposal.changes.entries()) {
    try {
      if (isOnlineChange(change)) env.onlineAt ??= i;
      else {
        if (env.onlineAt !== null) fail(`put online changes last: ${change.op} comes after ${proposal.changes[env.onlineAt].op}, and online changes run once the working copy is done.`);
        if (env.regenerateAt !== null) fail("regenerate runs after the other working-copy changes are made, so put it after them; only online changes may follow it.");
        if (env.online) env.online.dirty = true;
      }
      const step = STEPS[change.op](state, change as never, env, i);
      state = step.data;
      lines.push({ op: change.op, ...step.line });
    } catch (e) {
      const why = e instanceof ChangeError ? e.message : `it couldn't be checked (${e instanceof Error ? e.message : String(e)}).`;
      return { ok: false, errors: [maskText(`Change ${i + 1}: ${why}`, state.teachers)] };
    }
  }
  const online = proposal.changes.filter(isOnlineChange);
  return { ok: true, summary: proposal.summary, lines, warnings: newChecks(data, state, env.codes), regenerate: env.regenerateAt !== null, online, data: state };
}

/** Check a proposal on a copy of the working copy. Never throws: a bad input or a failing change comes back as errors. */
export function dryRun(input: unknown, data: ChangeData, ctx: ChangeContext): DryRun {
  const parsed = parseProposal(input);
  if ("errors" in parsed) return { ok: false, errors: parsed.errors };
  return run(parsed.proposal, data, ctx);
}

/** The working copy after a proposal that passed `dryRun`. Throws if it no longer passes (check it again first). */
export function applyChanges(input: unknown, data: ChangeData): ChangeData {
  const result = dryRun(input, data, { hasUnsavedWork: false });
  if (!result.ok) throw new Error(result.errors.join(" "));
  return result.data;
}

/** Data checks after the changes that weren't there before, with teachers as codes. */
function newChecks(before: ChangeData, after: ChangeData, codes: Map<Id, string>): NewCheck[] {
  const report = (d: ChangeData) => {
    const masked = maskTeachers(d, codes);
    return checkData(masked, masked.settings);
  };
  const was = report(before);
  const now = report(after);
  const fresh = (list: string[], old: string[]) => [...new Set(list)].filter((text) => !old.includes(text));
  return [
    ...fresh(now.errors, was.errors).map((text) => ({ level: "error" as const, text })),
    ...fresh(now.warnings, was.warnings).map((text) => ({ level: "warning" as const, text })),
  ];
}

// --- lookups --------------------------------------------------------------------------------------------------

function find<T extends { id: Id }>(list: T[], id: Id, what: string, hint = "Use find."): T {
  return list.find((x) => x.id === id) ?? fail(`no ${what} with id ${id}. ${hint}`);
}

function department(data: ChangeData, id: Id): Department {
  return find(data.departments, id, "department", `Departments: ${data.departments.map((d) => `${d.id} (${d.name})`).join(", ") || "none yet"}.`);
}

/** A teacher by the code the model saw, or by a new teacher's id from earlier in the proposal. */
function teacherId(data: ChangeData, env: Env, ref: string): Id {
  const id = env.aliases.get(ref) ?? [...env.codes].find(([, code]) => code === ref)?.[0];
  if (id === undefined || !data.teachers.some((t) => t.id === id)) fail(`no teacher with code ${ref}. Use find with the teacher's code.`);
  return id;
}

function newId(list: { id: Id }[], id: string, what: string): Id {
  const trimmed = id.trim();
  if (!trimmed) fail(`give the new ${what} an id.`);
  if (list.some((x) => x.id === trimmed)) fail(`a ${what} with id ${trimmed} already exists. Pick a new id.`);
  return trimmed;
}

function wholeNumber(value: string, field: string): number {
  const n = /^\s*-?\d+\s*$/.test(value) ? Number(value) : NaN;
  return Number.isInteger(n) ? n : fail(`${field} must be a whole number, like "3", not "${value}".`);
}

const deptName = (data: ChangeData, id: Id | null) => (id === null ? "shared" : (data.departments.find((d) => d.id === id)?.name ?? id));
const roomName = (data: ChangeData, id: Id | null | undefined) => (id ? (data.rooms.find((r) => r.id === id)?.name ?? id) : "any lab");
const sectionName = (data: ChangeData, id: Id) => data.sections.find((s) => s.id === id)?.name ?? id;
const courseName = (data: ChangeData, c: Course) => `${sectionName(data, c.sectionId)} ${c.subject}`;
const code = (env: Env, id: Id) => env.codes.get(id) ?? id;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

interface Part { label: string; from: string; to: string }

/** "name A → B, type classroom → lab"; an empty `from` reads "name → B". */
const diff = (parts: Part[]) => parts.map((p) => `${p.label}${p.from ? ` ${p.from}` : ""} → ${p.to}`).join(", ");

/** Apply each `set` entry to `item` in order; `field` turns one into a patch and how it reads on the card. */
function update<T, F extends string>(
  item: T,
  set: FieldSet<F>[],
  field: (item: T, f: FieldSet<F>) => Part & { patch: Partial<T> },
): { item: T; text: string } {
  const parts: Part[] = [];
  for (const entry of set) {
    const { patch, ...part } = field(item, entry);
    item = { ...item, ...patch };
    parts.push(part);
  }
  return { item, text: diff(parts) };
}

const replace = <T extends { id: Id }>(list: T[], item: T) => list.map((x) => (x.id === item.id ? item : x));

/** "CSE A Data Structures, CSE B Maths and 3 more". */
function listCourses(data: ChangeData, courses: Course[]): string {
  const names = courses.slice(0, 3).map((c) => courseName(data, c));
  return courses.length > 3 ? `${names.join(", ")} and ${courses.length - 3} more` : names.join(", ");
}

// --- the timetable ----------------------------------------------------------------------------------------------

/** The data as the solver and validator read it: teachers as codes, so messages carry codes; no courses of missing sections. */
function solveInput(data: ChangeData, env: Env, locks = data.locks): SolveInput {
  const masked = maskTeachers(data, env.codes);
  const sections = new Set(masked.sections.map((s) => s.id));
  return { ...masked, courses: masked.courses.filter((c) => sections.has(c.sectionId)), locks, options: { timeLimitSec: 0 } };
}

function timetable(data: ChangeData) {
  return data.result ?? fail("there is no timetable yet. Propose regenerate on its own first; moves, swaps and locks can follow once it has run.");
}

function session(input: SolveInput, id: Id): Session {
  return expandSessions(input).find((s) => s.id === id) ?? fail(`no class with id ${id}. Use schedule to see a section's classes.`);
}

function dayIndex(settings: Settings, text: string): number {
  const want = text.trim().toLowerCase();
  const exact = settings.days.findIndex((d) => d.toLowerCase() === want);
  const i = exact >= 0 ? exact : settings.days.findIndex((d) => want.length >= 3 && want.startsWith(d.toLowerCase()));
  return i >= 0 ? i : fail(`no day called ${text}. Days: ${settings.days.join(", ")}.`);
}

function periodIndex(settings: Settings, text: string): number {
  const want = text.trim().toLowerCase();
  const i = settings.periods.findIndex((p) => p.label.toLowerCase() === want);
  return i >= 0 ? i : fail(`no period called ${text}. Periods: ${settings.periods.map((p) => p.label).join(", ")}.`);
}

/**
 * The first room `s` may use that is free for its whole span among `others`, trying `prefer` first. `what` names the
 * change in the error ("moving CSE A Maths to Tue P4").
 */
function freeRoom(input: SolveInput, others: Placement[], s: Session, day: number, period: number, prefer: Id[], what: string): Room {
  const grid = buildGrid(input, others, expandSessions(input));
  const rooms = eligibleRooms(input, s);
  if (rooms.length === 0) fail(`${what} breaks H4: there is no ${s.roomType} ${label(input, s)} may use.`);
  const ordered = [...prefer.flatMap((id) => rooms.filter((r) => r.id === id)), ...rooms];
  const free = ordered.find((r) => Array.from({ length: s.length }, (_, k) => period + k).every((q) => (grid.byRoom.get(r.id)?.[day]?.[q]?.length ?? 0) === 0));
  return free ?? fail(`${what} breaks H3: every ${s.roomType} ${label(input, s)} may use is busy at ${slotLabel(input, day, period)}.`);
}

const ruleName = (rule: RuleId | null) => (rule === "LOCK" ? "a lock" : rule === "DATA" ? "the data" : rule);

/** Move (or place) sessions and lock them there, if the timetable then keeps every hard rule. */
function placeAndLock(data: ChangeData, env: Env, moves: Placement[], what: string): ChangeData {
  let result = timetable(data);
  let locks = data.locks;
  for (const moved of moves) {
    const next = applyMove(result, locks, moved);
    result = { ...result, placements: next.placements, unplaced: next.unplaced };
    locks = next.locks;
  }
  const before = timetable(data).placements;
  const check = checkMove(solveInput(data, env, locks), before, result.placements, moves.map((m) => m.sessionId));
  if (check.problem) fail(`${what} breaks ${ruleName(check.rule)}: ${check.problem}`);
  return { ...data, result: editedResult(timetable(data), result.placements, result.unplaced, solveInput(data, env)), locks };
}

const placementOf = (data: ChangeData, id: Id) => timetable(data).placements.find((p) => p.sessionId === id);

/** "CSE A Data Structures Lab (B1)". */
const label = (input: SolveInput, s: Session) => sessionLabel(input, s);

// --- online ---------------------------------------------------------------------------------------------------

/** `save_timetable` keeps the newest this many versions, plus the live one. */
export const KEPT_VERSIONS = 20;

/** The online state as the changes so far leave it. */
interface OnlineSim {
  snap: OnlineSnapshot;
  link: { name: string; institute: string; role: Role | null; handle: string | null } | null;
  /** `null` when the linked timetable couldn't be read. */
  versions: { latest: number; live: number | null; kept: number[] } | null;
  /** The version the next save builds on. */
  base: number;
  dirty: boolean;
}

function simulate(snap: OnlineSnapshot): OnlineSim {
  const t = snap.timetable;
  return {
    snap,
    link: snap.link && { name: snap.link.name, institute: snap.linkedInstitute?.name ?? snap.link.instituteName, role: snap.role, handle: snap.linkedInstitute?.handle ?? null },
    versions: t && { latest: t.latestVersion, live: t.liveVersion, kept: t.versions.map((v) => v.version) },
    base: snap.link?.version ?? 0,
    dirty: snap.dirty,
  };
}

function signedIn(sim: OnlineSim, verb: string): void {
  if (!sim.snap.signedIn) fail(`the user is signed out, so you can't ${verb}. They sign in with the account button.`);
}

/** The linked timetable, if the user may change it online. */
function editableLink(sim: OnlineSim, verb: string, notLinked: string): NonNullable<OnlineSim["link"]> {
  signedIn(sim, verb);
  const link = sim.link ?? fail(notLinked);
  if (link.role === null) fail(`the user is no longer a member of ${link.institute}, so you can't ${verb}.`);
  if (!canEdit(link.role)) fail(`the user is a viewer in ${link.institute}: their role can't ${verb}, ask an editor.`);
  return link;
}

function keptVersions(sim: OnlineSim): NonNullable<OnlineSim["versions"]> {
  return sim.versions ?? fail(`the linked timetable's versions couldn't be read (${sim.snap.problems.join(" ") || "no answer"}). Ask again in a moment.`);
}

function timetableName(text: string): string {
  const name = text.trim();
  if (!name) fail("give the timetable a name.");
  if (name.length > MAX_TIMETABLE_NAME) fail(`the name is ${name.length} characters long; at most ${MAX_TIMETABLE_NAME}.`);
  return name;
}

const NOT_SAVED = "this working copy isn't saved online yet.";
const versionList = (kept: number[]) => [...kept].sort((a, b) => b - a).join(", ");

/** `publish` and `make_live`: the version the public link will show. */
function pointAt(sim: OnlineSim, version: number, mode: "publish" | "make_live"): { link: NonNullable<OnlineSim["link"]>; version: number; warning?: string } {
  const link = editableLink(sim, mode === "publish" ? "publish" : "change the live version", `${NOT_SAVED} Use save_as_new first, then publish.`);
  if (!link.handle) {
    fail(
      link.role === "admin"
        ? "the institute has no link name yet, which a public link needs. The user sets it by hand: Publish in the status menu asks for it."
        : "the institute has no link name yet, which a public link needs. Only the admin can set it, so ask the admin.",
    );
  }
  const v = keptVersions(sim);
  if (mode === "publish" && v.live !== null) fail(`it's already published, showing version ${v.live}. Use make_live to show another version.`);
  if (mode === "make_live" && v.live === null) fail("it isn't published yet. Use publish.");
  const n = version === 0 ? v.latest : version;
  if (!v.kept.includes(n)) fail(`version ${n} isn't kept online. Kept versions: ${versionList(v.kept)}.`);
  if (n === v.live) fail(`version ${n} is already live.`);
  sim.versions = { ...v, live: n };
  const warning = n === v.latest && sim.dirty ? `Unsaved changes aren't in version ${n}: save online before this to include them.` : undefined;
  return { link, version: n, ...(warning && { warning }) };
}

/** An online step: checked against the snapshot when there is one, else just a line. */
function online<O extends OnlineChange["op"]>(
  check: (sim: OnlineSim, change: Extract<Change, { op: O }>, env: Env) => Omit<ChangeLine, "op">,
  unchecked: (change: Extract<Change, { op: O }>) => string,
): Handler<O> {
  return (data, change, env) => ({ data, line: env.online ? check(env.online, change, env) : { text: unchecked(change) } });
}

const ONLINE_STEPS: { [O in OnlineChange["op"]]: Handler<O> } = {
  open_online: (data, c, env) => {
    if (env.count > 1) fail("open_online replaces the working copy with the opened timetable, so propose it on its own; propose further changes once it's open.");
    return online<"open_online">(
      (sim, c, env) => {
        signedIn(sim, "open timetables from the institute");
        const active = sim.snap.active ?? fail("the user has no institute to open from.");
        const t = active.timetables.find((x) => x.id === c.timetableId.trim()) ?? fail(`no timetable with id ${c.timetableId} in ${active.name}. Use online_status to see them.`);
        if (c.version < 0 || c.version > t.latestVersion) fail(`“${t.name}” has versions up to ${t.latestVersion}. Give one of those, or 0 for the latest.`);
        const warning = env.ctx.hasUnsavedWork ? "Your unsaved changes will be lost: the opened timetable replaces the data, locks and timetable." : undefined;
        return { text: `Open “${t.name}”${c.version ? ` (version ${c.version})` : ""} from ${active.name}`, ...(warning && { warning }) };
      },
      (c) => `Open timetable ${c.timetableId}`,
    )(data, c, env, 0);
  },
  save_online: online(
    (sim) => {
      const link = editableLink(sim, "save online", `${NOT_SAVED} Use save_as_new to save it as a new timetable.`);
      const v = keptVersions(sim);
      if (sim.base < v.latest) fail(`version ${v.latest} was saved online after this copy's version ${sim.base}, so saving would conflict. Save by hand.`);
      const next = v.latest + 1;
      const dropped = v.kept.filter((k) => k <= next - KEPT_VERSIONS && k !== v.live).sort((a, b) => a - b);
      if (dropped.length > 0) fail(`this save would delete ${dropped.length === 1 ? "version" : "versions"} ${dropped.join(", ")}. Save by hand.`);
      sim.versions = { ...v, latest: next, kept: [...v.kept, next] };
      sim.base = next;
      sim.dirty = false;
      return { text: `Save online as version ${next} of “${link.name}”` };
    },
    () => "Save online",
  ),
  save_as_new: online(
    (sim, c) => {
      signedIn(sim, "save online");
      const into = sim.snap.saveAsInto ?? fail("the user is a viewer in every institute they belong to: their role can't save a new timetable, ask an editor.");
      const name = timetableName(c.name);
      sim.link = { name, institute: into.name, role: into.role, handle: into.handle };
      sim.versions = { latest: 1, live: null, kept: [1] };
      sim.base = 1;
      sim.dirty = false;
      return { text: `Save as a new timetable “${name}” in ${into.name}` };
    },
    (c) => `Save as a new timetable “${c.name.trim()}”`,
  ),
  rename_online: online(
    (sim, c) => {
      const link = editableLink(sim, "rename the timetable", `${NOT_SAVED} Use save_as_new with the name instead.`);
      const name = timetableName(c.name);
      sim.link = { ...link, name };
      return { text: `Rename “${link.name}” to “${name}” online` };
    },
    (c) => `Rename the timetable to “${c.name.trim()}”`,
  ),
  publish: online(
    (sim, c) => {
      const { link, version, warning } = pointAt(sim, c.version, "publish");
      return { text: `Publish version ${version} of “${link.name}”: the public link shows it`, ...(warning && { warning }) };
    },
    (c) => `Publish version ${c.version || "latest"}`,
  ),
  make_live: online(
    (sim, c) => {
      const { link, version, warning } = pointAt(sim, c.version, "make_live");
      return { text: `Make version ${version} of “${link.name}” live on the public link`, ...(warning && { warning }) };
    },
    (c) => `Make version ${c.version || "latest"} live`,
  ),
};

/** How an online change went. A conflict never overwrites the other save: the user saves by hand. */
export type OnlineRun = { ok: true } | { ok: false; reason: string; conflict?: true };

/**
 * Make one online change from a proposal that passed `dryRun`, with the user's token; the next one reads the link
 * this one leaves. Never throws and never retries: a refusal or a lost connection comes back as the reason.
 */
export async function runOnline(change: OnlineChange, api: OnlineApi): Promise<OnlineRun> {
  const link = useAppStore.getState().online;
  const notLinked: OnlineRun = { ok: false, reason: "This working copy isn't linked to an online timetable any more." };
  const active = () => currentInstitute(useInstitutes.getState());
  try {
    switch (change.op) {
      case "save_online": {
        if (!link) return notLinked;
        if (useOnline.getState().saving) return { ok: false, reason: "Another save is running. Try again when it's done." };
        useOnline.setState({ saving: true });
        try {
          await saveVersion(api, link);
        } finally {
          useOnline.setState({ saving: false });
        }
        break;
      }
      case "save_as_new": {
        const { memberships } = useInstitutes.getState();
        const into = saveAsInstitute(memberships, link?.instituteId ?? null, active()?.instituteId ?? null);
        if (!into) return { ok: false, reason: "Your role can't save a new timetable in any institute." };
        await createOnline(api, into, change.name.trim());
        break;
      }
      case "rename_online":
        if (!link) return notLinked;
        await renameOnline(api, link.timetableId, change.name.trim());
        break;
      case "publish":
      case "make_live":
        if (!link) return notLinked;
        await pointLink(api, link.timetableId, change.version || link.version);
        break;
      case "open_online":
        await openOnline(api, change.timetableId.trim(), active()?.name ?? "", change.version || undefined);
        break;
    }
    return { ok: true };
  } catch (e) {
    if (e instanceof SaveConflict) return { ok: false, reason: "Someone saved this timetable online since it was opened. Save by hand.", conflict: true };
    return { ok: false, reason: failureMessage(e) };
  }
}

// --- the steps ------------------------------------------------------------------------------------------------

type Handler<O extends ChangeOp> = (data: ChangeData, change: Extract<Change, { op: O }>, env: Env, index: number) => Step;

const STEPS: { [O in ChangeOp]: Handler<O> } = {
  add_department: (data, c) => {
    const item = { id: newId(data.departments, c.id, "department"), name: c.name.trim() };
    return { data: { ...data, departments: [...data.departments, item] }, line: { text: `Add department ${item.name}` } };
  },
  update_department: (data, c) => {
    const { item, text } = update(department(data, c.id), c.set, (d, f) => ({ patch: { name: f.value.trim() }, label: "name", from: d.name, to: f.value.trim() }));
    return { data: { ...data, departments: replace(data.departments, item) }, line: { text: `Change department ${deptName(data, c.id)}: ${text}` } };
  },
  remove_department: (data, c) => {
    const d = department(data, c.id);
    const count = (list: { departmentId: Id | null }[]) => list.filter((x) => x.departmentId === d.id).length;
    const uses = [plural(count(data.teachers), "teacher"), plural(count(data.rooms), "room"), plural(count(data.sections), "section")].filter((s) => !s.startsWith("0 "));
    if (uses.length > 0) fail(`department ${d.id} still has ${uses.join(", ")}. Move or remove them first.`);
    return { data: { ...data, departments: data.departments.filter((x) => x.id !== d.id) }, line: { text: `Remove department ${d.name}` } };
  },

  add_teacher: (data, c, env) => {
    const ref = c.id.trim();
    if (!ref) fail("give the new teacher an id for later changes to refer to.");
    if (env.aliases.has(ref) || [...env.codes.values()].includes(ref)) fail(`${ref} is already a teacher's code or id. Pick a new id.`);
    const dept = department(data, c.departmentId);
    const item: Teacher = { id: nextId("teacher", data.teachers), name: c.name.trim(), departmentId: dept.id };
    env.aliases.set(ref, item.id);
    env.codes = teacherCodes([...env.codes.keys(), item.id].map((id) => ({ id })));
    return { data: { ...data, teachers: [...data.teachers, item] }, line: { text: `Add teacher ${code(env, item.id)} (${dept.name})` } };
  },
  update_teacher: (data, c, env) => {
    const t = find(data.teachers, teacherId(data, env, c.id), "teacher");
    const { item, text } = update(t, c.set, (t, f) =>
      f.field === "name"
        ? // The old name never goes on the card's text, which is sent back to the model.
          { patch: { name: f.value.trim() }, label: "name", from: "", to: `"${f.value.trim()}"` }
        : { patch: { departmentId: department(data, f.value).id }, label: "department", from: deptName(data, t.departmentId), to: deptName(data, f.value) },
    );
    return { data: { ...data, teachers: replace(data.teachers, item) }, line: { text: `Change teacher ${code(env, t.id)}: ${text}` } };
  },
  remove_teacher: (data, c, env) => {
    const id = teacherId(data, env, c.id);
    const uses = data.courses.filter((x) => x.teacherId === id || x.batchTeacherIds?.includes(id));
    if (uses.length > 0) fail(`teacher ${c.id} still teaches ${listCourses(data, uses)}. Give those courses another teacher first.`);
    return { data: { ...data, teachers: data.teachers.filter((t) => t.id !== id) }, line: { text: `Remove teacher ${code(env, id)}` } };
  },

  add_room: (data, c) => {
    const departmentId = c.departmentId.trim() === "" ? null : department(data, c.departmentId).id;
    const item: Room = { id: newId(data.rooms, c.id, "room"), name: c.name.trim(), type: c.type, departmentId };
    return { data: { ...data, rooms: [...data.rooms, item] }, line: { text: `Add ${item.type} ${item.name} (${deptName(data, departmentId)})` } };
  },
  update_room: (data, c) => {
    const room = find(data.rooms, c.id, "room");
    const { item, text } = update(room, c.set, (r, f) => {
      switch (f.field) {
        case "name":
          return { patch: { name: f.value.trim() }, label: "name", from: r.name, to: f.value.trim() };
        case "type": {
          const type = f.value.trim();
          if (type !== "classroom" && type !== "lab") fail(`type must be classroom or lab, not "${f.value}".`);
          return { patch: { type: type as Room["type"] }, label: "type", from: r.type, to: type };
        }
        case "departmentId": {
          const id = f.value.trim() === "" ? null : department(data, f.value).id;
          return { patch: { departmentId: id }, label: "department", from: deptName(data, r.departmentId), to: deptName(data, id) };
        }
      }
    });
    return { data: { ...data, rooms: replace(data.rooms, item) }, line: { text: `Change room ${room.name}: ${text}` } };
  },
  remove_room: (data, c) => {
    const room = find(data.rooms, c.id, "room");
    const uses = data.courses.filter((x) => x.labRoomId === room.id);
    if (uses.length > 0) fail(`room ${room.id} is the required lab of ${listCourses(data, uses)}. Change their lab room first.`);
    const placed = data.result?.placements.filter((p) => p.roomId === room.id).length ?? 0;
    const warning = placed > 0 ? `${plural(placed, "class is", "classes are")} placed in this room; regenerate to move them.` : undefined;
    return { data: { ...data, rooms: data.rooms.filter((r) => r.id !== room.id) }, line: { text: `Remove room ${room.name}`, ...(warning && { warning }) } };
  },

  add_section: (data, c) => {
    const item: Section = { id: newId(data.sections, c.id, "section"), name: c.name.trim(), departmentId: department(data, c.departmentId).id, batches: c.batches };
    const text = `Add section ${item.name} (${deptName(data, item.departmentId)}, ${plural(item.batches, "lab batch", "lab batches")})`;
    return { data: { ...data, sections: [...data.sections, item] }, line: { text } };
  },
  update_section: (data, c) => {
    const section = find(data.sections, c.id, "section");
    const { item, text } = update(section, c.set, (s, f) => {
      switch (f.field) {
        case "name":
          return { patch: { name: f.value.trim() }, label: "name", from: s.name, to: f.value.trim() };
        case "departmentId":
          return { patch: { departmentId: department(data, f.value).id }, label: "department", from: deptName(data, s.departmentId), to: deptName(data, f.value) };
        case "batches": {
          const batches = wholeNumber(f.value, "batches");
          return { patch: { batches }, label: "lab batches", from: String(s.batches), to: String(batches) };
        }
      }
    });
    return { data: { ...data, sections: replace(data.sections, item) }, line: { text: `Change section ${section.name}: ${text}` } };
  },
  remove_section: (data, c) => {
    const section = find(data.sections, c.id, "section");
    const uses = data.courses.filter((x) => x.sectionId === section.id);
    if (uses.length > 0) fail(`section ${section.id} still has ${plural(uses.length, "course")} (${listCourses(data, uses)}). Remove them first.`);
    return { data: { ...data, sections: data.sections.filter((s) => s.id !== section.id) }, line: { text: `Remove section ${section.name}` } };
  },

  add_course: (data, c, env) => {
    const item: Course = {
      id: newId(data.courses, c.id, "course"),
      sectionId: find(data.sections, c.sectionId, "section").id,
      subject: c.subject.trim(),
      teacherId: teacherId(data, env, c.teacherId),
      lecturesPerWeek: c.lecturesPerWeek,
      labSessionsPerWeek: c.labSessionsPerWeek,
      labLength: c.labLength,
      labRoomId: c.labRoomId.trim() === "" ? null : find(data.rooms, c.labRoomId, "room").id,
      batchTeacherIds: c.batchTeacherIds.length === 0 ? null : c.batchTeacherIds.map((ref) => teacherId(data, env, ref)),
    };
    const labs = item.labSessionsPerWeek > 0 ? ` and ${plural(item.labSessionsPerWeek, `${item.labLength}-period lab`)}` : "";
    const text = `Add course ${item.subject} to ${sectionName(data, item.sectionId)}: ${plural(item.lecturesPerWeek, "lecture")}${labs} a week, taught by ${code(env, item.teacherId)}`;
    return { data: { ...data, courses: [...data.courses, item] }, line: { text } };
  },
  update_course: (data, c, env) => {
    const course = find(data.courses, c.id, "course");
    const teachers = (ids: Id[] | null | undefined) => (ids?.length ? ids.map((id) => code(env, id)).join(", ") : "lecture teacher");
    const { item, text } = update(course, c.set, (x, f) => {
      const number = (key: "lecturesPerWeek" | "labSessionsPerWeek" | "labLength", label: string) => {
        const n = wholeNumber(f.value, f.field);
        return { patch: { [key]: n }, label, from: String(x[key]), to: String(n) };
      };
      switch (f.field) {
        case "sectionId": {
          const id = find(data.sections, f.value.trim(), "section").id;
          return { patch: { sectionId: id }, label: "section", from: sectionName(data, x.sectionId), to: sectionName(data, id) };
        }
        case "subject":
          return { patch: { subject: f.value.trim() }, label: "subject", from: x.subject, to: f.value.trim() };
        case "teacherId": {
          const id = teacherId(data, env, f.value.trim());
          return { patch: { teacherId: id }, label: "teacher", from: code(env, x.teacherId), to: code(env, id) };
        }
        case "lecturesPerWeek":
          return number("lecturesPerWeek", "lectures a week");
        case "labSessionsPerWeek":
          return number("labSessionsPerWeek", "labs a week");
        case "labLength":
          return number("labLength", "lab length");
        case "labRoomId": {
          const id = f.value.trim() === "" ? null : find(data.rooms, f.value.trim(), "room").id;
          return { patch: { labRoomId: id }, label: "lab room", from: roomName(data, x.labRoomId), to: roomName(data, id) };
        }
        case "batchTeacherIds": {
          const refs = f.value.split(",").map((s) => s.trim()).filter(Boolean);
          const ids = refs.length === 0 ? null : refs.map((ref) => teacherId(data, env, ref));
          return { patch: { batchTeacherIds: ids }, label: "batch teachers", from: teachers(x.batchTeacherIds), to: teachers(ids) };
        }
      }
    });
    return { data: { ...data, courses: replace(data.courses, item) }, line: { text: `Change ${courseName(data, course)}: ${text}` } };
  },
  remove_course: (data, c) => {
    const course = find(data.courses, c.id, "course");
    return { data: { ...data, courses: data.courses.filter((x) => x.id !== course.id) }, line: { text: `Remove course ${courseName(data, course)}` } };
  },

  set_settings: (data, c) => {
    const days = c.days.map((d) => d.trim());
    if (days.some((d) => d === "")) fail("a day has no name.");
    if (new Set(days.map((d) => d.toLowerCase())).size !== days.length) fail("a day is listed twice.");
    const periods: Period[] = c.periods.map((p, id) => ({ id, label: p.label.trim(), start: p.start.trim(), end: p.end.trim(), kind: p.kind }));
    const twice = periods.find((p, i) => periods.findIndex((q) => q.label.toLowerCase() === p.label.toLowerCase()) !== i);
    if (twice) fail(`two periods are called ${twice.label}; give each its own label.`);
    const lunchCandidates = [...new Set(c.lunchCandidates.map((text) => periodIndex({ ...data.settings, periods }, text)))].sort((a, b) => a - b);
    const lunchBreak = lunchCandidates.find((id) => periods[id].kind !== "teaching");
    if (lunchBreak !== undefined) fail(`${periods[lunchBreak].label} is a break; lunch candidates must be teaching periods.`);
    const settings: Settings = { days, periods, lunchCandidates };
    const problems = [
      ...settingsErrors(settings).filter((e) => !e.startsWith("Fix the highlighted")),
      ...[...periodErrors(periods)].map(([id, e]) => `${periods[id].label || `period ${id + 1}`}: ${e.toLowerCase()}`),
    ];
    if (problems.length > 0) fail(`the week isn't valid: ${problems.join("; ")}`);
    const teaching = periods.filter((p) => p.kind === "teaching");
    const lunch = lunchCandidates.map((id) => periods[id].label).join(", ");
    const text = `Change the week to ${days.join(", ")} with ${plural(teaching.length, "teaching period")}, ${periods[0].start}–${periods[periods.length - 1].end}, lunch in ${lunch}`;
    return { data: { ...data, settings, result: null, locks: [] }, line: { text, warning: "Clears the timetable and all locks." } };
  },

  move: (data, c, env) => {
    const result = timetable(data);
    const input = solveInput(data, env);
    const s = session(input, c.sessionId);
    const day = dayIndex(data.settings, c.day);
    const period = periodIndex(data.settings, c.period);
    const what = `moving ${label(input, s)} to ${slotLabel(data, day, period)}`;
    const current = placementOf(data, s.id);
    const others = result.placements.filter((p) => p.sessionId !== s.id);
    const roomId = c.roomId.trim() === "" ? freeRoom(input, others, s, day, period, current ? [current.roomId] : [], what).id : find(data.rooms, c.roomId.trim(), "room").id;
    const moved = { sessionId: s.id, day, period, roomId };
    const next = placeAndLock(data, env, [moved], what);
    const to = `${slotLabel(data, day, period)} · ${roomName(data, roomId)} · locked`;
    const text = current ? `Move ${label(input, s)} from ${slotLabel(data, current.day, current.period)} to ${to}` : `Place ${label(input, s)} at ${to}`;
    return { data: next, line: { text } };
  },
  swap: (data, c, env) => {
    timetable(data);
    const input = solveInput(data, env);
    const [a, b] = [session(input, c.a), session(input, c.b)];
    if (a.id === b.id) fail("a and b are the same class.");
    const [pa, pb] = [a, b].map((s) => placementOf(data, s.id) ?? fail(`${label(input, s)} isn't placed; use move to place it.`));
    const what = `swapping ${label(input, a)} and ${label(input, b)}`;
    const rest = timetable(data).placements.filter((p) => p.sessionId !== a.id && p.sessionId !== b.id);
    const aTo = { sessionId: a.id, day: pb.day, period: pb.period, roomId: freeRoom(input, rest, a, pb.day, pb.period, [pb.roomId, pa.roomId], what).id };
    const bTo = { sessionId: b.id, day: pa.day, period: pa.period, roomId: freeRoom(input, [...rest, aTo], b, pa.day, pa.period, [pa.roomId, pb.roomId], what).id };
    const next = placeAndLock(data, env, [aTo, bTo], what);
    const text = `Swap ${label(input, a)} (${slotLabel(data, pa.day, pa.period)}) and ${label(input, b)} (${slotLabel(data, pb.day, pb.period)}) · both locked`;
    return { data: next, line: { text } };
  },
  lock: (data, c, env) => {
    timetable(data);
    const input = solveInput(data, env);
    const s = session(input, c.sessionId);
    const placement = placementOf(data, s.id) ?? fail(`${label(input, s)} isn't placed; use move to place it, which locks it too.`);
    if (data.locks.some((l) => l.sessionId === s.id)) fail(`${label(input, s)} is already locked.`);
    const locks = [...data.locks, { ...placement }];
    const check = checkMove(solveInput(data, env, locks), timetable(data).placements, timetable(data).placements, s.id);
    if (check.problem) fail(`${label(input, s)} can't be locked where it is: it breaks ${ruleName(check.rule)}: ${check.problem}`);
    return { data: { ...data, locks }, line: { text: `Lock ${label(input, s)} at ${slotLabel(data, placement.day, placement.period)}` } };
  },
  unlock: (data, c, env) => {
    timetable(data);
    const input = solveInput(data, env);
    const s = session(input, c.sessionId);
    const lock = data.locks.find((l) => l.sessionId === s.id) ?? fail(`${label(input, s)} isn't locked.`);
    return { data: { ...data, locks: data.locks.filter((l) => l !== lock) }, line: { text: `Unlock ${label(input, s)} (${slotLabel(data, lock.day, lock.period)})` } };
  },

  regenerate: (data, _c, env, index) => {
    env.regenerateAt = index;
    return { data, line: { text: regenerateLabel(data.locks.length) } };
  },
  load_sample: (data, _c, env) => {
    const sample = structuredClone(sampleCollege);
    env.codes = teacherCodes(sample.teachers);
    env.aliases.clear();
    const next: ChangeData = { ...data, ...sample, result: null, locks: [] };
    const warning = env.ctx.hasUnsavedWork ? "Your unsaved changes will be lost: the sample college replaces the data, locks and timetable." : undefined;
    return { data: pick(next), line: { text: "Load the sample college", ...(warning && { warning }) } };
  },
  ...ONLINE_STEPS,
};

/** Just the `ChangeData` fields (the sample also has `options`). */
function pick(d: ChangeData): ChangeData {
  const { settings, departments, teachers, rooms, sections, courses, result, locks } = d;
  return { settings, departments, teachers, rooms, sections, courses, result, locks };
}

/** The ops with a step, for the test that the definition and the steps match. */
export const STEP_OPS = Object.keys(STEPS) as ChangeOp[];
