import type { SolveResult, Teacher } from "@/domain/types";
import type { ChangeLine, DryRun, NewCheck } from "./changes";
import type { ToolOutput } from "./tools";
import type { Blocked } from "./panelState";

// The chat's pure logic (T40): what is kept, what each /agent request carries, and what an error means. The browser
// drives the loop (useAssistant.ts); the server (server/agent.py) makes one Claude call per request. T44 adds the
// change cards: what a `propose_changes` call shows, and the outcome notes sent with the next message.

/** A content block as the API sends it: text, thinking, tool_use, tool_result… Kept as received. */
export type Block = { type: string } & Record<string, unknown>;

export interface Message {
  role: "user" | "assistant";
  content: string | Block[];
}

/** `POST /agent`'s body (server/agent.py `AgentRequest`). */
export interface AgentRequest {
  institute_id: string;
  question_id: string | null;
  kind: "turn" | "compact";
  messages: Message[];
}

/** `POST /agent`'s answer (server/agent.py `AgentResponse`). */
export interface AgentReply {
  question_id: string;
  content: Block[];
  stop_reason: string | null;
  questions_left: number;
  expires_at: string;
}

/** Compact the chat after every this many answered questions. */
export const COMPACT_EVERY = 20;

export interface Chat {
  /** Every message exactly as sent and received. Never edited: the API rejects changed history. */
  history: Message[];
  /** The model's summary of `history` before `summaryFrom`, sent in place of those turns. */
  summary: string | null;
  summaryFrom: number;
  /** Questions answered in this chat. */
  answered: number;
  /** `answered` at the last compaction, so each 20th question compacts once. */
  compactedAt: number;
}

export const EMPTY_CHAT: Chat = { history: [], summary: null, summaryFrom: 0, answered: 0, compactedAt: 0 };

/** The first message of every request once the chat has been compacted. */
export function summaryMessage(summary: string): Message {
  return { role: "user", content: `This is a summary of our chat so far, written by you:\n\n${summary}` };
}

/** The chat as the model sees it: the summary (if any) in place of the turns it covers, then the rest unchanged. */
export function sentHistory(chat: Chat): Message[] {
  const rest = chat.history.slice(chat.summaryFrom);
  return chat.summary === null ? rest : [summaryMessage(chat.summary), ...rest];
}

/** A request for one step of a question: `message` is the new question (`questionId` null) or the tool results. */
export function turnRequest(chat: Chat, instituteId: string, questionId: string | null, message: Message): AgentRequest {
  return { institute_id: instituteId, question_id: questionId, kind: "turn", messages: [...sentHistory(chat), message] };
}

/** The compaction request after an answer: the chat as sent so far; the server adds the summary prompt. */
export function compactRequest(chat: Chat, instituteId: string, questionId: string): AgentRequest {
  return { institute_id: instituteId, question_id: questionId, kind: "compact", messages: sentHistory(chat) };
}

export function needsCompaction(chat: Chat): boolean {
  return chat.answered > 0 && chat.answered % COMPACT_EVERY === 0 && chat.compactedAt !== chat.answered;
}

/** Keep the summary from a compaction reply; the turns so far are no longer sent. */
export function applySummary(chat: Chat, reply: Pick<AgentReply, "content">): Chat {
  const summary = replyText(reply.content);
  if (!summary) return { ...chat, compactedAt: chat.answered };
  return { ...chat, summary, summaryFrom: chat.history.length, compactedAt: chat.answered };
}

/** A compaction that failed is only skipped; the chat goes on with the full history until the next 20. */
export function skipCompaction(chat: Chat): Chat {
  return { ...chat, compactedAt: chat.answered };
}

/** The exchange went through: keep what was sent and what came back, unchanged. */
export function commit(chat: Chat, sent: Message, reply: Pick<AgentReply, "content">): Chat {
  return { ...chat, history: [...chat.history, sent, { role: "assistant", content: reply.content }] };
}

/**
 * The request failed. A new question the model never answered is left out of the history (it stays on screen). Tool
 * results are kept: the model's tool_use before them needs its results, or the next request is invalid. The next
 * question then joins them in the same user turn.
 */
export function commitFailed(chat: Chat, sent: Message): Chat {
  return hasToolResults(sent) ? { ...chat, history: [...chat.history, sent] } : chat;
}

export function answered(chat: Chat): Chat {
  return { ...chat, answered: chat.answered + 1 };
}

function hasToolResults(message: Message): boolean {
  return Array.isArray(message.content) && message.content.some((b) => b.type === "tool_result");
}

export interface ToolUse {
  id: string;
  name: string;
  input: unknown;
}

/** The tools a reply asks for, in order. */
export function toolUses(reply: Pick<AgentReply, "content" | "stop_reason">): ToolUse[] {
  if (reply.stop_reason !== "tool_use") return [];
  return reply.content
    .filter((b) => b.type === "tool_use" && typeof b.id === "string" && typeof b.name === "string")
    .map((b) => ({ id: b.id as string, name: b.name as string, input: b.input }));
}

/** All of a reply's tool results in one user message, in the order they were asked for. */
export function toolResultsMessage(results: { id: string; output: ToolOutput }[]): Message {
  return {
    role: "user",
    content: results.map(({ id, output }) => ({
      type: "tool_result",
      tool_use_id: id,
      content: output.content,
      ...(output.isError ? { is_error: true } : {}),
    })),
  };
}

/** The text of a reply (its text blocks; thinking and tool calls aren't shown). */
export function replyText(content: Block[]): string {
  return content
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("\n\n")
    .trim();
}

// --- change cards (T44) -----------------------------------------------------------------------------------------

