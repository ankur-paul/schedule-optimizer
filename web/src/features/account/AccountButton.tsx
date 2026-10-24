import { useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Building2, CircleHelp, DoorOpen, FileText, Link2, LogIn, LogOut, Mail, MailCheck, Pencil, Plus, Shield, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { LearnMore } from "@/components/LearnMore";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuLinkItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabaseOnlineApi } from "@/features/online/onlineApi";
import { HandleDialog } from "@/features/online/PublishDialogs";
import { helpHref } from "@/help/helpLinks";
import { supabase } from "@/lib/supabase";
import { authErrorMessage, avatarUrl, displayName, initials, looksLikeEmail, redirectUrl, withoutAuthError } from "./account";
import { ConsentDialog } from "./ConsentDialog";
import { EmailConfirmDialogs } from "./EmailConfirmDialogs";
import { CreateInstituteDialog, DeleteDialog, MembersDialog, RenameDialog } from "./InstituteDialogs";
import { menuItems, roleLine, showSwitcher } from "./institutes";
import { supabaseApi, type InstitutesApi } from "./institutesApi";
import { signOut, syncAccount, useAccount } from "./useAccount";
import { consented, resetConsent, savePendingConsent, startConsent, supabaseConsentApi, useConsent } from "./useConsent";
import { requestAction } from "./useEmailConfirm";
import {
  currentInstitute,
  notify,
  refreshInstitutes,
  resetInstitutes,
  setCreateOpen,
  startInstitutes,
  switchInstitute,
  useInstitutes,
} from "./useInstitutes";

/**
 * The header's account control: *Sign in* when signed out, an avatar menu when signed in. Renders nothing without a
 * Supabase client, so the app stays exactly v1 when `web/.env.local` is missing.
 */
export function AccountButton() {
  return supabase ? <Account client={supabase} /> : null;
}

function Account({ client }: { client: SupabaseClient }) {
  const session = useAccount((s) => s.session);
  const ready = useAccount((s) => s.ready);

  useEffect(
    () =>
      syncAccount(client, (message) => {
        toast.error(message, { id: "auth-error" });
        window.history.replaceState(window.history.state, "", withoutAuthError(window.location.href));
      }),
    [client],
  );

  if (!ready) return null;
  return session ? <ConsentGate client={client} user={session.user} /> : <SignInButton client={client} />;
}

type SessionUser = Parameters<typeof displayName>[0] & { id: string };

/**
 * T24's gate: after every sign-in and on load with a session, nothing else happens to the account (the menu, and
 * with it `accept_invites()`) until the current Terms and Privacy Policy are accepted on record.
 */
function ConsentGate({ client, user }: { client: SupabaseClient; user: SessionUser }) {
  const api = useMemo(() => supabaseConsentApi(client), [client]);
  const userId = user.id;
  useEffect(() => {
    void startConsent(api, userId, notify);
    return resetConsent;
  }, [api, userId]);

  const ok = useConsent((s) => consented(s, userId));
  return ok ? <AccountMenu client={client} user={user} /> : <ConsentDialog client={client} api={api} />;
}

/** Unmounts on sign-in (the email link may land in another tab), so the dialog is closed again after a sign-out. */
function SignInButton({ client }: { client: SupabaseClient }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <LogIn /> Sign in
      </Button>
      <SignInDialog client={client} open={open} onOpenChange={setOpen} />
    </>
  );
}

