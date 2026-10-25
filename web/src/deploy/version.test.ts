import { describe, expect, it } from "vitest";
import { buildCommit } from "./version";

const SHA = "2492ae3f0c1d2e3f4a5b6c7d8e9f00112233445";

describe("buildCommit", () => {
  it("takes the commit Pages builds", () => {
    expect(buildCommit({ CF_PAGES_COMMIT_SHA: SHA }, () => "other")).toBe(SHA);
  });

  it("falls back to git's HEAD, without its newline", () => {
    expect(buildCommit({}, () => `${SHA}\n`)).toBe(SHA);
    expect(buildCommit({ CF_PAGES_COMMIT_SHA: "  " }, () => SHA)).toBe(SHA);
  });

  it("says unknown when git fails or prints nothing", () => {
    expect(
      buildCommit({}, () => {
        throw new Error("not a git repository");
      }),
    ).toBe("unknown");
    expect(buildCommit({}, () => "")).toBe("unknown");
    expect(buildCommit({}, () => undefined)).toBe("unknown");
  });
});
