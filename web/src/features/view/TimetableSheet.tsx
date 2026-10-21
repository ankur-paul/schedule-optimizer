import { cn } from "@/lib/utils";
import type { Id } from "@/domain/types";
import { layoutWeek, type PlacedSession, type ViewData, type ViewKind } from "./layout";
import { TimetableGrid } from "./TimetableGrid";

interface Props {
  data: ViewData;
  kind: ViewKind;
  title: string;
  subtitle: string;
  /** College / semester line; shown under the title when set. */
  heading: string;
  entries: PlacedSession[];
  colors: Map<string, number>;
  onSelect: (entry: PlacedSession) => void;
  locked?: ReadonlySet<Id>;
  className?: string;
}

/** Title + week grid for one section/teacher/room. Prints as one A4 landscape page. */
export function TimetableSheet({ data, kind, title, subtitle, heading, entries, colors, onSelect, locked, className }: Props) {
  return (
    <section className={cn("grid gap-3 break-inside-avoid print:gap-2", className)}>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div>
          <h3 className="text-lg font-semibold print:text-xl">
            {title} <span className="font-normal text-muted-foreground">— Timetable</span>
          </h3>
          {heading && <p className="text-sm text-muted-foreground">{heading}</p>}
        </div>
        <p className="text-sm text-muted-foreground">
          {subtitle ? `${subtitle} · ` : ""}
          {entries.length} {entries.length === 1 ? "class" : "classes"} a week
        </p>
      </div>
      <TimetableGrid data={data} kind={kind} week={layoutWeek(data.settings, entries)} colors={colors} onSelect={onSelect} locked={locked} />
    </section>
  );
}
