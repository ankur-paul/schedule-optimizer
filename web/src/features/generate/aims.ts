import { fillSoftRules, RULE_SWITCH } from "@/domain/score";
import { SCORE_ROWS } from "@/domain/stats";
import type { SoftRules } from "@/domain/types";

// Step ③'s "What to aim for" switches (T54), in a popover by the Generate button: one switch per soft rule, phrased as an aim. The S-IDs stay out of the UI.

export interface Aim {
  key: keyof SoftRules;
  /** The switch's text, e.g. "Finish each day as early as possible". */
  label: string;
  /** The ⓘ text: the penalty, and the rule's name in the score. */
  tip: string;
}

const AIM_LABELS: Record<keyof SoftRules, string> = {
  s1: "Spread each subject across the week",
  s2: "At most 3 periods in a row for a teacher",
  s3: "No free periods between a section's classes",
  s4: "Keep a section's batches busy at the same time",
  s5: "Finish each day as early as possible",
};

const rowFor = (key: keyof SoftRules) => SCORE_ROWS.find((r) => RULE_SWITCH[r.key] === key)!;

/** The five aims in S1–S5 order. */
export const AIMS: Aim[] = (Object.keys(AIM_LABELS) as (keyof SoftRules)[]).map((key) => {
  const row = rowFor(key);
  return { key, label: AIM_LABELS[key], tip: `${row.tip} In the score: ${row.label}.` };
});

/** The aim's text for a switch, e.g. s5 → "Finish each day as early as possible". */
export const aimLabel = (key: keyof SoftRules) => AIM_LABELS[key];

/** The score breakdown name for a switch, e.g. s5 → "Late finish". */
export const scoreName = (key: keyof SoftRules) => rowFor(key).label;

/** The card's rows: each aim with its switch. */
export function aimRows(softRules: Partial<SoftRules>): (Aim & { on: boolean })[] {
  const on = fillSoftRules(softRules);
  return AIMS.map((a) => ({ ...a, on: on[a.key] }));
}

/** The Aims button's text in step ③: how many aims are on. */
export function aimsButtonLabel(softRules: Partial<SoftRules>): string {
  const n = AIMS.filter((a) => fillSoftRules(softRules)[a.key]).length;
  if (n === AIMS.length) return `Aims: all ${n}`;
  if (n === 0) return "Aims: none";
  return `Aims: ${n} of ${AIMS.length}`;
}

/** The aims popover's description: how many aims are on. */
export function aimsSummary(softRules: Partial<SoftRules>): string {
  const n = AIMS.filter((a) => fillSoftRules(softRules)[a.key]).length;
  if (n === AIMS.length) return "All five count towards the score, and Generate tries to keep them.";
  if (n === 0) return "None count: Generate only follows the hard rules.";
  return `${n} of ${AIMS.length} count towards the score, and Generate tries to keep them.`;
}

export const sameRules = (a: Partial<SoftRules>, b: Partial<SoftRules>) => {
  const [x, y] = [fillSoftRules(a), fillSoftRules(b)];
  return AIMS.every(({ key }) => x[key] === y[key]);
};

/** Show "Preferences changed: regenerate to use them": there is a timetable and the switches differ from its run's. */
export function preferencesChanged(baseline: SoftRules | null, softRules: SoftRules, hasResult: boolean): boolean {
  return hasResult && baseline !== null && !sameRules(baseline, softRules);
}

export const PREFERENCES_CHANGED = "Preferences changed: regenerate to use them.";
