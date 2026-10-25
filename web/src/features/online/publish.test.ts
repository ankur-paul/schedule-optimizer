import { describe, expect, it } from "vitest";
import { askAdminText, cleanHandle, handleError, openedMessage, publicUrl, publishState, RESERVED_HANDLES, versionLabel } from "./publish";

describe("handleError", () => {
  it("accepts 3–30 lowercase letters, digits and inner hyphens", () => {
    expect(handleError("gndec")).toBeNull();
    expect(handleError("abc")).toBeNull();
    expect(handleError("a".repeat(30))).toBeNull();
    expect(handleError("gndec-ludhiana-2")).toBeNull();
    expect(handleError("123")).toBeNull();
  });

  it("checks the length after trimming", () => {
    expect(handleError("ab")).toBe("Use 3–30 characters.");
    expect(handleError("a".repeat(31))).toBe("Use 3–30 characters.");
    expect(handleError("  ab  ")).toBe("Use 3–30 characters.");
    expect(handleError("")).toBe("Enter a link name.");
    expect(handleError("   ")).toBe("Enter a link name.");
  });

  it("refuses other characters, inner spaces included", () => {
    for (const bad of ["gn dec", "gn_dec", "gndec.in", "gnd€c", "gn/dec"]) expect(handleError(bad)).toBe("Use only letters, digits and hyphens.");
  });

  it("refuses a leading or trailing hyphen", () => {
    expect(handleError("-gndec")).toBe("Start and end with a letter or digit.");
    expect(handleError("gndec-")).toBe("Start and end with a letter or digit.");
    expect(handleError("---")).toBe("Start and end with a letter or digit.");
  });

  it("refuses reserved words in any case", () => {
    for (const word of RESERVED_HANDLES) expect(handleError(word)).toBe("That name is reserved.");
    expect(handleError(" Privacy ")).toBe("That name is reserved.");
    expect(handleError("help")).toBe("That name is reserved.");
  });

  it("forgives capitals and outer spaces, as the database does", () => {
    expect(handleError("  GNDEC ")).toBeNull();
    expect(cleanHandle("  GNDEC-Ldh ")).toBe("gndec-ldh");
  });
});

describe("publicUrl", () => {
  it("joins the origin, handle and id", () => {
    expect(publicUrl("https://lattice.app", "gndec", "k7f3q9xa2m")).toBe("https://lattice.app/gndec/k7f3q9xa2m");
    expect(publicUrl("http://localhost:5173/", "gndec", "k7f3q9xa2m")).toBe("http://localhost:5173/gndec/k7f3q9xa2m");
  });
});

describe("versionLabel", () => {
  const now = new Date(2026, 9, 25, 9, 0);
  it("shows the number, who and when", () => {
    expect(versionLabel({ version: 7, savedBy: "Meera", savedById: "u2", savedAt: new Date(2026, 9, 24, 10, 42).toISOString() }, now)).toBe("Version 7 · Meera · 24 Oct, 10:42");
  });
  it("shows only the time for today, and leaves out an unknown saver", () => {
    expect(versionLabel({ version: 2, savedBy: null, savedById: null, savedAt: new Date(2026, 9, 25, 8, 5).toISOString() }, now)).toBe("Version 2 · 08:05");
  });
});

describe("openedMessage", () => {
  it("names the version, and how to restore an older one", () => {
    expect(openedMessage("CSE odd", 7, 7, true)).toBe("Opened CSE odd (version 7).");
    expect(openedMessage("CSE odd", 5, 7, true)).toBe("Opened version 5 of CSE odd. Save online to restore it as the newest version.");
    expect(openedMessage("CSE odd", 5, 7, false)).toBe("Opened version 5 of CSE odd.");
  });
});

describe("publishState", () => {
  const ready = { hasResult: true, dirty: false, role: "editor" as const, handle: "gndec", admin: "Meera" };

  it("is ready with a result, no unsaved changes and a handle", () => {
    expect(publishState(ready)).toEqual({ kind: "ready" });
    expect(publishState({ ...ready, role: "admin" })).toEqual({ kind: "ready" });
  });

  it("is disabled without a result, whatever else holds", () => {
    expect(publishState({ ...ready, hasResult: false, dirty: true, handle: null })).toMatchObject({ kind: "noResult" });
  });

  it("asks to save first when there are unsaved changes, the admin before setting the handle", () => {
    expect(publishState({ ...ready, dirty: true })).toEqual({ kind: "dirty" });
    expect(publishState({ ...ready, dirty: true, handle: null, role: "admin" })).toEqual({ kind: "dirty" });
  });

  it("tells an editor without a handle to ask the admin before asking them to save", () => {
    expect(publishState({ ...ready, dirty: true, handle: null })).toMatchObject({ kind: "askAdmin" });
  });

  it("without a handle, the admin sets it and an editor asks the admin", () => {
    expect(publishState({ ...ready, handle: null, role: "admin" })).toEqual({ kind: "needsHandle" });
    expect(publishState({ ...ready, handle: null })).toEqual({ kind: "askAdmin", message: "Ask your admin (Meera) to set the institute's link name." });
    expect(publishState({ ...ready, handle: null, admin: null })).toEqual({ kind: "askAdmin", message: askAdminText(null) });
    expect(askAdminText(null)).toBe("Ask your admin to set the institute's link name.");
  });
});
