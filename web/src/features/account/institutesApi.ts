import type { SupabaseClient } from "@supabase/supabase-js";
import { needsEmailConfirmation } from "./emailConfirm";
import { dbErrorMessage, normalizeEmail, type DbError, type Invite, type InviteRole, type Joined, type Member, type Membership, type Role } from "./institutes";

/** A database call that failed, with a message already in plain words (see `dbErrorMessage`). */
export class DbFailure extends Error {}

/** T26's refusal of *Make admin* or *Leave* without a recent email-link sign-in; the UI offers the link. */
export class EmailConfirmationNeeded extends DbFailure {}

/** A person's name and email, as `profiles` has them. */
export interface Person {
  name: string | null;
  email: string | null;
}

/**
 * Every institute read and write the UI makes. All of them go through T20's policies and functions with the user's
 * token, so a refusal here is the real rule; the UI hiding a button is only cosmetic.
 */
export interface InstitutesApi {
  acceptInvites(): Promise<Joined[]>;
  memberships(userId: string): Promise<Membership[]>;
  admin(instituteId: string): Promise<Person | null>;
  members(instituteId: string): Promise<{ members: Member[]; invites: Invite[] }>;
  createInstitute(name: string): Promise<string>;
  rename(instituteId: string, name: string): Promise<void>;
  deleteInstitute(instituteId: string): Promise<void>;
  leave(instituteId: string): Promise<void>;
  setRole(instituteId: string, userId: string, role: InviteRole): Promise<void>;
  makeAdmin(instituteId: string, userId: string): Promise<void>;
  removeMember(instituteId: string, userId: string): Promise<void>;
  invite(instituteId: string, email: string, role: InviteRole): Promise<void>;
  cancelInvite(instituteId: string, email: string): Promise<void>;
}

interface MembershipRow {
  institute_id: string;
  role: Role;
  institutes: { name: string } | null;
}

interface ProfileRow {
  user_id: string;
  email: string | null;
  name: string | null;
}

/** Rows of `memberships` joined to `institutes`, sorted by name. A row whose institute can't be read is dropped. */
export function toMemberships(rows: MembershipRow[]): Membership[] {
  return rows
    .filter((r) => r.institutes)
    .map((r) => ({ instituteId: r.institute_id, name: r.institutes!.name, role: r.role }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** An institute's memberships with each member's profile; a member with no profile row shows as unknown. */
export function toMembers(rows: { user_id: string; role: Role }[], profiles: ProfileRow[]): Member[] {
  const byId = new Map(profiles.map((p) => [p.user_id, p]));
  return rows.map((r) => ({ userId: r.user_id, role: r.role, email: byId.get(r.user_id)?.email ?? null, name: byId.get(r.user_id)?.name ?? null }));
}

/** The data of a Supabase response, or a `DbFailure` in plain words. */
function check<T>({ data, error }: { data: T; error: DbError | null }): T {
  if (error && needsEmailConfirmation(error)) throw new EmailConfirmationNeeded(error.message ?? "Confirm from your email first.");
  if (error) throw new DbFailure(dbErrorMessage(error));
  return data;
}

export function supabaseApi(client: SupabaseClient): InstitutesApi {
  const rpc = async (fn: string, args?: Record<string, unknown>) => check(await client.rpc(fn, args));

  return {
    async acceptInvites() {
      const rows = (await rpc("accept_invites")) as { institute_name: string; role: Role }[] | null;
      return (rows ?? []).map((r) => ({ name: r.institute_name, role: r.role }));
    },

    async memberships(userId) {
      const rows = check(await client.from("memberships").select("institute_id, role, institutes(name)").eq("user_id", userId));
      return toMemberships((rows ?? []) as unknown as MembershipRow[]);
    },

    async admin(instituteId) {
      const rows = check(await client.from("memberships").select("user_id").eq("institute_id", instituteId).eq("role", "admin"));
      const adminId = rows?.[0]?.user_id as string | undefined;
      if (!adminId) return null;
      const profiles = check(await client.from("profiles").select("email, name").eq("user_id", adminId));
      return (profiles?.[0] as Person | undefined) ?? null;
    },

    async members(instituteId) {
      const [rows, invites] = await Promise.all([
        client.from("memberships").select("user_id, role").eq("institute_id", instituteId).then(check),
        client.from("invites").select("email, role").eq("institute_id", instituteId).order("created_at").then(check),
      ]);
      const ids = (rows ?? []).map((r) => r.user_id as string);
      const profiles = ids.length ? check(await client.from("profiles").select("user_id, email, name").in("user_id", ids)) : [];
      return {
        members: toMembers((rows ?? []) as { user_id: string; role: Role }[], (profiles ?? []) as ProfileRow[]),
        invites: (invites ?? []) as Invite[],
      };
    },

    async createInstitute(name) {
      return (await rpc("create_institute", { name: name.trim() })) as string;
    },

    async rename(instituteId, name) {
      // RLS turns a refused update into "no rows", not an error, so ask for the row back and check it came.
      const rows = check(await client.from("institutes").update({ name: name.trim() }).eq("id", instituteId).select("id"));
      if (!rows?.length) throw new DbFailure("Only the admin can do that.");
    },

    async deleteInstitute(instituteId) {
      await rpc("delete_institute", { institute_id: instituteId });
    },

    async leave(instituteId) {
      await rpc("leave_institute", { institute_id: instituteId });
    },

    async setRole(instituteId, userId, role) {
      await rpc("set_member_role", { institute_id: instituteId, user_id: userId, role });
    },

    async makeAdmin(instituteId, userId) {
      await rpc("make_admin", { institute_id: instituteId, user_id: userId });
    },

    async removeMember(instituteId, userId) {
      await rpc("remove_member", { institute_id: instituteId, user_id: userId });
    },

    async invite(instituteId, email, role) {
      check(await client.from("invites").insert({ institute_id: instituteId, email: normalizeEmail(email), role }));
    },

    async cancelInvite(instituteId, email) {
      const rows = check(await client.from("invites").delete().eq("institute_id", instituteId).eq("email", email).select("email"));
      if (!rows?.length) throw new DbFailure("That invite was already accepted or cancelled.");
    },
  };
}
