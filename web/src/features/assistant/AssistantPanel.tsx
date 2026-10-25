import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Copy, Loader2, MessageSquarePlus, SendHorizontal, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { HelpLink } from "@/components/HelpLink";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SignInButton } from "@/features/account/AccountButton";
import { useAccount } from "@/features/account/useAccount";
import { setCreateOpen, useInstitutes } from "@/features/account/useInstitutes";
import { runOutcome } from "@/features/generate/useGenerate";
import { helpHref } from "@/help/helpLinks";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/useAppStore";
import { postAgent, supabaseAssistantApi, type AssistantApi } from "./agentClient";
import { askText, type AskCard } from "./askAbout";
import { allowanceLine, answerBlocks, askAdminLine, trialMailto, type Inline } from "./format";
import { unmaskText } from "./mask";
import { chooseInstitute, panelState, type PanelState } from "./panelState";
import {
  ask,
  askAbout,
  loadAccess,
  newChat,
  pickInstitute,
  redeemCoupon,
  setPanelOpen,
  takePending,
  useAssistant,
  type ChatItem,
} from "./useAssistant";

// The assistant (T40): a header button and a side panel whose content depends on who you are and whether your
// institute has access. Without Supabase (web/.env.local missing) neither renders, like the account button.

const CONTACT_EMAIL: string = import.meta.env?.VITE_CONTACT_EMAIL?.trim() ?? "";

/** The panel's width on wide screens; App pads the page by the same amount so nothing hides under it. */
export const PANEL_WIDTH = "sm:w-[26rem]";
export const PANEL_PAD = "sm:pr-[26rem]";

export function AssistantButton() {
  const open = useAssistant((s) => s.open);
  if (!supabase) return null;
  return (
    <Button variant={open ? "secondary" : "ghost"} size="sm" aria-expanded={open} onClick={() => setPanelOpen(!open)}>
      <Sparkles /> <span className="hidden sm:inline">Assistant</span>
    </Button>
  );
}

/** *Ask about this* on a problem card; only signed-in users see it. */
export function AskAboutButton({ card, className }: { card: AskCard; className?: string }) {
  const signedIn = useAccount((s) => s.session !== null);
  if (!supabase || !signedIn) return null;
  return (
    <button
      type="button"
      onClick={() => askAbout(askText(card))}
      className={cn("inline-flex items-center gap-1 whitespace-nowrap underline-offset-2 hover:underline print:hidden", className)}
    >
      <Sparkles className="size-3.5 shrink-0" aria-hidden />
      Ask about this
    </button>
  );
}

export function AssistantPanel() {
  const open = useAssistant((s) => s.open);
  if (!supabase || !open) return null;
  return <Panel client={supabase} />;
}

