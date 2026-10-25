import { causeHelpHref, unplacedHelpHref } from "@/features/generate/causeHelp";
import type { Cause } from "@/features/generate/causes";
import type { UnplacedCause } from "@/domain/types";
import { helpHref } from "@/help/helpLinks";

// *Ask about this* (T40): the question a problem card starts, with the card's details and its help link. It goes
// through maskText like any question, so teacher names in the details become codes.

/** An unplaced group lists at most this many different reasons (repeats are counted, not listed again). */
export const MAX_UNPLACED = 10;

export type AskCard =
  | { kind: "cause"; cause: Pick<Cause, "kind" | "detail" | "text" | "fix"> }
  | { kind: "couldntFinish"; title: string; body: string }
  | { kind: "unplaced"; cause: UnplacedCause | "other"; label: string; reasons: string[] }
  | { kind: "dataCheck"; tone: "error" | "warning"; text: string };

export function askText(card: AskCard): string {
  switch (card.kind) {
    case "cause":
      return [
        "The Generate step says my timetable can't be built. One reason it gives:",
        `"${card.cause.text}"`,
        `Its suggested fix: ${card.cause.fix}. Help: ${causeHelpHref(card.cause)}`,
        "What does this mean, and how do I fix it?",
      ].join("\n");
    case "couldntFinish":
      return [
        "The Generate step says:",
        `"${card.title}. ${card.body}"`,
        `Help: ${helpHref("generate", "couldnt-finish")}`,
        "What should I do?",
      ].join("\n");
    case "unplaced": {
      const counts = new Map<string, number>();
      for (const r of card.reasons) counts.set(r, (counts.get(r) ?? 0) + 1);
      const distinct = [...counts];
      const shown = distinct.slice(0, MAX_UNPLACED).map(([r, n]) => (n > 1 ? `- ${r} (${n} classes)` : `- ${r}`));
      const more = distinct.slice(MAX_UNPLACED).reduce((sum, [, n]) => sum + n, 0);
      return [
        `Some classes weren't placed. The reason given: "${card.label}" (${card.reasons.length}):`,
        ...shown,
        ...(more > 0 ? [`- and ${more} more`] : []),
        `Help: ${unplacedHelpHref(card.cause)}`,
        "Why weren't they placed, and how can I place them?",
      ].join("\n");
    }
    case "dataCheck":
      return [
        card.tone === "error" ? "A data check says this must be fixed before generating:" : "A data check warns:",
        `"${card.text}"`,
        `Help: ${helpHref("data", "data-checks")}`,
        "What does it mean, and how do I fix it?",
      ].join("\n");
  }
}
