import { create } from "zustand";
import { personLabel } from "@/features/account/institutes";
import { currentInstitute, failureMessage, useInstitutes, type Notify } from "@/features/account/useInstitutes";
import { useAppStore, type OnlineLink } from "@/store/useAppStore";
import { docHash, fromDoc, isDirty, roleIn, toDoc, type Conflict } from "./online";
import { HandleRequired, NotEditable, SaveConflict, type OnlineApi, type PublishStatus } from "./onlineApi";
import { publicUrl, publishState, type PublishState } from "./publish";

/** A timetable the Versions dialog lists, linked or picked from *Open from institute*. */
export interface TimetableRef {
  timetableId: string;
  name: string;
  instituteId: string;
  instituteName: string;
}

/** Pointing a timetable's link at a version: *Publish* (the linked version, then the link dialog) or *Make live*. */
export interface PublishTarget {
  timetableId: string;
  instituteId: string;
  version: number;
  mode: "publish" | "makeLive";
}

export type OnlineDialog =
  | { kind: "create" }
  | { kind: "conflict"; conflict: Conflict | null }
  | { kind: "gone"; message: string }
  | { kind: "open" }
  | { kind: "rename" }
  | { kind: "delete" }
  | { kind: "versions"; timetable: TimetableRef }
  | { kind: "saveFirst" }
  /** The admin sets the handle; `then` carries on with the publish that needed it. */
  | { kind: "handle"; instituteId: string; then?: PublishTarget }
  | { kind: "askAdmin"; message: string }
  | { kind: "published"; url: string; version: number };

interface OnlineState {
  dialog: OnlineDialog | null;
  /** A save from the menu or the conflict dialog is running. */
  saving: boolean;
  /** The linked timetable's public link, for the "· published" note; `null` until loaded or when unlinked. */
  linked: (PublishStatus & { timetableId: string }) | null;
}

/** The status menu's dialogs and the save in flight. The link itself lives in the app store, with the data. */
export const useOnline = create<OnlineState>(() => ({ dialog: null, saving: false, linked: null }));

export function showDialog(dialog: OnlineDialog | null): void {
  useOnline.setState({ dialog });
}

/** The working copy and its hash, taken together so a save records exactly what it sent. */
function snapshot() {
  const state = useAppStore.getState();
  const doc = toDoc(state);
  return { doc, hash: docHash(doc) };
}

/**
 * *Save online*. Without a link it opens the create dialog. Linked, it saves a new version on top of `base` (the
 * linked version, or the newer one from a conflict for *Overwrite*). A stale base opens the conflict dialog, a deleted
 * timetable or lost access the *gone* dialog; anything else is a toast. The link changes only on success, and not
 * at all if the working copy was linked elsewhere meanwhile. Returns whether it saved.
 */
export async function saveOnline(api: OnlineApi, notify: Notify, base?: number): Promise<boolean> {
  const link = useAppStore.getState().online;
  if (!link) {
    showDialog({ kind: "create" });
    return false;
  }
  if (useOnline.getState().saving) return false;
  useOnline.setState({ saving: true, dialog: null });
  try {
    const version = await saveVersion(api, link, base);
    notify.info(`Saved ${link.name} online (version ${version}).`);
    return true;
  } catch (e) {
    if (e instanceof SaveConflict) showDialog({ kind: "conflict", conflict: e.conflict });
    else if (e instanceof NotEditable) showDialog({ kind: "gone", message: e.message });
    else notify.error(`Couldn't save online: ${failureMessage(e)}`);
    return false;
  } finally {
    useOnline.setState({ saving: false });
  }
}

/**
 * Saves the working copy as a new version of `link`'s timetable on top of `base` (default: the linked version) and
 * moves the link to it, unless the working copy was linked elsewhere meanwhile. Returns the new version. Throws
 * `SaveConflict` for a stale base, `NotEditable` for a deleted timetable or lost access, `DbFailure` otherwise.
 */
export async function saveVersion(api: OnlineApi, link: OnlineLink, base = link.version): Promise<number> {
  const { doc, hash } = snapshot();
  const version = await api.save(link.timetableId, doc, base);
  const now = useAppStore.getState().online;
  if (now?.timetableId === link.timetableId) useAppStore.getState().setOnline({ ...now, version, savedHash: hash });
  return version;
}

/** First save and *Save as new timetable*: creates version 1 in `institute` and links the working copy to it. Throws on refusal. */
export async function createOnline(api: OnlineApi, institute: { instituteId: string; name: string }, name: string): Promise<void> {
  const { doc, hash } = snapshot();
  const { timetableId, version } = await api.create(institute.instituteId, name, doc);
  useAppStore.getState().setOnline({ instituteId: institute.instituteId, instituteName: institute.name, timetableId, name: name.trim(), version, savedHash: hash });
}

/**
 * Downloads a timetable's latest version, or `version`, into the working copy and links to it; the step and time
 * limit stay. The link's base is always the latest version, so an older version opens with unsaved changes and the
 * next *Save online* restores it as a new version without a conflict. `instituteName` is kept in the link for the
 * signed-out status line. Returns the version opened; throws on refusal or unreadable data.
 */
export async function openOnline(api: OnlineApi, timetableId: string, instituteName: string, version?: number): Promise<number> {
  const opened = await api.open(timetableId, version);
  const data = fromDoc(opened.data);
  useAppStore.getState().loadOnline(data, {
    instituteId: opened.instituteId,
    instituteName,
    timetableId,
    name: opened.name,
    version: opened.version,
    // No hash matches "", so an older version shows as unsaved changes until it is saved.
    savedHash: opened.opened === opened.version ? docHash(data) : "",
  });
  return opened.opened;
}

