import { useEffect, useState } from "react";
import { CopyPlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAction } from "@/features/account/InstituteDialogs";
import { deleteConfirmed, nameError, type Membership } from "@/features/account/institutes";
import { notify } from "@/features/account/useInstitutes";
import { initialData, useAppStore, type OnlineLink } from "@/store/useAppStore";
import { conflictText, defaultInstitute, defaultName, docHash, hasUnsavedWork, MAX_TIMETABLE_NAME, whenPhrase, type Conflict } from "./online";
import type { OnlineApi, TimetableSummary } from "./onlineApi";
import { createOnline, deleteOnline, openOnline, renameOnline, saveOnline, showDialog, useOnline } from "./useOnline";

const selectClass =
  "h-8 min-w-0 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50";

/** The hash of a fresh start: an unlinked copy that still matches it has nothing to lose. */
const EMPTY_HASH = docHash(initialData());

const close = () => showDialog(null);

/**
 * The status menu's dialogs, one at a time from `useOnline`. `editable` are the institutes the user may save into;
 * `active` is the institute *Open* lists.
 */
export function OnlineDialogs({ api, link, editable, active }: { api: OnlineApi; link: OnlineLink | null; editable: Membership[]; active: Membership | null }) {
  const dialog = useOnline((s) => s.dialog);
  const onOpenChange = (open: boolean) => !open && close();
  return (
    <>
      <Dialog open={dialog?.kind === "create"} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{link ? "Save as new timetable" : "Save online"}</DialogTitle>
            <DialogDescription>
              Uploads this working copy as a new timetable that the institute's members can open. Later saves add versions to it.
            </DialogDescription>
          </DialogHeader>
          {dialog?.kind === "create" && <CreateForm api={api} link={link} editable={editable} activeId={active?.instituteId ?? null} />}
        </DialogContent>
      </Dialog>

      <Dialog open={dialog?.kind === "conflict"} onOpenChange={onOpenChange}>
        <DialogContent>
          {dialog?.kind === "conflict" && link && <ConflictBody api={api} link={link} conflict={dialog.conflict} />}
        </DialogContent>
      </Dialog>

      <Dialog open={dialog?.kind === "gone"} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Can't save to {link?.name ?? "this timetable"}</DialogTitle>
            <DialogDescription>{dialog?.kind === "gone" ? dialog.message : null} Your working copy is unchanged.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            {editable.length > 0 && (
              <Button onClick={() => showDialog({ kind: "create" })}>
                <CopyPlus /> Save as new timetable…
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog?.kind === "open"} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-xl">{dialog?.kind === "open" && active && <OpenBody api={api} institute={active} />}</DialogContent>
      </Dialog>

      {link && (
        <>
          <Dialog open={dialog?.kind === "rename"} onOpenChange={onOpenChange}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Rename timetable</DialogTitle>
              </DialogHeader>
              {dialog?.kind === "rename" && <RenameForm api={api} link={link} />}
            </DialogContent>
          </Dialog>
          <Dialog open={dialog?.kind === "delete"} onOpenChange={onOpenChange}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete {link.name}?</DialogTitle>
                <DialogDescription>
                  Deletes every saved version online, for everyone in the institute, and takes down its public link. This can't be undone. Your working
                  copy stays on this device.
                </DialogDescription>
              </DialogHeader>
              {dialog?.kind === "delete" && <DeleteForm api={api} link={link} />}
            </DialogContent>
          </Dialog>
        </>
      )}
    </>
  );
}

function NameField({ id, value, onChange, shown }: { id: string; value: string; onChange: (v: string) => void; shown: string | null | false }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>Timetable name</Label>
      <Input
        id={id}
        autoFocus
        maxLength={MAX_TIMETABLE_NAME + 20}
        placeholder="CSE odd sem 2026"
        value={value}
        aria-invalid={!!shown || undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {shown && <p className="text-xs text-destructive">{shown}</p>}
    </div>
  );
}

/** Mounted while the dialog is open, so the name and institute start from their defaults each time. */
function CreateForm({ api, link, editable, activeId }: { api: OnlineApi; link: OnlineLink | null; editable: Membership[]; activeId: string | null }) {
  const printHeading = useAppStore((s) => s.printHeading);
  const [name, setName] = useState(() => defaultName(printHeading, link?.name ?? null));
  const [instituteId, setInstituteId] = useState(() => defaultInstitute(editable, activeId));
  const [tried, setTried] = useState(false);
  const { busy, run } = useAction();
  const institute = editable.find((m) => m.instituteId === instituteId);
  const error = nameError(name);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (error || busy || !institute) return;
    if (await run(() => createOnline(api, institute, name))) {
      close();
      toast.success(`Saved ${name.trim()} online in ${institute.name}.`);
    }
  };

  if (!editable.length) {
    return <p className="text-muted-foreground">You can save only to an institute where you are the admin or an editor. Ask an admin to make you an editor.</p>;
  }
  return (
    <form className="grid gap-4" onSubmit={submit}>
      <div className="grid gap-2">
        <Label htmlFor="online-institute">Institute</Label>
        <select id="online-institute" className={selectClass} value={instituteId ?? ""} onChange={(e) => setInstituteId(e.target.value)}>
          {editable.map((m) => (
            <option key={m.instituteId} value={m.instituteId}>
              {m.name}
            </option>
          ))}
        </select>
      </div>
      <NameField id="online-name" value={name} onChange={setName} shown={tried && error} />
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={close}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save online"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function ConflictBody({ api, link, conflict }: { api: OnlineApi; link: OnlineLink; conflict: Conflict | null }) {
  const saving = useOnline((s) => s.saving);
  return (
    <>
      <DialogHeader>
        <DialogTitle>{link.name} changed online</DialogTitle>
        <DialogDescription>
          {conflictText(conflict)}{" "}
          {conflict
            ? "Overwrite saves your working copy as the newest version; theirs stays in the version list. Or save yours as a new timetable."
            : "Save yours as a new timetable, or cancel and open theirs."}
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="ghost" onClick={close}>
          Cancel
        </Button>
        <Button variant="outline" onClick={() => showDialog({ kind: "create" })}>
          <CopyPlus /> Save as new timetable…
        </Button>
        {conflict && (
          <Button disabled={saving} onClick={() => void saveOnline(api, notify, conflict.latestVersion)}>
            Overwrite
          </Button>
        )}
      </DialogFooter>
    </>
  );
}

/** Lists the active institute's timetables; opening one with unsaved work asks first. */
function OpenBody({ api, institute }: { api: OnlineApi; institute: Membership }) {
  const [rows, setRows] = useState<TimetableSummary[] | null>(null);
  const [pending, setPending] = useState<TimetableSummary | null>(null);
  const { busy, run } = useAction();
  const linkedId = useAppStore((s) => s.online?.timetableId);

  useEffect(() => {
    void run(async () => setRows(await api.list(institute.instituteId)));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per institute while the dialog is open
  }, [api, institute.instituteId]);

  const open = async (row: TimetableSummary) => {
    if (await run(() => openOnline(api, row.id, institute.name))) {
      close();
      toast.success(`Opened ${row.name} (version ${useAppStore.getState().online?.version ?? row.latestVersion}).`);
    }
  };

  const choose = (row: TimetableSummary) => {
    const state = useAppStore.getState();
    if (hasUnsavedWork(state.online, docHash(state), EMPTY_HASH)) setPending(row);
    else void open(row);
  };

  if (pending) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Replace your working copy?</DialogTitle>
          <DialogDescription>
            Your unsaved changes will be lost. {pending.name} replaces the data, locks and timetable on this device.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" disabled={busy} onClick={() => setPending(null)}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={busy} onClick={() => void open(pending)}>
            {busy ? "Opening…" : "Replace"}
          </Button>
        </DialogFooter>
      </>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Open from {institute.name}</DialogTitle>
        <DialogDescription>Downloads the latest saved version into this browser and links to it, so Save online adds a version.</DialogDescription>
      </DialogHeader>
      {rows === null ? (
        <p className="text-muted-foreground">{busy ? "Loading timetables…" : "Couldn't load the timetables."}</p>
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground">No timetables saved in {institute.name} yet.</p>
      ) : (
        <ul className="grid max-h-96 divide-y overflow-y-auto rounded-lg border">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{row.name}</span>
                  {row.live && <Badge variant="secondary">Live</Badge>}
                  {row.id === linkedId && <Badge variant="outline">Open here</Badge>}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  Version {row.latestVersion}
                  {row.savedAt && ` · saved ${row.savedBy ? `by ${row.savedBy} ` : ""}${whenPhrase(row.savedAt)}`}
                </div>
              </div>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => choose(row)}>
                Open
              </Button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function RenameForm({ api, link }: { api: OnlineApi; link: OnlineLink }) {
  const [name, setName] = useState(link.name);
  const { busy, run } = useAction();
  const error = nameError(name);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (error || busy) return;
    if (name.trim() === link.name) return close();
    if (await run(() => renameOnline(api, link.timetableId, name))) {
      close();
      toast.success(`Renamed to ${name.trim()}.`);
    }
  };
  return (
    <form className="grid gap-4" onSubmit={submit}>
      <NameField id="online-rename" value={name} onChange={setName} shown={name !== link.name && error} />
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={close}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || !!error}>
          {busy ? "Saving…" : "Rename"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function DeleteForm({ api, link }: { api: OnlineApi; link: OnlineLink }) {
  const [typed, setTyped] = useState("");
  const { busy, run } = useAction();
  const confirmed = deleteConfirmed(typed, link.name);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmed || busy) return;
    if (await run(() => deleteOnline(api, link.timetableId))) {
      close();
      toast.success(`Deleted ${link.name}. Your working copy is now on this device only.`);
    }
  };
  return (
    <form className="grid gap-4" onSubmit={submit}>
      <div className="grid gap-2">
        <Label htmlFor="online-delete-name">
          Type <span className="font-semibold">{link.name}</span> to confirm
        </Label>
        <Input id="online-delete-name" autoFocus autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={close}>
          Cancel
        </Button>
        <Button type="submit" variant="destructive" disabled={!confirmed || busy}>
          <Trash2 /> {busy ? "Deleting…" : "Delete timetable"}
        </Button>
      </DialogFooter>
    </form>
  );
}
