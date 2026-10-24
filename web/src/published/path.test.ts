import { describe, expect, it } from "vitest";
import { isPublishedRewrite, parsePublishedPath, publishedPath } from "./path";

describe("parsePublishedPath", () => {
  it("reads the handle and the id", () => {
    expect(parsePublishedPath("/gndec/k7f3q9xa2m")).toEqual({ handle: "gndec", publicId: "k7f3q9xa2m" });
    expect(parsePublishedPath("/cse-dept-2/0123456789")).toEqual({ handle: "cse-dept-2", publicId: "0123456789" });
  });

  it("forgives extra slashes, a query, a hash and capitals", () => {
    expect(parsePublishedPath("//gndec//k7f3q9xa2m/")).toEqual({ handle: "gndec", publicId: "k7f3q9xa2m" });
    expect(parsePublishedPath("/gndec/k7f3q9xa2m?from=whatsapp#top")).toEqual({ handle: "gndec", publicId: "k7f3q9xa2m" });
    expect(parsePublishedPath("/GNDEC/K7F3Q9XA2M")).toEqual({ handle: "gndec", publicId: "k7f3q9xa2m" });
  });

  it("needs exactly two segments", () => {
    expect(parsePublishedPath("/")).toBeNull();
    expect(parsePublishedPath("")).toBeNull();
    expect(parsePublishedPath("/gndec")).toBeNull();
    expect(parsePublishedPath("/gndec/k7f3q9xa2m/extra")).toBeNull();
  });

  it("refuses bad characters and wrong lengths", () => {
    expect(parsePublishedPath("/gn_dec/k7f3q9xa2m")).toBeNull();
    expect(parsePublishedPath("/gndec/k7f3q9xa2!")).toBeNull();
    expect(parsePublishedPath("/gndec/k7f3q9xa2")).toBeNull(); // 9 characters
    expect(parsePublishedPath("/gndec/k7f3q9xa2mm")).toBeNull(); // 11
    expect(parsePublishedPath("/gn/k7f3q9xa2m")).toBeNull(); // handle under 3
    expect(parsePublishedPath("/-gndec/k7f3q9xa2m")).toBeNull();
    expect(parsePublishedPath("/gndec-/k7f3q9xa2m")).toBeNull();
    expect(parsePublishedPath(`/${"a".repeat(31)}/k7f3q9xa2m`)).toBeNull();
    expect(parsePublishedPath("/gndec/k7f3%20q9xa")).toBeNull();
  });
});

describe("publishedPath", () => {
  it("builds the link's path", () => {
    expect(publishedPath("gndec", "k7f3q9xa2m")).toBe("/gndec/k7f3q9xa2m");
  });
});

describe("isPublishedRewrite", () => {
  it("rewrites a public link, with or without a query or trailing slash", () => {
    expect(isPublishedRewrite("/gndec/k7f3q9xa2m")).toBe(true);
    expect(isPublishedRewrite("/gndec/k7f3q9xa2m/")).toBe(true);
    expect(isPublishedRewrite("/gndec/k7f3q9xa2m?x=1")).toBe(true);
  });

  it("rewrites a mistyped id too, so the page can say it isn't published", () => {
    expect(isPublishedRewrite("/gndec/oops")).toBe(true);
  });

  it("leaves files, the app, the legal pages and Vite's own paths alone", () => {
    expect(isPublishedRewrite("/")).toBe(false);
    expect(isPublishedRewrite("/privacy")).toBe(false);
    expect(isPublishedRewrite("/terms")).toBe(false);
    expect(isPublishedRewrite("/published.html")).toBe(false);
    expect(isPublishedRewrite("/favicon.svg")).toBe(false);
    expect(isPublishedRewrite("/assets/x.js")).toBe(false);
    expect(isPublishedRewrite("/assets/index")).toBe(false);
    expect(isPublishedRewrite("/src/main.tsx")).toBe(false);
    expect(isPublishedRewrite("/src/published")).toBe(false);
    expect(isPublishedRewrite("/node_modules/vite")).toBe(false);
    expect(isPublishedRewrite("/@vite/client")).toBe(false);
    expect(isPublishedRewrite("/@fs/home/x.ts")).toBe(false);
    expect(isPublishedRewrite("/a/b/c")).toBe(false);
  });

  it("leaves the help pages alone", () => {
    expect(isPublishedRewrite("/help")).toBe(false);
    expect(isPublishedRewrite("/help/data")).toBe(false);
    expect(isPublishedRewrite("/help/troubleshooting#solver-offline")).toBe(false);
    expect(isPublishedRewrite("/Help/data")).toBe(false);
    expect(isPublishedRewrite("/help/data.html")).toBe(false);
  });
});
