import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { create } from "zustand";
import { authErrorMessage } from "./account";

interface AccountState {
  /** The signed-in session, or `null` when signed out. */
  session: Session | null;
  /** False until the stored session (or a sign-in redirect) has been read, so the header doesn't flash *Sign in*. */
  ready: boolean;
}

/** The sign-in state. Kept apart from the app store: signing in or out never touches the app's data. */
export const useAccount = create<AccountState>(() => ({ session: null, ready: false }));

/**
 * Keeps `useAccount` in step with Supabase: reads the stored session (finishing a Google or email-link redirect), then
 * follows sign-in, sign-out and token refreshes. A failed redirect, such as an expired link, goes to `onError` in
 * plain words. Returns the unsubscribe.
 */
export function syncAccount(client: Pick<SupabaseClient, "auth">, onError: (message: string) => void): () => void {
  let live = true;
  const { data } = client.auth.onAuthStateChange((_event, session) => {
    if (live) useAccount.setState({ session, ready: true });
  });
  void client.auth.initialize().then(async ({ error }) => {
    if (!live) return;
    if (error) {
      // A redirect error keeps its code (e.g. `otp_expired`) in `details`.
      const details = (error as { details?: { code?: string } }).details;
      onError(authErrorMessage({ code: details?.code ?? error.code, message: error.message, status: error.status }));
    }
    const { data: stored } = await client.auth.getSession();
    if (live) useAccount.setState({ session: stored.session, ready: true });
  });
  return () => {
    live = false;
    data.subscription.unsubscribe();
  };
}
