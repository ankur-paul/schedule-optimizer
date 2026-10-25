import { AlertTriangle, Check, Circle, CircleX, Info, Loader2, Undo2 } from "lucide-react";
import { HelpLink } from "@/components/HelpLink";
import { Button } from "@/components/ui/button";
import type { Teacher } from "@/domain/types";
import { showFailure } from "@/features/generate/useGenerate";
import { helpHref } from "@/help/helpLinks";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/useAppStore";
import type { Card, StepState } from "./chat";
import { unmaskText } from "./mask";
import { discardCard, useAssistant } from "./useAssistant";

// A change card (T44): what the assistant proposes, one line per change, with *Apply* and *Discard*. Nothing changes
// until *Apply*; applyCard.ts runs it and this shows how far it got.

export const ONLINE_UNDO_NOTE = "Undo restores your working copy; the saved version stays online.";

/** The store's teachers, then any the card adds, so codes show as names. */
function namesFor(card: Card, current: Teacher[]): Teacher[] {
  const known = new Set(current.map((t) => t.id));
  return [...current, ...card.teachers.filter((t) => !known.has(t.id))];
}

export function ChangeCard({ card, onApply }: { card: Card; onApply: (n: number) => void }) {
  const current = useAppStore((s) => s.teachers);
  const setStep = useAppStore((s) => s.setStep);
  const busy = useAssistant((s) => s.busy !== null || s.applying !== null);
  const teachers = namesFor(card, current);
  const show = (text: string) => unmaskText(text, teachers);
  const applying = card.status === "applying";
  /** The step running now, for the spinner. */
  const running = applying ? card.steps.indexOf("pending") : -1;

  return (
    <section aria-label={`Changes #${card.n}`} className="grid gap-3 rounded-lg border bg-card p-3 shadow-xs">
      <div className="grid gap-1">
        <p className="text-xs font-medium text-muted-foreground">Changes #{card.n}</p>
        <p className="font-medium">{show(card.summary)}</p>
      </div>

      <ol className="grid gap-1.5">
        {card.lines.map((line, i) => (
          <li key={i} className="flex gap-2">
            <StepIcon state={card.steps[i]} running={i === running} />
            <div className="grid min-w-0 gap-0.5">
              <span className={cn(card.steps[i] === "done" && "text-muted-foreground")}>{show(line.text)}</span>
              {line.warning && <span className="text-xs text-amber-700">{show(line.warning)}</span>}
              {card.failure?.step === i && <span className="text-xs text-destructive">{show(card.failure.reason)}</span>}
            </div>
          </li>
        ))}
      </ol>

      {card.warnings.length > 0 && (
        <div className="grid gap-1 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
          <p className="font-medium">New data checks after these changes</p>
          <ul className="grid gap-0.5">
            {card.warnings.map((w, i) => (
              <li key={i} className="flex gap-1.5">
                {w.level === "error" ? <CircleX className="mt-px size-3.5 shrink-0" aria-label="Error" /> : <AlertTriangle className="mt-px size-3.5 shrink-0" aria-label="Warning" />}
                {show(w.text)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {card.online && (
        <p className="flex gap-1.5 text-xs text-muted-foreground">
          <Info className="mt-px size-3.5 shrink-0" aria-hidden /> {ONLINE_UNDO_NOTE}
        </p>
      )}

      {card.after && (
        <p className={cn("text-xs font-medium", card.after.failed ? "text-destructive" : "text-foreground")}>
          {card.after.text}
          {card.after.failed && (
            <>
              {" "}
              <button
                type="button"
                className="text-primary underline underline-offset-2"
                onClick={() => {
                  showFailure(true);
                  setStep(2);
                }}
              >
                See why
              </button>
            </>
          )}
        </p>
      )}

      <Footer card={card} busy={busy} onApply={onApply} />
    </section>
  );
}

function Footer({ card, busy, onApply }: { card: Card; busy: boolean; onApply: (n: number) => void }) {
  const note = (text: string, className = "text-muted-foreground") => <p className={cn("text-xs font-medium", className)}>{text}</p>;
  switch (card.status) {
    case "proposed":
      return (
        <div className="flex gap-2">
          <Button size="sm" onClick={() => onApply(card.n)} disabled={busy}>
            Apply
          </Button>
          <Button size="sm" variant="outline" onClick={() => discardCard(card.n)} disabled={busy}>
            Discard
          </Button>
          <HelpLink href={helpHref("online", "assistant-changes")} className="ml-auto self-center text-xs text-muted-foreground hover:text-foreground">
            How cards work
          </HelpLink>
        </div>
      );
    case "applying":
      return (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" aria-hidden /> Applying…
        </p>
      );
    case "applied":
      return (
        <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
          <Check className="size-3.5" aria-hidden /> Applied
          <span className="font-normal text-muted-foreground">
            · <Undo2 className="inline size-3" aria-hidden /> Undo in the header takes it back
          </span>
        </p>
      );
    case "stopped":
      return note(
        card.failure?.conflict ? "Stopped: someone saved first. Save by hand." : "Stopped at the failed step; the steps before it were made.",
        "text-destructive",
      );
    case "discarded":
      return note("Discarded");
    case "outOfDate":
      return (
        <div className="flex items-center gap-2">
          <Button size="sm" disabled>
            Apply
          </Button>
          {note("Out of date: ask again", "text-amber-700")}
        </div>
      );
  }
}

function StepIcon({ state, running }: { state: StepState; running: boolean }) {
  const cls = "mt-0.5 size-3.5 shrink-0";
  if (running) return <Loader2 className={cn(cls, "animate-spin text-muted-foreground")} aria-label="Running" />;
  if (state === "done") return <Check className={cn(cls, "text-emerald-600")} aria-label="Done" />;
  if (state === "failed") return <CircleX className={cn(cls, "text-destructive")} aria-label="Failed" />;
  return <Circle className={cn(cls, "text-muted-foreground/50")} aria-hidden />;
}
