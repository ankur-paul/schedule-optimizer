import type { SupabaseClient } from "@supabase/supabase-js";
import { SOLVER_URL } from "@/engine/solveClient";
import { dbErrorMessage, type DbError } from "@/features/account/institutes";
import { DbFailure, supabaseApi, type Person } from "@/features/account/institutesApi";
import type { AgentReply, AgentRequest } from "./chat";
import type { Access } from "./panelState";

// The assistant's calls (T40): `POST /agent` (server/agent.py) with the Supabase token, and the access row and coupon
// redeeming (T36) through Supabase with the user's own token.

/** The agent runs as its own Lambda when deployed; locally it is the solver's FastAPI app. */
export const AGENT_URL: string = import.meta.env?.VITE_AGENT_URL || SOLVER_URL;
/** One Claude call of up to 8,000 tokens, plus the Supabase checks. */
export const AGENT_TIMEOUT_MS = 120_000;

/** A refused or failed `/agent` call: `reason` is the server's (see chat.ts `errorOutcome`); `status` 0 is no answer. */
export class AgentFailure extends Error {
  readonly status: number;
  readonly reason: string | null;

  constructor(status: number, reason: string | null) {
    super(reason ?? `HTTP ${status}`);
    this.status = status;
    this.reason = reason;
  }
}

export interface AgentDeps {
  fetch?: typeof fetch;
  url?: string;
  signal?: AbortSignal;
}

export async function postAgent(req: AgentRequest, token: string, deps: AgentDeps = {}): Promise<AgentReply> {
  const fetchFn = deps.fetch ?? globalThis.fetch;
  const timeout = AbortSignal.timeout(AGENT_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetchFn(`${deps.url ?? AGENT_URL}/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(req),
      signal: deps.signal ? AbortSignal.any([deps.signal, timeout]) : timeout,
    });
  } catch (e) {
    if (deps.signal?.aborted) throw e;
    throw new AgentFailure(0, null);
  }
  if (!res.ok) {
    let reason: string | null = null;
    try {
      reason = ((await res.json()) as { reason?: string }).reason ?? null;
    } catch {
      // not JSON: a proxy or Lambda error page
    }
    throw new AgentFailure(res.status, reason);
  }
  return (await res.json()) as AgentReply;
}

/** The Supabase side of the panel. */
export interface AssistantApi {
  /** The current access token, or null when signed out. */
  token(): Promise<string | null>;
  /** The institute's `agent_access` row, or null when it has none. */
  access(instituteId: string): Promise<Access | null>;
  /** Redeems a coupon (admin only): the new access, or null for a wrong or used code. Throws a `DbFailure`. */
  redeem(instituteId: string, code: string): Promise<Access | null>;
  admin(instituteId: string): Promise<Person | null>;
}

interface AccessRow {
  questions_left: number;
  expires_at: string;
}

const toAccess = (row: AccessRow): Access => ({ questionsLeft: row.questions_left, expiresAt: row.expires_at });

function check<T>({ data, error }: { data: T; error: DbError | null }): T {
  if (error) throw new DbFailure(dbErrorMessage(error));
  return data;
}

export function supabaseAssistantApi(client: SupabaseClient): AssistantApi {
  return {
    async token() {
      const { data } = await client.auth.getSession();
      return data.session?.access_token ?? null;
    },

    async access(instituteId) {
      const row = check(await client.from("agent_access").select("questions_left, expires_at").eq("institute_id", instituteId).maybeSingle());
      return row ? toAccess(row as AccessRow) : null;
    },

    async redeem(instituteId, code) {
      // A wrong or used code returns no rows rather than raising (T36: raising would undo the counted try).
      const rows = check(await client.rpc("redeem_coupon", { institute_id: instituteId, code }));
      const row = (rows as AccessRow[] | null)?.[0];
      return row ? toAccess(row) : null;
    },

    admin: (instituteId) => supabaseApi(client).admin(instituteId),
  };
}
