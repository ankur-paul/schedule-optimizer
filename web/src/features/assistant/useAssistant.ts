import { create } from "zustand";
import { failureMessage } from "@/features/account/useInstitutes";
import type { Person } from "@/features/account/institutesApi";
import { AgentFailure, type AssistantApi } from "./agentClient";
import {
  answered,
  applySummary,
  commit,
  commitFailed,
  compactRequest,
  EMPTY_CHAT,
  errorOutcome,
  needsCompaction,
  replyText,
  skipCompaction,
  toolResultsMessage,
  toolUses,
  turnRequest,
  type AgentReply,
  type AgentRequest,
  type Chat,
  type ErrorOutcome,
  type Message,
} from "./chat";
import { toolLabel } from "./format";
import { maskText } from "./mask";
import type { Access, Blocked } from "./panelState";
import { runTool, type ToolData } from "./tools";

// The assistant panel's state and the question loop (T40). The browser drives the loop: send the question, run the
// tools the reply asks for over the working copy, send all their results back, until the reply is an answer.

/** What the panel shows; `answer` text still holds teacher codes, unmasked when drawn so renames show. */
export type ChatItem =
  | { kind: "question"; text: string }
  | { kind: "answer"; text: string; tools: string[] }
  | { kind: "notice"; text: string };

interface AssistantState {
  open: boolean;
  chat: Chat;
  items: ChatItem[];
  /** A question is running: the tools used so far. */
  busy: { tools: string[] } | null;
  /** Whose access `access` is; `undefined` access while it loads, `null` when the institute has none. */
  accessFor: string | null;
  access: Access | null | undefined;
  accessError: string | null;
  admin: Person | null;
  blocked: Blocked | null;
  /** The institute picked in the panel when the working copy isn't linked to one. */
  pickedId: string | null;
  /** An *Ask about this* question waiting for the panel to be open and ready. */
  pending: string | null;
  /** Bumped by *New chat*, so a question still running drops its results. */
  generation: number;
}

const initial: AssistantState = {
  open: false,
  chat: EMPTY_CHAT,
  items: [],
  busy: null,
  accessFor: null,
  access: undefined,
  accessError: null,
  admin: null,
  blocked: null,
  pickedId: null,
  pending: null,
  generation: 0,
};

/** The panel's state. In memory only: the chat lives in this tab and nowhere else. */
export const useAssistant = create<AssistantState>(() => initial);

export function setPanelOpen(open: boolean): void {
  useAssistant.setState({ open });
}

export function pickInstitute(instituteId: string): void {
  useAssistant.setState({ pickedId: instituteId });
}

/** *Ask about this*: open the panel with a question, which it sends once it is open and not busy. */
export function askAbout(text: string): void {
  useAssistant.setState({ open: true, pending: text });
}

export function takePending(): string | null {
  const { pending } = useAssistant.getState();
  useAssistant.setState({ pending: null });
  return pending;
}

/** *New chat*: clears the history, the summary and the screen. A question still running is dropped. */
export function newChat(): void {
  useAssistant.setState((s) => ({ chat: EMPTY_CHAT, items: [], busy: null, generation: s.generation + 1 }));
}

/** Signed out: forget the chat and the access. */
export function resetAssistant(): void {
  useAssistant.setState((s) => ({ ...initial, generation: s.generation + 1 }));
}

// --- access -----------------------------------------------------------------------------------------------------

/** Loads the institute's access row and, for the locked screen, its admin. */
export async function loadAccess(api: AssistantApi, instituteId: string): Promise<void> {
  useAssistant.setState({ accessFor: instituteId, access: undefined, accessError: null, admin: null });
  const mine = () => useAssistant.getState().accessFor === instituteId;
  try {
    const access = await api.access(instituteId);
    if (mine()) useAssistant.setState({ access });
  } catch (e) {
    if (mine()) useAssistant.setState({ accessError: `Couldn't load the assistant's access: ${failureMessage(e)}` });
    return;
  }
  try {
    const admin = await api.admin(instituteId);
    if (mine()) useAssistant.setState({ admin });
  } catch {
    // only the "ask your admin" line needs it
  }
}