/** The time, once a minute, so an expiry locks the panel and the allowance line stays right while it is open. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

const toolData = () => ({ ...useAppStore.getState(), outcome: runOutcome() });

function Panel({ client }: { client: SupabaseClient }) {
  const api = useMemo(() => supabaseAssistantApi(client), [client]);
  const session = useAccount((s) => s.session);
  const userId = session?.user.id ?? null;
  const { loaded, memberships, rememberedId } = useInstitutes();
  const linkedId = useAppStore((s) => s.online?.instituteId ?? null);
  const { pickedId, access, accessFor, accessError, blocked, busy, items, pending } = useAssistant();
  const { institute, picker } = chooseInstitute(memberships, linkedId, pickedId, rememberedId);
  const instituteId = institute?.instituteId ?? null;
  const now = useNow();
  const state = panelState({
    signedIn: userId !== null,
    loaded,
    institute,
    access: accessFor === instituteId ? access : undefined,
    blocked,
    now,
  });

  // A different user starts a new chat.
  const lastUser = useRef(userId);
  useEffect(() => {
    if (lastUser.current !== userId) newChat();
    lastUser.current = userId;
  }, [userId]);

  useEffect(() => {
    if (userId && instituteId) void loadAccess(api, instituteId);
  }, [api, userId, instituteId]);

  const send = useCallback(
    (text: string) => {
      if (!instituteId) return;
      void ask(text, {
        api,
        post: (req, token) => postAgent(req, token),
        instituteId,
        toolData,
        reloadAccess: () => void loadAccess(api, instituteId),
      });
    },
    [api, instituteId],
  );

  // *Ask about this*: send once the chat is open and free; in any other settled state, just drop it.
  useEffect(() => {
    if (!pending || state.kind === "loading" || (state.kind === "open" && busy)) return;
    const text = takePending();
    if (text && state.kind === "open") send(text);
  }, [pending, state.kind, busy, send]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) setPanelOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const showAllowance = access && accessFor === instituteId && (state.kind === "open" || state.kind === "paused");
  const allowance = showAllowance ? allowanceLine(access, now) : null;

  return (
    <aside
      aria-label="Assistant"
      className={cn("fixed inset-0 z-40 flex flex-col bg-background sm:left-auto sm:border-l sm:shadow-lg print:hidden", PANEL_WIDTH)}
    >
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Sparkles className="size-4 text-primary" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm leading-tight font-semibold">Assistant</h2>
          {allowance && <p className={cn("text-xs", allowance.low ? "font-medium text-amber-700" : "text-muted-foreground")}>{allowance.text}</p>}
        </div>
        {items.length > 0 && (
          <Button variant="ghost" size="sm" onClick={newChat} disabled={busy !== null}>
            <MessageSquarePlus /> New chat
          </Button>
        )}
        <Button variant="ghost" size="icon-sm" aria-label="Close the assistant" onClick={() => setPanelOpen(false)}>
          <X />
        </Button>
      </div>

      {picker && state.kind !== "signedOut" && (
        <label className="flex items-center gap-2 border-b px-4 py-2 text-xs text-muted-foreground">
          Institute
          <select
            value={instituteId ?? ""}
            onChange={(e) => pickInstitute(e.target.value)}
            className="h-7 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {memberships.map((m) => (
              <option key={m.instituteId} value={m.instituteId}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <Conversation items={items} busy={busy}>
        <StateScreen state={state} client={client} api={api} accessError={accessError} instituteId={instituteId} hasChat={items.length > 0} />
      </Conversation>

      {state.kind === "open" && <Composer busy={busy !== null} onSend={send} />}
    </aside>
  );
}

/** The chat (kept on screen in every state), then the state's own screen or the busy line. */
function Conversation({ items, busy, children }: { items: ChatItem[]; busy: { tools: string[] } | null; children: React.ReactNode }) {
  const end = useRef<HTMLDivElement>(null);
  const teachers = useAppStore((s) => s.teachers);
  // Braces: Chrome's scrollIntoView returns a promise now, and an effect may only return a cleanup.
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [items.length, busy?.tools.length]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4" aria-live="polite">
      <div className="grid gap-3 text-sm">
        {items.map((item, i) =>
          item.kind === "question" ? (
            <p key={i} className="ml-8 rounded-lg bg-primary/10 px-3 py-2 whitespace-pre-wrap">
              {item.text}
            </p>
          ) : item.kind === "answer" ? (
            <div key={i} className="grid gap-1">
              {item.tools.length > 0 && <ToolList tools={item.tools} />}
              <Answer text={unmaskText(item.text, teachers)} />
            </div>
          ) : (
            <p key={i} className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive">
              {item.text}
            </p>
          ),
        )}
        {busy && (
          <div className="grid gap-1">
            {busy.tools.length > 0 && <ToolList tools={busy.tools} />}
            <p className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Thinking…
            </p>
          </div>
        )}
        {children}
      </div>
      <div ref={end} />
    </div>
  );
}

function ToolList({ tools }: { tools: string[] }) {
  return (
    <ul className="grid gap-0.5 text-xs text-muted-foreground">
      {tools.map((t, i) => (
        <li key={i}>· {t}</li>
      ))}
    </ul>
  );
}

