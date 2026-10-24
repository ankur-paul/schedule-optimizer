// Takes the help screenshots listed in scripts/help-shots.config.ts and saves them to web/public/help/ (T33).
//   cd web && npm run help:shots              every shot
//   cd web && npm run help:shots -- print-panel   only the named ones
// It builds the app, serves it with `vite preview` and opens it in Chromium with the sample college and the fixed
// timetable (shared/fixtures/sample-timetable.json) in localStorage. No solver and no real Supabase: `/health` and
// Supabase (help-shots.supabase.ts, for signed-in shots) are answered here, and every other outside request is
// blocked. A PNG is only rewritten when its bytes change.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { chromium, type BrowserContext, type Locator, type Page } from "playwright";
import { build, preview, type PreviewServer } from "vite";
import type { SolveResult } from "../src/domain/types";
import { toDoc } from "../src/features/online/online";
import { SHOTS, type Action, type Shot, type Target } from "./help-shots.config";
import { captureTargets, DEFAULT_PADDING, MAX_PNG_BYTES, persistedState, shotData, shotProblems, unionClip } from "./help-shots.lib";
import { answer, SESSION_KEY, storedSession, SUPABASE_ANON_KEY, SUPABASE_URL } from "./help-shots.supabase";

const web = resolve(import.meta.dirname, "..");
const outDir = resolve(web, "public/help");
const buildDir = resolve(web, "node_modules/.cache/help-shots");
const timetable = JSON.parse(readFileSync(resolve(web, "../shared/fixtures/sample-timetable.json"), "utf8")) as SolveResult;

const VIEWPORT = { width: 1280, height: 800 };
/** A Monday morning, for anything on screen that shows the date or time. */
const NOW = new Date("2026-10-26T10:00:00+05:30");
const SOLVER_URL = "https://solver.help-shots.invalid";
const STORE_KEY = "timetable-v1";
/**
 * The address the page sees. Its requests are passed to the preview server, whose port changes each run, so public
 * links on screen read the same every time.
 */
const SITE = "https://lattice.example";
/** The pretend Supabase is on another origin, so its answers need these to reach the page. */
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET, POST, PATCH, DELETE" };
const NO_MOTION = "*, *::before, *::after { transition: none !important; animation: none !important; caret-color: transparent !important; }";

async function main() {
  const problems = shotProblems(SHOTS, timetable);
  if (problems.length > 0) throw new Error(problems.join("\n"));
  const wanted = process.argv.slice(2);
  const unknown = wanted.filter((name) => !SHOTS.some((s) => s.name === name));
  if (unknown.length > 0) throw new Error(`No shot named ${unknown.join(", ")}`);
  const shots = wanted.length > 0 ? SHOTS.filter((s) => wanted.includes(s.name)) : SHOTS;

  // These win over web/.env.local, so the app talks only to the pretend solver and Supabase answered in `take`.
  Object.assign(process.env, { VITE_SUPABASE_URL: SUPABASE_URL, VITE_SUPABASE_ANON_KEY: SUPABASE_ANON_KEY, VITE_SOLVER_URL: SOLVER_URL });
  console.log("Building the app…");
  await build({ root: web, logLevel: "warn", build: { outDir: buildDir, emptyOutDir: true } });

  let server: PreviewServer | undefined;
  const browser = await chromium.launch();
  try {
    server = await preview({ root: web, logLevel: "warn", build: { outDir: buildDir }, preview: { host: "127.0.0.1", port: await freePort(), strictPort: true, open: false } });
    const origin = new URL(server.resolvedUrls!.local[0]).origin;
    mkdirSync(outDir, { recursive: true });
    for (const shot of shots) {
      const context = await browser.newContext({
        viewport: VIEWPORT,
        deviceScaleFactor: 2,
        colorScheme: "light",
        reducedMotion: "reduce",
        locale: "en-GB",
        timezoneId: "Asia/Kolkata",
      });
      try {
        report(shot, await take(context, origin, shot));
      } finally {
        await context.close();
      }
    }
    const listed = new Set(SHOTS.map((s) => `${s.name}.png`));
    for (const file of readdirSync(outDir)) if (file.endsWith(".png") && !listed.has(file)) console.warn(`  ! ${file} is not in the shot list`);
  } finally {
    await browser.close();
    await server?.close();
  }
}

