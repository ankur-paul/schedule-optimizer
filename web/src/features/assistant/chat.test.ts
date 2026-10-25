import { describe, expect, it } from "vitest";
import type { SolveResult } from "@/domain/types";
import {
  answered,
  applySummary,
  changesWorkingCopy,
  commit,
  commitFailed,
  compactRequest,
  COMPACT_EVERY,
  EMPTY_CHAT,
  errorOutcome,
  needsCompaction,
  outcomeNote,
  proposalOutcome,
  replyText,
  scoreLine,
  sentHistory,
  skipCompaction,
  stepStates,
  summaryMessage,
  toolResultsMessage,
  toolUses,
  turnRequest,
  withOutcomes,
  type AgentReply,
  type Block,
  type Chat,
  type Message,
} from "./chat";
import type { ChangeData, DryRun } from "./changes";

const ask = (text: string): Message => ({ role: "user", content: text });
const thinking: Block = { type: "thinking", thinking: "", signature: "sig==" };
const toolUse = (id: string, name: string, input: unknown = {}): Block => ({ type: "tool_use", id, name, input, caller: { type: "direct" } });
const reply = (content: Block[], stop_reason = "end_turn"): AgentReply => ({
  question_id: "q1",
  content,
  stop_reason,
  questions_left: 10,
  expires_at: "2026-11-23T00:00:00Z",
});
const text = (t: string): Block => ({ type: "text", text: t });

/** A chat of `n` answered questions. */
function chatOf(n: number): Chat {
  let chat = EMPTY_CHAT;
  for (let i = 1; i <= n; i++) chat = answered(commit(chat, ask(`q${i}`), reply([text(`a${i}`)])));
  return chat;
}

describe("requests", () => {
  it("starts a new question with no question id and the chat so far", () => {
    const chat = chatOf(1);
    const req = turnRequest(chat, "inst", null, ask("why is the score 34?"));
    expect(req).toEqual({
      institute_id: "inst",
      question_id: null,
      kind: "turn",
      messages: [ask("q1"), { role: "assistant", content: [text("a1")] }, ask("why is the score 34?")],
    });
  });

  it("continues a question with its id and the tool results last", () => {
    const first = reply([thinking, toolUse("tu1", "overview")], "tool_use");
    const chat = commit(EMPTY_CHAT, ask("hi"), first);
    const results = toolResultsMessage([{ id: "tu1", output: { content: "{}", isError: false } }]);
    const req = turnRequest(chat, "inst", "q1", results);
    expect(req.question_id).toBe("q1");
    expect(req.messages.at(-1)).toBe(results);
  });

  it("sends the history exactly as received, thinking signatures and unknown fields included", () => {
    const content = [thinking, text("answer"), { type: "server_thing", extra: { nested: [1, 2] } }];
    const chat = commit(EMPTY_CHAT, ask("hi"), reply(content));
    const sent = turnRequest(chat, "inst", null, ask("next")).messages[1];
    expect(sent).toEqual({ role: "assistant", content });
    expect((sent.content as Block[])[0]).toBe(thinking);
  });
});

describe("tools", () => {
  it("reads the tool calls of a tool_use reply, in order", () => {
    const r = reply([thinking, text("Let me look."), toolUse("a", "find", { text: "CSE" }), toolUse("b", "overview")], "tool_use");
    expect(toolUses(r)).toEqual([
      { id: "a", name: "find", input: { text: "CSE" } },
      { id: "b", name: "overview", input: {} },
    ]);
  });

  it("ignores tool calls when the reply is an answer", () => {
    expect(toolUses(reply([toolUse("a", "find")], "max_tokens"))).toEqual([]);
  });

  it("batches every result in one user message, errors flagged", () => {
    const msg = toolResultsMessage([
      { id: "a", output: { content: '{"n":1}', isError: false } },
      { id: "b", output: { content: '{"error":"x"}', isError: true } },
    ]);
    expect(msg).toEqual({
      role: "user",
      content: [
        { type: "tool_result", tool_use_id: "a", content: '{"n":1}' },
        { type: "tool_result", tool_use_id: "b", content: '{"error":"x"}', is_error: true },
      ],
    });
  });

  it("reads the answer text, skipping thinking and tool calls", () => {
    expect(replyText([thinking, text("One."), toolUse("a", "x"), text("Two.")])).toBe("One.\n\nTwo.");
    expect(replyText([thinking])).toBe("");
  });
});

