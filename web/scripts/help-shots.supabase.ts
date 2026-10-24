// A pretend Supabase for the signed-in help screenshots (T35): one institute, its members and one saved timetable,
// answered the way PostgREST and the database functions would. Pure, so Vitest can check it without a browser.
import type { Role } from "../src/features/account/institutes";
import { docHash } from "../src/features/online/online";
import type { OnlineLink, WorkingCopy } from "../src/store/useAppStore";

/** The URL the screenshot build uses for Supabase. Every request to it is answered by `answer`. */
export const SUPABASE_URL = "https://supabase.help-shots.invalid";
export const SUPABASE_ANON_KEY = "help-shots";
/** Where supabase-js keeps the session: `sb-<first part of the host>-auth-token`. */
export const SESSION_KEY = "sb-supabase-auth-token";

export const INSTITUTE = { id: "inst-gndec", name: "GNDEC Ludhiana", handle: "gndec" };
export const TIMETABLE = { id: "tt-cse", name: "CSE odd sem 2026", publicId: "k7f3q9xa2m", latest: 6, live: 5 };

interface Person {
  id: string;
  name: string | null;
  email: string;
  role: Role;
}

/** Who signs in as each role. The email-link member has no name, as in the real app. */
export const PEOPLE: Person[] = [
  { id: "user-meera", name: "Dr. Meera Iyer", email: "meera@gndec.ac.in", role: "admin" },
  { id: "user-rahul", name: "Rahul Verma", email: "rahul@gndec.ac.in", role: "editor" },
  { id: "user-simran", name: "Simran Kaur", email: "simran@gndec.ac.in", role: "viewer" },
  { id: "user-hod", name: null, email: "hod.ece@gndec.ac.in", role: "viewer" },
];

const INVITES = [{ email: "jaspreet@gndec.ac.in", role: "editor" }];

/** The kept versions, oldest first, in India time like the screenshots' clock. */
const VERSIONS: { version: number; savedBy: string; savedAt: string }[] = [
  { version: 1, savedBy: "user-meera", savedAt: "2026-10-20T11:05:00+05:30" },
  { version: 2, savedBy: "user-rahul", savedAt: "2026-10-21T15:30:00+05:30" },
  { version: 3, savedBy: "user-rahul", savedAt: "2026-10-23T12:10:00+05:30" },
  { version: 4, savedBy: "user-meera", savedAt: "2026-10-24T10:42:00+05:30" },
  { version: 5, savedBy: "user-rahul", savedAt: "2026-10-24T16:20:00+05:30" },
  { version: 6, savedBy: "user-meera", savedAt: "2026-10-26T09:42:00+05:30" },
];

export function person(role: Role): Person {
  return PEOPLE.find((p) => p.role === role)!;
}

/**
 * The working copy's link to the saved timetable. `latest`: opened at the newest version, no changes. `behind`:
 * opened at the version before and changed since, so *Save online* runs into Meera's newer save.
 */
export function onlineLink(doc: WorkingCopy, state: "latest" | "behind"): OnlineLink {
  return {
    instituteId: INSTITUTE.id,
    instituteName: INSTITUTE.name,
    timetableId: TIMETABLE.id,
    name: TIMETABLE.name,
    version: state === "latest" ? TIMETABLE.latest : TIMETABLE.latest - 1,
    savedHash: state === "latest" ? docHash(doc) : "changed since",
  };
}

const base64url = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");

/**
 * The session supabase-js reads from `localStorage` on start. The token is a JWT nobody checks (the signature is
 * fake); it signed in with Google, so *Make admin* and *Leave* would ask for the email step.
 */
export function storedSession(role: Role, now: Date): string {
  const who = person(role);
  const iat = Math.floor(now.getTime() / 1000);
  const exp = iat + 365 * 24 * 3600;
  const claims = { sub: who.id, email: who.email, role: "authenticated", aud: "authenticated", iat, exp, amr: [{ method: "oauth", timestamp: iat }] };
  const user = {
    id: who.id,
    aud: "authenticated",
    role: "authenticated",
    email: who.email,
    app_metadata: { provider: "google" },
    user_metadata: who.name ? { full_name: who.name } : {},
    created_at: "2026-10-01T09:00:00Z",
  };
  return JSON.stringify({
    access_token: `${base64url({ alg: "HS256", typ: "JWT" })}.${base64url(claims)}.help-shots`,
    refresh_token: "help-shots",
    token_type: "bearer",
    expires_in: exp - iat,
    expires_at: exp,
    user,
  });
}

