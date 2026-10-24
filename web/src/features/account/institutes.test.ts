import { describe, expect, it } from "vitest";
import {
  activeInstitute,
  dbErrorMessage,
  deleteConfirmed,
  inviteError,
  joinedMessage,
  menuItems,
  nameError,
  personLabel,
  promptCreate,
  roleLine,
  showSwitcher,
  sortMembers,
  type Member,
  type Membership,
} from "./institutes";

const gndec: Membership = { instituteId: "i1", name: "GNDEC Ludhiana", role: "admin", handle: null };
const pec: Membership = { instituteId: "i2", name: "PEC Chandigarh", role: "editor", handle: null };
const viewerOnly: Membership = { instituteId: "i3", name: "Thapar", role: "viewer", handle: null };

const meera: Member = { userId: "u1", email: "meera@gndec.ac.in", name: "Dr. Meera Iyer", role: "admin" };
const ankur: Member = { userId: "u2", email: "ankur@gndec.ac.in", name: null, role: "editor" };
const bela: Member = { userId: "u3", email: "bela@gmail.com", name: "Bela Kaur", role: "viewer" };

describe("activeInstitute", () => {
  it("keeps the remembered institute while you're in it", () => {
    expect(activeInstitute([gndec, pec], "i2")).toBe(pec);
  });

  it("falls back to the first membership when the remembered one is gone or unset", () => {
    expect(activeInstitute([gndec, pec], "deleted")).toBe(gndec);
    expect(activeInstitute([pec, gndec], null)).toBe(pec);
  });

  it("is null with no memberships", () => {
    expect(activeInstitute([], "i1")).toBeNull();
  });
});

describe("showSwitcher", () => {
  it("shows only with two or more institutes", () => {
    expect(showSwitcher([])).toBe(false);
    expect(showSwitcher([gndec])).toBe(false);
    expect(showSwitcher([gndec, pec])).toBe(true);
    expect(showSwitcher([gndec, pec, viewerOnly])).toBe(true);
  });
});

describe("menuItems", () => {
  it("gives the admin members, rename, link name and delete, never leave", () => {
    expect(menuItems(gndec)).toEqual(["members", "rename", "handle", "delete", "create"]);
  });

  it("gives editors and viewers leave only, never members", () => {
    for (const m of [pec, viewerOnly]) {
      expect(menuItems(m)).toEqual(["leave", "create"]);
      expect(menuItems(m)).not.toContain("members");
      expect(menuItems(m)).not.toContain("handle");
    }
  });

  it("offers create with no institute", () => {
    expect(menuItems(null)).toEqual(["create"]);
  });
});

describe("roleLine", () => {
  it("names the admin with their email", () => {
    expect(roleLine("editor", meera)).toBe("Editor · admin is Dr. Meera Iyer (meera@gndec.ac.in)");
    expect(roleLine("viewer", meera)).toBe("Viewer · admin is Dr. Meera Iyer (meera@gndec.ac.in)");
  });

  it("uses the email alone for an admin with no name", () => {
    expect(roleLine("editor", { name: null, email: "ankur@gndec.ac.in" })).toBe("Editor · admin is ankur@gndec.ac.in");
    expect(roleLine("editor", { name: "  ", email: "ankur@gndec.ac.in" })).toBe("Editor · admin is ankur@gndec.ac.in");
  });

  it("copes with a name but no email, or no admin found", () => {
    expect(roleLine("viewer", { name: "Meera", email: null })).toBe("Viewer · admin is Meera");
    expect(roleLine("viewer", null)).toBe("Viewer");
  });

  it("tells the admin it's them", () => {
    expect(roleLine("admin", meera)).toBe("Admin · you manage members");
  });
});

describe("personLabel", () => {
  it("is the name, else the email", () => {
    expect(personLabel(meera)).toBe("Dr. Meera Iyer");
    expect(personLabel(ankur)).toBe("ankur@gndec.ac.in");
    expect(personLabel({ name: null, email: null })).toBe("Unknown user");
  });
});

describe("sortMembers", () => {
  it("puts the admin first, then the rest by name or email", () => {
    expect(sortMembers([bela, ankur, meera]).map((m) => m.userId)).toEqual(["u1", "u2", "u3"]);
  });

  it("doesn't change the list it was given", () => {
    const list = [bela, meera];
    sortMembers(list);
    expect(list).toEqual([bela, meera]);
  });
});

