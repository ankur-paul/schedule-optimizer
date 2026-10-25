import type { Room, Section, Teacher } from "@/domain/types";
import { teacherCodes } from "@/domain/teacherCodes";
import type { Access } from "./panelState";

// What the assistant panel shows (T40) apart from the chat logic: the allowance line, the trial-coupon email, the
// "Looked at…" lines while it works, and answers turned into safe React-renderable parts.

const DAY_MS = 24 * 60 * 60 * 1000;
/** The allowance line turns amber below this many questions or days. */
export const LOW_QUESTIONS = 20;
export const LOW_DAYS = 3;

/** "143 questions left · until 23 Nov", and whether it is running low. */
export function allowanceLine(access: Access, now: Date): { text: string; low: boolean } {
  const expires = new Date(access.expiresAt);
  const n = access.questionsLeft;
  const until = expires.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const low = n < LOW_QUESTIONS || expires.getTime() - now.getTime() < LOW_DAYS * DAY_MS;
  return { text: `${n} question${n === 1 ? "" : "s"} left · until ${until}`, low };
}

type RequestingInstitute = { name: string; handle: string | null };

export const TRIAL_SUBJECT = "Lattice assistant trial";

export function trialBody(institute: RequestingInstitute): string {
  return [`Institute: ${institute.name}`, `Handle: ${institute.handle ?? "(not set)"}`, "", "What will you use it for?", ""].join("\n");
}

/** *Request a trial coupon*: an email to the operator with the institute filled in. */
export function trialMailto(to: string, institute: RequestingInstitute): string {
  // encodeURIComponent, not URLSearchParams: mail apps read "+" as a plus, not a space.
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(TRIAL_SUBJECT)}&body=${encodeURIComponent(trialBody(institute))}`;
}

/**
 * The same email as a Gmail compose window. `account` (the signed-in email) goes in the path, `/mail/u/<email>/`,
 * so Gmail opens it in that account when several are signed in; without it, the first one (`/u/0/`). `tf=cm` opens
 * the compose window; the older `view=cm&fs=1` no longer does.
 */
export function trialGmailUrl(to: string, institute: RequestingInstitute, account?: string): string {
  const params: [string, string][] = [
    ["to", to],
    ["su", TRIAL_SUBJECT],
    ["body", trialBody(institute)],
    ["tf", "cm"],
  ];
  // encodeURIComponent, as for the mailto: Gmail shows a "+" from URLSearchParams as a plus.
  const query = params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
  return `https://mail.google.com/mail/u/${account ? encodeURIComponent(account) : "0"}/?${query}`;
}

/** The dialog's copy rows: the same email in three parts, to paste into any email. */
export function trialCopyRows(to: string, institute: RequestingInstitute): { label: string; value: string }[] {
  return [
    { label: "To", value: to },
    { label: "Subject", value: TRIAL_SUBJECT },
    { label: "Message", value: trialBody(institute) },
  ];
}

/** The locked screen's line for editors and viewers: whom to ask, with their email so they can. */
export function askAdminLine(admin: { name: string | null; email: string | null } | null): string {
  const name = admin?.name?.trim();
  const who = name && admin?.email ? `${name} (${admin.email})` : name || admin?.email;
  return who ? `Your institute's admin, ${who}, can unlock it.` : "Your institute's admin can unlock it.";
}

type Names = { sections: Pick<Section, "id" | "name">[]; rooms: Pick<Room, "id" | "name">[]; teachers: Pick<Teacher, "id" | "name">[] };

/** A section, room or teacher (by code) as the user knows it; the id itself when it isn't found. */
function entityName(kind: unknown, id: string, names: Names): string {
  if (kind === "teacher") {
    const codes = teacherCodes(names.teachers);
    const t = names.teachers.find((t) => codes.get(t.id) === id);
    return t ? t.name.trim() || t.id : id;
  }
  const list = kind === "section" ? names.sections : kind === "room" ? names.rooms : [];
  return list.find((e) => e.id === id || e.name.toLowerCase() === id.toLowerCase())?.name ?? id;
}

