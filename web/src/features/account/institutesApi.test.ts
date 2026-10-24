import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { DbFailure, supabaseApi, toMembers, toMemberships } from "./institutesApi";

/**
 * A stand-in Supabase client. Every query-builder method returns the builder, and awaiting it gives the next queued
 * response, so a test only says what the database answers. `calls` records each method with its arguments.
 */
function fakeClient(responses: { data: unknown; error: unknown }[]) {
  const calls: [string, unknown[]][] = [];
  const next = () => responses.shift() ?? { data: null, error: null };
  const builder: object = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === "then") {
          const response = next();
          return (resolve: (v: unknown) => void) => resolve(response);
        }
        return (...args: unknown[]) => {
          calls.push([prop, args]);
          return builder;
        };
      },
    },
  );
  const client = {
    from: (table: string) => {
      calls.push(["from", [table]]);
      return builder;
    },
    rpc: vi.fn(async (fn: string, args?: unknown) => {
      calls.push(["rpc", [fn, args]]);
      return next();
    }),
  };
  return { api: supabaseApi(client as unknown as SupabaseClient), calls };
}

describe("toMemberships", () => {
  it("maps rows and sorts by institute name", () => {
    const rows = [
      { institute_id: "i2", role: "viewer" as const, institutes: { name: "PEC" } },
      { institute_id: "i1", role: "admin" as const, institutes: { name: "GNDEC" } },
    ];
    expect(toMemberships(rows)).toEqual([
      { instituteId: "i1", name: "GNDEC", role: "admin" },
      { instituteId: "i2", name: "PEC", role: "viewer" },
    ]);
  });

  it("drops a row whose institute can't be read", () => {
    expect(toMemberships([{ institute_id: "i1", role: "editor", institutes: null }])).toEqual([]);
  });
});

describe("toMembers", () => {
  it("joins each membership to its profile, leaving unknowns blank", () => {
    const members = toMembers(
      [
        { user_id: "u1", role: "admin" },
        { user_id: "u2", role: "editor" },
      ],
      [{ user_id: "u1", email: "meera@gndec.ac.in", name: "Meera" }],
    );
    expect(members).toEqual([
      { userId: "u1", role: "admin", email: "meera@gndec.ac.in", name: "Meera" },
      { userId: "u2", role: "editor", email: null, name: null },
    ]);
  });
});

describe("supabaseApi", () => {
  it("returns the institutes accept_invites joined", async () => {
    const { api } = fakeClient([{ data: [{ institute_id: "i1", institute_name: "GNDEC", role: "editor" }], error: null }]);
    expect(await api.acceptInvites()).toEqual([{ name: "GNDEC", role: "editor" }]);
  });

  it("turns a function's refusal into a DbFailure with its plain words", async () => {
    const { api } = fakeClient([{ data: null, error: { code: "42501", message: "Only the admin can remove members." } }]);
    await expect(api.removeMember("i1", "u2")).rejects.toEqual(new DbFailure("Only the admin can remove members."));
  });

  it("never lets raw SQL through", async () => {
    const { api } = fakeClient([{ data: null, error: { code: "23505", message: 'duplicate key value violates unique constraint "invites_pkey"' } }]);
    await expect(api.invite("i1", "a@b.in", "editor")).rejects.toThrow("That already exists.");
  });

  it("trims a new institute's name and passes the function's argument names", async () => {
    const { api, calls } = fakeClient([{ data: "new-id", error: null }]);
    expect(await api.createInstitute("  GNDEC  ")).toBe("new-id");
    expect(calls).toContainEqual(["rpc", ["create_institute", { name: "GNDEC" }]]);
  });

  it("treats a rename that changed no row as refused", async () => {
    const refused = fakeClient([{ data: [], error: null }]);
    await expect(refused.api.rename("i1", "New")).rejects.toThrow("Only the admin can do that.");
    const ok = fakeClient([{ data: [{ id: "i1" }], error: null }]);
    await expect(ok.api.rename("i1", " New ")).resolves.toBeUndefined();
    expect(ok.calls).toContainEqual(["update", [{ name: "New" }]]);
  });

  it("stores invite emails lower-cased and trimmed", async () => {
    const { api, calls } = fakeClient([{ data: null, error: null }]);
    await api.invite("i1", "  Bela@Gmail.com ", "viewer");
    expect(calls).toContainEqual(["insert", [{ institute_id: "i1", email: "bela@gmail.com", role: "viewer" }]]);
  });

  it("says an invite that's already gone was accepted or cancelled", async () => {
    const { api } = fakeClient([{ data: [], error: null }]);
    await expect(api.cancelInvite("i1", "a@b.in")).rejects.toThrow(/already accepted or cancelled/);
  });

  it("finds the admin's profile, or null with no admin row", async () => {
    const found = fakeClient([
      { data: [{ user_id: "u1" }], error: null },
      { data: [{ email: "meera@gndec.ac.in", name: "Meera" }], error: null },
    ]);
    expect(await found.api.admin("i1")).toEqual({ email: "meera@gndec.ac.in", name: "Meera" });
    const none = fakeClient([{ data: [], error: null }]);
    expect(await none.api.admin("i1")).toBeNull();
  });

  it("loads members with profiles and the pending invites", async () => {
    const { api } = fakeClient([
      { data: [{ user_id: "u1", role: "admin" }], error: null },
      { data: [{ email: "new@x.in", role: "viewer" }], error: null },
      { data: [{ user_id: "u1", email: "meera@gndec.ac.in", name: null }], error: null },
    ]);
    expect(await api.members("i1")).toEqual({
      members: [{ userId: "u1", role: "admin", email: "meera@gndec.ac.in", name: null }],
      invites: [{ email: "new@x.in", role: "viewer" }],
    });
  });
});
