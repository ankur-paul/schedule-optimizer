import { teacherCodes } from "@/domain/teacherCodes";
import type { Teacher } from "@/domain/types";

// Text to and from the model with teacher names and ids swapped for their codes (`@/domain/teacherCodes`).

// A whole word or token: not touching a letter, digit or underscore on either side.
const BEFORE = "(?<![\\p{L}\\p{N}_])";
const AFTER = "(?![\\p{L}\\p{N}_])";

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** One regex over `terms`, longest first so "Ravi Kumar" wins over "Ravi". Spaces in a term match any whitespace. */
function wholeTerms(terms: string[], flags: string): RegExp | null {
  const unique = [...new Set(terms.filter((t) => t.trim() !== ""))].sort((a, b) => b.length - a.length);
  if (unique.length === 0) return null;
  const alternatives = unique.map((t) => t.trim().split(/\s+/).map(escape).join("\\s+"));
  return new RegExp(`${BEFORE}(?:${alternatives.join("|")})${AFTER}`, `gu${flags}`);
}

/**
 * Text going to the model: each teacher name or id (whole words, any case) becomes the teacher's code. A misspelt
 * or partial name isn't caught.
 */
export function maskText(text: string, teachers: Teacher[]): string {
  const codes = teacherCodes(teachers);
  const byTerm = new Map<string, string>();
  for (const t of teachers) {
    const c = codes.get(t.id)!;
    // The first teacher with a name keeps it; a second teacher of the same name is masked to the first one's code.
    for (const term of [t.name, t.id]) {
      const key = normalise(term);
      if (key && !byTerm.has(key)) byTerm.set(key, c);
    }
  }
  const re = wholeTerms([...teachers.map((t) => t.name), ...teachers.map((t) => t.id)], "i");
  return re ? text.replace(re, (m) => byTerm.get(normalise(m)) ?? m) : text;
}

/** Text from the model, for display: each teacher code (a whole token, exact case) becomes the teacher's name. */
export function unmaskText(text: string, teachers: Teacher[]): string {
  const codes = teacherCodes(teachers);
  const names = new Map(teachers.map((t) => [codes.get(t.id)!, t.name.trim() || t.id]));
  const re = wholeTerms([...names.keys()], "");
  return re ? text.replace(re, (m) => names.get(m) ?? m) : text;
}

function normalise(term: string): string {
  return term.trim().replace(/\s+/g, " ").toLowerCase();
}
