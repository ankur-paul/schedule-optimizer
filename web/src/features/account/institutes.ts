import { looksLikeEmail } from "./account";

/** Mirrors `public.member_role` (T20). Exactly one admin per institute; invites are editor or viewer. */
export type Role = "admin" | "editor" | "viewer";
export type InviteRole = Exclude<Role, "admin">;

/** One institute the signed-in user belongs to. */
export interface Membership {
  instituteId: string;
  name: string;
  role: Role;
}

/** A member as the admin sees them. Email-link users have no name. */
export interface Member {
  userId: string;
  email: string | null;
  name: string | null;
  role: Role;
}

export interface Invite {
  email: string;
  role: InviteRole;
}

/** What `accept_invites()` returns per institute joined. */
export interface Joined {
  name: string;
  role: Role;
}

export const ROLE_LABEL: Record<Role, string> = { admin: "Admin", editor: "Editor", viewer: "Viewer" };

/** The longest name `institutes.name` accepts (its check constraint). */
export const MAX_NAME = 120;

/**
 * The institute to show as active: the remembered one while you're still in it, else the first membership (the
 * remembered one was left, removed or deleted). `null` with no memberships.
 */
export function activeInstitute(memberships: Membership[], rememberedId: string | null): Membership | null {
  return memberships.find((m) => m.instituteId === rememberedId) ?? memberships[0] ?? null;
}

/** The switcher only appears with somewhere to switch to. */
export function showSwitcher(memberships: Membership[]): boolean {
  return memberships.length >= 2;
}

export type MenuItem = "members" | "rename" | "delete" | "leave" | "create";

/**
 * The institute items in the account menu. Only the admin manages members and the institute; editors and viewers
 * can leave. Anyone signed in may create an institute.
 */
export function menuItems(active: Membership | null): MenuItem[] {
  if (!active) return ["create"];
  return active.role === "admin" ? ["members", "rename", "delete", "create"] : ["leave", "create"];
}

/** A member's name, else their email. */
export function personLabel(person: { name: string | null; email: string | null }): string {
  return person.name?.trim() || person.email || "Unknown user";
}

/**
 * The role line under the institute name, so editors and viewers know whom to ask: "Editor · admin is Dr. Meera
 * Iyer (meera@gndec.ac.in)". Email-link admins have no name, so it is just their email.
 */
export function roleLine(role: Role, admin: { name: string | null; email: string | null } | null): string {
  if (role === "admin") return "Admin · you manage members";
  if (!admin) return ROLE_LABEL[role];
  const name = admin.name?.trim();
  const who = name ? (admin.email ? `${name} (${admin.email})` : name) : (admin.email ?? "unknown");
  return `${ROLE_LABEL[role]} · admin is ${who}`;
}

/** The admin first, then everyone else by name (or email). */
export function sortMembers(members: Member[]): Member[] {
  return [...members].sort(
    (a, b) => Number(b.role === "admin") - Number(a.role === "admin") || personLabel(a).localeCompare(personLabel(b)),
  );
}

/** Invites are stored lower-cased and trimmed (T20's trigger), so compare that way too. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Why an invite can't be sent, checked before calling the database; `null` when it's fine. */
export function inviteError(email: string, members: Member[], invites: Invite[]): string | null {
  const address = normalizeEmail(email);
  if (!looksLikeEmail(address)) return "That email address isn't valid.";
  if (members.some((m) => m.email && normalizeEmail(m.email) === address)) return `${address} is already a member.`;
  if (invites.some((i) => i.email === address)) return `${address} is already invited. Cancel that invite to change the role.`;
  return null;
}

/** Why an institute name can't be saved; `null` when it's fine. */
export function nameError(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "Enter a name.";
  if (trimmed.length > MAX_NAME) return `Keep it under ${MAX_NAME} characters.`;
  return null;
}

/** *Delete institute* is enabled once the typed text, trimmed, is the institute's name in the same case. */
export function deleteConfirmed(typed: string, name: string): boolean {
  return typed.trim() === name;
}

/** "You joined GNDEC Ludhiana as editor", or "… as editor and PEC as viewer" for several. `null` for none. */
export function joinedMessage(joined: Joined[]): string | null {
  if (joined.length === 0) return null;
  const parts = joined.map((j) => `${j.name} as ${j.role}`);
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return `You joined ${list}`;
}

/** The shape of a Supabase (PostgREST) error, or a network failure. */
export interface DbError {
  code?: string;
  message?: string;
}

/**
 * A database refusal in plain words, never raw SQL. T20's functions raise 42501 with a sentence meant for the user;
 * a row-level security refusal on a direct write says "row-level security", which becomes "Only the admin can do
 * that."
 */
export function dbErrorMessage(error: DbError): string {
  const message = error.message ?? "";
  switch (error.code) {
    case "42501":
      return /row-level security|permission denied/i.test(message) || !message ? "Only the admin can do that." : message;
    case "23505":
      return "That already exists.";
    case "23514":
      return "That value isn't allowed.";
    case "PGRST301":
    case "PGRST303":
      return "Your sign-in has expired. Sign in again.";
  }
  if (/failed to fetch|network|load failed/i.test(message)) return "Couldn't reach the server. Check your connection and try again.";
  return "Something went wrong. Try again.";
}

const ACTIVE_KEY = "lattice-active-institute";
const DISMISSED_KEY = "lattice-create-institute-dismissed";

/** The localStorage key remembering a user's active institute, apart from the app's data. */
export function activeKey(userId: string): string {
  return `${ACTIVE_KEY}:${userId}`;
}

/** The localStorage key remembering that a user chose *Not now* on the create-institute prompt. */
export function dismissedKey(userId: string): string {
  return `${DISMISSED_KEY}:${userId}`;
}

/**
 * Whether to open the create-institute prompt by itself: signed in with no institute, none just joined, and *Not
 * now* not chosen before. After that the menu's *Create institute* is the way in.
 */
export function promptCreate(memberships: Membership[], joined: Joined[], dismissed: boolean): boolean {
  return memberships.length === 0 && joined.length === 0 && !dismissed;
}