describe("failed requests", () => {
  it("leaves an unanswered new question out of the history", () => {
    const chat = chatOf(1);
    expect(commitFailed(chat, ask("lost"))).toBe(chat);
  });

  it("keeps tool results, so the model's tool call has its answer", () => {
    const chat = commit(EMPTY_CHAT, ask("hi"), reply([toolUse("a", "overview")], "tool_use"));
    const results = toolResultsMessage([{ id: "a", output: { content: "{}", isError: false } }]);
    const after = commitFailed(chat, results);
    expect(after.history.at(-1)).toBe(results);
    // The next question joins the results in the same user turn.
    expect(turnRequest(after, "i", null, ask("again")).messages.slice(-2)).toEqual([results, ask("again")]);
  });
});

describe("compaction", () => {
  it("is due after every 20th answered question, once", () => {
    expect(needsCompaction(chatOf(0))).toBe(false);
    expect(needsCompaction(chatOf(COMPACT_EVERY - 1))).toBe(false);
    const due = chatOf(COMPACT_EVERY);
    expect(needsCompaction(due)).toBe(true);
    expect(needsCompaction(applySummary(due, reply([text("s")])))).toBe(false);
    expect(needsCompaction(skipCompaction(due))).toBe(false);
  });

  it("asks with the last question's id and the chat as sent", () => {
    const chat = chatOf(COMPACT_EVERY);
    const req = compactRequest(chat, "inst", "q20");
    expect(req).toEqual({ institute_id: "inst", question_id: "q20", kind: "compact", messages: chat.history });
  });

  it("sends the summary in place of the earlier turns, but keeps them in the history", () => {
    const chat = applySummary(chatOf(COMPACT_EVERY), reply([thinking, text("We talked about CSE-3A.")]));
    expect(chat.history).toHaveLength(COMPACT_EVERY * 2);
    expect(sentHistory(chat)).toEqual([summaryMessage("We talked about CSE-3A.")]);

    const next = commit(chat, ask("q21"), reply([text("a21")]));
    expect(turnRequest(next, "i", null, ask("q22")).messages).toEqual([
      summaryMessage("We talked about CSE-3A."),
      ask("q21"),
      { role: "assistant", content: [text("a21")] },
      ask("q22"),
    ]);
  });

  it("folds the old summary into the next one", () => {
    let chat = applySummary(chatOf(COMPACT_EVERY), reply([text("first")]));
    for (let i = 21; i <= 2 * COMPACT_EVERY; i++) chat = answered(commit(chat, ask(`q${i}`), reply([text(`a${i}`)])));
    expect(needsCompaction(chat)).toBe(true);
    expect(compactRequest(chat, "i", "q40").messages[0]).toEqual(summaryMessage("first"));
    chat = applySummary(chat, reply([text("second")]));
    expect(sentHistory(chat)).toEqual([summaryMessage("second")]);
  });

  it("keeps sending everything when the summary comes back empty", () => {
    const chat = applySummary(chatOf(COMPACT_EVERY), reply([thinking]));
    expect(chat.summary).toBeNull();
    expect(sentHistory(chat)).toHaveLength(COMPACT_EVERY * 2);
    expect(needsCompaction(chat)).toBe(false);
  });
});

