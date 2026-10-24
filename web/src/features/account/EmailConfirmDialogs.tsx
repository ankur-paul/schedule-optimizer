import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Mail, MailCheck, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { actionQuestion, pendingKey } from "./emailConfirm";
import type { InstitutesApi } from "./institutesApi";
import { useAccount } from "./useAccount";
import { cancelPending, checkPending, finishPending, sendConfirmLink, useEmailConfirm } from "./useEmailConfirm";
import { notify } from "./useInstitutes";

/**
 * The email step of *Make admin* and *Leave* (T26): one dialog sends the link, the other finishes the action once
 * the link has signed the user in again. Mounted with the account menu.
 */
export function EmailConfirmDialogs({ client, api }: { client: SupabaseClient; api: InstitutesApi }) {
  const token = useAccount((s) => s.session?.access_token);
  useEffect(() => checkPending(), [token]);

  // Finished in another tab: its stored action is gone, so close the offer here too.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      const { finishing } = useEmailConfirm.getState();
      if (finishing && e.key === pendingKey(finishing.by) && e.newValue === null) useEmailConfirm.setState({ finishing: null });
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return (
    <>
      <SendLinkDialog client={client} />
      <FinishDialog api={api} />
    </>
  );
}

function SendLinkDialog({ client }: { client: SupabaseClient }) {
  const asking = useEmailConfirm((s) => s.asking);
  const sentTo = useEmailConfirm((s) => s.sentTo);
  const email = useAccount((s) => s.session?.user.email);
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true);
    const error = await sendConfirmLink(client, window.location);
    setBusy(false);
    if (error) toast.error(error);
  };

  return (
    <Dialog open={asking !== null} onOpenChange={(open) => !open && cancelPending()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-primary" /> Confirm from your email
          </DialogTitle>
          <DialogDescription>{asking && actionQuestion(asking)}</DialogDescription>
        </DialogHeader>
        {sentTo ? (
          <p className="flex items-start gap-2">
            <MailCheck className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>
              Check your inbox at <span className="font-medium">{sentTo}</span> and open the link within the hour. It signs you in
              again and brings you back here to finish.
            </span>
          </p>
        ) : (
          <p>
            To make sure it's really you, we'll email a sign-in link to <span className="font-medium">{email}</span>. Opening it
            brings you back here to finish.
          </p>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={cancelPending}>
            Cancel
          </Button>
          <Button disabled={busy} variant={sentTo ? "outline" : "default"} onClick={() => void send()}>
            <Mail /> {busy ? "Sending…" : sentTo ? "Send again" : "Email me a link"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FinishDialog({ api }: { api: InstitutesApi }) {
  const finishing = useEmailConfirm((s) => s.finishing);
  const [busy, setBusy] = useState(false);

  const finish = async () => {
    setBusy(true);
    await finishPending(api, notify);
    setBusy(false);
  };

  return (
    <Dialog open={finishing !== null} onOpenChange={(open) => !open && cancelPending()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-primary" /> Email confirmed
          </DialogTitle>
          <DialogDescription>{finishing && actionQuestion(finishing)}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={cancelPending}>
            Cancel
          </Button>
          <Button disabled={busy} variant={finishing?.kind === "leave" ? "destructive" : "default"} onClick={() => void finish()}>
            {busy ? "Working…" : finishing?.kind === "leave" ? "Leave institute" : "Make admin"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
