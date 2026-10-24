import { describe, expect, it, vi } from "vitest";
import { sampleCollege } from "@/domain/sampleCollege";
import { loadPublished, readDoc, readRow, updatedText } from "./published";

const CONFIG = { url: "https://abcd.supabase.co/", anonKey: "anon-key" };

const { locks: _locks, options: _options, ...rest } = sampleCollege;
const RESULT = { engine: "cpsat", status: "optimal", placements: [{ sessionId: "cse-a-ds:L1", day: 0, period: 0, roomId: "cr-cse-a" }], unplaced: [], score: { total: 0 }, timeMs: 1 };
const DOC = { ...rest, result: RESULT, printHeading: "GNDEC · Semester 5" };
const ROW = { institute_name: "GNDEC", handle: "gndec", timetable_name: "CSE odd sem", saved_at: "2026-10-24T10:42:00Z", data: DOC };

function fakeFetch(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status }));
}

describe("loadPublished", () => {
  it("calls get_published as anon and reads the row", async () => {
    const fetchFn = fakeFetch(200, [ROW]);
    const out = await loadPublished(CONFIG, "k7f3q9xa2m", fetchFn);
    expect(fetchFn).toHaveBeenCalledWith("https://abcd.supabase.co/rest/v1/rpc/get_published", {
      method: "POST",
      headers: { apikey: "anon-key", "Content-Type": "application/json" },
      body: '{"public_id":"k7f3q9xa2m"}',
    });
    expect(out.kind).toBe("ok");
    if (out.kind !== "ok") return;
    expect(out.timetable).toMatchObject({ instituteName: "GNDEC", handle: "gndec", timetableName: "CSE odd sem", printHeading: "GNDEC · Semester 5" });
    expect(out.timetable.data.sections).toEqual(sampleCollege.sections);
    expect(out.timetable.result.placements).toHaveLength(1);
  });

  it("says not published when there is no row", async () => {
    expect(await loadPublished(CONFIG, "k7f3q9xa2m", fakeFetch(200, []))).toEqual({ kind: "notPublished" });
  });

  it("fails without the env vars, on an error status, a network error or a bad body", async () => {
    expect(await loadPublished(null, "k7f3q9xa2m", fakeFetch(200, [ROW]))).toEqual({ kind: "failed" });
    expect(await loadPublished(CONFIG, "k7f3q9xa2m", fakeFetch(500, { message: "boom" }))).toEqual({ kind: "failed" });
    expect(await loadPublished(CONFIG, "k7f3q9xa2m", vi.fn(async () => Promise.reject(new TypeError("offline"))))).toEqual({ kind: "failed" });
    expect(await loadPublished(CONFIG, "k7f3q9xa2m", fakeFetch(200, { not: "rows" }))).toEqual({ kind: "failed" });
    expect(await loadPublished(CONFIG, "k7f3q9xa2m", fakeFetch(200, [{ ...ROW, data: { settings: {} } }]))).toEqual({ kind: "failed" });
    const notJson = vi.fn(async () => new Response("<html>", { status: 200 }));
    expect(await loadPublished(CONFIG, "k7f3q9xa2m", notJson)).toEqual({ kind: "failed" });
  });
});

describe("readRow", () => {
  it("needs every field", () => {
    expect(readRow(ROW)).not.toBeNull();
    for (const key of Object.keys(ROW)) {
      expect(readRow({ ...ROW, [key]: undefined })).toBeNull();
    }
    expect(readRow(null)).toBeNull();
    expect(readRow([ROW])).toBeNull();
  });
});

describe("readDoc", () => {
  it("keeps what the page draws and leaves the rest", () => {
    const doc = readDoc({ ...DOC, step: 3, locks: [] })!;
    expect(Object.keys(doc.data).sort()).toEqual(["courses", "departments", "rooms", "sections", "settings", "teachers"]);
    expect(doc.printHeading).toBe("GNDEC · Semester 5");
  });

  it("fills in what an older or sparser document may lack", () => {
    const { printHeading: _h, ...noHeading } = DOC;
    const doc = readDoc({ ...noHeading, settings: { ...DOC.settings, lunchCandidates: undefined }, result: { placements: [] } })!;
    expect(doc.printHeading).toBe("");
    expect(doc.data.settings.lunchCandidates).toEqual([]);
    expect(doc.result.unplaced).toEqual([]);
  });

  it("refuses a document without a result or with broken lists", () => {
    expect(readDoc({ ...DOC, result: null })).toBeNull();
    expect(readDoc({ ...DOC, result: { placements: "x" } })).toBeNull();
    expect(readDoc({ ...DOC, teachers: undefined })).toBeNull();
    expect(readDoc({ ...DOC, settings: { ...DOC.settings, days: [1, 2] } })).toBeNull();
    expect(readDoc({ ...DOC, settings: { days: ["Mon"] } })).toBeNull();
  });
});

describe("updatedText", () => {
  it("formats the save date in the viewer's time zone", () => {
    expect(updatedText(new Date(2026, 9, 24, 10, 42).toISOString())).toBe("Updated 24 Oct 2026");
    expect(updatedText(new Date(2026, 8, 3, 9).toISOString())).toBe("Updated 3 Sep 2026");
  });

  it("is empty for a time it can't read", () => {
    expect(updatedText("soon")).toBe("");
  });
});
