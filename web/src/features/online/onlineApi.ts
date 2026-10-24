import type { SupabaseClient } from "@supabase/supabase-js";
import { dbErrorMessage, personLabel, type DbError } from "@/features/account/institutes";
import { DbFailure } from "@/features/account/institutesApi";
import { parseConflict, type Conflict, type OnlineDoc } from "./online";

/** `save_timetable` refused a stale base: someone saved since. *Overwrite* retries with `conflict.latestVersion`. */
export class SaveConflict extends DbFailure {
  readonly conflict: Conflict | null;
  constructor(conflict: Conflict | null) {
    super("Someone saved this timetable online since you opened it.");
    this.conflict = conflict;
  }
}

/** The linked timetable was deleted, or the user can no longer edit it; *Save as new timetable* still works. */
export class NotEditable extends DbFailure {}

/** One row of *Open from institute*. */
export interface TimetableSummary {
  id: string;
  name: string;
  latestVersion: number;
  /** Published (T29): `live_version` is set. */
  live: boolean;
  savedBy: string | null;
  savedAt: string | null;
}

/** The latest version of a timetable, as downloaded. `data` is checked by `fromDoc`. */
export interface OpenedTimetable {
  instituteId: string;
  name: string;
  version: number;
  data: unknown;
}

/**
 * Every online-timetable read and write the UI makes, with the user's token. T27's RLS and functions are the rule;
 * the UI hiding an item is cosmetic.
 */
export interface OnlineApi {
  list(instituteId: string): Promise<TimetableSummary[]>;
  open(timetableId: string): Promise<OpenedTimetable>;
  create(instituteId: string, name: string, data: OnlineDoc): Promise<{ timetableId: string; version: number }>;
  /** The new version number. Throws `SaveConflict` for a stale base and `NotEditable` for a deleted timetable or lost access. */
  save(timetableId: string, data: OnlineDoc, baseVersion: number): Promise<number>;
  rename(timetableId: string, name: string): Promise<void>;
  remove(timetableId: string): Promise<void>;
}

type PgError = DbError & { details?: string | null };

const GONE = "This timetable was deleted online, or you can no longer edit it.";

/**
 * A refusal in plain words. T27's functions raise sentences meant for the user (42501, 23505 for a name clash, 22023
 * for a bad value); a 2 MB refusal is named. Everything else goes through `dbErrorMessage`.
 */
export function onlineErrorMessage(error: PgError): string {
  const message = error.message ?? "";
  if (error.code === "23514" && /timetable_versions_data_check/.test(message)) return "This timetable is too big to save online (over 2 MB).";
  if ((error.code === "23505" || error.code === "22023") && message && !/constraint|violates/i.test(message)) return message;
  return dbErrorMessage(error);
}

function check<T>({ data, error }: { data: T; error: PgError | null }): T {
  if (error) throw new DbFailure(onlineErrorMessage(error));
  return data;
}

/** A save's error: the version clash and a lost timetable get their own classes, a missing consent keeps its words. */
function saveFailure(error: PgError): DbFailure {
  if (error.code === "LT409") return new SaveConflict(parseConflict(error.details));
  if (error.code === "42501" && error.hint !== "consent_required") return new NotEditable(GONE);
  return new DbFailure(onlineErrorMessage(error));
}

interface TimetableRow {
  id: string;
  name: string;
  latest_version: number;
  live_version: number | null;
}

interface VersionRow {
  timetable_id: string;
  version: number;
  saved_by: string | null;
  saved_at: string;
}

/** The list rows, by name, each with who saved its latest version and when (a saver whose profile is gone shows as unknown). */
export function toSummaries(timetables: TimetableRow[], versions: VersionRow[], profiles: { user_id: string; name: string | null; email: string | null }[]): TimetableSummary[] {
  const people = new Map(profiles.map((p) => [p.user_id, personLabel(p)]));
  return timetables
    .map((t) => {
      const latest = versions.find((v) => v.timetable_id === t.id && v.version === t.latest_version);
      return {
        id: t.id,
        name: t.name,
        latestVersion: t.latest_version,
        live: t.live_version !== null,
        savedBy: latest?.saved_by ? (people.get(latest.saved_by) ?? null) : null,
        savedAt: latest?.saved_at ?? null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

export function supabaseOnlineApi(client: SupabaseClient): OnlineApi {
  return {
    async list(instituteId) {
      const timetables = (check(await client.from("timetables").select("id, name, latest_version, live_version").eq("institute_id", instituteId)) ?? []) as TimetableRow[];
      if (!timetables.length) return [];
      // Without `data`: a version can be 2 MB.
      const versions = (check(
        await client.from("timetable_versions").select("timetable_id, version, saved_by, saved_at").in("timetable_id", timetables.map((t) => t.id)),
      ) ?? []) as VersionRow[];
      const savers = [...new Set(versions.map((v) => v.saved_by).filter((id): id is string => !!id))];
      const profiles = savers.length ? (check(await client.from("profiles").select("user_id, name, email").in("user_id", savers)) ?? []) : [];
      return toSummaries(timetables, versions, profiles as { user_id: string; name: string | null; email: string | null }[]);
    },

    async open(timetableId) {
      const gone = "That timetable was deleted, or you're no longer a member of its institute.";
      const tt = check(await client.from("timetables").select("institute_id, name, latest_version").eq("id", timetableId).maybeSingle()) as {
        institute_id: string;
        name: string;
        latest_version: number;
      } | null;
      if (!tt) throw new DbFailure(gone);
      const row = check(await client.from("timetable_versions").select("data").eq("timetable_id", timetableId).eq("version", tt.latest_version).maybeSingle()) as {
        data: unknown;
      } | null;
      if (!row) throw new DbFailure(gone);
      return { instituteId: tt.institute_id, name: tt.name, version: tt.latest_version, data: row.data };
    },

    async create(instituteId, name, data) {
      const rows = check(await client.rpc("create_timetable", { institute_id: instituteId, name: name.trim(), data })) as { timetable_id: string; version: number }[] | null;
      const row = rows?.[0];
      if (!row) throw new DbFailure("Something went wrong. Try again.");
      return { timetableId: row.timetable_id, version: row.version };
    },

    async save(timetableId, data, baseVersion) {
      const { data: version, error } = await client.rpc("save_timetable", { timetable_id: timetableId, data, base_version: baseVersion });
      if (error) throw saveFailure(error);
      return version as number;
    },

    async rename(timetableId, name) {
      check(await client.rpc("rename_timetable", { timetable_id: timetableId, name: name.trim() }));
    },

    async remove(timetableId) {
      check(await client.rpc("delete_timetable", { timetable_id: timetableId }));
    },
  };
}
