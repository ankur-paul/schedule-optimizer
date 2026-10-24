import { create } from "zustand";
import { failureMessage, type Notify } from "@/features/account/useInstitutes";
import { useAppStore } from "@/store/useAppStore";
import { docHash, fromDoc, toDoc, type Conflict } from "./online";
import { NotEditable, SaveConflict, type OnlineApi } from "./onlineApi";

export type OnlineDialog =
  | { kind: "create" }
  | { kind: "conflict"; conflict: Conflict | null }
  | { kind: "gone"; message: string }
  | { kind: "open" }
  | { kind: "rename" }
  | { kind: "delete" };

interface OnlineState {
  dialog: OnlineDialog | null;
  /** A save from the menu or the conflict dialog is running. */
  saving: boolean;
}

/** The status menu's dialogs and the save in flight. The link itself lives in the app store, with the data. */
export const useOnline = create<OnlineState>(() => ({ dialog: null, saving: false }));

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
 * at all if the working copy was linked elsewhere meanwhile.
 */
export async function saveOnline(api: OnlineApi, notify: Notify, base?: number): Promise<void> {
  const link = useAppStore.getState().online;
  if (!link) return showDialog({ kind: "create" });
  if (useOnline.getState().saving) return;
  const { doc, hash } = snapshot();
  useOnline.setState({ saving: true, dialog: null });
  try {
    const version = await api.save(link.timetableId, doc, base ?? link.version);
    const now = useAppStore.getState().online;
    if (now?.timetableId === link.timetableId) useAppStore.getState().setOnline({ ...now, version, savedHash: hash });
    notify.info(`Saved ${link.name} online (version ${version}).`);
  } catch (e) {
    if (e instanceof SaveConflict) showDialog({ kind: "conflict", conflict: e.conflict });
    else if (e instanceof NotEditable) showDialog({ kind: "gone", message: e.message });
    else notify.error(`Couldn't save online: ${failureMessage(e)}`);
  } finally {
    useOnline.setState({ saving: false });
  }
}

/** First save and *Save as new timetable*: creates version 1 in `institute` and links the working copy to it. Throws on refusal. */
export async function createOnline(api: OnlineApi, institute: { instituteId: string; name: string }, name: string): Promise<void> {
  const { doc, hash } = snapshot();
  const { timetableId, version } = await api.create(institute.instituteId, name, doc);
  useAppStore.getState().setOnline({ instituteId: institute.instituteId, instituteName: institute.name, timetableId, name: name.trim(), version, savedHash: hash });
}

/**
 * Downloads a timetable's latest version into the working copy and links to it; the step and time limit stay.
 * `instituteName` is kept in the link for the signed-out status line. Throws on refusal or unreadable data.
 */
export async function openOnline(api: OnlineApi, timetableId: string, instituteName: string): Promise<void> {
  const opened = await api.open(timetableId);
  const data = fromDoc(opened.data);
  useAppStore.getState().loadOnline(data, {
    instituteId: opened.instituteId,
    instituteName,
    timetableId,
    name: opened.name,
    version: opened.version,
    savedHash: docHash(data),
  });
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
