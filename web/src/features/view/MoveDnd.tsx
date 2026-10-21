import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type Announcements,
  type DragStartEvent,
} from "@dnd-kit/core";
import { GripVertical } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { score } from "@/domain/score";
import type { Id, Session } from "@/domain/types";
import { useAppStore } from "@/store/useAppStore";
import { subjectColor } from "./colors";
import { sessionLabel, slotLabel } from "@/domain/grid";
import type { PlacedSession, ViewData } from "./layout";
import { applyMove, checkMove, dragId, dropHint, editedResult, grabOffset, moveSummary, moveTargets, targetUnder, type MoveTarget } from "./moves";
import { CellCardBody, type GridDnd } from "./TimetableGrid";

/** What a draggable carries: the session, and its placed block (null for an unplaced session). */
interface DragData {
  sessionId: Id;
  entry: PlacedSession | null;
}

interface DragState {
  session: Session;
  entry: PlacedSession | null;
  targets: MoveTarget[][];
  /** Which period of a lab card the pointer grabbed; the drop slot is shifted back by this much. */
  offset: number;
  /** Size of the grabbed card, so the floating copy matches it. */
  size: { width: number; height: number } | null;
}

interface Props {
  data: ViewData;
  sessions: Map<Id, Session>;
  colors: Map<string, number>;
  locked: ReadonlySet<Id>;
  children: (dnd: GridDnd) => React.ReactNode;
}

/**
 * Drag a class to another slot (Section view). On drag start every slot is checked against the hard rules; slots go
 * green (with the score change) or red, and the floating card says why. A drop is re-validated, then the class is
 * moved, locked there, re-scored, and a toast offers Undo.
 */
export function MoveDnd({ data, sessions, colors, locked, children }: Props) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const [over, setOver] = useState<{ day: number; period: number } | null>(null);
  // A short movement threshold keeps a plain click opening the details dialog.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const targetAt = (day: number, period: number) => (drag ? targetUnder(drag.targets, day, period, drag.offset) : null);
  const dnd: GridDnd = { dragging: drag?.session.id ?? null, targetAt, over };

  // Screen-reader messages in words instead of dnd-kit's raw ids.
  const name = (id: string | number) => {
    const session = sessions.get((id as string).replace(/^session:/, ""));
    return session ? sessionLabel(data, session) : "class";
  };
  const slotData = (over: { data: { current?: unknown } } | null) => over?.data.current as { day: number; period: number } | undefined;
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${name(active.id)}`,
    onDragOver: ({ over }) => {
      const cell = slotData(over);
      return cell ? dropHint(data, targetAt(cell.day, cell.period)).text : "Not over a slot";
    },
    onDragEnd: ({ active, over }) => {
      const cell = slotData(over);
      return cell ? `Dropped ${name(active.id)} on ${slotLabel(data, cell.day, cell.period)}` : `${name(active.id)} was not moved`;
    },
    onDragCancel: ({ active }) => `${name(active.id)} was not moved`,
  };

  const onDragStart = (event: DragStartEvent) => {
    const { sessionId, entry } = event.active.data.current as DragData;
    const session = sessions.get(sessionId);
    const result = useAppStore.getState().result;
    if (!session || !result) return;
    const rect = event.active.rect.current.initial;
    const pointer = event.activatorEvent as PointerEvent;
    setDrag({
      session,
      entry,
      targets: moveTargets(data, result.placements, sessionId, [...sessions.values()]),
      offset: entry && rect ? grabOffset(pointer.clientX, rect.left, rect.width, session.length) : 0,
      size: entry && rect ? { width: rect.width, height: rect.height } : null,
    });
  };

  const onDragOver = (event: DragOverEvent) => setOver((event.over?.data.current as { day: number; period: number } | undefined) ?? null);

  const finish = () => {
    setDrag(null);
    setOver(null);
  };

  const onDragEnd = (event: DragEndEvent) => {
    const cell = event.over?.data.current as { day: number; period: number } | undefined;
    const state = drag;
    finish();
    if (!cell || !state) return;
    const target = targetUnder(state.targets, cell.day, cell.period, state.offset);
    if (!target) return;
    if (!target.ok) {
      toast.error(`Can't move there: ${target.reason}`);
      return;
    }
    if (!target.current) commitMove(data, state.session, target);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      accessibility={{ announcements }}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={finish}
    >
      {children(dnd)}
      <DragOverlay dropAnimation={null}>
        {drag && <DragPreview data={data} drag={drag} colors={colors} locked={locked.has(drag.session.id)} target={over ? targetAt(over.day, over.period) : null} />}
      </DragOverlay>
    </DndContext>
  );
}

