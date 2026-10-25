import { beforeEach, describe, expect, it, vi } from "vitest";
import timetableJson from "../../../../shared/fixtures/sample-timetable.json";
import { sampleCollege } from "@/domain/sampleCollege";
import type { SolveResult } from "@/domain/types";
import { DbFailure } from "@/features/account/institutesApi";
import { AgentFailure, type AssistantApi } from "./agentClient";
import { COMPACT_EVERY, EMPTY_CHAT, type AgentReply, type AgentRequest, type Block, type Chat } from "./chat";
import { teacherCodes } from "@/domain/teacherCodes";
import type { OnlineSnapshot } from "./onlineState";
import type { ToolData } from "./tools";
import {
  ask,
  askAbout,
  discardCard,
  findCard,
  loadAccess,
  newChat,
  redeemCoupon,
  resetAssistant,
  takePending,
  updateCard,
  useAssistant,
  type LoopDeps,
} from "./useAssistant";

const data: ToolData = { ...structuredClone(sampleCollege), result: timetableJson as SolveResult };
const teacher = sampleCollege.teachers[0];
const code = teacherCodes(sampleCollege.teachers).get(teacher.id)!;
const section = sampleCollege.sections[0];

const reply = (content: Block[], stop_reason = "end_turn", questions_left = 99): AgentReply => ({
  question_id: "q1",
  content,
  stop_reason,
  questions_left,
  expires_at: "2026-11-23T00:00:00Z",
});
const text = (t: string): Block => ({ type: "text", text: t });
const toolUse = (id: string, name: string, input: unknown): Block => ({ type: "tool_use", id, name, input });

const SIGNED_OUT: OnlineSnapshot = {
  signedIn: false,
  link: null,
  role: null,
  linkedInstitute: null,
  dirty: false,
  timetable: null,
  saveAsInto: null,
  active: null,
  problems: [],
};

/** Deps whose `post` answers with `replies` in order, recording each request. */
function deps(replies: (AgentReply | Error)[], over: Partial<LoopDeps> = {}) {
  const requests: AgentRequest[] = [];
  const post = vi.fn(async (req: AgentRequest) => {
    requests.push(structuredClone(req));
    const next = replies.shift();
    if (!next) throw new Error("no more replies");
    if (next instanceof Error) throw next;
    return next;
  });
  const reloadAccess = vi.fn();
  const onlineSnapshot = vi.fn(async () => SIGNED_OUT);
  const d: LoopDeps = {
    api: { token: async () => "tok" },
    post,
    instituteId: "inst",
    toolData: () => data,
    reloadAccess,
    onlineSnapshot,
    hasUnsavedWork: () => false,
    ...over,
  };
  return { d, requests, post, reloadAccess, onlineSnapshot };
}

beforeEach(() => {
  resetAssistant();
  useAssistant.setState({ accessFor: "inst", access: { questionsLeft: 100, expiresAt: "2026-11-23T00:00:00Z" } });
});

