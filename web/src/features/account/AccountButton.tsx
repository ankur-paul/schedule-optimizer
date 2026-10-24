import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LogIn, LogOut, Mail, MailCheck } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { authErrorMessage, avatarUrl, displayName, initials, looksLikeEmail, redirectUrl, withoutAuthError } from "./account";
import { syncAccount, useAccount } from "./useAccount";

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
  return session ? <AccountMenu client={client} user={session.user} /> : <SignInButton client={client} />;
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

  const google = async () => {
    setBusy("google");
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
        if (!next) setSentTo(null);
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
                Check your inbox at <span className="font-medium">{sentTo}</span> and open the link to sign in.
              </span>
            </p>
            <Button variant="ghost" size="sm" className="justify-self-start" onClick={() => setSentTo(null)}>
              Use a different email
            </Button>
          </div>
        ) : (
          <div className="grid gap-4">
            <Button variant="outline" disabled={busy !== null} onClick={google}>
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
              <Button type="submit" disabled={busy !== null || !looksLikeEmail(email)}>
                <Mail /> {busy === "email" ? "Sending…" : "Email me a sign-in link"}
              </Button>
            </form>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AccountMenu({ client, user }: { client: SupabaseClient; user: Parameters<typeof displayName>[0] }) {
  const name = displayName(user);
  const picture = avatarUrl(user);
  const signOut = async () => {
    const { error } = await client.auth.signOut();
    // Supabase drops the local session even when it can't reach the server, so only a session that survived is a failure.
    if (error && useAccount.getState().session) toast.error(`Couldn't sign out: ${error.message}`);
  };
  return (
    <DropdownMenu>
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
        <DropdownMenuItem onClick={signOut}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
