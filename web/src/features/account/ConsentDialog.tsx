import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LogOut, ScrollText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { POLICY_CHANGES, POLICY_VERSION } from "@/legal/policy";
import { changesSince, gateTitle } from "./consent";
import { signOut } from "./useAccount";
import { acceptConsent, useConsent, type ConsentApi } from "./useConsent";
import { notify } from "./useInstitutes";

/**
 * The consent gate's blocking dialog (T24): no close button, and Esc or a click outside does nothing. The only ways
 * on are *Accept* and *Sign out*.
 */
export function ConsentDialog({ client, api }: { client: SupabaseClient; api: ConsentApi }) {
  const status = useConsent((s) => s.status);
  const acceptedMax = useConsent((s) => s.acceptedMax);
  const [busy, setBusy] = useState<"accept" | "sign-out" | null>(null);
  const changes = changesSince(acceptedMax, POLICY_VERSION, POLICY_CHANGES);

  const accept = async () => {
    setBusy("accept");
    await acceptConsent(api, notify);
    setBusy(null);
  };

  const leave = async () => {
    setBusy("sign-out");
    const error = await signOut(client);
    setBusy(null);
    if (error) toast.error(error);
  };

  return (
    <Dialog open={status === "ask"} onOpenChange={() => {}} disablePointerDismissal>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="flex items-start gap-2">
            <ScrollText className="size-5 shrink-0 text-primary" /> {gateTitle(acceptedMax)}
          </DialogTitle>
          <DialogDescription>
            {acceptedMax === null
              ? "To use your account, agree to the Terms and Privacy Policy. Signed out, the app works the same."
              : "Accept them to keep using your account, or sign out. Signed out, the app works the same."}
          </DialogDescription>
        </DialogHeader>
        {changes.length > 0 && (
          <div className="grid gap-1">
            <p className="font-medium">What changed</p>
            <ul className="list-disc space-y-0.5 pl-5">
              {changes.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        )}
        <p>
          Read the{" "}
          <a href="/terms" target="_blank" rel="noopener" className="font-medium text-primary underline underline-offset-4">
            Terms
          </a>{" "}
          and the{" "}
          <a href="/privacy" target="_blank" rel="noopener" className="font-medium text-primary underline underline-offset-4">
            Privacy Policy
          </a>
          .
        </p>
        <DialogFooter>
          <Button variant="ghost" disabled={busy !== null} onClick={() => void leave()}>
            <LogOut /> {busy === "sign-out" ? "Signing out…" : "Sign out"}
          </Button>
          <Button disabled={busy !== null} onClick={() => void accept()}>
            {busy === "accept" ? "Saving…" : "Accept"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
