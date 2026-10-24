import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { DbFailure } from "@/features/account/institutesApi";
import { initialData } from "@/store/useAppStore";
import { toDoc } from "./online";
import { NotEditable, onlineErrorMessage, SaveConflict, supabaseOnlineApi, toSummaries } from "./onlineApi";

/** A stand-in Supabase client, as in `institutesApi.test.ts`: each awaited query or rpc gives the next queued response. */
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
  return { api: supabaseOnlineApi(client as unknown as SupabaseClient), calls };
}

const doc = toDoc(initialData());

describe("onlineErrorMessage", () => {
  it("keeps the functions' own sentences", () => {
    expect(onlineErrorMessage({ code: "23505", message: "This institute already has a timetable with that name." })).toBe(
      "This institute already has a timetable with that name.",
    );
    expect(onlineErrorMessage({ code: "42501", message: "Only the admin can delete a timetable." })).toBe("Only the admin can delete a timetable.");
  });

  it("names the 2 MB limit and never shows raw SQL", () => {
    expect(onlineErrorMessage({ code: "23514", message: 'new row violates check constraint "timetable_versions_data_check"' })).toMatch(/too big.*2 MB/);
    expect(onlineErrorMessage({ code: "23505", message: 'duplicate key value violates unique constraint "x"' })).toBe("That already exists.");
    expect(onlineErrorMessage({ message: "Failed to fetch" })).toMatch(/Couldn't reach the server/);
  });
});

describe("toSummaries", () => {
  it("joins each timetable's latest version and its saver, sorted by name", () => {
    const rows = toSummaries(
      [
        { id: "t2", name: "ece even", latest_version: 1, live_version: null },
        { id: "t1", name: "CSE odd", latest_version: 2, live_version: 1 },
      ],
      [
        { timetable_id: "t1", version: 1, saved_by: "u1", saved_at: "2026-10-23T10:00:00Z" },
        { timetable_id: "t1", version: 2, saved_by: "u2", saved_at: "2026-10-24T10:42:00Z" },
        { timetable_id: "t2", version: 1, saved_by: "u9", saved_at: "2026-10-22T08:00:00Z" },
      ],
      [{ user_id: "u2", name: null, email: "meera@gndec.ac.in" }],
    );
    expect(rows).toEqual([
      { id: "t1", name: "CSE odd", latestVersion: 2, live: true, savedBy: "meera@gndec.ac.in", savedAt: "2026-10-24T10:42:00Z" },
      { id: "t2", name: "ece even", latestVersion: 1, live: false, savedBy: null, savedAt: "2026-10-22T08:00:00Z" },
    ]);
  });
});

describe("supabaseOnlineApi", () => {
  it("lists without reading version data, and skips the extra queries for none", async () => {
    const { api, calls } = fakeClient([
      { data: [{ id: "t1", name: "CSE", latest_version: 1, live_version: null }], error: null },
      { data: [{ timetable_id: "t1", version: 1, saved_by: "u1", saved_at: "2026-10-24T10:00:00Z" }], error: null },
      { data: [{ user_id: "u1", name: "Meera", email: null }], error: null },
    ]);
    expect(await api.list("i1")).toEqual([{ id: "t1", name: "CSE", latestVersion: 1, live: false, savedBy: "Meera", savedAt: "2026-10-24T10:00:00Z" }]);
    expect(calls).toContainEqual(["select", ["timetable_id, version, saved_by, saved_at"]]);
    expect(calls.filter(([m, args]) => m === "select" && String(args[0]).includes("data"))).toEqual([]);

    const empty = fakeClient([{ data: [], error: null }]);
    expect(await empty.api.list("i1")).toEqual([]);
    expect(empty.calls.filter(([m]) => m === "from")).toHaveLength(1);
  });

  it("opens the latest version", async () => {
    const { api, calls } = fakeClient([
      { data: { institute_id: "i1", name: "CSE", latest_version: 3 }, error: null },
      { data: { data: doc }, error: null },
    ]);
    expect(await api.open("t1")).toEqual({ instituteId: "i1", name: "CSE", version: 3, data: doc });
    expect(calls).toContainEqual(["eq", ["version", 3]]);
  });

  it("says a timetable that can't be read is gone", async () => {
    const { api } = fakeClient([{ data: null, error: null }]);
    await expect(api.open("t1")).rejects.toThrow(/deleted, or you're no longer a member/);
  });

  it("creates with trimmed name and the function's argument names", async () => {
    const { api, calls } = fakeClient([{ data: [{ timetable_id: "t9", version: 1 }], error: null }]);
    expect(await api.create("i1", "  CSE odd ", doc)).toEqual({ timetableId: "t9", version: 1 });
    expect(calls).toContainEqual(["rpc", ["create_timetable", { institute_id: "i1", name: "CSE odd", data: doc }]]);
  });

  it("saves on top of the base version", async () => {
    const { api, calls } = fakeClient([{ data: 4, error: null }]);
    expect(await api.save("t1", doc, 3)).toBe(4);
    expect(calls).toContainEqual(["rpc", ["save_timetable", { timetable_id: "t1", data: doc, base_version: 3 }]]);
  });

  it("turns LT409 into a SaveConflict with the parsed detail", async () => {
    const details = JSON.stringify({ latest_version: 5, saved_by: "u2", saved_by_name: "Meera", saved_at: "2026-10-24T10:42:00Z" });
    const { api } = fakeClient([{ data: null, error: { code: "LT409", message: "Someone saved this timetable since you opened it.", details } }]);
    const error = await api.save("t1", doc, 3).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SaveConflict);
    expect((error as SaveConflict).conflict).toEqual({ latestVersion: 5, savedByName: "Meera", savedAt: "2026-10-24T10:42:00Z" });
  });

  it("treats a save refusal as gone, but keeps the consent message", async () => {
    const gone = fakeClient([{ data: null, error: { code: "42501", message: "Only editors and the admin can change online timetables." } }]);
    await expect(gone.api.save("t1", doc, 1)).rejects.toBeInstanceOf(NotEditable);
    const consent = fakeClient([{ data: null, error: { code: "42501", message: "Accept the current Terms first.", hint: "consent_required" } }]);
    const error = await consent.api.save("t1", doc, 1).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DbFailure);
    expect(error).not.toBeInstanceOf(NotEditable);
    expect((error as Error).message).toBe("Accept the current Terms first.");
  });

  it("renames and deletes through the functions", async () => {
    const { api, calls } = fakeClient([
      { data: null, error: null },
      { data: null, error: null },
    ]);
    await api.rename("t1", " New ");
    await api.remove("t1");
    expect(calls).toContainEqual(["rpc", ["rename_timetable", { timetable_id: "t1", name: "New" }]]);
    expect(calls).toContainEqual(["rpc", ["delete_timetable", { timetable_id: "t1" }]]);
  });
});