/** Renames the linked timetable online and in the link. Throws on refusal. */
export async function renameOnline(api: OnlineApi, timetableId: string, name: string): Promise<void> {
  await api.rename(timetableId, name);
  const link = useAppStore.getState().online;
  if (link?.timetableId === timetableId) useAppStore.getState().setOnline({ ...link, name: name.trim() });
}

/** Deletes a timetable (admin) and drops the link if it pointed there; the working copy stays. Throws on refusal. */
export async function deleteOnline(api: OnlineApi, timetableId: string): Promise<void> {
  await api.remove(timetableId);
  if (useAppStore.getState().online?.timetableId === timetableId) useAppStore.getState().setOnline(null);
}

/** *Work on this device only*: drop the link, keep the data. */
export function unlink(): void {
  useAppStore.getState().setOnline(null);
}

/** The page's own origin, for public links; empty outside a browser. */
const siteOrigin = () => globalThis.location?.origin ?? "";

/** Reloads the linked timetable's publish status; quiet on failure, since it only feeds the status line. */
export async function refreshLinked(api: OnlineApi): Promise<void> {
  const link = useAppStore.getState().online;
  if (!link) return useOnline.setState({ linked: null });
  try {
    const status = await api.status(link.timetableId);
    if (useAppStore.getState().online?.timetableId === link.timetableId) useOnline.setState({ linked: status && { ...status, timetableId: link.timetableId } });
  } catch {
    // Keep what was there.
  }
}

/** What *Publish* would do for the linked timetable right now, from the working copy and the memberships. */
export function currentPublishState(): PublishState | null {
  const state = useAppStore.getState();
  const link = state.online;
  if (!link) return null;
  const institutes = useInstitutes.getState();
  const membership = institutes.memberships.find((m) => m.instituteId === link.instituteId);
  // The admin's name is loaded for the active institute only.
  const admin = currentInstitute(institutes)?.instituteId === link.instituteId && institutes.admin ? personLabel(institutes.admin) : null;
  return publishState({
    hasResult: state.result !== null,
    dirty: isDirty(link, docHash(state)),
    role: roleIn(institutes.memberships, link.instituteId),
    handle: membership?.handle ?? null,
    admin,
  });
}

/**
 * *Publish*: points the public link at the linked version, then shows the link. Unsaved changes ask to save
 * first, a missing handle opens the admin's handle dialog or tells an editor to ask the admin.
 */
export async function startPublish(api: OnlineApi, notify: Notify): Promise<void> {
  const link = useAppStore.getState().online;
  const state = currentPublishState();
  if (!link || !state) return;
  if (state.kind === "dirty") return showDialog({ kind: "saveFirst" });
  if (state.kind === "askAdmin") return showDialog({ kind: "askAdmin", message: state.message });
  const target: PublishTarget = { timetableId: link.timetableId, instituteId: link.instituteId, version: link.version, mode: "publish" };
  if (state.kind === "needsHandle") return showDialog({ kind: "handle", instituteId: link.instituteId, then: target });
  if (state.kind === "ready") await publishVersion(api, notify, target);
}

/** *Save and publish*: saves, then publishes if the save went through (a conflict opens its own dialog). */
export async function saveAndPublish(api: OnlineApi, notify: Notify): Promise<void> {
  if (await saveOnline(api, notify)) await startPublish(api, notify);
}

/**
 * Points `target`'s public link at its version. *Publish* then shows the link dialog, *Make live* a toast. When
 * the database finds no handle (the memberships were stale), the admin gets the handle dialog and an editor is
 * told to ask. Returns whether it worked.
 */
export async function publishVersion(api: OnlineApi, notify: Notify, target: PublishTarget): Promise<boolean> {
  try {
    await pointLink(api, target.timetableId, target.version);
  } catch (e) {
    if (e instanceof HandleRequired) {
      const role = roleIn(useInstitutes.getState().memberships, target.instituteId);
      showDialog(role === "admin" ? { kind: "handle", instituteId: target.instituteId, then: target } : { kind: "askAdmin", message: e.message });
    } else notify.error(`Couldn't publish: ${failureMessage(e)}`);
    return false;
  }
  if (target.mode === "makeLive") {
    notify.info(`The public link now shows version ${target.version}.`);
    return true;
  }
  const handle = useInstitutes.getState().memberships.find((m) => m.instituteId === target.instituteId)?.handle;
  const status = useOnline.getState().linked?.timetableId === target.timetableId ? useOnline.getState().linked : await api.status(target.timetableId).catch(() => null);
  if (handle && status) showDialog({ kind: "published", url: publicUrl(siteOrigin(), handle, status.publicId), version: target.version });
  else notify.info(`Published version ${target.version}.`);
  return true;
}

/** Points a timetable's public link at `version` and reloads the linked status. Throws `HandleRequired` or `DbFailure`. */
export async function pointLink(api: OnlineApi, timetableId: string, version: number): Promise<void> {
  await api.publish(timetableId, version);
  await refreshLinked(api);
}

/** *Unpublish*: takes the public link down; publishing again brings the same link back. Throws on refusal. */
export async function unpublishOnline(api: OnlineApi, timetableId: string): Promise<void> {
  await api.unpublish(timetableId);
  await refreshLinked(api);
}
