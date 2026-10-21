import type { Course } from "@/domain/types";

export interface SubjectColor {
  bg: string;
  border: string;
  fg: string;
}

/** 12 soft hues, spread around the wheel so neighbours in the list look different. */
const HUES = [210, 145, 30, 280, 0, 175, 50, 330, 100, 240, 15, 190];

export const PALETTE: SubjectColor[] = HUES.map((h) => ({
  bg: `hsl(${h} 85% 93%)`,
  border: `hsl(${h} 55% 70%)`,
  fg: `hsl(${h} 60% 22%)`,
}));

/** djb2 string hash, non-negative. Stable across runs and browsers. */
export function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

/**
 * Palette index per subject. Each subject starts at its hashed colour; if another subject of the same
 * section already has it, the next free colour is used, so one section's subjects differ while it has
 * ≤ 12 subjects. Subjects are coloured in name order, so the result depends only on the data.
 */
export function buildSubjectColors(courses: Pick<Course, "sectionId" | "subject">[]): Map<string, number> {
  const neighbours = new Map<string, Set<string>>();
  const bySection = new Map<string, Set<string>>();
  for (const c of courses) {
    if (!bySection.has(c.sectionId)) bySection.set(c.sectionId, new Set());
    bySection.get(c.sectionId)!.add(c.subject);
  }
  for (const subjects of bySection.values()) {
    for (const s of subjects) {
      if (!neighbours.has(s)) neighbours.set(s, new Set());
      for (const t of subjects) if (t !== s) neighbours.get(s)!.add(t);
    }
  }

  const colors = new Map<string, number>();
  for (const subject of [...neighbours.keys()].sort()) {
    const taken = new Set([...neighbours.get(subject)!].map((n) => colors.get(n)));
    const start = hashString(subject) % PALETTE.length;
    let index = start;
    for (let k = 0; k < PALETTE.length; k++) {
      const candidate = (start + k) % PALETTE.length;
      if (!taken.has(candidate)) {
        index = candidate;
        break;
      }
    }
    colors.set(subject, index);
  }
  return colors;
}

/** Colour for a subject; unknown subjects fall back to their hash. */
export function subjectColor(colors: Map<string, number>, subject: string): SubjectColor {
  return PALETTE[colors.get(subject) ?? hashString(subject) % PALETTE.length];
}
