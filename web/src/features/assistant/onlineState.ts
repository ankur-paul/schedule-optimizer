import type { Membership, Role } from "@/features/account/institutes";
import { currentInstitute, failureMessage, useInstitutes } from "@/features/account/useInstitutes";
import { docHash, editableInstitutes, isDirty, roleIn } from "@/features/online/online";
import type { OnlineApi } from "@/features/online/onlineApi";
import { useAppStore, type OnlineLink } from "@/store/useAppStore";

// Where the working copy stands online, for the assistant (T43): the `online_status` tool and the online changes'
// dry run read this snapshot, loaded once before they run. It holds no member names or emails: each version's saver
// is already "you" or "another member".

export type Saver = "you" | "another member" | "unknown";

export interface OnlineVersion {
  version: number;
  savedAt: string;
  savedBy: Saver;
}

/** An institute the assistant may name: no members, no invites. */
export interface InstituteRef {
  instituteId: string;
  name: string;
  /** The link name public links need (T29); `null` until the admin sets it. */
  handle: string | null;
}

export interface OnlineSnapshot {
  signedIn: boolean;
  /** `null`: on this device only. */
  link: OnlineLink | null;
  /** The user's role in the linked timetable's institute; `null` without a link or without access. */
  role: Role | null;
  /** The linked institute, when the user is still a member. */
  linkedInstitute: InstituteRef | null;
  /** Linked, with changes since the last save or open. */
  dirty: boolean;
  /** The linked timetable as stored online; `null` without a link, signed out, or when it couldn't be read. */
  timetable: { latestVersion: number; liveVersion: number | null; versions: OnlineVersion[] } | null;
  /** Where *Save as new* creates a timetable; `null` when the user may save in no institute. */
  saveAsInto: (InstituteRef & { role: Role }) | null;
  /** The active institute's timetables, for *Open from institute*. */
  active: (InstituteRef & { role: Role; timetables: { id: string; name: string; latestVersion: number; published: boolean }[] }) | null;
  /** What couldn't be loaded, in words. */
  problems: string[];
}

const ref = (m: Membership): InstituteRef => ({ instituteId: m.instituteId, name: m.name, handle: m.handle });

/**
 * Where *Save as new* saves: the linked institute when the user may save there, else the active one, else the first
 * they may save in.
 */
export function saveAsInstitute(memberships: Membership[], linkedId: string | null, activeId: string | null): Membership | null {
  const editable = editableInstitutes(memberships);
  return editable.find((m) => m.instituteId === linkedId) ?? editable.find((m) => m.instituteId === activeId) ?? editable[0] ?? null;
}

/** A saver as the assistant may say it. */
export function saverOf(savedById: string | null, userId: string | null): Saver {
  if (!savedById) return "unknown";
  return savedById === userId ? "you" : "another member";
}

/** Reads the stores and, when signed in, the linked timetable's versions and the active institute's list. Never throws. */
export async function loadOnlineSnapshot(api: OnlineApi): Promise<OnlineSnapshot> {
  const state = useAppStore.getState();
  const institutes = useInstitutes.getState();
  const link = state.online;
  const signedIn = institutes.userId !== null;
  const membership = link ? institutes.memberships.find((m) => m.instituteId === link.instituteId) : undefined;
  const active = signedIn ? currentInstitute(institutes) : null;
  const into = signedIn ? saveAsInstitute(institutes.memberships, link?.instituteId ?? null, active?.instituteId ?? null) : null;
  const snapshot: OnlineSnapshot = {
    signedIn,
    link,
    role: link ? roleIn(institutes.memberships, link.instituteId) : null,
    linkedInstitute: membership ? ref(membership) : null,
    dirty: isDirty(link, docHash(state)),
    timetable: null,
    saveAsInto: into && { ...ref(into), role: into.role },
    active: active && { ...ref(active), role: active.role, timetables: [] },
    problems: [],
  };
  if (!signedIn) return snapshot;

  const [status, versions, list] = await Promise.allSettled([
    link ? api.status(link.timetableId) : null,
    link ? api.versions(link.timetableId) : null,
    active ? api.list(active.instituteId) : null,
  ]);
  const why = (r: PromiseRejectedResult) => failureMessage(r.reason);

  if (link) {
    if (status.status === "rejected") snapshot.problems.push(`Couldn't read the linked timetable: ${why(status)}`);
    else if (versions.status === "rejected") snapshot.problems.push(`Couldn't read the linked timetable's versions: ${why(versions)}`);
    else if (!status.value) snapshot.problems.push("The linked timetable was deleted online, or the user can no longer open it.");
    else {
      snapshot.timetable = {
        latestVersion: status.value.latestVersion,
        liveVersion: status.value.liveVersion,
        versions: (versions.value ?? []).map((v) => ({ version: v.version, savedAt: v.savedAt, savedBy: saverOf(v.savedById, institutes.userId) })),
      };
    }
  }
  if (snapshot.active) {
    if (list.status === "rejected") snapshot.problems.push(`Couldn't list ${snapshot.active.name}'s timetables: ${why(list)}`);
    else snapshot.active.timetables = (list.value ?? []).map((t) => ({ id: t.id, name: t.name, latestVersion: t.latestVersion, published: t.live }));
  }
  return snapshot;
}
