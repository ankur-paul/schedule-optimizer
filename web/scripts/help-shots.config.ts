// The help screenshots (T33): one entry per PNG in web/public/help/. `npm run help:shots` takes them all.
// To add one: give it a unique name, a starting state, the steps to get there and what to capture.
import type { Id } from "../src/domain/types";
import type { Role } from "../src/features/account/institutes";
import type { Step } from "../src/store/useAppStore";

/**
 * What the app holds when the page opens: the sample college with no timetable (`sample`), or with the fixed
 * timetable from shared/fixtures/sample-timetable.json (`timetable`).
 */
export type StartState = "sample" | "timetable";
export const START_STATES: StartState[] = ["sample", "timetable"];

/** An element on the page: by role and accessible name, by its visible text, or by CSS (optionally containing text). */
export type Target = { role: "button" | "tab" | "heading" | "dialog" | "link" | "menuitem"; name: string } | { text: string } | { css: string; hasText?: string };

export type Action = { click: Target } | { hover: Target } | { fill: Target; value: string } | { waitFor: Target };

export interface Shot {
  /** File name without `.png`: lower-case words joined by dashes. */
  name: string;
  start: StartState;
  /** The step the app opens on: 0 Setup, 1 Data, 2 Generate, 3 View. */
  step: Step;
  /** What `/health` answers, so the solver badge and banner are the same on every run. */
  solver: "online" | "offline";
  /** Sessions to lock, at their place in the fixed timetable (`timetable` start only). */
  locks?: Id[];
  printHeading?: string;
  /**
   * Signed in as the member with this role of the pretend institute in help-shots.supabase.ts, optionally with the
   * working copy linked to its saved timetable (`latest`, or `behind` a newer save so *Save online* conflicts).
   * Without it the app runs signed out.
   */
  signedIn?: { as: Role; online?: "latest" | "behind" };
  actions?: Action[];
  /** The element to capture, or several: the image then covers all of them. */
  capture: Target | Target[];
  /** Space around the captured area, in CSS pixels (default 8). */
  padding?: number;
  /** Keep only the top of the captured area, in CSS pixels, when the whole of it would make too big an image. */
  maxHeight?: number;
}

export const SHOTS: Shot[] = [
  {
    name: "data-entry-cards",
    start: "sample",
    step: 1,
    solver: "online",
    capture: [
      { css: '[data-slot="card"]', hasText: "Load sample college" },
      { css: '[data-slot="card"]', hasText: "Upload your file" },
    ],
  },
  {
    name: "data-checks",
    start: "sample",
    step: 1,
    solver: "online",
    capture: { css: '[data-slot="card"]', hasText: "Busiest sections" },
  },
  {
    name: "generate-card",
    start: "sample",
    step: 2,
    solver: "online",
    capture: { css: '[data-slot="card"]', hasText: "Generate timetable" },
  },
  {
    name: "timetable-ready",
    start: "timetable",
    step: 2,
    solver: "online",
    capture: { css: '[data-slot="card"]', hasText: "Timetable ready" },
  },
  {
    name: "grid-locked-class",
    start: "timetable",
    step: 3,
    solver: "online",
    locks: ["cse-a-dbms:L1"],
    capture: { css: "section", hasText: "CSE A — Timetable" },
    maxHeight: 322,
  },
  {
    name: "print-panel",
    start: "timetable",
    step: 3,
    solver: "online",
    printHeading: "GNDEC Ludhiana · Semester 5, 2026",
    actions: [{ click: { role: "button", name: "Print" } }, { waitFor: { text: "Heading on printouts" } }],
    capture: [{ role: "button", name: "Print" }, { css: '[role="dialog"]', hasText: "Heading on printouts" }],
  },
  {
    name: "account-menu",
    start: "timetable",
    step: 3,
    solver: "online",
    signedIn: { as: "editor" },
    actions: [{ click: { role: "button", name: "Account: Rahul Verma" } }, { waitFor: { text: "Leave institute…" } }],
    capture: [{ role: "button", name: "Account: Rahul Verma" }, { css: '[role="menu"]' }],
  },
  {
    name: "members-dialog",
    start: "timetable",
    step: 3,
    solver: "online",
    signedIn: { as: "admin" },
    actions: [
      { click: { role: "button", name: "Account: Dr. Meera Iyer" } },
      { click: { role: "menuitem", name: "Members…" } },
      { waitFor: { text: "jaspreet@gndec.ac.in" } },
    ],
    capture: { css: '[role="dialog"]', hasText: "Members of GNDEC Ludhiana" },
  },
  {
    name: "online-menu",
    start: "timetable",
    step: 3,
    solver: "online",
    signedIn: { as: "editor", online: "latest" },
    actions: [{ click: { css: '[aria-label^="Online:"]' } }, { waitFor: { text: "Open from GNDEC Ludhiana…" } }],
    capture: [{ css: '[aria-label^="Online:"]' }, { css: '[role="menu"]' }],
  },
  {
    name: "online-versions",
    start: "timetable",
    step: 3,
    solver: "online",
    signedIn: { as: "editor", online: "latest" },
    actions: [
      { click: { css: '[aria-label^="Online:"]' } },
      { click: { role: "menuitem", name: "Versions…" } },
      { waitFor: { text: "Version 1 · Dr. Meera Iyer · 20 Oct, 11:05" } },
    ],
    capture: { css: '[role="dialog"]', hasText: "Versions of CSE odd sem 2026" },
  },
  {
    name: "online-conflict",
    start: "timetable",
    step: 3,
    solver: "online",
    signedIn: { as: "editor", online: "behind" },
    actions: [{ click: { css: '[aria-label^="Online:"]' } }, { click: { role: "menuitem", name: "Save online" } }, { waitFor: { text: "Overwrite" } }],
    capture: { css: '[role="dialog"]', hasText: "changed online" },
  },
];
