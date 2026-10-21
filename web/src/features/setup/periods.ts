import type { Period, Settings } from "@/domain/types";

export const ALL_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function toMinutes(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
}

export function fromMinutes(mins: number): string {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Toggle a day on/off, keeping days in Mon–Sun order (unknown day names stay at the end). */
export function toggleDay(days: string[], day: string): string[] {
  const next = days.includes(day) ? days.filter((d) => d !== day) : [...days, day];
  const rank = (d: string) => {
    const i = ALL_DAYS.indexOf(d);
    return i === -1 ? ALL_DAYS.length : i;
  };
  return next.sort((a, b) => rank(a) - rank(b));
}

/**
 * Replace the period list. `periods` carry their *old* ids (use -1 for new rows); ids are
 * renumbered to indexes and lunch candidates follow their period, dropping any that are no
 * longer teaching periods.
 */
export function withPeriods(settings: Settings, periods: Period[]): Settings {
  const oldToNew = new Map<number, number>();
  periods.forEach((p, i) => {
    if (p.id >= 0) oldToNew.set(p.id, i);
  });
  const renumbered = periods.map((p, i) => ({ ...p, id: i }));
  const lunchCandidates = settings.lunchCandidates
    .map((id) => oldToNew.get(id))
    .filter((id): id is number => id !== undefined && renumbered[id].kind === "teaching")
    .sort((a, b) => a - b);
  return { ...settings, periods: renumbered, lunchCandidates };
}

export interface GenerateOptions {
  start: string;      // "09:00"
  lengthMin: number;  // teaching period length
  count: number;      // number of teaching periods
  breakAfter: number; // insert a break after teaching period N (0 = no break)
  breakMin: number;
}

/** The generator form as typed: number fields are kept as text so they can be empty while editing. */
export type GeneratorForm = { [K in keyof GenerateOptions]: string };

/** Text for a whole-number field: the digits before any decimal point, without leading zeros ("020" → "20"). */
export function cleanWholeNumber(text: string): string {
  const digits = /^\d*/.exec(text.trim())?.[0] ?? "";
  return digits.replace(/^0+(?=\d)/, "");
}

/** Generator options from the form, or null if the start time is missing or there are no periods to build. */
export function parseGeneratorForm(f: GeneratorForm): GenerateOptions | null {
  const whole = (text: string) => (/^\d*$/.test(text.trim()) ? Number(text) : NaN); // "" → 0
  const o = { start: f.start, lengthMin: whole(f.lengthMin), count: whole(f.count), breakAfter: whole(f.breakAfter), breakMin: whole(f.breakMin) };
  const ok = !Number.isNaN(toMinutes(o.start)) && o.lengthMin > 0 && o.count > 0 && o.breakAfter >= 0 && o.breakMin >= 0;
  return ok ? o : null;
}

export function generatePeriods(o: GenerateOptions): Period[] {
  const periods: Period[] = [];
  let t = toMinutes(o.start);
  for (let i = 1; i <= o.count; i++) {
    periods.push({ id: periods.length, label: `P${i}`, start: fromMinutes(t), end: fromMinutes(t + o.lengthMin), kind: "teaching" });
    t += o.lengthMin;
    if (i === o.breakAfter && o.breakMin > 0) {
      periods.push({ id: periods.length, label: "Break", start: fromMinutes(t), end: fromMinutes(t + o.breakMin), kind: "break" });
      t += o.breakMin;
    }
  }
  return periods;
}

/** Teaching periods starting between 11:30 and 14:00: a sensible default lunch window. */
export function defaultLunchCandidates(periods: Period[]): number[] {
  return periods
    .filter((p) => p.kind === "teaching" && toMinutes(p.start) >= 11 * 60 + 30 && toMinutes(p.start) < 14 * 60)
    .map((p) => p.id);
}

/** Per-period problem, keyed by period id. */
export function periodErrors(periods: Period[]): Map<number, string> {
  const errors = new Map<number, string>();
  periods.forEach((p, i) => {
    const s = toMinutes(p.start);
    const e = toMinutes(p.end);
    if (!p.label.trim()) errors.set(p.id, "Label is empty");
    else if (Number.isNaN(s) || Number.isNaN(e)) errors.set(p.id, "Start and end time are required");
    else if (e <= s) errors.set(p.id, "End must be after start");
    else if (i > 0 && s < toMinutes(periods[i - 1].end)) errors.set(p.id, `Starts before ${periods[i - 1].label} ends`);
  });
  return errors;
}

/** Whole-settings problems that block moving on. Empty = valid. */
export function settingsErrors(settings: Settings): string[] {
  const errors: string[] = [];
  if (settings.days.length === 0) errors.push("Pick at least one working day.");
  if (!settings.periods.some((p) => p.kind === "teaching")) errors.push("Add at least one teaching period.");
  if (periodErrors(settings.periods).size > 0) errors.push("Fix the highlighted periods.");
  if (settings.lunchCandidates.length === 0) errors.push("Pick at least one lunch candidate period.");
  return errors;
}