describe("ask", () => {
  it("masks the question, shows the answer, and updates the allowance", async () => {
    const { d, requests } = deps([reply([text(`${code} is free.`)])]);
    await ask(`When is ${teacher.name} free?`, d);
    expect(requests[0].question_id).toBeNull();
    expect(requests[0].messages).toEqual([{ role: "user", content: `When is ${code} free?` }]);
    const s = useAssistant.getState();
    expect(s.items).toEqual([
      { kind: "question", text: `When is ${teacher.name} free?` },
      { kind: "answer", text: `${code} is free.`, tools: [] },
    ]);
    expect(s.chat.answered).toBe(1);
    expect(s.chat.history).toHaveLength(2);
    expect(s.access).toEqual({ questionsLeft: 99, expiresAt: "2026-11-23T00:00:00Z" });
    expect(s.busy).toBeNull();
  });

  it("runs the tools a reply asks for and sends every result in one message, same question", async () => {
    const { d, requests } = deps([
      reply([toolUse("a", "schedule", { kind: "section", id: section.id }), toolUse("b", "overview", {})], "tool_use"),
      reply([text("Done.")]),
    ]);
    await ask("Show me", d);
    expect(requests).toHaveLength(2);
    expect(requests[1].question_id).toBe("q1");
    const results = requests[1].messages.at(-1)!;
    expect(results.role).toBe("user");
    expect((results.content as Block[]).map((b) => [b.type, b.tool_use_id])).toEqual([
      ["tool_result", "a"],
      ["tool_result", "b"],
    ]);
    // The tool results carry codes, never a teacher's name.
    expect(JSON.stringify(results)).not.toContain(teacher.name);
    expect(useAssistant.getState().items.at(-1)).toEqual({
      kind: "answer",
      text: "Done.",
      tools: [`Looked at ${section.name}'s week`, "Looked at the overview"],
    });
  });

  it("returns a bad tool call as an error result", async () => {
    const { d, requests } = deps([reply([toolUse("a", "schedule", { kind: "planet" })], "tool_use"), reply([text("ok")])]);
    await ask("x", d);
    const [result] = requests[1].messages.at(-1)!.content as Block[];
    expect(result.is_error).toBe(true);
  });

  it("shows the busy tools while it works and blocks a second question", async () => {
    let release!: (r: AgentReply) => void;
    const second = new Promise<AgentReply>((r) => (release = r));
    const replies = [reply([toolUse("a", "problems", {})], "tool_use")];
    const post = vi.fn(async () => (replies.length ? replies.shift()! : second));
    const { d } = deps([], { post });
    const running = ask("x", d);
    await vi.waitFor(() => expect(useAssistant.getState().busy).toEqual({ tools: ["Looked at the problems"] }));
    await ask("another", d);
    expect(post).toHaveBeenCalledTimes(2);
    release(reply([text("ok")]));
    await running;
    expect(useAssistant.getState().busy).toBeNull();
  });

  it("says so when the answer has no text", async () => {
    const { d } = deps([reply([{ type: "thinking", thinking: "", signature: "s" }], "max_tokens")]);
    await ask("x", d);
    expect(useAssistant.getState().items.at(-1)).toMatchObject({ kind: "answer", text: "The assistant didn't answer. Try again." });
  });

  it("ignores an empty question", async () => {
    const { d, post } = deps([]);
    await ask("   ", d);
    expect(post).not.toHaveBeenCalled();
    expect(useAssistant.getState().items).toEqual([]);
  });
});

