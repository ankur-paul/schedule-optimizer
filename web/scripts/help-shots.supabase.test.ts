import { describe, expect, it } from "vitest";
import { parseConflict, toDoc } from "../src/features/online/online";
import { initialData } from "../src/store/useAppStore";
import { POLICY_VERSION } from "../src/legal/policy";
import { AGENT_ACCESS, agentReply, answer, INSTITUTE, PEOPLE, SESSION_KEY, storedSession, SUPABASE_URL, TIMETABLE } from "./help-shots.supabase";

const doc = toDoc(initialData());
const get = (path: string) => answer({ method: "GET", url: `${SUPABASE_URL}${path}` }, doc);
const rpc = (fn: string, body?: unknown) => answer({ method: "POST", url: `${SUPABASE_URL}/rest/v1/rpc/${fn}`, body }, doc);

describe("the pretend Supabase", () => {
  it("keeps the session where supabase-js looks for it", () => {
    expect(SESSION_KEY).toBe(`sb-${new URL(SUPABASE_URL).hostname.split(".")[0]}-auth-token`);
  });

  it("filters rows with eq", () => {
    const rahul = PEOPLE.find((p) => p.role === "editor")!;
    const res = get(`/rest/v1/memberships?select=institute_id,role,institutes(name,handle)&user_id=eq.${rahul.id}`);
    expect(res.status).toBe(200);
    expect(res.json).toEqual([
      { institute_id: INSTITUTE.id, user_id: rahul.id, role: "editor", institutes: { name: INSTITUTE.name, handle: INSTITUTE.handle } },
    ]);
  });

  it("filters rows with in, quoted or not", () => {
    const res = get(`/rest/v1/profiles?select=user_id,name,email&user_id=in.("user-meera",user-rahul)`);
    expect((res.json as { user_id: string }[]).map((p) => p.user_id)).toEqual(["user-meera", "user-rahul"]);
  });

  it("applies every filter", () => {
    const res = get(`/rest/v1/memberships?select=user_id&institute_id=eq.${INSTITUTE.id}&role=eq.admin`);
    expect(res.json).toEqual([expect.objectContaining({ user_id: "user-meera" })]);
  });

  it("has the timetable with its live and latest versions", () => {
    expect(get(`/rest/v1/timetables?select=public_id,latest_version,live_version&id=eq.${TIMETABLE.id}`).json).toEqual([
      expect.objectContaining({ public_id: TIMETABLE.publicId, latest_version: TIMETABLE.latest, live_version: TIMETABLE.live }),
    ]);
    const versions = get(`/rest/v1/timetable_versions?select=version,saved_by,saved_at&timetable_id=eq.${TIMETABLE.id}`).json as { version: number }[];
    expect(versions.map((v) => v.version)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("refuses an unknown table", () => {
    expect(get("/rest/v1/nothing").status).toBe(404);
  });

  it("accepts no invites", () => {
    expect(rpc("accept_invites")).toEqual({ status: 200, json: [] });
  });

  it("saves on top of the latest version", () => {
    expect(rpc("save_timetable", { timetable_id: TIMETABLE.id, data: doc, base_version: TIMETABLE.latest })).toEqual({ status: 200, json: TIMETABLE.latest + 1 });
  });

  it("answers a stale save with the conflict the app reads", () => {
    const res = rpc("save_timetable", { timetable_id: TIMETABLE.id, data: doc, base_version: TIMETABLE.latest - 1 });
    const error = res.json as { code: string; details: string };
    expect(res.status).toBe(400);
    expect(error.code).toBe("LT409");
    expect(parseConflict(error.details)).toEqual({ latestVersion: TIMETABLE.latest, savedByName: "Dr. Meera Iyer", savedAt: "2026-10-26T09:42:00+05:30" });
  });

  it("refuses writes no shot needs", () => {
    expect(rpc("delete_timetable", { timetable_id: TIMETABLE.id }).status).toBe(400);
    expect(answer({ method: "PATCH", url: `${SUPABASE_URL}/rest/v1/institutes?id=eq.${INSTITUTE.id}` }, doc).status).toBe(400);
  });
});

describe("the pretend assistant", () => {
  it("has every member accept the current policy, so no consent dialog covers a shot", () => {
    const rows = get(`/rest/v1/consents?select=version&user_id=eq.${PEOPLE[0].id}`).json as { version: number }[];
    expect(rows).toEqual([expect.objectContaining({ version: POLICY_VERSION })]);
  });

  it("gives the institute an allowance", () => {
    expect(get(`/rest/v1/agent_access?select=questions_left,expires_at&institute_id=eq.${INSTITUTE.id}`).json).toEqual([
      { institute_id: INSTITUTE.id, ...AGENT_ACCESS },
    ]);
  });

  it("asks for a tool first, then answers once the result is back", () => {
    const first = agentReply({ messages: [{ role: "user", content: "q" }] }) as { stop_reason: string; content: { type: string; id: string }[] };
    expect(first.stop_reason).toBe("tool_use");
    expect(first.content[0]).toMatchObject({ type: "tool_use", name: "score_details" });
    const results = { role: "user", content: [{ type: "tool_result", tool_use_id: first.content[0].id, content: "{}" }] };
    const second = agentReply({ messages: [{ role: "user", content: "q" }, { role: "assistant", content: first.content }, results] }) as {
      stop_reason: string;
      content: { type: string; text: string }[];
      questions_left: number;
    };
    expect(second.stop_reason).toBe("end_turn");
    expect(second.content[0].text).toContain("All 18 points");
    expect(second.questions_left).toBe(AGENT_ACCESS.questions_left);
  });
});

describe("storedSession", () => {
  const now = new Date("2026-10-26T10:00:00+05:30");

  it("signs in the member with that role, valid for a long time", () => {
    const session = JSON.parse(storedSession("viewer", now));
    expect(session.user).toMatchObject({ id: "user-simran", email: "simran@gndec.ac.in", user_metadata: { full_name: "Simran Kaur" } });
    expect(session.expires_at).toBeGreaterThan(now.getTime() / 1000 + 30 * 24 * 3600);
  });

  it("gives a JWT whose claims name the user and a Google sign-in", () => {
    const [, payload] = JSON.parse(storedSession("admin", now)).access_token.split(".");
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
    expect(claims).toMatchObject({ sub: "user-meera", email: "meera@gndec.ac.in", amr: [{ method: "oauth" }] });
  });
});
