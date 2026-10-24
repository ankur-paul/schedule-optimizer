import type { SupabaseClient } from "@supabase/supabase-js";
import { create } from "zustand";
import { redirectUrl } from "./account";
import { actionDone, confirmedRecently, parsePending, pendingKey, sendErrorMessage, type PendingAction } from "./emailConfirm";
import { EmailConfirmationNeeded, type InstitutesApi } from "./institutesApi";
import { storage } from "./storage";
import { useAccount } from "./useAccount";
import { failureMessage, refreshInstitutes, type Notify } from "./useInstitutes";

/** An action as the UI asks for it; who asked and when are filled in from the session. */
export type ActionRequest =
  | Omit<Extract<PendingAction, { kind: "make_admin" }>, "by" | "at">
  | Omit<Extract<PendingAction, { kind: "leave" }>, "by" | "at">;

interface EmailConfirmState {
  /** Waiting for the user to send (then open) the email link; drives the *Confirm from your email* dialog. */
  asking: PendingAction | null;
  /** Where the link went, once sent. */
  sentTo: string | null;
  /** Back through the link: the action to finish, behind one more *Confirm*. */
  finishing: PendingAction | null;
}

export const useEmailConfirm = create<EmailConfirmState>(() => ({ asking: null, sentTo: null, finishing: null }));

export type Outcome = "done" | "email" | "failed";

/** Runs the action. A T26 refusal (the email sign-in got too old) asks for the link again instead of erroring. */
export async function runAction(api: InstitutesApi, action: PendingAction, notify: Notify): Promise<Outcome> {
  try {
    if (action.kind === "make_admin") await api.makeAdmin(action.instituteId, action.userId);
    else await api.leave(action.instituteId);
  } catch (e) {
    if (e instanceof EmailConfirmationNeeded) {
      useEmailConfirm.setState({ asking: { ...action, at: Date.now() }, sentTo: null });
      return "email";
    }
    notify.error(failureMessage(e));
    return "failed";
  }
  notify.info(actionDone(action));
  await refreshInstitutes(api, notify);
  return "done";
}

/**
 * *Make admin* or *Leave*, after the user has said yes: runs now if this session signed in by email link in the last
 * few minutes, otherwise opens the dialog that sends the link.
 */
export async function requestAction(api: InstitutesApi, request: ActionRequest, notify: Notify, now = Date.now()): Promise<Outcome | null> {
  const session = useAccount.getState().session;
  if (!session) return null;
  const action = { ...request, by: session.user.id, at: now } as PendingAction;
  if (!confirmedRecently(session.access_token, now)) {
    useEmailConfirm.setState({ asking: action, sentTo: null });
    return "email";
  }
  return runAction(api, action, notify);
}

/**
 * Emails the signed-in user a sign-in link (no new account) and remembers the action, so opening the link, in this
 * tab or another, offers to finish it. Returns an error in plain words, or `null` once sent.
 */
export async function sendConfirmLink(client: Pick<SupabaseClient, "auth">, location: { origin: string }): Promise<string | null> {
  const { asking } = useEmailConfirm.getState();
  const email = useAccount.getState().session?.user.email;
  if (!asking) return null;
  if (!email) return "Your account has no email address to confirm with.";
  const { error } = await client.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: redirectUrl(location) } });
  if (error) return sendErrorMessage(error);
  storage.set(pendingKey(asking.by), JSON.stringify(asking));
  useEmailConfirm.setState({ sentTo: email });
  return null;
}

/**
 * On every session change: if this user has a pending action and the session now has a fresh email sign-in (they
 * came back through the link), offer to finish it.
 */
export function checkPending(now = Date.now()): void {
  const session = useAccount.getState().session;
  if (!session) return;
  const pending = parsePending(storage.get(pendingKey(session.user.id)), session.user.id, now);
  if (pending && confirmedRecently(session.access_token, now)) useEmailConfirm.setState({ finishing: pending, asking: null, sentTo: null });
}

/** *Confirm* on the finish dialog. The stored action is cleared first, so another tab can't run it twice. */
export async function finishPending(api: InstitutesApi, notify: Notify): Promise<Outcome | null> {
  const { finishing } = useEmailConfirm.getState();
  if (!finishing) return null;
  storage.remove(pendingKey(finishing.by));
  useEmailConfirm.setState({ finishing: null });
  return runAction(api, finishing, notify);
}

/** *Cancel* on either dialog: forget the action. */
export function cancelPending(): void {
  const { asking, finishing } = useEmailConfirm.getState();
  const by = asking?.by ?? finishing?.by;
  if (by) storage.remove(pendingKey(by));
  useEmailConfirm.setState({ asking: null, sentTo: null, finishing: null });
}