/** What a tool call looked at, for the busy list: "Looked at CSE-3A's week". */
export function toolLabel(name: string, input: unknown, names: Names): string {
  const args = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  const str = (key: string) => (typeof args[key] === "string" ? (args[key] as string) : "");
  switch (name) {
    case "overview":
      return "Looked at the overview";
    case "schedule":
      return `Looked at ${entityName(args.kind, str("id"), names)}'s week`;
    case "free_periods": {
      const day = str("day");
      return `Checked when ${entityName(args.kind, str("id"), names)} is free${day ? ` on ${day}` : ""}`;
    }
    case "problems":
      return "Looked at the problems";
    case "score_details":
      return str("rule") ? `Looked at the ${str("rule")} penalties` : "Looked at the score";
    case "find":
      return `Searched for "${entityName("teacher", str("text"), names)}"`;
    case "online_status":
      return "Looked at where it stands online";
    default:
      return `Used ${name}`;
  }
}

// --- answers ----------------------------------------------------------------------------------------------------

export type Inline =
  | { kind: "text"; text: string }
  | { kind: "bold"; text: string }
  | { kind: "code"; text: string }
  | { kind: "link"; text: string; href: string };

/** A list item, with the indented bullets under it (one level). */
export interface ListItem {
  parts: Inline[];
  sub: Inline[][];
}

export type AnswerBlock = { kind: "p"; parts: Inline[] } | { kind: "ul" | "ol"; items: ListItem[] };

/** Links the panel opens: the app's own pages, or https. Anything else stays text. */
export function safeHref(href: string): string | null {
  if (/^\/(help|privacy|terms)(?=$|[/#?])/.test(href)) return href;
  if (/^https:\/\/[^\s]+$/.test(href)) return href;
  return null;
}

// [text](href), **bold**, `code`, or a bare /help path.
const INLINE = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|`([^`]+)`|(?<![\w/])(\/help(?:\/[a-z-]+)?(?:#[a-z0-9-]+)?)/g;

export function inlineParts(text: string): Inline[] {
  const parts: Inline[] = [];
  const push = (part: Inline) => {
    const last = parts.at(-1);
    if (part.kind === "text" && last?.kind === "text") last.text += part.text;
    else if (part.text) parts.push(part);
  };
  let at = 0;
  for (const m of text.matchAll(INLINE)) {
    push({ kind: "text", text: text.slice(at, m.index) });
    const [whole, linkText, href, bold, code, bare] = m;
    if (linkText !== undefined) {
      const safe = safeHref(href);
      push(safe ? { kind: "link", text: linkText, href: safe } : { kind: "text", text: linkText });
    } else if (bold !== undefined) push({ kind: "bold", text: bold });
    else if (code !== undefined) push({ kind: "code", text: code });
    else if (bare !== undefined) push({ kind: "link", text: bare, href: bare });
    else push({ kind: "text", text: whole });
    at = m.index + whole.length;
  }
  push({ kind: "text", text: text.slice(at) });
  return parts;
}

const BULLET = /^(\s*)[-*•]\s+(.*)$/;
const NUMBERED = /^(\s*)\d+[.)]\s+(.*)$/;
const HEADING = /^\s*#{1,6}\s+(.*)$/;

/**
 * The model's markdown, the little of it the panel shows: paragraphs, bullet and numbered lists (an indented item
 * nests under the one before), headings as bold lines, bold, code and links. Rendered as React elements, never as HTML.
 */
export function answerBlocks(text: string): AnswerBlock[] {
  const blocks: AnswerBlock[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ kind: "p", parts: inlineParts(para.join("\n")) });
    para = [];
  };
  for (const line of text.split("\n")) {
    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    const heading = HEADING.exec(line);
    if (bullet || numbered) {
      flush();
      const [, indent, body] = (bullet ?? numbered)!;
      const parts = inlineParts(body);
      const last = blocks.at(-1);
      const kind = bullet ? "ul" : "ol";
      if (indent.length >= 2 && last && last.kind !== "p") last.items.at(-1)!.sub.push(parts);
      else if (last && last.kind === kind) last.items.push({ parts, sub: [] });
      else blocks.push({ kind, items: [{ parts, sub: [] }] });
    } else if (heading) {
      flush();
      blocks.push({ kind: "p", parts: [{ kind: "bold", text: heading[1].replace(/\*\*/g, "") }] });
    } else if (line.trim() === "") flush();
    else para.push(line);
  }
  flush();
  return blocks;
}
