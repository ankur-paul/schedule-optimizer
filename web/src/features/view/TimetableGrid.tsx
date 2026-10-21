import { Fragment } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Id, Settings } from "@/domain/types";
import { subjectColor } from "./colors";
import { sessionDetails, type Block, type DayLayout, type PlacedSession, type ViewData, type ViewKind } from "./layout";
import { dragId, formatDelta, slotId, type MoveTarget } from "./moves";

/** Drag-and-drop on the grid (needs a surrounding `DndContext`): cards drag, every teaching slot is a drop target. */
export interface GridDnd {
  /** Id of the session being dragged, or null when nothing is. */
  dragging: Id | null;
  /** While dragging: what dropping on a cell would do (null = not a slot). */
  targetAt: (day: number, period: number) => MoveTarget | null;
  /** The cell under the pointer while dragging. */
  over: { day: number; period: number } | null;
}

interface Props {
  data: ViewData;
  kind: ViewKind;
  week: DayLayout[];
  colors: Map<string, number>;
  onSelect: (entry: PlacedSession) => void;
  /** Session ids to mark as locked (🔒 + thicker border). */
  locked?: ReadonlySet<Id>;
  dnd?: GridDnd;
}

/** Week grid: rows = days, columns = periods. Labs span columns; parallel batch sessions stack inside a day. */
export function TimetableGrid({ data, kind, week, colors, onSelect, locked, dnd }: Props) {
  const { settings } = data;
  const columns = ["5rem", ...settings.periods.map((p) => (p.kind === "break" ? "2rem" : "minmax(7.5rem, 1fr)"))];
  // Fill the card, but scroll sideways (inside the card only) once columns would get narrower than their minimum.
  const minWidth = `calc(${columns.map((c) => c.replace(/minmax\((.+), 1fr\)/, "$1")).join(" + ")})`;
  // Grid rows: 1 header row, then `lanes` rows per day.
  const firstRow: number[] = [];
  let row = 2;
  for (const day of week) {
    firstRow.push(row);
    row += day.lanes;
  }
  const rows = ["auto", ...week.flatMap((d) => Array(d.lanes).fill(d.lanes === 1 ? "minmax(4.5rem, auto)" : "minmax(3.25rem, auto)"))];

  return (
    <div className="overflow-x-auto rounded-xl border bg-background print:overflow-visible">
      <div
        className="grid text-xs print:min-w-0!"
        style={{ minWidth, gridTemplateColumns: columns.join(" "), gridTemplateRows: rows.join(" ") }}
      >
        <div className="sticky left-0 z-20 border-r border-b bg-muted/60" style={{ gridRow: 1, gridColumn: 1 }} />
        {settings.periods.map((p, i) => (
          <PeriodHeader key={p.id} settings={settings} index={i} />
        ))}

        {week.map((day, d) => (
          <Fragment key={d}>
            <div
              className="sticky left-0 z-20 flex items-center border-r border-b bg-background px-3 text-sm font-semibold"
              style={{ gridRow: `${firstRow[d]} / span ${day.lanes}`, gridColumn: 1 }}
            >
              {settings.days[d]}
            </div>
            {settings.periods.map((p, i) => {
              if (p.kind === "break") return null;
              const style = { gridRow: `${firstRow[d]} / span ${day.lanes}`, gridColumn: i + 2 };
              return dnd ? (
                <Fragment key={p.id}>
                  <DropSlot day={d} period={p.id} style={style} />
                  {dnd.dragging && <SlotTint target={dnd.targetAt(d, p.id)} hovered={dnd.over?.day === d && dnd.over.period === p.id} style={style} />}
                </Fragment>
              ) : (
                <div key={p.id} className={SLOT_CLASS} style={style} />
              );
            })}
            {day.blocks.map((block) => {
              const props: CellProps = {
                data,
                kind,
                block,
                colors,
                onSelect,
                locked: locked?.has(block.session.id) ?? false,
                gridRow: `${firstRow[d] + block.lane} / span ${block.laneSpan}`,
                gridColumn: `${block.start + 2} / span ${block.span}`,
              };
              return dnd ? (
                <DraggableCell key={block.session.id} {...props} dragActive={dnd.dragging !== null} />
              ) : (
                <Cell key={block.session.id} {...props} />
              );
            })}
          </Fragment>
        ))}

        {settings.periods.map((p, i) =>
          p.kind === "break" ? (
            <div
              key={p.id}
              aria-hidden
              className="flex items-center justify-center border-r border-b text-[10px] font-medium tracking-widest text-muted-foreground uppercase [writing-mode:vertical-rl]"
              style={{
                gridRow: `2 / ${row}`,
                gridColumn: i + 2,
                backgroundImage:
                  "repeating-linear-gradient(135deg, transparent 0 6px, color-mix(in oklab, var(--border) 70%, transparent) 6px 7px)",
              }}
            >
              {p.label}
            </div>
          ) : null,
        )}
      </div>
    </div>
  );
}

function PeriodHeader({ settings, index }: { settings: Settings; index: number }) {
  const p = settings.periods[index];
  const lunch = settings.lunchCandidates.includes(p.id);
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-0.5 border-r border-b bg-muted/60 px-1 py-2 text-center",
        p.kind === "break" && "px-0",
      )}
      style={{ gridRow: 1, gridColumn: index + 2 }}
      title={lunch ? "Lunch candidate: every section and teacher gets at least one of these periods free each day" : undefined}
    >
      {p.kind === "break" ? (
        <span className="text-[10px] text-muted-foreground">{p.start}</span>
      ) : (
        <>
          <span className="font-semibold">
            {p.label}
            {lunch && (
              <span className="ml-1" aria-label="lunch candidate">
                🍽
              </span>
            )}
          </span>
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {p.start}–{p.end}
          </span>
        </>
      )}
    </div>
  );
}

