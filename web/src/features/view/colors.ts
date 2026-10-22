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

/** Distance between two palette colours around the hue wheel, 0–180°. */
export function hueDistance(a: number, b: number): number {
  const d = Math.abs(HUES[a] - HUES[b]) % 360;
  return Math.min(d, 360 - d);
}

/**
 * Palette index per subject (a subject keeps one colour in every section). Subjects are coloured in
 * name order; each takes the colour that no subject sharing a section with it already has and that is
 * farthest around the hue wheel from theirs, so a section's subjects differ as much as the palette
 * allows (no pink next to rose). Ties go to the subject's hashed colour, then the next ones after it,
 * so the result depends only on the data. Past 12 subjects in a section, colours repeat.
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
    const near = [...neighbours.get(subject)!].map((n) => colors.get(n)).filter((i) => i !== undefined);
    const start = hashString(subject) % PALETTE.length;
    let best = start;
    let bestGap = -1;
    for (let k = 0; k < PALETTE.length; k++) {
      const candidate = (start + k) % PALETTE.length;
      // A colour a neighbour already has scores -1, so it is only used once the palette runs out.
      const gap = near.includes(candidate) ? -1 : Math.min(180, ...near.map((n) => hueDistance(candidate, n)));
      if (gap > bestGap) {
        best = candidate;
        bestGap = gap;
      }
    }
    colors.set(subject, best);
  }
  return colors;
}

/** Colour for a subject; unknown subjects fall back to their hash. */
export function subjectColor(colors: Map<string, number>, subject: string): SubjectColor {
  return PALETTE[colors.get(subject) ?? hashString(subject) % PALETTE.length];
}