function Answer({ text }: { text: string }) {
  return (
    <div className="grid gap-2 leading-relaxed">
      {answerBlocks(text).map((b, i) =>
        b.kind === "p" ? (
          <p key={i} className="whitespace-pre-wrap">
            <Parts parts={b.parts} />
          </p>
        ) : (
          (() => {
            const List = b.kind;
            return (
              <List key={i} className={cn("grid gap-1 pl-5", b.kind === "ul" ? "list-disc" : "list-decimal")}>
                {b.items.map((item, j) => (
                  <li key={j}>
                    <Parts parts={item.parts} />
                    {item.sub.length > 0 && (
                      <ul className="mt-1 grid list-[circle] gap-0.5 pl-5">
                        {item.sub.map((sub, k) => (
                          <li key={k}>
                            <Parts parts={sub} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </List>
            );
          })()
        ),
      )}
    </div>
  );
}

function Parts({ parts }: { parts: Inline[] }) {
  return parts.map((p, i) => {
    switch (p.kind) {
      case "text":
        return <span key={i}>{p.text}</span>;
      case "bold":
        return <strong key={i}>{p.text}</strong>;
      case "code":
        return (
          <code key={i} className="rounded bg-muted px-1 text-xs">
            {p.text}
          </code>
        );
      case "link":
        return (
          <a key={i} href={p.href} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">
            {p.text}
          </a>
        );
    }
  });
}

const ABOUT =
  "The assistant answers questions about using Lattice and about your own timetable: why it can't be built, why a " +
  "class wasn't placed, where the score comes from, when a teacher is free. It only reads your data; it changes nothing.";

function StateScreen({ state, client, api, accessError, instituteId, hasChat }: {
  state: PanelState;
  client: SupabaseClient;
  api: AssistantApi;
  accessError: string | null;
  instituteId: string | null;
  hasChat: boolean;
}) {
  const learnMore = (
    <HelpLink href={helpHref("online", "assistant")} className="text-xs text-muted-foreground hover:text-foreground">
      About the assistant
    </HelpLink>
  );
  const box = (children: React.ReactNode) => <div className="grid gap-3 rounded-lg border bg-muted/40 p-4">{children}</div>;

  switch (state.kind) {
    case "open":
      return hasChat ? null : <OpenIntro />;
    case "loading":
      return accessError ? (
        box(
          <>
            <p className="text-destructive">{accessError}</p>
            <div>
              <Button variant="outline" size="sm" onClick={() => instituteId && void loadAccess(api, instituteId)}>
                Try again
              </Button>
            </div>
          </>,
        )
      ) : (
        <p className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Loading…
        </p>
      );
    case "signedOut":
      return box(
        <>
          <p>{ABOUT}</p>
          <p className="font-medium">Sign in to use the assistant.</p>
          <div>
            <SignInButton client={client} />
          </div>
          {learnMore}
        </>,
      );
    case "noInstitute":
      return box(
        <>
          <p>{ABOUT}</p>
          <p className="font-medium">It works for members of an institute. Create one, or ask an institute's admin to invite you.</p>
          <div>
            <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
              Create an institute…
            </Button>
          </div>
          {learnMore}
        </>,
      );
    case "locked":
      return box(
        <>
          <p>{ABOUT}</p>
          {state.reason !== "none" && (
            <p className="font-medium">
              {state.reason === "expired" ? "Your institute's access has ended." : "Your institute has used all its questions."}
            </p>
          )}
          {state.role === "admin" ? <Unlock api={api} instituteId={instituteId!} renew={state.reason !== "none"} /> : <AskAdmin />}
          {learnMore}
        </>,
      );
    case "paused":
      return box(<p>The assistant is paused until next month: this month's spending limit for the service has been reached.</p>);
    case "notConfigured":
      return box(<p>The assistant isn't set up on this server.</p>);
  }
}

function OpenIntro() {
  return (
    <div className="grid gap-2 text-muted-foreground">
      <p>Ask about using Lattice or about your timetable, in any language. For example:</p>
      <ul className="list-disc pl-5">
        <li>Why is the score what it is?</li>
        <li>When is a teacher free on Monday?</li>
        <li>How do I lock a class?</li>
      </ul>
      <p className="text-xs">
        It only reads your data, and its answers can be wrong.{" "}
        <HelpLink href={helpHref("online", "assistant")} className="hover:text-foreground">
          More
        </HelpLink>
      </p>
    </div>
  );
}

function AskAdmin() {
  const admin = useAssistant((s) => s.admin);
  return <p className="font-medium">{askAdminLine(admin)}</p>;
}

function Unlock({ api, instituteId, renew }: { api: AssistantApi; instituteId: string; renew: boolean }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const membership = useInstitutes((s) => s.memberships.find((m) => m.instituteId === instituteId));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setError(await redeemCoupon(api, instituteId, code));
    setBusy(false);
  };

  return (
    <form onSubmit={submit} className="grid gap-2">
      <label htmlFor="coupon" className="font-medium">
        {renew ? "Redeem a new coupon to unlock it again" : "Unlock it with a trial coupon"}
      </label>
      <div className="flex gap-2">
        <Input
          id="coupon"
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setError(null);
          }}
          placeholder="LTC-XXXX-XXXX-XXXX-XXXX"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={error !== null || undefined}
          className="font-mono"
        />
        <Button type="submit" disabled={busy || !code.trim()}>
          {busy && <Loader2 className="animate-spin" />} Unlock
        </Button>
      </div>
      {error && <p className="text-destructive">{error}</p>}
      {CONTACT_EMAIL && membership && (
        <>
          <a href={trialMailto(CONTACT_EMAIL, membership)} className="text-xs text-primary underline underline-offset-2">
            Request a trial coupon
          </a>
          <ContactLine />
        </>
      )}
    </form>
  );
}

/** For admins without a mail app, where *Request a trial coupon* does nothing: the address to write to, with *Copy*. */
function ContactLine() {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(CONTACT_EMAIL);
      toast.success("Address copied.");
    } catch {
      toast.error("Couldn't copy. Select the address and copy it yourself.");
    }
  };
  return (
    <p className="text-xs text-muted-foreground">
      No email app? Write to <span className="select-all text-foreground">{CONTACT_EMAIL}</span> with your institute's name.{" "}
      <button type="button" onClick={() => void copy()} className="inline-flex items-center gap-1 underline-offset-2 hover:text-foreground hover:underline">
        <Copy className="size-3" /> Copy
      </button>
    </p>
  );
}

function Composer({ busy, onSend }: { busy: boolean; onSend: (text: string) => void }) {
  const [text, setText] = useState("");
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    area.current?.focus();
  }, []);

  const submit = () => {
    if (busy || !text.trim()) return;
    onSend(text.trim());
    setText("");
  };

  return (
    <form
      className="flex items-end gap-2 border-t px-4 py-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <textarea
        ref={area}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
        rows={2}
        placeholder="Ask about your timetable…"
        aria-label="Your question"
        className="max-h-40 min-h-10 flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none field-sizing-content focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
      <Button type="submit" size="icon" aria-label="Send" disabled={busy || !text.trim()}>
        <SendHorizontal />
      </Button>
    </form>
  );
}