describe("inviteError", () => {
  it("accepts a new address", () => {
    expect(inviteError("new@gndec.ac.in", [meera, ankur], [])).toBeNull();
  });

  it("rejects a malformed address", () => {
    for (const email of ["", "meera", "meera@", "meera@gndec", "a b@c.in"]) {
      expect(inviteError(email, [], [])).toBe("That email address isn't valid.");
    }
  });

  it("rejects an existing member's address, whatever the case or spaces", () => {
    expect(inviteError("  Ankur@GNDEC.ac.in ", [meera, ankur], [])).toBe("ankur@gndec.ac.in is already a member.");
    expect(inviteError("meera@gndec.ac.in", [meera], [])).toMatch(/already a member/);
  });

  it("rejects an address that already has an invite", () => {
    expect(inviteError("Pending@Gndec.ac.in", [], [{ email: "pending@gndec.ac.in", role: "viewer" }])).toMatch(/already invited/);
  });

  it("ignores members without an email", () => {
    expect(inviteError("x@y.in", [{ ...ankur, email: null }], [])).toBeNull();
  });
});

describe("nameError", () => {
  it("wants a non-empty trimmed name of at most 120 characters", () => {
    expect(nameError("GNDEC Ludhiana")).toBeNull();
    expect(nameError("   ")).toBe("Enter a name.");
    expect(nameError("")).toBe("Enter a name.");
    expect(nameError("x".repeat(120))).toBeNull();
    expect(nameError(` ${"x".repeat(120)} `)).toBeNull();
    expect(nameError("x".repeat(121))).toMatch(/under 120/);
  });
});

describe("deleteConfirmed", () => {
  it("matches the name exactly once trimmed", () => {
    expect(deleteConfirmed("GNDEC Ludhiana", "GNDEC Ludhiana")).toBe(true);
    expect(deleteConfirmed("  GNDEC Ludhiana ", "GNDEC Ludhiana")).toBe(true);
  });

  it("refuses a different case, a partial name or nothing", () => {
    expect(deleteConfirmed("gndec ludhiana", "GNDEC Ludhiana")).toBe(false);
    expect(deleteConfirmed("GNDEC", "GNDEC Ludhiana")).toBe(false);
    expect(deleteConfirmed("", "GNDEC Ludhiana")).toBe(false);
  });
});

describe("joinedMessage", () => {
  it("says nothing when nothing was joined", () => {
    expect(joinedMessage([])).toBeNull();
  });

  it("names one institute and the role", () => {
    expect(joinedMessage([{ name: "GNDEC Ludhiana", role: "editor" }])).toBe("You joined GNDEC Ludhiana as editor");
  });

  it("lists several", () => {
    expect(joinedMessage([{ name: "GNDEC", role: "editor" }, { name: "PEC", role: "viewer" }])).toBe(
      "You joined GNDEC as editor and PEC as viewer",
    );
    expect(
      joinedMessage([{ name: "A", role: "editor" }, { name: "B", role: "viewer" }, { name: "C", role: "editor" }]),
    ).toBe("You joined A as editor, B as viewer and C as editor");
  });
});

describe("dbErrorMessage", () => {
  it("passes T20's plain-word refusals through", () => {
    expect(dbErrorMessage({ code: "42501", message: "Hand the admin role to another member before leaving." })).toBe(
      "Hand the admin role to another member before leaving.",
    );
  });

  it("turns a row-level security refusal into words", () => {
    expect(dbErrorMessage({ code: "42501", message: 'new row violates row-level security policy for table "invites"' })).toBe(
      "Only the admin can do that.",
    );
    expect(dbErrorMessage({ code: "42501", message: "permission denied for table memberships" })).toBe("Only the admin can do that.");
    expect(dbErrorMessage({ code: "42501" })).toBe("Only the admin can do that.");
  });

  it("never shows raw SQL for other failures", () => {
    expect(dbErrorMessage({ code: "23505", message: 'duplicate key value violates unique constraint "invites_pkey"' })).toBe(
      "That already exists.",
    );
    expect(dbErrorMessage({ code: "23514", message: 'new row violates check constraint "institutes_name_check"' })).toBe(
      "That value isn't allowed.",
    );
    expect(dbErrorMessage({ code: "XX000", message: "internal error at line 3" })).toBe("Something went wrong. Try again.");
    expect(dbErrorMessage({})).toBe("Something went wrong. Try again.");
  });

  it("explains an expired token and a dropped connection", () => {
    expect(dbErrorMessage({ code: "PGRST301", message: "JWT expired" })).toMatch(/Sign in again/);
    expect(dbErrorMessage({ message: "TypeError: Failed to fetch" })).toMatch(/Couldn't reach the server/);
  });
});

describe("promptCreate", () => {
  it("asks only with no institute, no invite just accepted, and no earlier Not now", () => {
    expect(promptCreate([], [], false)).toBe(true);
    expect(promptCreate([gndec], [], false)).toBe(false);
    expect(promptCreate([], [{ name: "GNDEC", role: "editor" }], false)).toBe(false);
    expect(promptCreate([], [], true)).toBe(false);
  });
});
