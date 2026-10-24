import type { SolveResult } from "@/domain/types";
import type { ViewData } from "@/features/view/layout";
import type { SupabaseConfig } from "@/lib/supabaseConfig";

/** A live version as `get_published` returns it (T27), read into what the page shows. */
export interface PublishedTimetable {
  instituteName: string;
  /** The institute's current handle; the link may still carry an old one. */
  handle: string;
  timetableName: string;
  /** When the live version was saved (ISO time). */
  savedAt: string;
  data: ViewData;
  result: SolveResult;
  printHeading: string;
}

export type LoadOutcome =
  | { kind: "ok"; timetable: PublishedTimetable }
  /** Unknown id, or the timetable isn't published. */
  | { kind: "notPublished" }
  /** No Supabase env vars, the request failed, or the document can't be read. */
  | { kind: "failed" };

const FAILED: LoadOutcome = { kind: "failed" };

/**
 * Calls `get_published` as `anon` through the Data API. Plain `fetch` rather than the Supabase client: the page
 * needs one call and no session, so it stays small and never touches a signed-in user's token.
 */
export async function loadPublished(config: SupabaseConfig | null, publicId: string, fetchFn: typeof fetch = fetch): Promise<LoadOutcome> {
  if (!config) return FAILED;
  try {
    const res = await fetchFn(`${config.url.replace(/\/+$/, "")}/rest/v1/rpc/get_published`, {
      method: "POST",
      headers: { apikey: config.anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ public_id: publicId }),
    });
    if (!res.ok) return FAILED;
    const rows: unknown = await res.json();
    if (!Array.isArray(rows)) return FAILED;
    if (rows.length === 0) return { kind: "notPublished" };
    const timetable = readRow(rows[0]);
    return timetable ? { kind: "ok", timetable } : FAILED;
  } catch {
    return FAILED;
  }
}

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === "object" && x !== null && !Array.isArray(x);
const str = (x: unknown): x is string => typeof x === "string";

/** One `get_published` row, or null when a field is missing or the document isn't a timetable with a result. */
export function readRow(row: unknown): PublishedTimetable | null {
  if (!isObj(row)) return null;
  const { institute_name, handle, timetable_name, saved_at, data } = row;
  if (!str(institute_name) || !str(handle) || !str(timetable_name) || !str(saved_at) || !isObj(data)) return null;
  const doc = readDoc(data);
  return doc && { instituteName: institute_name, handle, timetableName: timetable_name, savedAt: saved_at, ...doc };
}

/**
 * The parts of a version document (T28's `toDoc`) the page draws. Shapes are checked only as far as drawing needs:
 * the document was valid when it was saved, and a broken one should fail here rather than half-render.
 */
export function readDoc(doc: Obj): Pick<PublishedTimetable, "data" | "result" | "printHeading"> | null {
  const { settings, departments, teachers, rooms, sections, courses, result, printHeading } = doc;
  if (!isObj(settings) || !Array.isArray(settings.days) || !settings.days.every(str) || !Array.isArray(settings.periods)) return null;
  const lists = [departments, teachers, rooms, sections, courses];
  if (!lists.every(Array.isArray)) return null;
  if (!isObj(result) || !Array.isArray(result.placements)) return null;
  return {
    data: {
      settings: { ...settings, lunchCandidates: Array.isArray(settings.lunchCandidates) ? settings.lunchCandidates : [] },
      departments,
      teachers,
      rooms,
      sections,
      courses,
    } as ViewData,
    result: { ...result, unplaced: Array.isArray(result.unplaced) ? result.unplaced : [] } as SolveResult,
    printHeading: str(printHeading) ? printHeading : "",
  };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Updated 24 Oct 2026" in the viewer's time zone, or "" for a bad time. Months by hand: en-GB says "Sept". */
export function updatedText(savedAt: string): string {
  const d = new Date(savedAt);
  if (Number.isNaN(d.getTime())) return "";
  return `Updated ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
