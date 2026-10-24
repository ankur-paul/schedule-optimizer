import type { SupabaseClient } from "@supabase/supabase-js";
import { create } from "zustand";
import { POLICY_VERSION } from "@/legal/policy";
import { gateDecision, highestVersion, parsePendingConsent, pendingConsentValue, PENDING_CONSENT_KEY } from "./consent";
import { dbErrorMessage, type DbError } from "./institutes";
import { DbFailure } from "./institutesApi";
import { storage } from "./storage";
import { failureMessage, type Notify } from "./useInstitutes";

/** The consent reads and writes. Both go through T24's policies and `record_consent` with the user's token. */
export interface ConsentApi {
  /** The highest policy version `userId` has accepted, or `null` for none. */
  acceptedMax(userId: string): Promise<number | null>;
  record(version: number): Promise<void>;
}

function check<T>({ data, error }: { data: T; error: DbError | null }): T {
  if (error) throw new DbFailure(dbErrorMessage(error));
  return data;
}

export function supabaseConsentApi(client: SupabaseClient): ConsentApi {
  return {
    async acceptedMax(userId) {
      const rows = check(await client.from("consents").select("version").eq("user_id", userId));
      return highestVersion((rows ?? []) as { version: number }[]);
    },
    async record(version) {
      check(await client.rpc("record_consent", { version }));
    },
  };
}

interface ConsentState {
  /** Whose consent this is; `null` when signed out. */
  userId: string | null;
  /** `checking` until the gate has decided; `ask` shows the blocking dialog; only `ok` lets the account in. */
  status: "checking" | "ask" | "ok";
  /** The highest version on record, for the dialog's title and "what changed" list. */
  acceptedMax: number | null;
}

const empty: ConsentState = { userId: null, status: "checking", acceptedMax: null };

/** The consent gate's state. The account menu, and with it `accept_invites()`, waits for `ok`. */
export const useConsent = create<ConsentState>(() => empty);

/** Whether `userId` is cleared to use their account. */
export function consented(state: ConsentState, userId: string): boolean {
  return state.status === "ok" && state.userId === userId;
}

/** The sign-in dialog's tick, kept across the Google or email-link redirect. */
export function savePendingConsent(version = POLICY_VERSION): void {
  storage.set(PENDING_CONSENT_KEY, pendingConsentValue(version));
}

export function clearPendingConsent(): void {
  storage.remove(PENDING_CONSENT_KEY);
}

/**
 * Runs after every sign-in and on load with a session, before anything else touches the account: lets the user
 * through if the current version is on record, records the box they ticked in this browser, or asks. A failed read
 * or record asks too, so nobody gets through unrecorded. Safe to call again for the same user.
 */
export async function startConsent(api: ConsentApi, userId: string, notify: Notify, current = POLICY_VERSION): Promise<void> {
  useConsent.setState({ ...empty, userId });
  let acceptedMax: number | null = null;
  try {
    acceptedMax = await api.acceptedMax(userId);
  } catch (e) {
    notify.error(`Couldn't check which Terms you accepted: ${failureMessage(e)}`);
  }
  if (useConsent.getState().userId !== userId) return;

  const decision = gateDecision(acceptedMax, parsePendingConsent(storage.get(PENDING_CONSENT_KEY)), current);
  if (decision === "ok") {
    clearPendingConsent();
    useConsent.setState({ status: "ok", acceptedMax });
    return;
  }
  if (decision === "record") {
    try {
      await api.record(current);
      if (useConsent.getState().userId !== userId) return;
      clearPendingConsent();
      useConsent.setState({ status: "ok", acceptedMax: current });
      return;
    } catch (e) {
      notify.error(`Couldn't record your acceptance: ${failureMessage(e)}`);
      if (useConsent.getState().userId !== userId) return;
    }
  }
  useConsent.setState({ status: "ask", acceptedMax });
}

/** *Accept* in the blocking dialog. On failure the dialog stays and says why. */
export async function acceptConsent(api: ConsentApi, notify: Notify, current = POLICY_VERSION): Promise<void> {
  const { userId } = useConsent.getState();
  if (!userId) return;
  try {
    await api.record(current);
  } catch (e) {
    notify.error(`Couldn't record your acceptance: ${failureMessage(e)}`);
    return;
  }
  if (useConsent.getState().userId !== userId) return;
  clearPendingConsent();
  useConsent.setState({ status: "ok", acceptedMax: current });
}

/** Signed out: forget the decision. The next sign-in runs the gate again. */
export function resetConsent(): void {
  useConsent.setState(empty);
}
