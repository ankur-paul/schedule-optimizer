import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DbFailure } from "@/features/account/institutesApi";
import { AgentFailure, postAgent, supabaseAssistantApi } from "./agentClient";
import type { AgentRequest } from "./chat";

const req: AgentRequest = { institute_id: "i", question_id: null, kind: "turn", messages: [{ role: "user", content: "hi" }] };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("postAgent", () => {
  it("posts the request with the token and returns the reply", async () => {
    const answer = { question_id: "q", content: [], stop_reason: "end_turn", questions_left: 3, expires_at: "x" };
    const fetch = vi.fn(async () => json(answer));
    expect(await postAgent(req, "tok", { fetch, url: "http://agent" })).toEqual(answer);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://agent/agent");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(JSON.parse(init.body as string)).toEqual(req);
  });

  it("throws the server's reason", async () => {
    const fetch = vi.fn(async () => json({ reason: "used_up" }, 429));
    await expect(postAgent(req, "t", { fetch })).rejects.toMatchObject({ status: 429, reason: "used_up" });
  });

  it("throws a null reason for a body that isn't JSON", async () => {
    const fetch = vi.fn(async () => new Response("Bad gateway", { status: 502 }));
    await expect(postAgent(req, "t", { fetch })).rejects.toMatchObject({ status: 502, reason: null });
  });

  it("throws status 0 when nothing answers", async () => {
    const fetch = vi.fn(async () => Promise.reject(new TypeError("Failed to fetch")));
    const err = await postAgent(req, "t", { fetch }).catch((e) => e);
    expect(err).toBeInstanceOf(AgentFailure);
    expect(err).toMatchObject({ status: 0, reason: null });
  });

  it("passes a cancel through as itself", async () => {
    const controller = new AbortController();
    controller.abort(new Error("stop"));
    const fetch = vi.fn(async () => Promise.reject(new DOMException("aborted", "AbortError")));
    await expect(postAgent(req, "t", { fetch, signal: controller.signal })).rejects.toBeInstanceOf(DOMException);
  });
});

/** A fake client whose table select and rpc answer with `result`. */
function fakeClient(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn(async () => result);
  const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => result };
  const client = { rpc, from: vi.fn(() => chain), auth: { getSession: async () => ({ data: { session: { access_token: "tok" } } }) } };
  return { client: client as unknown as SupabaseClient, rpc };
}

describe("supabaseAssistantApi", () => {
  it("reads the access row, or null without one", async () => {
    const row = { questions_left: 7, expires_at: "2026-11-01T00:00:00Z" };
    expect(await supabaseAssistantApi(fakeClient({ data: row, error: null }).client).access("i")).toEqual({
      questionsLeft: 7,
      expiresAt: "2026-11-01T00:00:00Z",
    });
    expect(await supabaseAssistantApi(fakeClient({ data: null, error: null }).client).access("i")).toBeNull();
  });

  it("redeems through redeem_coupon", async () => {
    const { client, rpc } = fakeClient({ data: [{ questions_left: 200, expires_at: "e" }], error: null });
    expect(await supabaseAssistantApi(client).redeem("i", "LTC-AAAA")).toEqual({ questionsLeft: 200, expiresAt: "e" });
    expect(rpc).toHaveBeenCalledWith("redeem_coupon", { institute_id: "i", code: "LTC-AAAA" });
  });

  it("returns null for a wrong code (no rows)", async () => {
    expect(await supabaseAssistantApi(fakeClient({ data: [], error: null }).client).redeem("i", "x")).toBeNull();
  });

  it("throws the database's own message on a refusal", async () => {
    const { client } = fakeClient({ data: null, error: { code: "42501", message: "Only the admin can redeem a coupon.", hint: "not_admin" } });
    const err = await supabaseAssistantApi(client).redeem("i", "x").catch((e) => e);
    expect(err).toBeInstanceOf(DbFailure);
    expect(err.message).toBe("Only the admin can redeem a coupon.");
  });

  it("reads the session's token", async () => {
    expect(await supabaseAssistantApi(fakeClient({ data: null, error: null }).client).token()).toBe("tok");
  });
});
