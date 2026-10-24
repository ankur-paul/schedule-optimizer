// The help screenshots (T33): one entry per PNG in web/public/help/. `npm run help:shots` takes them all.
// To add one: give it a unique name, a starting state, the steps to get there and what to capture.
import type { Id } from "../src/domain/types";
import type { Step } from "../src/store/useAppStore";

/**
 * What the app holds when the page opens: the sample college with no timetable (`sample`), or with the fixed
 * timetable from shared/fixtures/sample-timetable.json (`timetable`).
 */
export type StartState = "sample" | "timetable";
export const START_STATES: StartState[] = ["sample", "timetable"];

/** An element on the page: by role and accessible name, by its visible text, or by CSS (optionally containing text). */
export type Target = { role: "button" | "tab" | "heading" | "dialog" | "link"; name: string } | { text: string } | { css: string; hasText?: string };

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
];
