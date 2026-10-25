// web/public/_redirects (T50), read the way Cloudflare Pages reads it: top to bottom, the first matching rule only,
// applied even where a file exists; `:name` is one path segment, `*` the rest. Checked live in T51.
import { describe, expect, it } from "vitest";
import { HELP_PAGES } from "../help/helpText";
import { isPublishedRewrite } from "../published/path";
import redirectsFile from "../../public/_redirects?raw";

interface Rule {
  from: string;
  to: string;
  status: number;
}

function parse(text: string): Rule[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const [from, to, status] = line.split(/\s+/);
      return { from, to, status: Number(status ?? 302) };
    });
}

/** Where Pages sends `pathname`: the first rule's target with its placeholders filled, or null if none matches. */
function apply(rules: Rule[], pathname: string): { to: string; status: number } | null {
  for (const rule of rules) {
    const names: string[] = [];
    const pattern = rule.from
      .split("/")
      .map((part) => {
        if (part === "*") return names.push("splat"), "(.*)";
        if (part.startsWith(":")) return names.push(part.slice(1)), "([^/]+)";
        return part.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
      })
      .join("/");
    const match = new RegExp(`^${pattern}$`).exec(pathname);
    if (!match) continue;
    let to = rule.to;
    names.forEach((name, i) => (to = to.replace(`:${name}`, match[i + 1])));
    return { to, status: rule.status };
  }
  return null;
}

const rules = parse(redirectsFile);

/** What Pages serves for `pathname`: the rewritten path, or `pathname` itself. */
function served(pathname: string): string {
  const hit = apply(rules, pathname);
  expect(hit?.status ?? 200, pathname).toBe(200);
  return hit?.to ?? pathname;
}

describe("_redirects", () => {
  it("only rewrites (200); nothing redirects the browser", () => {
    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) expect(rule.status, rule.from).toBe(200);
  });

  it("serves the public timetable page for /<handle>/<id>", () => {
    expect(served("/acme/abc123")).toBe("/published");
    expect(served("/gndec/k7f3q9xa2m")).toBe("/published");
    expect(served("/GNDEC/K7F3Q9XA2M")).toBe("/published");
  });

  it("leaves the build's own files and pages alone", () => {
    for (const p of [
      "/",
      "/privacy",
      "/terms",
      "/help",
      "/help/start",
      "/help/data-checks.png",
      "/assets/index-AbC123.js",
      "/assets/fonts/geist.woff2",
      "/favicon.svg",
      "/version.txt",
      "/published",
    ]) {
      expect(served(p), p).toBe(p);
    }
  });

  it("leaves every help page alone", () => {
    for (const page of HELP_PAGES.filter((p) => p !== "index")) {
      expect(served(`/help/${page}`)).toBe(`/help/${page}`);
    }
  });

  it("agrees with the dev and preview servers (isPublishedRewrite)", () => {
    for (const p of [
      "/acme/abc123",
      "/a-b/1",
      "/help/start",
      "/assets/x.js",
      "/privacy",
      "/one/two/three",
      "/",
    ]) {
      expect(served(p) === "/published", p).toBe(isPublishedRewrite(p));
    }
  });
});
