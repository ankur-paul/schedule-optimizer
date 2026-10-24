import { useEffect, useState } from "react";
import { Crown, Mail, Trash2, UserMinus, X } from "lucide-react";
import { toast } from "sonner";
import { LearnMore } from "@/components/LearnMore";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { helpHref } from "@/help/helpLinks";
import { deleteConfirmed, inviteError, MAX_NAME, nameError, personLabel, ROLE_LABEL, sortMembers, type Invite, type InviteRole, type Member, type Membership } from "./institutes";
import type { InstitutesApi } from "./institutesApi";
import { requestAction } from "./useEmailConfirm";
import { createAndSwitch, dismissCreate, failureMessage, notify, refreshInstitutes } from "./useInstitutes";

const selectClass =
  "h-8 min-w-0 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50";

function RoleSelect({ value, onChange, label, disabled }: { value: InviteRole; onChange: (r: InviteRole) => void; label: string; disabled?: boolean }) {
  return (
    <select aria-label={label} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as InviteRole)} className={selectClass}>
      <option value="editor">Editor</option>
      <option value="viewer">Viewer</option>
    </select>
  );
}

/** Runs a database action with a busy flag; a refusal becomes a toast in plain words. Returns whether it worked. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const run = async (action: () => Promise<void>): Promise<boolean> => {
    setBusy(true);
    try {
      await action();
      return true;
    } catch (e) {
      toast.error(failureMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}

/** A name form shared by *Create institute* and *Rename*. */
function NameForm({ initial, submit, busy, id, children }: { initial: string; submit: (name: string) => void; busy: boolean; id: string; children: React.ReactNode }) {
  const [name, setName] = useState(initial);
  const [tried, setTried] = useState(false);
  const error = nameError(name);
  const shown = (tried || name !== initial) && error;
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setTried(true);
        if (!error && !busy) submit(name.trim());
      }}
    >
      <div className="grid gap-2">
        <Label htmlFor={id}>Institute name</Label>
        <Input id={id} autoFocus maxLength={MAX_NAME + 20} placeholder="GNDEC Ludhiana" value={name} aria-invalid={!!shown || undefined} onChange={(e) => setName(e.target.value)} />
        {shown && <p className="text-xs text-destructive">{shown}</p>}
      </div>
      <DialogFooter>{children}</DialogFooter>
    </form>
  );
}

