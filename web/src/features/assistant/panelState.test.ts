import { describe, expect, it } from "vitest";
import type { Membership } from "@/features/account/institutes";
import { chooseInstitute, lockReason, panelState, type PanelInput } from "./panelState";

const now = new Date("2026-10-25T12:00:00Z");
const admin: Membership = { instituteId: "a", name: "GNDEC", role: "admin", handle: "gndec" };
const editor: Membership = { instituteId: "b", name: "PEC", role: "editor", handle: null };
const viewer: Membership = { instituteId: "c", name: "Thapar", role: "viewer", handle: null };
const open = { questionsLeft: 143, expiresAt: "2026-11-23T00:00:00Z" };

const input = (over: Partial<PanelInput> = {}): PanelInput => ({
  signedIn: true,
  loaded: true,
  institute: admin,
  access: open,
  blocked: null,
  now,
  ...over,
});

describe("panelState", () => {
  it("is signed out without a session, whatever else is known", () => {
    expect(panelState(input({ signedIn: false, loaded: false, institute: null }))).toEqual({ kind: "signedOut" });
  });

  it("waits for the memberships before saying there is no institute", () => {
    expect(panelState(input({ loaded: false, institute: null }))).toEqual({ kind: "loading" });
  });

  it("asks to create or join an institute when there is none", () => {
    expect(panelState(input({ institute: null }))).toEqual({ kind: "noInstitute" });
  });

  it("waits for the access row", () => {
    expect(panelState(input({ access: undefined }))).toEqual({ kind: "loading" });
  });

  it("is locked without access, with the role deciding who sees the coupon box", () => {
    expect(panelState(input({ access: null }))).toEqual({ kind: "locked", role: "admin", reason: "none" });
    expect(panelState(input({ institute: editor, access: null }))).toEqual({ kind: "locked", role: "editor", reason: "none" });
    expect(panelState(input({ institute: viewer, access: null }))).toEqual({ kind: "locked", role: "viewer", reason: "none" });
  });

  it("is locked when the access has expired or the questions are used up", () => {
    expect(panelState(input({ access: { ...open, expiresAt: "2026-10-25T12:00:00Z" } }))).toMatchObject({ kind: "locked", reason: "expired" });
    expect(panelState(input({ access: { ...open, questionsLeft: 0 } }))).toMatchObject({ kind: "locked", reason: "usedUp" });
  });

  it("is open with questions left before the expiry", () => {
    expect(panelState(input())).toEqual({ kind: "open" });
  });

  it("shows the monthly pause over the chat, but a lock wins over it", () => {
    expect(panelState(input({ blocked: "paused" }))).toEqual({ kind: "paused" });
    expect(panelState(input({ blocked: "paused", access: null }))).toMatchObject({ kind: "locked" });
  });

  it("shows not configured once an institute is known, before the access loads", () => {
    expect(panelState(input({ blocked: "notConfigured", access: undefined }))).toEqual({ kind: "notConfigured" });
    expect(panelState(input({ blocked: "notConfigured", institute: null }))).toEqual({ kind: "noInstitute" });
  });
});

describe("lockReason", () => {
  it("says none, expired, used up or null", () => {
    expect(lockReason(null, now)).toBe("none");
    expect(lockReason({ questionsLeft: 5, expiresAt: "2026-10-25T11:59:59Z" }, now)).toBe("expired");
    expect(lockReason({ questionsLeft: 0, expiresAt: "2026-12-01T00:00:00Z" }, now)).toBe("usedUp");
    expect(lockReason(open, now)).toBeNull();
  });

  it("calls an expired, used-up access expired", () => {
    expect(lockReason({ questionsLeft: 0, expiresAt: "2026-10-01T00:00:00Z" }, now)).toBe("expired");
  });
});

describe("chooseInstitute", () => {
  const all = [admin, editor, viewer];

  it("uses the linked institute and hides the picker", () => {
    expect(chooseInstitute(all, "b", "a", "c")).toEqual({ institute: editor, picker: false });
  });

  it("ignores a linked institute you're not a member of", () => {
    expect(chooseInstitute(all, "gone", null, "c")).toEqual({ institute: viewer, picker: true });
  });

  it("prefers the panel's pick over the active institute when not linked", () => {
    expect(chooseInstitute(all, null, "b", "c")).toEqual({ institute: editor, picker: true });
  });

  it("falls back to the active institute, then the first, when the pick is gone", () => {
    expect(chooseInstitute(all, null, "gone", "c").institute).toBe(viewer);
    expect(chooseInstitute(all, null, null, null).institute).toBe(admin);
  });

  it("hides the picker with one membership", () => {
    expect(chooseInstitute([editor], null, null, null)).toEqual({ institute: editor, picker: false });
  });

  it("has no institute without memberships", () => {
    expect(chooseInstitute([], "a", "a", "a")).toEqual({ institute: null, picker: false });
  });
});
