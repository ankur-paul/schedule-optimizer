import { useCallback, useEffect, useState } from "react";
import { Copy, ExternalLink, Radio } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAction } from "@/features/account/InstituteDialogs";
import type { Membership } from "@/features/account/institutes";
import { DbFailure } from "@/features/account/institutesApi";
import { failureMessage, notify, useInstitutes } from "@/features/account/useInstitutes";
import { initialData, useAppStore } from "@/store/useAppStore";
import { canEdit, docHash, hasUnsavedWork, roleIn } from "./online";
import type { OnlineApi, PublishStatus } from "./onlineApi";
import { cleanHandle, handleError, openedMessage, publicUrl, versionLabel, type VersionSummary } from "./publish";
import { openOnline, publishVersion, saveAndPublish, showDialog, unpublishOnline, useOnline, type PublishTarget, type TimetableRef } from "./useOnline";

const EMPTY_HASH = docHash(initialData());
const close = () => showDialog(null);
const origin = () => window.location.origin;

/** A read-only link with *Copy* and *Open*. */
function LinkField({ url }: { url: string }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied.");
    } catch {
      toast.error("Couldn't copy. Select the link and copy it yourself.");
    }
  };
  return (
    <div className="flex items-center gap-2">
      <Input readOnly aria-label="Public link" value={url} onFocus={(e) => e.target.select()} className="font-mono text-xs" />
      <Button type="button" variant="outline" size="sm" onClick={() => void copy()}>
        <Copy /> Copy
      </Button>
      <a href={url} target="_blank" rel="noopener" className={buttonVariants({ variant: "outline", size: "sm" })}>
        <ExternalLink /> Open
      </a>
    </div>
  );
}

/** After *Publish*: the link to share. */
export function PublishedBody({ url, version }: { url: string; version: number }) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Published version {version}</DialogTitle>
        <DialogDescription>
          Anyone with this link can see the timetable without signing in; search engines don't list it. Publishing again updates what it shows,
          and the link stays the same.
        </DialogDescription>
      </DialogHeader>
      <LinkField url={url} />
      <DialogFooter>
        <Button onClick={close}>Done</Button>
      </DialogFooter>
    </>
  );
}

/** *Publish* with unsaved changes: the link shows a saved version, so save first. */
export function SaveFirstBody({ api }: { api: OnlineApi }) {
  const saving = useOnline((s) => s.saving);
  return (
    <>
      <DialogHeader>
        <DialogTitle>Save online first?</DialogTitle>
        <DialogDescription>
          The public link shows a saved version, and your working copy has changes that aren't saved online yet. Save them as a new version and
          publish it?
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="ghost" onClick={close}>
          Cancel
        </Button>
        <Button disabled={saving} onClick={() => void saveAndPublish(api, notify)}>
          {saving ? "Saving…" : "Save and publish"}
        </Button>
      </DialogFooter>
    </>
  );
}

/** An editor publishing in an institute without a handle. */
export function AskAdminBody({ message }: { message: string }) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Your institute needs a link name</DialogTitle>
        <DialogDescription>
          Public links start with the institute's link name, like /gndec/k7f3q9xa2m, and only the admin can set it. {message}
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button onClick={close}>OK</Button>
      </DialogFooter>
    </>
  );
}

/**
 * The admin's link name for an institute (the handle). Checked as you type by T27's rules; the server still says
 * when it's taken. `then` carries on with the publish that needed it.
 */
