import { toast } from "sonner";
import { create } from "zustand";
import { activeInstitute, activeKey, dismissedKey, joinedMessage, promptCreate, type Membership } from "./institutes";
import { DbFailure, type InstitutesApi, type Person } from "./institutesApi";
import { storage } from "./storage";

interface InstitutesState {
  /** Whose institutes these are; `null` when signed out. */
  userId: string | null;
  memberships: Membership[];
  /** False until the first load for this user is done, so the menu doesn't flash *Create institute*. */
  loaded: boolean;
  /** The active institute as remembered in this browser; `activeInstitute` falls back when it's gone. */
  rememberedId: string | null;
  /** Name and email of the active institute's admin, for the "admin is X" line. */
  admin: Person | null;
  /** The create-institute dialog, which opens by itself after a sign-in with no institute. */
  createOpen: boolean;
}

const empty: InstitutesState = { userId: null, memberships: [], loaded: false, rememberedId: null, admin: null, createOpen: false };

/** The signed-in user's institutes. Kept apart from the app store: none of this is timetable data. */
export const useInstitutes = create<InstitutesState>(() => empty);

export interface Notify {
  info(message: string): void;
  error(message: string): void;
}

/** The app's toasts; tests pass their own `Notify`. */
export const notify: Notify = { info: (m) => toast.success(m), error: (m) => toast.error(m) };

/** A thrown `DbFailure` in its own words; anything else (a bug) as a generic line, never raw. */
export function failureMessage(e: unknown): string {
  return e instanceof DbFailure ? e.message : "Something went wrong. Try again.";
}

/** The active institute right now, after the fallback. */
export function currentInstitute(state: Pick<InstitutesState, "memberships" | "rememberedId">): Membership | null {
  return activeInstitute(state.memberships, state.rememberedId);
}

/**
 * Runs on every sign-in and on load with a session: accepts pending invites (toasting each institute joined), loads
 * the memberships, and opens the create-institute dialog when there is no institute, no invite and no earlier *Not
 * now*. Safe to call again for the same user.
 */
export async function startInstitutes(api: InstitutesApi, userId: string, notify: Notify): Promise<void> {
  useInstitutes.setState({ ...empty, userId, rememberedId: storage.get(activeKey(userId)) });
  let joined: Awaited<ReturnType<InstitutesApi["acceptInvites"]>> = [];
  try {
    joined = await api.acceptInvites();
  } catch (e) {
    notify.error(`Couldn't check for invites: ${failureMessage(e)}`);
  }
  if (useInstitutes.getState().userId !== userId) return;
  const message = joinedMessage(joined);
  if (message) notify.info(message);
  await refreshInstitutes(api, notify);
  const state = useInstitutes.getState();
  if (state.userId !== userId || !state.loaded) return;
  if (promptCreate(state.memberships, joined, storage.get(dismissedKey(userId)) !== null)) useInstitutes.setState({ createOpen: true });
}

/**
 * Reloads the memberships and the active institute's admin, e.g. when the menu opens, so a role change, removal or
 * deletion by someone else shows up.
 */
export async function refreshInstitutes(api: InstitutesApi, notify: Notify): Promise<void> {
  const { userId } = useInstitutes.getState();
  if (!userId) return;
  try {
    const memberships = await api.memberships(userId);
    if (useInstitutes.getState().userId !== userId) return;
    useInstitutes.setState({ memberships, loaded: true });
    await loadAdmin(api);
  } catch (e) {
    if (useInstitutes.getState().userId === userId) {
      useInstitutes.setState({ loaded: true });
      notify.error(`Couldn't load your institutes: ${failureMessage(e)}`);
    }
  }
}

async function loadAdmin(api: InstitutesApi) {
  const active = currentInstitute(useInstitutes.getState());
  const admin = active ? await api.admin(active.instituteId) : null;
  if (currentInstitute(useInstitutes.getState())?.instituteId === active?.instituteId) useInstitutes.setState({ admin });
}

/** Makes `instituteId` the active institute and remembers it in this browser, under the user's own key. */
export async function switchInstitute(api: InstitutesApi, instituteId: string, notify: Notify): Promise<void> {
  const { userId } = useInstitutes.getState();
  if (!userId) return;
  storage.set(activeKey(userId), instituteId);
  useInstitutes.setState({ rememberedId: instituteId, admin: null });
  try {
    await loadAdmin(api);
  } catch (e) {
    notify.error(`Couldn't load the institute: ${failureMessage(e)}`);
  }
}

/** Creates an institute (you become its admin) and switches to it. Throws a `DbFailure` on refusal. */
export async function createAndSwitch(api: InstitutesApi, name: string, notify: Notify): Promise<void> {
  const id = await api.createInstitute(name);
  await refreshInstitutes(api, notify);
  await switchInstitute(api, id, notify);
}

/** *Not now*: close the prompt and don't open it by itself again for this user in this browser. */
export function dismissCreate(): void {
  const { userId } = useInstitutes.getState();
  if (userId) storage.set(dismissedKey(userId), "1");
  useInstitutes.setState({ createOpen: false });
}

export function setCreateOpen(open: boolean): void {
  useInstitutes.setState({ createOpen: open });
}

/** Signed out: forget the institutes in memory. The remembered active institute stays in localStorage. */
export function resetInstitutes(): void {
  useInstitutes.setState(empty);
}