/** Opens by itself after a sign-in with no institute; *Not now* stops that, and the menu's item opens it again. */
export function CreateInstituteDialog({ api, open, onOpenChange }: { api: InstitutesApi; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { busy, run } = useAction();
  const create = async (name: string) => {
    if (await run(() => createAndSwitch(api, name, notify))) {
      onOpenChange(false);
      toast.success(`Created ${name}. You're its admin.`);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create an institute</DialogTitle>
          <DialogDescription>
            An institute groups the people who build its timetables. You become its admin and can invite editors and viewers.{" "}
            <LearnMore href={helpHref("online", "institutes")} />
          </DialogDescription>
        </DialogHeader>
        {open && (
          <NameForm id="create-institute-name" initial="" submit={create} busy={busy}>
            <Button type="button" variant="ghost" onClick={dismissCreate}>
              Not now
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Creating…" : "Create institute"}
            </Button>
          </NameForm>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function RenameDialog({ api, institute, open, onOpenChange }: { api: InstitutesApi; institute: Membership; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { busy, run } = useAction();
  const rename = async (name: string) => {
    if (name === institute.name) return onOpenChange(false);
    if (await run(() => api.rename(institute.instituteId, name))) {
      onOpenChange(false);
      toast.success(`Renamed to ${name}.`);
      await refreshInstitutes(api, notify);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename institute</DialogTitle>
        </DialogHeader>
        {open && (
          <NameForm id="rename-institute-name" initial={institute.name} submit={rename} busy={busy}>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Rename"}
            </Button>
          </NameForm>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function DeleteDialog({ api, institute, open, onOpenChange }: { api: InstitutesApi; institute: Membership; open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {institute.name}?</DialogTitle>
          <DialogDescription>
            Every member loses access and pending invites are cancelled. This can't be undone. The timetable data in your browser is not affected.
          </DialogDescription>
        </DialogHeader>
        {open && <DeleteForm api={api} institute={institute} close={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

/** Mounted only while the dialog is open, so the typed name starts empty each time. */
function DeleteForm({ api, institute, close }: { api: InstitutesApi; institute: Membership; close: () => void }) {
  const { busy, run } = useAction();
  const [typed, setTyped] = useState("");
  const confirmed = deleteConfirmed(typed, institute.name);
  const remove = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmed || busy) return;
    if (await run(() => api.deleteInstitute(institute.instituteId))) {
      close();
      toast.success(`Deleted ${institute.name}.`);
      await refreshInstitutes(api, notify);
    }
  };
  return (
    <form className="grid gap-4" onSubmit={remove}>
      <div className="grid gap-2">
        <Label htmlFor="delete-institute-name">
          Type <span className="font-semibold">{institute.name}</span> to confirm
        </Label>
        <Input id="delete-institute-name" autoFocus autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={close}>
          Cancel
        </Button>
        <Button type="submit" variant="destructive" disabled={!confirmed || busy}>
          <Trash2 /> {busy ? "Deleting…" : "Delete institute"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Admin only (the menu hides it from others, and T20's policies refuse them anyway). */
export function MembersDialog({ api, institute, open, onOpenChange }: { api: InstitutesApi; institute: Membership; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const { busy, run } = useAction();
  const id = institute.instituteId;

  const load = async () => {
    await run(async () => {
      const data = await api.members(id);
      setMembers(sortMembers(data.members));
      setInvites(data.invites);
    });
  };

  useEffect(() => {
    if (!open) return;
    setMembers(null);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when the dialog opens or the institute changes
  }, [open, id]);

  const act = async (action: () => Promise<void>, done?: string): Promise<boolean> => {
    const ok = await run(action);
    if (ok && done) toast.success(done);
    if (ok) await load();
    return ok;
  };

  const setRole = (m: Member, role: InviteRole) => act(() => api.setRole(id, m.userId, role), `${personLabel(m)} is now ${role === "editor" ? "an editor" : "a viewer"}.`);

  // Needs a recent email-link sign-in (T26): runs at once if there is one, else the email dialog takes over.
  const makeAdmin = (m: Member) => {
    if (!confirm(`Make ${personLabel(m)} the admin of ${institute.name}? You'll become an editor.`)) return;
    onOpenChange(false);
    void requestAction(api, { kind: "make_admin", instituteId: id, instituteName: institute.name, userId: m.userId, userLabel: personLabel(m) }, notify);
  };

  const remove = (m: Member) => {
    if (confirm(`Remove ${personLabel(m)} from ${institute.name}?`)) void act(() => api.removeMember(id, m.userId), `Removed ${personLabel(m)}.`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Members of {institute.name}</DialogTitle>
          <DialogDescription>
            You're the admin: you decide who has access and with which role. <LearnMore href={helpHref("online", "institutes")}>What each role can do</LearnMore>
          </DialogDescription>
        </DialogHeader>

        {members === null ? (
          <p className="text-muted-foreground">{busy ? "Loading members…" : "Couldn't load the members."}</p>
        ) : (
          <div className="grid gap-5">
            <ul className="grid divide-y rounded-lg border">
              {members.map((m) => (
                <li key={m.userId} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{personLabel(m)}</div>
                    {m.name && m.email && <div className="truncate text-xs text-muted-foreground">{m.email}</div>}
                  </div>
                  {m.role === "admin" ? (
                    <Badge variant="secondary">
                      <Crown /> Admin
                    </Badge>
                  ) : (
                    <>
                      <RoleSelect label={`Role of ${personLabel(m)}`} value={m.role} disabled={busy} onChange={(r) => void setRole(m, r)} />
                      <Button variant="ghost" size="sm" disabled={busy} onClick={() => makeAdmin(m)}>
                        <Crown /> Make admin
                      </Button>
                      <Button variant="ghost" size="sm" className="text-destructive" disabled={busy} onClick={() => remove(m)}>
                        <UserMinus /> Remove
                      </Button>
                    </>
                  )}
                </li>
              ))}
            </ul>

            {invites.length > 0 && (
              <div className="grid gap-2">
                <h3 className="text-sm font-medium">Pending invites</h3>
                <ul className="grid divide-y rounded-lg border">
                  {invites.map((i) => (
                    <li key={i.email} className="flex items-center gap-2 px-3 py-2">
                      <span className="min-w-0 flex-1 truncate">{i.email}</span>
                      <span className="text-xs text-muted-foreground">{ROLE_LABEL[i.role]}</span>
                      <Button variant="ghost" size="sm" disabled={busy} onClick={() => void act(() => api.cancelInvite(id, i.email), `Cancelled the invite for ${i.email}.`)}>
                        <X /> Cancel
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <InviteForm busy={busy} check={(email) => inviteError(email, members, invites)} send={(email, role) => act(() => api.invite(id, email, role))} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function InviteForm({ busy, check, send }: { busy: boolean; check: (email: string) => string | null; send: (email: string, role: InviteRole) => Promise<boolean> }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InviteRole>("editor");
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = check(email);
    setError(problem);
    if (problem) return;
    const address = email.trim().toLowerCase();
    if (!(await send(address, role))) return;
    toast.success(`Invited ${address} as ${role}. Ask them to sign in with that address.`);
    setEmail("");
  };
  return (
    <form className="grid gap-2" onSubmit={submit}>
      <Label htmlFor="invite-email">Invite someone</Label>
      <div className="flex flex-wrap gap-2">
        <Input
          id="invite-email"
          type="email"
          autoComplete="off"
          placeholder="name@college.ac.in"
          className="min-w-48 flex-1"
          value={email}
          aria-invalid={!!error || undefined}
          onChange={(e) => {
            setEmail(e.target.value);
            setError(null);
          }}
        />
        <RoleSelect label="Role for the invite" value={role} onChange={setRole} />
        <Button type="submit" disabled={busy || !email.trim()}>
          <Mail /> Invite
        </Button>
      </div>
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Use the address they'll sign in with (Google or email link). No email is sent: they join when they next sign in.
        </p>
      )}
    </form>
  );
}