export function HandleDialog({
  api,
  institute,
  open,
  onOpenChange,
  onSaved,
  then,
}: {
  api: OnlineApi;
  institute: Membership | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Reloads the memberships, so the new handle is known before publishing goes on. */
  onSaved: () => Promise<void>;
  then?: PublishTarget;
}) {
  return (
    <Dialog open={open && !!institute} onOpenChange={onOpenChange}>
      <DialogContent>
        {institute && (
          <>
            <DialogHeader>
              <DialogTitle>{institute.handle ? "Change the link name" : "Choose a link name"}</DialogTitle>
              <DialogDescription>
                {institute.handle
                  ? `Public links of ${institute.name} start with it. Links shared before keep working: the part after the name finds the timetable.`
                  : `Public links of ${institute.name} start with it. Pick something short that students will recognise, like your college's initials.`}
              </DialogDescription>
            </DialogHeader>
            <HandleForm api={api} institute={institute} onDone={() => onOpenChange(false)} onSaved={onSaved} then={then} />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function HandleForm({
  api,
  institute,
  onDone,
  onSaved,
  then,
}: {
  api: OnlineApi;
  institute: Membership;
  onDone: () => void;
  onSaved: () => Promise<void>;
  then?: PublishTarget;
}) {
  const [handle, setHandle] = useState(institute.handle ?? "");
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const clean = cleanHandle(handle);
  const error = handleError(handle);
  const shown = handle !== (institute.handle ?? "") && handle.trim() !== "" ? (error ?? serverError) : serverError;
  const unchanged = clean === institute.handle;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (error || busy) return;
    if (unchanged && !then) return onDone();
    setBusy(true);
    try {
      if (!unchanged) await api.setHandle(institute.instituteId, clean);
      await onSaved();
      onDone();
      if (!unchanged) toast.success(`Links of ${institute.name} now start with /${clean}.`);
      if (then) await publishVersion(api, notify, then);
    } catch (e) {
      if (e instanceof DbFailure) setServerError(e.message);
      else toast.error(failureMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="grid gap-4" onSubmit={submit}>
      <div className="grid gap-2">
        <Label htmlFor="institute-handle">Link name</Label>
        <Input
          id="institute-handle"
          autoFocus
          autoComplete="off"
          spellCheck={false}
          maxLength={40}
          placeholder="gndec"
          value={handle}
          aria-invalid={!!shown || undefined}
          onChange={(e) => {
            setHandle(e.target.value);
            setServerError(null);
          }}
        />
        {shown ? (
          <p className="text-xs text-destructive">{shown}</p>
        ) : (
          <p className="text-xs text-muted-foreground">3–30 lowercase letters, digits or hyphens.</p>
        )}
        <p className="truncate font-mono text-xs text-muted-foreground">
          {origin()}/{clean || "…"}/k7f3q9xa2m
        </p>
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || !!error}>
          {busy ? "Saving…" : then ? "Save and publish" : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}

type Pending = { kind: "open"; version: number } | { kind: "makeLive"; version: number } | { kind: "unpublish" };

/**
 * A timetable's kept versions, newest first. Anyone in the institute may open one; editors and the admin make one
 * live or unpublish. Opening an older version and saving it restores it as the newest.
 */
export function VersionsBody({ api, timetable }: { api: OnlineApi; timetable: TimetableRef }) {
  const memberships = useInstitutes((s) => s.memberships);
  const role = roleIn(memberships, timetable.instituteId);
  const handle = memberships.find((m) => m.instituteId === timetable.instituteId)?.handle ?? null;
  const editor = canEdit(role);
  const [rows, setRows] = useState<VersionSummary[] | null>(null);
  const [status, setStatus] = useState<PublishStatus | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const { busy, run } = useAction();

  const load = useCallback(
    () =>
      run(async () => {
        const [versions, next] = await Promise.all([api.versions(timetable.timetableId), api.status(timetable.timetableId)]);
        setRows(versions);
        setStatus(next);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `run` is a fresh closure each render
    [api, timetable.timetableId],
  );
  useEffect(() => {
    void load();
  }, [load]);

  const open = async (version: number) => {
    let opened = version;
    if (await run(async () => void (opened = await openOnline(api, timetable.timetableId, timetable.instituteName, version)))) {
      close();
      toast.success(openedMessage(timetable.name, opened, useAppStore.getState().online?.version ?? opened, canEdit(role)));
    }
  };

  const chooseOpen = (version: number) => {
    const state = useAppStore.getState();
    if (hasUnsavedWork(state.online, docHash(state), EMPTY_HASH)) setPending({ kind: "open", version });
    else void open(version);
  };

  const makeLive = async (version: number) => {
    const target: PublishTarget = { timetableId: timetable.timetableId, instituteId: timetable.instituteId, version, mode: "makeLive" };
    // A refusal for want of a handle switches to that dialog; anything else is a toast.
    if (await publishVersion(api, notify, target)) {
      setPending(null);
      await load();
    } else setPending(null);
  };

  const unpublish = async () => {
    if (await run(() => unpublishOnline(api, timetable.timetableId))) {
      toast.success(`Unpublished ${timetable.name}. The link shows nothing until you publish again.`);
      setPending(null);
      await load();
    }
  };

  if (pending?.kind === "open") {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Replace your working copy?</DialogTitle>
          <DialogDescription>
            Your unsaved changes will be lost. Version {pending.version} of {timetable.name} replaces the data, locks and timetable on this device.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" disabled={busy} onClick={() => setPending(null)}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={busy} onClick={() => void open(pending.version)}>
            {busy ? "Opening…" : "Replace"}
          </Button>
        </DialogFooter>
      </>
    );
  }
  if (pending?.kind === "makeLive") {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Make version {pending.version} live?</DialogTitle>
          <DialogDescription>The public link will show version {pending.version} at once. The link itself doesn't change.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setPending(null)}>
            Cancel
          </Button>
          <Button onClick={() => void makeLive(pending.version)}>
            <Radio /> Make live
          </Button>
        </DialogFooter>
      </>
    );
  }
  if (pending?.kind === "unpublish") {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Unpublish {timetable.name}?</DialogTitle>
          <DialogDescription>
            Anyone who opens the link will see that it isn't published. Its versions stay, and publishing again brings back the same link.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" disabled={busy} onClick={() => setPending(null)}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={busy} onClick={() => void unpublish()}>
            {busy ? "Unpublishing…" : "Unpublish"}
          </Button>
        </DialogFooter>
      </>
    );
  }

  const live = status?.liveVersion ?? null;
  return (
    <>
      <DialogHeader>
        <DialogTitle>Versions of {timetable.name}</DialogTitle>
        <DialogDescription>
          Each Save online adds a version; kept: the last 20, plus the live one. Open one to load it here; saving it then makes it the newest
          version.
        </DialogDescription>
      </DialogHeader>
      {live !== null && status && (
        <div className="grid gap-2 rounded-lg border p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm">
              The public link shows <span className="font-medium">version {live}</span>.
            </span>
            {editor && (
              <Button variant="ghost" size="sm" className="text-destructive" disabled={busy} onClick={() => setPending({ kind: "unpublish" })}>
                Unpublish…
              </Button>
            )}
          </div>
          {handle && <LinkField url={publicUrl(origin(), handle, status.publicId)} />}
        </div>
      )}
      {rows === null ? (
        <p className="text-muted-foreground">{busy ? "Loading versions…" : "Couldn't load the versions."}</p>
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground">No versions kept.</p>
      ) : (
        <ul className="grid max-h-96 divide-y overflow-y-auto rounded-lg border">
          {rows.map((row) => (
            <li key={row.version} className="flex items-center gap-2 px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-sm">{versionLabel(row)}</span>
              {row.version === live && <Badge>Live</Badge>}
              {editor && row.version !== live && (
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => setPending({ kind: "makeLive", version: row.version })}>
                  Make live
                </Button>
              )}
              <Button size="sm" variant="outline" disabled={busy} onClick={() => chooseOpen(row.version)}>
                Open
              </Button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