export interface MockRequest {
  method: string;
  url: string;
  /** The JSON body of a POST, already parsed. */
  body?: unknown;
}

export interface MockResponse {
  status: number;
  json: unknown;
}

type Row = Record<string, unknown>;

/** Every row of the tables the app reads, before filters. Row-level security is left out. */
function tables(doc: WorkingCopy): Record<string, Row[]> {
  const membership = (p: Person): Row => ({
    institute_id: INSTITUTE.id,
    user_id: p.id,
    role: p.role,
    institutes: { name: INSTITUTE.name, handle: INSTITUTE.handle },
  });
  return {
    consents: PEOPLE.map((p) => ({ user_id: p.id, version: 2 })),
    memberships: PEOPLE.map(membership),
    profiles: PEOPLE.map((p) => ({ user_id: p.id, name: p.name, email: p.email })),
    invites: INVITES.map((i) => ({ institute_id: INSTITUTE.id, ...i })),
    timetables: [
      {
        id: TIMETABLE.id,
        institute_id: INSTITUTE.id,
        name: TIMETABLE.name,
        public_id: TIMETABLE.publicId,
        latest_version: TIMETABLE.latest,
        live_version: TIMETABLE.live,
      },
    ],
    timetable_versions: VERSIONS.map((v) => ({ timetable_id: TIMETABLE.id, version: v.version, saved_by: v.savedBy, saved_at: v.savedAt, data: doc })),
  };
}

/** One PostgREST filter, `eq.x` or `in.(x,y)`; anything else matches everything. */
function matches(value: unknown, filter: string): boolean {
  if (filter.startsWith("eq.")) return String(value) === filter.slice(3);
  const list = /^in\.\((.*)\)$/.exec(filter);
  if (list) return list[1].split(",").map((s) => s.replace(/^"|"$/g, "")).includes(String(value));
  return true;
}

const KNOWN_PARAMS = new Set(["select", "order", "limit", "offset"]);

/** What the pretend Supabase answers to one request. `doc` is the data every saved version holds. */
export function answer(request: MockRequest, doc: WorkingCopy): MockResponse {
  const url = new URL(request.url);
  const rpc = /^\/rest\/v1\/rpc\/(\w+)$/.exec(url.pathname);
  if (rpc) return callFunction(rpc[1], request.body);
  const table = /^\/rest\/v1\/(\w+)$/.exec(url.pathname);
  if (table && request.method === "GET") {
    const rows = tables(doc)[table[1]];
    if (!rows) return { status: 404, json: { code: "42P01", message: `relation "${table[1]}" does not exist` } };
    const filters = [...url.searchParams].filter(([key]) => !KNOWN_PARAMS.has(key));
    return { status: 200, json: rows.filter((row) => filters.every(([key, f]) => matches(row[key], f))) };
  }
  // Writes other than the functions below aren't part of any screenshot.
  return { status: 400, json: { code: "help-shots", message: `Not mocked: ${request.method} ${url.pathname}` } };
}

function callFunction(name: string, body: unknown): MockResponse {
  const args = (body ?? {}) as Record<string, unknown>;
  if (name === "accept_invites") return { status: 200, json: [] };
  if (name === "save_timetable") {
    if (args.base_version !== TIMETABLE.latest) {
      const newest = VERSIONS[VERSIONS.length - 1];
      const by = PEOPLE.find((p) => p.id === newest.savedBy)!;
      const details = JSON.stringify({ latest_version: newest.version, saved_by: by.id, saved_by_name: by.name ?? by.email, saved_at: newest.savedAt });
      // The Data API sends the clash as HTTP 400; the app reads the code.
      return { status: 400, json: { code: "LT409", message: "Someone saved this timetable since you opened it.", details, hint: null } };
    }
    return { status: 200, json: TIMETABLE.latest + 1 };
  }
  return { status: 400, json: { code: "help-shots", message: `Not mocked: rpc ${name}` } };
}