async function take(context: BrowserContext, origin: string, shot: Shot): Promise<Buffer> {
  await context.route("**/*", async (route) => {
    const url = route.request().url();
    if (url.startsWith(SITE)) return route.fulfill({ response: await route.fetch({ url: origin + url.slice(SITE.length) }) });
    if (url === `${SOLVER_URL}/health`) {
      return shot.solver === "online" ? route.fulfill({ json: { ok: true } }) : route.abort("connectionrefused");
    }
    if (url.startsWith(SUPABASE_URL)) {
      const request = route.request();
      if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
      const { status, json } = answer({ method: request.method(), url, body: request.postDataJSON() }, toDoc(shotData(shot, timetable)));
      return route.fulfill({ status, json, headers: CORS });
    }
    return route.abort("blockedbyclient");
  });
  const stored: [string, string][] = [[STORE_KEY, persistedState(shot, timetable)]];
  if (shot.signedIn) stored.push([SESSION_KEY, storedSession(shot.signedIn.as, NOW)]);
  await context.addInitScript((items) => items.forEach(([key, value]) => localStorage.setItem(key, value)), stored);
  const page = await context.newPage();
  await page.clock.setFixedTime(NOW);
  await page.goto(SITE);
  await page.addStyleTag({ content: NO_MOTION });
  await page.evaluate(() => document.fonts.ready);
  if (shot.step === 2) await page.getByText(`Exact solver: ${shot.solver}`).waitFor();
  for (const action of shot.actions ?? []) await act(page, action);

  const targets = captureTargets(shot).map((t) => locate(page, t));
  await targets[0].scrollIntoViewIfNeeded();
  const boxes = await Promise.all(targets.map(async (t) => (await t.boundingBox())!));
  const clip = unionClip(boxes, shot.padding ?? DEFAULT_PADDING, VIEWPORT, shot.maxHeight);
  const cut = boxes.some((b) => b.y < 0 || Math.min(b.y + b.height, clip.y + clip.height) > VIEWPORT.height);
  if (cut) console.warn(`  ! ${shot.name}: the area is taller than the ${VIEWPORT.height}px viewport and is cut off`);
  return page.screenshot({ clip, animations: "disabled", caret: "hide" });
}

async function act(page: Page, action: Action) {
  if ("click" in action) await locate(page, action.click).click();
  else if ("hover" in action) await locate(page, action.hover).hover();
  else if ("fill" in action) await locate(page, action.fill).fill(action.value);
  else await locate(page, action.waitFor).waitFor();
}

/** Exactly one element: Playwright's strict mode throws if a target matches more. */
function locate(page: Page, target: Target): Locator {
  if ("role" in target) return page.getByRole(target.role, { name: target.name, exact: true });
  if ("text" in target) return page.getByText(target.text, { exact: true });
  return page.locator(target.css, target.hasText ? { hasText: target.hasText } : undefined);
}

function report(shot: Shot, png: Buffer) {
  const file = resolve(outDir, `${shot.name}.png`);
  const old = existsSync(file) ? readFileSync(file) : null;
  const state = old === null ? "new" : old.equals(png) ? "unchanged" : "updated";
  if (state !== "unchanged") writeFileSync(file, png);
  const kb = Math.round(png.length / 1024);
  console.log(`  ${shot.name}.png  ${kb} KB  ${state}`);
  if (png.length > MAX_PNG_BYTES) console.warn(`  ! ${shot.name}.png is over ${MAX_PNG_BYTES / 1024} KB: capture a smaller area`);
}

function freePort(): Promise<number> {
  return new Promise((done, fail) => {
    const probe = createServer();
    probe.once("error", fail);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => done(port));
    });
  });
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
