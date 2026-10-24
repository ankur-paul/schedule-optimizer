import { describe, expect, it } from "vitest";
import { changesSince, gateDecision, gateTitle, highestVersion, parsePendingConsent, pendingConsentValue } from "./consent";

describe("gateDecision", () => {
  it("lets through a user who accepted the current version", () => {
    expect(gateDecision(2, null, 2)).toBe("ok");
  });

  it("lets through a user who accepted a newer version (an older build of the app)", () => {
    expect(gateDecision(3, null, 2)).toBe("ok");
  });

  it("ignores a pending tick once the current version is on record", () => {
    expect(gateDecision(2, 1, 2)).toBe("ok");
  });

  it("records a tick for the current version", () => {
    expect(gateDecision(null, 2, 2)).toBe("record");
    expect(gateDecision(1, 2, 2)).toBe("record");
  });

  it("asks a user who never accepted and ticked nothing here (e.g. an email link on another device)", () => {
    expect(gateDecision(null, null, 1)).toBe("ask");
  });

  it("asks a user who accepted an older version", () => {
    expect(gateDecision(1, null, 2)).toBe("ask");
  });

  it("asks when the pending tick is for another version", () => {
    expect(gateDecision(null, 1, 2)).toBe("ask");
    expect(gateDecision(1, 1, 2)).toBe("ask");
    expect(gateDecision(null, 3, 2)).toBe("ask");
  });
});

describe("gateTitle", () => {
  it("is a first acceptance when nothing was accepted", () => {
    expect(gateTitle(null)).toBe("Before you continue");
  });

  it("is an update when an older version was accepted", () => {
    expect(gateTitle(1)).toBe("We've updated our Terms and Privacy Policy");
  });
});

describe("changesSince", () => {
  const changes = { 1: ["First version."], 2: ["Names the AI provider."], 3: ["Adds payments.", "New refund terms."] };

  it("lists every version skipped since the last acceptance, in order", () => {
    expect(changesSince(1, 3, changes)).toEqual(["Names the AI provider.", "Adds payments.", "New refund terms."]);
  });

  it("lists just the newest version's lines after one bump", () => {
    expect(changesSince(2, 3, changes)).toEqual(["Adds payments.", "New refund terms."]);
  });

  it("lists nothing for a first acceptance", () => {
    expect(changesSince(null, 3, changes)).toEqual([]);
  });

  it("lists nothing when already up to date", () => {
    expect(changesSince(3, 3, changes)).toEqual([]);
  });

  it("skips a version with no entry", () => {
    expect(changesSince(1, 3, { 3: ["Only this."] })).toEqual(["Only this."]);
  });
});

describe("parsePendingConsent", () => {
  it("reads what the sign-in dialog stores", () => {
    expect(parsePendingConsent(pendingConsentValue(2))).toBe(2);
  });

  it("is null when nothing is stored", () => {
    expect(parsePendingConsent(null)).toBeNull();
    expect(parsePendingConsent("")).toBeNull();
  });

  it("is null for something that isn't JSON", () => {
    expect(parsePendingConsent("{version: 1")).toBeNull();
    expect(parsePendingConsent("yes")).toBeNull();
  });

  it("is null for the wrong shape", () => {
    expect(parsePendingConsent("1")).toBeNull();
    expect(parsePendingConsent("null")).toBeNull();
    expect(parsePendingConsent("[1]")).toBeNull();
    expect(parsePendingConsent("{}")).toBeNull();
    expect(parsePendingConsent('{"version":"1"}')).toBeNull();
    expect(parsePendingConsent('{"version":1.5}')).toBeNull();
    expect(parsePendingConsent('{"version":0}')).toBeNull();
    expect(parsePendingConsent('{"version":-1}')).toBeNull();
  });
});

describe("highestVersion", () => {
  it("is null with no rows", () => {
    expect(highestVersion([])).toBeNull();
  });

  it("is the largest version whatever the order", () => {
    expect(highestVersion([{ version: 2 }, { version: 3 }, { version: 1 }])).toBe(3);
  });
});
