import { useEffect } from "react";
import { Redo2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useGenerating } from "@/features/generate/useGenerate";
import { nextRedoLabel, nextUndoLabel } from "@/store/undo";
import { useAppStore } from "@/store/useAppStore";
import { runRedo, runUndo } from "./runUndo";
import { isMac, isTextField, shortcutLabel, undoShortcut } from "./shortcuts";

const mac = typeof navigator !== "undefined" && isMac(navigator.platform || navigator.userAgent);

/**
 * Header Undo and Redo (T41), each shown only when there is something to undo or redo, plus Ctrl+Z and Ctrl+Shift+Z
 * outside text fields. Both wait while Generate runs, whose result would land on top of the restored copy.
 */
export function UndoButtons() {
  const undoLabel = useAppStore((s) => nextUndoLabel(s.history));
  const redoLabel = useAppStore((s) => nextRedoLabel(s.history));
  const generating = useGenerating();

  useEffect(() => {
    if (generating) return;
    const onKey = (e: KeyboardEvent) => {
      const action = undoShortcut(e);
      if (!action || isTextField(e.target as HTMLElement | null)) return;
      const { history } = useAppStore.getState();
      if (action === "undo" ? !history.undo.length : !history.redo.length) return;
      e.preventDefault();
      if (action === "undo") runUndo();
      else runRedo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [generating]);

  return (
    <>
      {undoLabel && <HistoryButton action="undo" label={undoLabel} disabled={generating} onClick={runUndo} />}
      {redoLabel && <HistoryButton action="redo" label={redoLabel} disabled={generating} onClick={runRedo} />}
    </>
  );
}

function HistoryButton({ action, label, disabled, onClick }: { action: "undo" | "redo"; label: string; disabled: boolean; onClick: () => void }) {
  const name = action === "undo" ? "Undo" : "Redo";
  return (
    <Tooltip>
      <TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`${name}: ${label}`} disabled={disabled} onClick={onClick} />}>
        {action === "undo" ? <Undo2 /> : <Redo2 />}
      </TooltipTrigger>
      <TooltipContent>
        {name}: {label} ({shortcutLabel(action, mac)})
      </TooltipContent>
    </Tooltip>
  );
}