describe("errorOutcome", () => {
  it("maps the server's states", () => {
    expect(errorOutcome(503, "not_configured")).toMatchObject({ blocked: "notConfigured" });
    expect(errorOutcome(429, "paused")).toMatchObject({ blocked: "paused" });
  });

  it("reloads the access when it may have run out or the membership changed", () => {
    for (const reason of ["no_access", "expired", "used_up", "not_member"]) {
      expect(errorOutcome(reason === "used_up" ? 429 : 403, reason).reloadAccess).toBe(true);
    }
  });

  it("signs out on a rejected token", () => {
    expect(errorOutcome(401, "unauthorized")).toMatchObject({ signedOut: true });
  });

  it("keeps the panel open with a line for question limits", () => {
    for (const reason of ["question_closed", "too_many_calls", "unknown_question", "too_large", "consent_required"]) {
      const out = errorOutcome(429, reason);
      expect(out.blocked).toBeUndefined();
      expect(out.reloadAccess).toBeUndefined();
      expect(out.message).not.toBe("");
    }
  });

  it("says try again for a model error and anything unknown", () => {
    expect(errorOutcome(502, "model_error").message).toBe("The assistant didn't answer. Try again.");
    expect(errorOutcome(500, null).message).toBe("The assistant didn't answer. Try again.");
  });

  it("says the server can't be reached when nothing answered", () => {
    expect(errorOutcome(0, null).message).toMatch(/Couldn't reach/);
  });
});

// --- change cards ---------------------------------------------------------------------------------------------

describe("proposalOutcome", () => {
  const data = { teachers: [{ id: "t1", name: "Asha", departmentId: "cse" }] } as ChangeData;
  const passed: DryRun = {
    ok: true,
    summary: "Move DS off Monday",
    lines: [
      { op: "move", text: "Move CSE A DS from Mon P1 to Tue P2 · R1 · locked" },
      { op: "regenerate", text: "Regenerate, keeping 1 lock" },
      { op: "save_online", text: "Save online as version 8 of “CSE odd”" },
    ],
    warnings: [{ level: "warning", text: "CSE A has 31 of 35 periods booked." }],
    regenerate: true,
    online: [{ op: "save_online" }],
    data,
  };

  it("shows a passed proposal as a numbered card, every step pending", () => {
    const input = { summary: "Move DS off Monday", changes: [] };
    const { output, card } = proposalOutcome(passed, 3, input);
    expect(output).toEqual({ content: "Shown to the user as changes #3; they will apply or discard it.", isError: false });
    expect(card).toEqual({
      n: 3,
      input,
      summary: "Move DS off Monday",
      lines: passed.lines,
      warnings: passed.warnings,
      regenerate: true,
      online: true,
      teachers: data.teachers,
      status: "proposed",
      steps: ["pending", "pending", "pending"],
    });
  });

  it("sends a failed one back as an error result, with no card", () => {
    const { output, card } = proposalOutcome({ ok: false, errors: ["Change 1: no room with id X.", "Change 2: …"] }, 1, {});
    expect(card).toBeNull();
    expect(output).toEqual({ content: JSON.stringify({ error: "Change 1: no room with id X.\nChange 2: …" }), isError: true });
  });

  it("marks a card without online changes", () => {
    expect(proposalOutcome({ ...passed, online: [] }, 1, {}).card!.online).toBe(false);
  });
});

describe("changesWorkingCopy", () => {
  const card = (...ops: string[]) => ({ lines: ops.map((op) => ({ op, text: op })) }) as Parameters<typeof changesWorkingCopy>[0];

  it("is true for data changes, moves, regenerate and opening a timetable", () => {
    for (const op of ["add_room", "move", "set_settings", "regenerate", "load_sample", "open_online"]) expect(changesWorkingCopy(card(op))).toBe(true);
    expect(changesWorkingCopy(card("move", "save_online"))).toBe(true);
  });

  it("is false when every change is online only", () => {
    expect(changesWorkingCopy(card("save_online", "publish"))).toBe(false);
    expect(changesWorkingCopy(card("save_as_new", "rename_online", "make_live"))).toBe(false);
  });
});

describe("stepStates", () => {
  it("marks steps done up to a point, then the failed one", () => {
    expect(stepStates(4, 0)).toEqual(["pending", "pending", "pending", "pending"]);
    expect(stepStates(4, 2)).toEqual(["done", "done", "pending", "pending"]);
    expect(stepStates(4, 2, 2)).toEqual(["done", "done", "failed", "pending"]);
    expect(stepStates(2, 2)).toEqual(["done", "done"]);
  });
});

describe("outcome notes", () => {
  it("says what happened to a card", () => {
    expect(outcomeNote({ n: 3, status: "applied" })).toBe("Applied changes #3");
    expect(outcomeNote({ n: 3, status: "discarded" })).toBe("Discarded changes #3");
    expect(outcomeNote({ n: 3, status: "outOfDate" })).toBe("Changes #3 are out of date and weren't applied");
    expect(outcomeNote({ n: 3, status: "stopped", failure: { step: 4, reason: "Someone saved…", conflict: true } })).toBe("Applied changes #3 up to step 5: save conflict");
    expect(outcomeNote({ n: 2, status: "stopped", failure: { step: 0, reason: "No connection." } })).toBe("Applied changes #2 up to step 1: No connection.");
  });

  it("has nothing to say while a card waits or runs", () => {
    expect(outcomeNote({ n: 1, status: "proposed" })).toBeNull();
    expect(outcomeNote({ n: 1, status: "applying" })).toBeNull();
  });

  it("puts every note before the question, or leaves it alone", () => {
    expect(withOutcomes("And now?", [])).toBe("And now?");
    expect(withOutcomes("And now?", ["Applied changes #1", "Discarded changes #2"])).toBe("[Applied changes #1]\n[Discarded changes #2]\n\nAnd now?");
  });
});

describe("scoreLine", () => {
  const result = (total: number, unplaced: number) => ({ score: { total } as SolveResult["score"], unplaced: Array.from({ length: unplaced }, (_, i) => ({ sessionId: `s${i}`, reason: "" })) });

  it("gives the score before and after, and the unplaced count", () => {
    expect(scoreLine(result(34, 2), result(28, 0))).toBe("Score 34 → 28 · 0 unplaced");
    expect(scoreLine(result(10, 0), result(12, 3))).toBe("Score 10 → 12 · 3 unplaced");
  });

  it("gives just the new score without an earlier timetable", () => {
    expect(scoreLine(null, result(28, 1))).toBe("Score 28 · 1 unplaced");
  });
});