/** Where a card stands: shown, being applied, applied in full, stopped at a failed step, discarded, or out of date on *Apply*. */
export type CardStatus = "proposed" | "applying" | "applied" | "stopped" | "discarded" | "outOfDate";

export type StepState = "pending" | "done" | "failed";

/** A `propose_changes` call that passed its dry run, as the panel shows it. Lines and reasons carry teacher codes. */
export interface Card {
  /** "changes #3": numbered from 1 in each chat. */
  n: number;
  /** The tool input, checked again on *Apply*. */
  input: unknown;
  summary: string;
  lines: ChangeLine[];
  warnings: NewCheck[];
  regenerate: boolean;
  /** Has online changes, which Undo won't take back. */
  online: boolean;
  /** The teachers as the proposal leaves them, so a new teacher's code shows as the typed name. */
  teachers: Teacher[];
  status: CardStatus;
  /** One per line. */
  steps: StepState[];
  /** The failed step (0-based) and why. */
  failure?: { step: number; reason: string; conflict?: boolean };
  /** After a regenerate: "Score 34 → 28 · 0 unplaced", or what Generate said instead (`failed`). */
  after?: { text: string; failed: boolean };
}

/** The tool result and, when the proposal passed, the card it shows as number `n`. */
export function proposalOutcome(dry: DryRun, n: number, input: unknown): { output: ToolOutput; card: Card | null } {
  if (!dry.ok) return { output: { content: JSON.stringify({ error: dry.errors.join("\n") }), isError: true }, card: null };
  const card: Card = {
    n,
    input,
    summary: dry.summary,
    lines: dry.lines,
    warnings: dry.warnings,
    regenerate: dry.regenerate,
    online: dry.online.length > 0,
    teachers: dry.data.teachers,
    status: "proposed",
    steps: dry.lines.map(() => "pending"),
  };
  return { output: { content: `Shown to the user as changes #${n}; they will apply or discard it.`, isError: false }, card };
}

/** Online ops that leave the working copy alone (`open_online` replaces it). */
const ONLINE_ONLY = new Set<ChangeLine["op"]>(["save_online", "save_as_new", "rename_online", "publish", "make_live"]);

/** The card changes the working copy, so *Apply* takes an undo snapshot first. */
export function changesWorkingCopy(card: Pick<Card, "lines">): boolean {
  return card.lines.some((l) => !ONLINE_ONLY.has(l.op));
}

/** Steps before `upTo` done, `failed` (if given) failed, the rest pending. */
export function stepStates(count: number, upTo: number, failed?: number): StepState[] {
  return Array.from({ length: count }, (_, i) => (i === failed ? "failed" : i < upTo ? "done" : "pending"));
}

/** What the model hears about a card at the start of the user's next message, or null while nothing has happened to it. */
export function outcomeNote(card: Pick<Card, "n" | "status" | "failure">): string | null {
  switch (card.status) {
    case "applied":
      return `Applied changes #${card.n}`;
    case "stopped": {
      const f = card.failure!;
      return `Applied changes #${card.n} up to step ${f.step + 1}: ${f.conflict ? "save conflict" : f.reason}`;
    }
    case "discarded":
      return `Discarded changes #${card.n}`;
    case "outOfDate":
      return `Changes #${card.n} are out of date and weren't applied`;
    default:
      return null;
  }
}

/** The user's next message with the outcomes since the last one first, in square brackets so they read as notes. */
export function withOutcomes(text: string, notes: string[]): string {
  return notes.length === 0 ? text : `${notes.map((n) => `[${n}]`).join("\n")}\n\n${text}`;
}

/** The line under a card after its regenerate: "Score 34 → 28 · 0 unplaced" ("Score 28 · …" without an earlier timetable). */
export function scoreLine(before: Pick<SolveResult, "score"> | null, after: Pick<SolveResult, "score" | "unplaced">): string {
  const score = before ? `${before.score.total} → ${after.score.total}` : `${after.score.total}`;
  return `Score ${score} · ${after.unplaced.length} unplaced`;
}

// --- errors -----------------------------------------------------------------------------------------------------

/**
 * What a failed request means for the panel: a state to switch to, the access to reload (it may have run out or
 * been changed), and a line for the chat. `status` 0 means no answer at all.
 */
export interface ErrorOutcome {
  blocked?: Blocked;
  reloadAccess?: boolean;
  /** The session has expired: sign in again. */
  signedOut?: boolean;
  message: string;
}

const RETRY = "The assistant didn't answer. Try again.";

export function errorOutcome(status: number, reason: string | null): ErrorOutcome {
  switch (reason) {
    case "not_configured":
      return { blocked: "notConfigured", message: "The assistant isn't set up on this server." };
    case "paused":
      return { blocked: "paused", message: "The assistant is paused until next month." };
    case "no_access":
    case "expired":
    case "used_up":
      return { reloadAccess: true, message: "Your institute's access to the assistant has run out." };
    case "not_member":
      return { reloadAccess: true, message: "You're no longer a member of this institute." };
    case "consent_required":
      return { message: "Accept the current Terms first: sign out and in again to see them." };
    case "unauthorized":
      return { signedOut: true, message: "Your sign-in has expired. Sign in again." };
    case "question_closed":
      return { message: "This question ran for 15 minutes. Ask it again." };
    case "too_many_calls":
      return { message: "This question took too many steps. Try asking something narrower." };
    case "unknown_question":
      return { message: "That question can't be continued. Ask it again." };
    case "too_large":
      return { message: "This chat is too long to send. Start a new chat." };
  }
  if (status === 0) return { message: "Couldn't reach the assistant. Check your connection and try again." };
  return { message: RETRY };
}