describe("errors", () => {
  it("keeps the chat on screen and says try again after a model error", async () => {
    const { d } = deps([reply([text("first")]), new AgentFailure(502, "model_error")]);
    await ask("one", d);
    await ask("two", d);
    const s = useAssistant.getState();
    expect(s.items.map((i) => i.kind)).toEqual(["question", "answer", "question", "notice"]);
    expect(s.items.at(-1)).toEqual({ kind: "notice", text: "The assistant didn't answer. Try again." });
    // The unanswered question isn't kept for the model.
    expect(s.chat.history).toHaveLength(2);
    expect(s.busy).toBeNull();
  });

  it("keeps tool results that got no answer, so the next request is valid", async () => {
    const { d, requests } = deps([reply([toolUse("a", "overview", {})], "tool_use"), new AgentFailure(0, null), reply([text("ok")])]);
    await ask("one", d);
    expect(useAssistant.getState().chat.history.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    await ask("two", d);
    expect(requests[2].messages.slice(-2).map((m) => m.role)).toEqual(["user", "user"]);
  });

  it("switches to paused or not configured", async () => {
    await ask("x", deps([new AgentFailure(429, "paused")]).d);
    expect(useAssistant.getState().blocked).toBe("paused");
    await ask("y", deps([new AgentFailure(503, "not_configured")]).d);
    expect(useAssistant.getState().blocked).toBe("notConfigured");
  });

  it("clears paused once a request goes through", async () => {
    useAssistant.setState({ blocked: "paused" });
    await ask("x", deps([reply([text("ok")])]).d);
    expect(useAssistant.getState().blocked).toBeNull();
  });

  it("reloads the access when it ran out", async () => {
    const { d, reloadAccess } = deps([new AgentFailure(429, "used_up")]);
    await ask("x", d);
    expect(reloadAccess).toHaveBeenCalledOnce();
  });

  it("asks to sign in again without a token", async () => {
    const { d, post } = deps([], { api: { token: async () => null } });
    await ask("x", d);
    expect(post).not.toHaveBeenCalled();
    expect(useAssistant.getState().items.at(-1)).toEqual({ kind: "notice", text: "Your sign-in has expired. Sign in again." });
  });
});

describe("compaction", () => {
  /** A chat that has answered 19 questions. */
  const nineteen = (): Chat => ({ ...EMPTY_CHAT, answered: COMPACT_EVERY - 1, history: [] });

  it("compacts after the 20th answer with that question's id, then sends the summary instead", async () => {
    useAssistant.setState({ chat: nineteen() });
    const { d, requests } = deps([reply([text("a20")]), reply([text("The summary.")], "end_turn", 98), reply([text("a21")])]);
    await ask("q20", d);
    expect(requests[1]).toMatchObject({ kind: "compact", question_id: "q1" });
    expect(requests[1].messages).toEqual(requests[0].messages.concat({ role: "assistant", content: [text("a20")] }));
    expect(useAssistant.getState().chat.summary).toBe("The summary.");
    // The screen still shows the whole chat; the compaction adds nothing to it.
    expect(useAssistant.getState().items.map((i) => i.kind)).toEqual(["question", "answer"]);

    await ask("q21", d);
    expect(requests[2].messages[0].content).toContain("The summary.");
    expect(requests[2].messages).toHaveLength(2);
  });

  it("skips a failed compaction and keeps the answer", async () => {
    useAssistant.setState({ chat: nineteen() });
    const { d } = deps([reply([text("a20")]), new AgentFailure(429, "too_many_compactions")]);
    await ask("q20", d);
    const s = useAssistant.getState();
    expect(s.chat.summary).toBeNull();
    expect(s.chat.compactedAt).toBe(COMPACT_EVERY);
    expect(s.items.map((i) => i.kind)).toEqual(["question", "answer"]);
  });
});

describe("new chat", () => {
  it("clears the history and screen, and drops a question still running", async () => {
    let release!: (r: AgentReply) => void;
    const post = vi.fn(() => new Promise<AgentReply>((r) => (release = r)));
    const running = ask("x", deps([], { post }).d);
    await vi.waitFor(() => expect(post).toHaveBeenCalled());
    newChat();
    release(reply([text("late")]));
    await running;
    const s = useAssistant.getState();
    expect(s.items).toEqual([]);
    expect(s.chat).toEqual(EMPTY_CHAT);
    expect(s.busy).toBeNull();
  });
});

describe("askAbout", () => {
  it("opens the panel with the question waiting, taken once", () => {
    askAbout("Why?");
    expect(useAssistant.getState()).toMatchObject({ open: true, pending: "Why?" });
    expect(takePending()).toBe("Why?");
    expect(takePending()).toBeNull();
  });
});

describe("access", () => {
  const api = (over: Partial<AssistantApi> = {}): AssistantApi => ({
    token: async () => "tok",
    access: async () => ({ questionsLeft: 5, expiresAt: "2026-11-01T00:00:00Z" }),
    redeem: async () => ({ questionsLeft: 200, expiresAt: "2026-11-24T00:00:00Z" }),
    admin: async () => ({ name: "Asha", email: "asha@example.org" }),
    ...over,
  });

  it("loads the access and the admin", async () => {
    await loadAccess(api(), "x");
    expect(useAssistant.getState()).toMatchObject({
      accessFor: "x",
      access: { questionsLeft: 5 },
      admin: { name: "Asha" },
      accessError: null,
    });
  });

  it("drops a load for an institute switched away from", async () => {
    let release!: () => void;
    const slow = api({ access: () => new Promise((r) => (release = () => r(null))) });
    const first = loadAccess(slow, "old");
    await loadAccess(api(), "new");
    release();
    await first;
    expect(useAssistant.getState()).toMatchObject({ accessFor: "new", access: { questionsLeft: 5 } });
  });

  it("shows a load error", async () => {
    await loadAccess(api({ access: async () => Promise.reject(new DbFailure("Nope.")) }), "x");
    expect(useAssistant.getState()).toMatchObject({ access: undefined, accessError: "Couldn't load the assistant's access: Nope." });
  });

  it("redeems a coupon and opens", async () => {
    useAssistant.setState({ accessFor: "x", access: null, blocked: "paused" });
    expect(await redeemCoupon(api(), "x", " ltc-abcd ")).toBeNull();
    expect(useAssistant.getState()).toMatchObject({ access: { questionsLeft: 200 }, blocked: null });
  });

  it("says a wrong or used coupon isn't valid", async () => {
    expect(await redeemCoupon(api({ redeem: async () => null }), "x", "bad")).toBe("That coupon isn't valid.");
  });

  it("shows the database's message on a refusal", async () => {
    const refused = api({ redeem: async () => Promise.reject(new DbFailure("Too many tries, wait an hour.")) });
    expect(await redeemCoupon(refused, "x", "bad")).toBe("Too many tries, wait an hour.");
  });
});

// --- change cards ---------------------------------------------------------------------------------------------

describe("change cards", () => {
  const MOVE = { op: "move", sessionId: "cse-a-ds:L1", day: "Tue", period: "P1", roomId: "" };
  const propose = (id: string, changes: unknown[], summary = "Move DS") => toolUse(id, "propose_changes", { summary, changes });
  const cards = () => useAssistant.getState().items.filter((i) => i.kind === "card").map((i) => (i.kind === "card" ? i.card : null)!);
  const lastResult = (req: AgentRequest) => (req.messages.at(-1)!.content as Block[])[0];

  it("shows a passed proposal as a card, says so to the model, and puts the answer above it", async () => {
    const { d, requests, onlineSnapshot } = deps([reply([propose("p", [MOVE])], "tool_use"), reply([text("Apply it when ready.")])]);
    await ask("Move DS off Monday", d);
    expect(onlineSnapshot).toHaveBeenCalledOnce();
    expect(lastResult(requests[1])).toEqual({ type: "tool_result", tool_use_id: "p", content: "Shown to the user as changes #1; they will apply or discard it." });
    const items = useAssistant.getState().items;
    expect(items.map((i) => i.kind)).toEqual(["question", "answer", "card"]);
    expect(items[1]).toEqual({ kind: "answer", text: "Apply it when ready.", tools: ["Proposed changes #1"] });
    expect(cards()[0]).toMatchObject({ n: 1, summary: "Move DS", status: "proposed", steps: ["pending"] });
    expect(cards()[0].lines[0].text).toMatch(/^Move CSE A Data Structures from .+ to Tue P1 · .+ · locked$/);
  });

  it("numbers cards through the chat, and from 1 again after New chat", async () => {
    await ask("one", deps([reply([propose("a", [MOVE]), propose("b", [{ op: "regenerate" }])], "tool_use"), reply([text("Two.")])]).d);
    await ask("two", deps([reply([propose("c", [{ op: "regenerate" }])], "tool_use"), reply([text("One more.")])]).d);
    expect(cards().map((c) => c.n)).toEqual([1, 2, 3]);
    expect(useAssistant.getState().items.map((i) => i.kind)).toEqual(["question", "answer", "card", "card", "question", "answer", "card"]);
    newChat();
    await ask("three", deps([reply([propose("d", [{ op: "regenerate" }])], "tool_use"), reply([text("Ok.")])]).d);
    expect(cards().map((c) => c.n)).toEqual([1]);
  });

  it("returns a failed proposal as an error result and adds no card", async () => {
    const { d, requests } = deps([reply([propose("p", [{ ...MOVE, sessionId: "nope" }])], "tool_use"), reply([text("Sorry.")])]);
    await ask("Move it", d);
    const result = lastResult(requests[1]);
    expect(result).toMatchObject({ type: "tool_result", tool_use_id: "p", is_error: true });
    expect(JSON.parse(result.content as string).error).toMatch(/^Change 1: no class with id nope/);
    expect(cards()).toEqual([]);
    expect(useAssistant.getState().items.at(-1)).toEqual({ kind: "answer", text: "Sorry.", tools: ["Checked changes that didn't pass"] });
  });

  it("passes the snapshot and the unsaved-work flag to the dry run", async () => {
    const { d } = deps([reply([propose("p", [{ op: "load_sample" }])], "tool_use"), reply([text("Ok.")])], { hasUnsavedWork: () => true });
    await ask("Load the sample", d);
    expect(cards()[0].lines[0].warning).toMatch(/unsaved changes will be lost/);

    const viewer = deps([reply([propose("p", [{ op: "save_online" }])], "tool_use"), reply([text("Can't.")])]);
    await ask("Save it", viewer.d);
    // Signed out: the online check refuses it, so no card.
    expect(JSON.parse(lastResult(viewer.requests[1]).content as string).error).toMatch(/signed out/);
  });

  it("reads the online snapshot for online_status only when asked", async () => {
    const plain = deps([reply([toolUse("a", "overview", {})], "tool_use"), reply([text("Ok.")])]);
    await ask("hi", plain.d);
    expect(plain.onlineSnapshot).not.toHaveBeenCalled();
    const online = deps([reply([toolUse("a", "online_status", {})], "tool_use"), reply([text("Ok.")])]);
    await ask("Is it saved?", online.d);
    expect(online.onlineSnapshot).toHaveBeenCalledOnce();
    expect(JSON.parse(lastResult(online.requests[1]).content as string)).toMatchObject({ signedIn: false });
  });

  it("puts every outcome since the last question at the start of the next one, masked, once", async () => {
    await ask("one", deps([reply([propose("a", [MOVE]), propose("b", [MOVE])], "tool_use"), reply([text("Two.")])]).d);
    discardCard(1);
    updateCard(2, { status: "stopped", failure: { step: 0, reason: `No connection for ${teacher.name}.` } });
    const next = deps([reply([text("Noted.")]), reply([text("Again.")])]);
    await ask(`And ${teacher.name}?`, next.d);
    expect(next.requests[0].messages.at(-1)).toEqual({
      role: "user",
      content: `[Discarded changes #1]\n[Applied changes #2 up to step 1: No connection for ${code}.]\n\nAnd ${code}?`,
    });
    // The screen shows the question as typed.
    expect(useAssistant.getState().items.filter((i) => i.kind === "question").at(-1)).toEqual({ kind: "question", text: `And ${teacher.name}?` });
    await ask("Then?", next.d);
    expect(next.requests[1].messages.at(-1)).toEqual({ role: "user", content: "Then?" });
  });

  it("keeps the outcomes for the next question when this one fails", async () => {
    await ask("one", deps([reply([propose("a", [MOVE])], "tool_use"), reply([text("Ok.")])]).d);
    discardCard(1);
    await ask("two", deps([new AgentFailure(502, "model_error")]).d);
    const next = deps([reply([text("Ok.")])]);
    await ask("three", next.d);
    expect(next.requests[0].messages.at(-1)!.content).toBe("[Discarded changes #1]\n\nthree");
  });

  it("discards only a card still waiting, once", async () => {
    await ask("one", deps([reply([propose("a", [MOVE])], "tool_use"), reply([text("Ok.")])]).d);
    discardCard(1);
    discardCard(1);
    expect(findCard(1)!.status).toBe("discarded");
    expect(useAssistant.getState().outcomes).toEqual(["Discarded changes #1"]);
    updateCard(1, { status: "proposed" });
    useAssistant.setState({ outcomes: [] });
    updateCard(1, { status: "applied" });
    discardCard(1);
    expect(findCard(1)!.status).toBe("applied");
  });

  it("asks nothing while a card is being applied", async () => {
    useAssistant.setState({ applying: 1 });
    const { d, post } = deps([reply([text("Hi.")])]);
    await ask("hi", d);
    expect(post).not.toHaveBeenCalled();
  });
});