function SignInDialog({ client, open, onOpenChange }: { client: SupabaseClient; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState<"google" | "email" | null>(null);
  const [agreed, setAgreed] = useState(false);

  const google = async () => {
    setBusy("google");
    // Google leaves the page; the gate records the tick when it comes back.
    savePendingConsent();
    const { error } = await client.auth.signInWithOAuth({ provider: "google", options: { redirectTo: redirectUrl(window.location) } });
    // On success the browser is already leaving for Google.
    if (error) {
      setBusy(null);
      toast.error(authErrorMessage(error));
    }
  };

  const sendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    const address = email.trim();
    setBusy("email");
    savePendingConsent();
    const { error } = await client.auth.signInWithOtp({ email: address, options: { emailRedirectTo: redirectUrl(window.location) } });
    setBusy(null);
    if (error) toast.error(authErrorMessage(error));
    else setSentTo(address);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          setSentTo(null);
          setAgreed(false);
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sign in</DialogTitle>
          <DialogDescription>
            Optional. The app works the same signed out, and your data stays in this browser either way.
          </DialogDescription>
        </DialogHeader>
        {sentTo ? (
          <div className="grid gap-3">
            <p className="flex items-start gap-2">
              <MailCheck className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>
                Check your inbox at <span className="font-medium">{sentTo}</span> and open the link to sign in.{" "}
                <LearnMore href={helpHref("troubleshooting", "email-link")}>Didn't get it?</LearnMore>
              </span>
            </p>
            <Button variant="ghost" size="sm" className="justify-self-start" onClick={() => setSentTo(null)}>
              Use a different email
            </Button>
          </div>
        ) : (
          <div className="grid gap-4">
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-0.5 size-4 shrink-0 accent-primary"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
              />
              <span>
                I agree to the{" "}
                <a href="/terms" target="_blank" rel="noopener" className="font-medium text-primary underline underline-offset-4">
                  Terms
                </a>{" "}
                and{" "}
                <a href="/privacy" target="_blank" rel="noopener" className="font-medium text-primary underline underline-offset-4">
                  Privacy Policy
                </a>
              </span>
            </label>
            <Button variant="outline" disabled={!agreed || busy !== null} onClick={google}>
              <GoogleLogo /> {busy === "google" ? "Opening Google…" : "Continue with Google"}
            </Button>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
            </div>
            <form className="grid gap-2" onSubmit={sendLink}>
              <Label htmlFor="sign-in-email">Email</Label>
              <Input
                id="sign-in-email"
                type="email"
                autoComplete="email"
                placeholder="you@college.ac.in"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Button type="submit" disabled={!agreed || busy !== null || !looksLikeEmail(email)}>
                <Mail /> {busy === "email" ? "Sending…" : "Email me a sign-in link"}
              </Button>
            </form>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

type InstituteDialog = "members" | "rename" | "handle" | "delete";

function AccountMenu({ client, user }: { client: SupabaseClient; user: SessionUser }) {
  const api = useMemo(() => supabaseApi(client), [client]);
  const onlineApi = useMemo(() => supabaseOnlineApi(client), [client]);
  const userId = user.id;
  useEffect(() => {
    void startInstitutes(api, userId, notify);
    return resetInstitutes;
  }, [api, userId]);

  const [dialog, setDialog] = useState<InstituteDialog | null>(null);
  const createOpen = useInstitutes((s) => s.createOpen);
  const active = useInstitutes(currentInstitute);
  const name = displayName(user);
  const picture = avatarUrl(user);
  const leave = async () => {
    const error = await signOut(client);
    if (error) toast.error(error);
  };
  return (
    <>
      <DropdownMenu onOpenChange={(open) => open && void refreshInstitutes(api, notify)}>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon" className="rounded-full" aria-label={`Account: ${name}`} />}
        >
          <Avatar size="sm">
            {picture && <AvatarImage src={picture} alt="" referrerPolicy="no-referrer" />}
            <AvatarFallback>{initials(name)}</AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-auto min-w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel>
              <div className="text-sm font-medium text-foreground">{name}</div>
              {user.email && user.email !== name && <div className="text-xs font-normal">{user.email}</div>}
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <InstituteItems api={api} onOpen={setDialog} />
          <DropdownMenuGroup>
            <DropdownMenuLinkItem href={helpHref("index")} target="_blank" rel="noopener">
              <CircleHelp /> Help
            </DropdownMenuLinkItem>
            <DropdownMenuLinkItem href="/privacy" target="_blank" rel="noopener">
              <Shield /> Privacy
            </DropdownMenuLinkItem>
            <DropdownMenuLinkItem href="/terms" target="_blank" rel="noopener">
              <FileText /> Terms
            </DropdownMenuLinkItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={leave}>
            <LogOut /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <CreateInstituteDialog api={api} open={createOpen} onOpenChange={setCreateOpen} />
      <EmailConfirmDialogs client={client} api={api} />
      {active && (
        <>
          <MembersDialog api={api} institute={active} open={dialog === "members" && active.role === "admin"} onOpenChange={(o) => setDialog(o ? "members" : null)} />
          <RenameDialog api={api} institute={active} open={dialog === "rename"} onOpenChange={(o) => setDialog(o ? "rename" : null)} />
          <HandleDialog
            api={onlineApi}
            institute={active.role === "admin" ? active : null}
            open={dialog === "handle"}
            onOpenChange={(o) => setDialog(o ? "handle" : null)}
            onSaved={() => refreshInstitutes(api, notify)}
          />
          <DeleteDialog api={api} institute={active} open={dialog === "delete"} onOpenChange={(o) => setDialog(o ? "delete" : null)} />
        </>
      )}
    </>
  );
}

/**
 * The institute part of the menu: the active institute with your role and its admin, the switcher (with 2+), and
 * what your role may do. Hiding items is cosmetic; T20's policies are the rule.
 */
function InstituteItems({ api, onOpen }: { api: InstitutesApi; onOpen: (dialog: InstituteDialog) => void }) {
  const memberships = useInstitutes((s) => s.memberships);
  const loaded = useInstitutes((s) => s.loaded);
  const admin = useInstitutes((s) => s.admin);
  const active = useInstitutes(currentInstitute);
  if (!loaded) return null;

  // Needs a recent email-link sign-in (T26), like Make admin.
  const leave = () => {
    if (!active || !confirm(`Leave ${active.name}? You'll need a new invite from the admin to come back.`)) return;
    void requestAction(api, { kind: "leave", instituteId: active.instituteId, instituteName: active.name }, notify);
  };

  const items = menuItems(active);
  return (
    <>
      {active && (
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              <Building2 className="size-4 shrink-0" /> {active.name}
            </div>
            <div className="text-xs font-normal">{roleLine(active.role, admin)}</div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
      )}
      {showSwitcher(memberships) && (
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs">Switch institute</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={active?.instituteId} onValueChange={(id: string) => void switchInstitute(api, id, notify)}>
            {memberships.map((m) => (
              <DropdownMenuRadioItem key={m.instituteId} value={m.instituteId}>
                {m.name}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      )}
      <DropdownMenuGroup>
        {items.includes("members") && (
          <DropdownMenuItem onClick={() => onOpen("members")}>
            <Users /> Members…
          </DropdownMenuItem>
        )}
        {items.includes("rename") && (
          <DropdownMenuItem onClick={() => onOpen("rename")}>
            <Pencil /> Rename…
          </DropdownMenuItem>
        )}
        {items.includes("handle") && active && (
          <DropdownMenuItem onClick={() => onOpen("handle")}>
            <Link2 /> Link name{active.handle ? `: ${active.handle}` : "…"}
          </DropdownMenuItem>
        )}
        {items.includes("delete") && (
          <DropdownMenuItem variant="destructive" onClick={() => onOpen("delete")}>
            <Trash2 /> Delete institute…
          </DropdownMenuItem>
        )}
        {items.includes("leave") && (
          <DropdownMenuItem onClick={leave}>
            <DoorOpen /> Leave institute…
          </DropdownMenuItem>
        )}
        {items.includes("create") && (
          <DropdownMenuItem onClick={() => setCreateOpen(true)}>
            <Plus /> Create institute…
          </DropdownMenuItem>
        )}
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
    </>
  );
}

function GoogleLogo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4">
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.8Z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1Z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9Z" />
    </svg>
  );
}
