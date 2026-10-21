import { Fragment } from "react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Id, Settings } from "@/domain/types";
import { subjectColor } from "./colors";
import { sessionDetails, type Block, type DayLayout, type PlacedSession, type ViewData, type ViewKind } from "./layout";

interface Props {
  data: ViewData;
  kind: ViewKind;
  week: DayLayout[];
  colors: Map<string, number>;
  onSelect: (entry: PlacedSession) => void;
  /** Session ids to mark as locked (🔒 + thicker border). */
  locked?: ReadonlySet<Id>;
}

/** Week grid: rows = days, columns = periods. Labs span columns; parallel batch sessions stack inside a day. */
export function TimetableGrid({ data, kind, week, colors, onSelect, locked }: Props) {
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
            {settings.periods.map((p, i) =>
              p.kind === "break" ? null : (
                <div
                  key={p.id}
                  className="border-r border-b border-dashed border-border/70"
                  style={{ gridRow: `${firstRow[d]} / span ${day.lanes}`, gridColumn: i + 2 }}
                />
              ),
            )}
            {day.blocks.map((block) => (
              <Cell
                key={block.session.id}
                data={data}
                kind={kind}
                block={block}
                colors={colors}
                onSelect={onSelect}
                locked={locked?.has(block.session.id) ?? false}
                gridRow={`${firstRow[d] + block.lane} / span ${block.laneSpan}`}
                gridColumn={`${block.start + 2} / span ${block.span}`}
              />
            ))}
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

function Cell({ data, kind, block, colors, onSelect, locked, gridRow, gridColumn }: CellProps) {
  const info = sessionDetails(data, block);
  const color = subjectColor(colors, info.subject);
  // The line under the subject names whatever the current view doesn't already tell you.
  const lines =
    kind === "section" ? [info.teacher, info.room] : kind === "teacher" ? [info.section, info.room] : [info.section, info.teacher];

  return (
    <Tooltip>
      <TooltipTrigger
        onClick={() => onSelect(block)}
        className={cn(
          "relative z-10 m-0.5 flex min-w-0 cursor-pointer flex-col items-start gap-0.5 overflow-hidden rounded-md border px-2 py-1.5 text-left transition-shadow hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
          locked && "border-[3px] px-[6px] py-[4px]",
        )}
        aria-label={locked ? `${info.subject} (locked)` : undefined}
        style={{ gridRow, gridColumn, backgroundColor: color.bg, borderColor: color.border, color: color.fg }}
      >
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