/** Re-validate, then move + lock + re-score, with Undo. Reads the store fresh so it never applies a stale result. */
function commitMove(data: ViewData, session: Session, target: Extract<MoveTarget, { ok: true }>) {
  const { result, locks, setResult, setLocks } = useAppStore.getState();
  if (!result) return;
  const moved = { sessionId: session.id, day: target.day, period: target.period, roomId: target.roomId };
  const next = applyMove(result, locks, moved);
  const check = checkMove({ ...data, locks: next.locks, options: { timeLimitSec: 0 } }, result.placements, next.placements, session.id);
  if (check.problem) {
    toast.error(`Move cancelled: ${check.problem}`);
    return;
  }
  const edited = editedResult(result, next.placements, next.unplaced, data);
  setResult(edited);
  setLocks(next.locks);
  const { title, description } = moveSummary(data, session, moved, { before: score(data, result.placements).total, after: edited.score.total }, check.violations);
  toast.success(title, {
    description,
    action: {
      label: "Undo",
      onClick: () => {
        setResult(result);
        setLocks(locks);
      },
    },
  });
}

/** The card under the pointer while dragging, with a line saying what dropping here would do. */
function DragPreview({ data, drag, colors, locked, target }: { data: ViewData; drag: DragState; colors: Map<string, number>; locked: boolean; target: MoveTarget | null }) {
  const hint = dropHint(data, target);
  const subject = data.courses.find((c) => c.id === drag.session.courseId)?.subject ?? drag.session.courseId;
  const color = subjectColor(colors, subject);
  return (
    <div className="relative cursor-grabbing" style={drag.size ?? undefined}>
      <div
        className={cn(
          "flex size-full flex-col items-start gap-0.5 overflow-hidden rounded-md border px-2 py-1.5 text-left text-xs shadow-lg",
          locked && "border-[3px] px-[6px] py-[4px]",
        )}
        style={{ backgroundColor: color.bg, borderColor: color.border, color: color.fg }}
      >
        {drag.entry ? (
          <CellCardBody data={data} kind="section" block={drag.entry} locked={locked} />
        ) : (
          <span className="font-semibold">
            {subject}
            {drag.session.kind === "lab" ? " lab" : ""}
            {drag.session.batch != null ? ` (B${drag.session.batch})` : ""}
          </span>
        )}
      </div>
      <div
        role="status"
        className={cn(
          "absolute top-full left-0 mt-1.5 w-max max-w-72 rounded-md px-2 py-1 text-xs font-medium shadow-md",
          hint.ok === true && "bg-emerald-600 text-white",
          hint.ok === false && "bg-red-600 text-white",
          hint.ok === null && "bg-foreground text-background",
        )}
      >
        {hint.ok === true ? "✓ " : hint.ok === false ? "✗ " : ""}
        {hint.text}
      </div>
    </div>
  );
}

/** An unplaced session in the warning list, draggable onto the grid to place it by hand. */
export function DraggableUnplaced({ sessionId, children }: { sessionId: Id; children: React.ReactNode }) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({ id: dragId(sessionId), data: { sessionId, entry: null } satisfies DragData });
  return (
    <span
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      title="Drag onto a green slot to place it"
      className={cn(
        "inline-flex cursor-grab touch-none items-center gap-1 rounded border border-amber-400 bg-white/70 px-1.5 py-0.5 active:cursor-grabbing",
        isDragging && "opacity-40",
      )}
    >
      <GripVertical className="size-3.5 shrink-0 opacity-60" />
      {children}
    </span>
  );
}