/** Redeems a coupon: null on success (the panel opens), else the line to show. */
export async function redeemCoupon(api: AssistantApi, instituteId: string, code: string): Promise<string | null> {
  try {
    const access = await api.redeem(instituteId, code.trim());
    if (!access) return "That coupon isn't valid.";
    if (useAssistant.getState().accessFor === instituteId) useAssistant.setState({ access, blocked: null });
    return null;
  } catch (e) {
    return failureMessage(e);
  }
}

// --- the loop ---------------------------------------------------------------------------------------------------

export interface LoopDeps {
  api: Pick<AssistantApi, "token">;
  post: (req: AgentRequest, token: string) => Promise<AgentReply>;
  instituteId: string;
  /** The working copy now: tools read it fresh each round. */
  toolData: () => ToolData;
  /** The access may have changed (ran out, membership gone): load it again. */
  reloadAccess: () => void;
}

const NO_ANSWER = "The assistant didn't answer. Try again.";
const COMPACTING = "Tidying up the chat so far";

/** Asks one question and runs it to an answer, then compacts the chat when it is due. */
export async function ask(text: string, deps: LoopDeps): Promise<void> {
  const start = useAssistant.getState();
  if (start.busy || !text.trim()) return;
  const generation = start.generation;
  const live = () => useAssistant.getState().generation === generation;
  const set = (fn: (s: AssistantState) => Partial<AssistantState>) => {
    if (live()) useAssistant.setState(fn);
  };

  set((s) => ({ items: [...s.items, { kind: "question", text }], busy: { tools: [] } }));
  const tools: string[] = [];
  let message: Message = { role: "user", content: maskText(text, deps.toolData().teachers) };
  let questionId: string | null = null;
  try {
    for (;;) {
      const reply = await send(deps, turnRequest(useAssistant.getState().chat, deps.instituteId, questionId, message), message, set);
      if (!live()) return;
      questionId = reply.question_id;
      const uses = toolUses(reply);
      if (uses.length === 0) {
        const answer = replyText(reply.content) || NO_ANSWER;
        set((s) => ({ chat: answered(s.chat), items: [...s.items, { kind: "answer", text: answer, tools: [...tools] }] }));
        break;
      }
      const data = deps.toolData();
      const results = uses.map((u) => ({ id: u.id, output: runTool(u.name, u.input, data) }));
      tools.push(...uses.map((u) => toolLabel(u.name, u.input, data)));
      set(() => ({ busy: { tools: [...tools] } }));
      message = toolResultsMessage(results);
    }
    if (needsCompaction(useAssistant.getState().chat)) await compact(deps, questionId!, set);
  } catch (e) {
    const outcome: ErrorOutcome = e instanceof AgentFailure ? errorOutcome(e.status, e.reason) : { message: NO_ANSWER };
    set((s) => ({
      items: [...s.items, { kind: "notice", text: outcome.message }],
      ...(outcome.blocked ? { blocked: outcome.blocked } : {}),
    }));
    if (outcome.reloadAccess && live()) deps.reloadAccess();
  } finally {
    set(() => ({ busy: null }));
  }
}

type Setter = (fn: (s: AssistantState) => Partial<AssistantState>) => void;

/** One request. Success keeps the exchange and the allowance it reports; a failure keeps only what must stay. */
async function send(deps: LoopDeps, req: AgentRequest, message: Message, set: Setter): Promise<AgentReply> {
  let reply: AgentReply;
  try {
    const token = await deps.api.token();
    if (!token) throw new AgentFailure(401, "unauthorized");
    reply = await deps.post(req, token);
  } catch (e) {
    set((s) => ({ chat: commitFailed(s.chat, message) }));
    throw e;
  }
  set((s) => ({
    chat: commit(s.chat, message, reply),
    blocked: null,
    ...(s.accessFor === deps.instituteId ? { access: { questionsLeft: reply.questions_left, expiresAt: reply.expires_at } } : {}),
  }));
  return reply;
}

/** After every 20th answer: swap the turns so far for a summary. A failure only skips it. */
async function compact(deps: LoopDeps, questionId: string, set: Setter): Promise<void> {
  set(() => ({ busy: { tools: [COMPACTING] } }));
  try {
    const token = await deps.api.token();
    if (!token) throw new AgentFailure(401, "unauthorized");
    const reply = await deps.post(compactRequest(useAssistant.getState().chat, deps.instituteId, questionId), token);
    set((s) => ({ chat: applySummary(s.chat, reply) }));
  } catch {
    set((s) => ({ chat: skipCompaction(s.chat) }));
  }
}