interface CellProps {
  data: ViewData;
  kind: ViewKind;
  block: Block;
  colors: Map<string, number>;
  onSelect: (entry: PlacedSession) => void;
  locked: boolean;
  gridRow: string;
  gridColumn: string;
}

interface DragBindings {
  setNodeRef: (node: HTMLElement | null) => void;
  listeners: ReturnType<typeof useDraggable>["listeners"];
  attributes: ReturnType<typeof useDraggable>["attributes"];
  /** This card is the one being dragged (its copy follows the pointer). */
  isDragging: boolean;
  /** Some card is being dragged: no hover tooltips. */
  dragActive: boolean;
}

const SLOT_CLASS = "border-r border-b border-dashed border-border/70";

function DropSlot({ day, period, style }: { day: number; period: number; style: React.CSSProperties }) {
  const { setNodeRef } = useDroppable({ id: slotId(day, period), data: { day, period } });
  return <div ref={setNodeRef} className={SLOT_CLASS} style={style} />;
}

/** Green (with the score change) or red tint over a slot while dragging. Drawn above the cards, never catches the pointer. */
function SlotTint({ target, hovered, style }: { target: MoveTarget | null; hovered: boolean; style: React.CSSProperties }) {
  if (!target) return null;
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none z-30 m-px flex items-end justify-end rounded-md p-1 text-[10px] font-semibold tabular-nums transition-colors",
        target.ok ? "bg-emerald-500/15 text-emerald-800 ring-1 ring-emerald-500/40 ring-inset" : "bg-red-500/10",
        hovered && (target.ok ? "bg-emerald-500/30 ring-2 ring-emerald-600" : "bg-red-500/25 ring-2 ring-red-500"),
      )}
      style={style}
    >
      {target.ok && !target.current && formatDelta(target.scoreDelta)}
    </div>
  );
}

function DraggableCell({ dragActive, ...props }: CellProps & { dragActive: boolean }) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: dragId(props.block.session.id),
    data: { sessionId: props.block.session.id, entry: props.block },
  });
  return <Cell {...props} drag={{ setNodeRef, listeners, attributes, isDragging, dragActive }} />;
}

function Cell({ data, kind, block, colors, onSelect, locked, gridRow, gridColumn, drag }: CellProps & { drag?: DragBindings }) {
  const info = sessionDetails(data, block);
  const color = subjectColor(colors, info.subject);

  return (
    <Tooltip disabled={drag?.dragActive}>
      <TooltipTrigger
        ref={drag?.setNodeRef}
        {...drag?.listeners}
        {...drag?.attributes}
        onClick={() => onSelect(block)}
        className={cn(
          "relative z-10 m-0.5 flex min-w-0 cursor-pointer flex-col items-start gap-0.5 overflow-hidden rounded-md border px-2 py-1.5 text-left transition-shadow hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
          locked && "border-[3px] px-[6px] py-[4px]",
          drag && "cursor-grab touch-none active:cursor-grabbing",
          drag?.isDragging && "opacity-40",
        )}
        aria-label={locked ? `${info.subject} (locked)` : undefined}
        style={{ gridRow, gridColumn, backgroundColor: color.bg, borderColor: color.border, color: color.fg }}
      >
        <CellCardBody data={data} kind={kind} block={block} locked={locked} />
      </TooltipTrigger>
      <TooltipContent className="block">
        <div className="font-semibold">
          {info.subject} {info.kind === "lab" ? "(lab)" : ""} {locked ? "· locked" : ""}
        </div>
        <div>
          {info.section}
          {info.batch ? ` · batch ${info.batch}` : ""}
        </div>
        <div>{info.teacher}</div>
        <div>{info.room}</div>
        <div className="opacity-80">
          {info.day} {info.periods} · {info.time}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

/** What a card shows: subject + chips, then whatever the current view doesn't already tell you. */
export function CellCardBody({ data, kind, block, locked }: { data: ViewData; kind: ViewKind; block: PlacedSession; locked: boolean }) {
  const info = sessionDetails(data, block);
  const lines =
    kind === "section" ? [info.teacher, info.room] : kind === "teacher" ? [info.section, info.room] : [info.section, info.teacher];
  return (
    <>
      <span className="flex w-full items-start gap-1">
        <span className="line-clamp-2 leading-tight font-semibold">{info.subject}</span>
        {info.kind === "lab" && <Chip>Lab</Chip>}
        {info.batch && <Chip strong>{info.batch}</Chip>}
        {locked && (
          <span className="ml-auto shrink-0 leading-tight" title="Locked: kept in place when you regenerate">
            🔒
          </span>
        )}
      </span>
      {lines.map((line, i) => (
        <span key={i} className="w-full truncate leading-tight opacity-80 print:whitespace-normal">
          {line}
        </span>
      ))}
    </>
  );
}

function Chip({ children, strong }: { children: React.ReactNode; strong?: boolean }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded px-1 text-[10px] leading-4 font-semibold",
        strong ? "bg-current/15" : "border border-current/30 font-medium",
      )}
    >
      {children}
    </span>
  );
}
