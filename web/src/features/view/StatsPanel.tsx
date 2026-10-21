import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { InfoTip } from "@/components/InfoTip";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { score } from "@/domain/score";
import { loadRange, roomUtilisation, SCORE_ROWS, sortLoads, teacherLoads, type LoadSortKey, type StatsData } from "@/domain/stats";
import type { Placement, Score } from "@/domain/types";

interface Props {
  data: StatsData;
  placements: Placement[];
}

/** Why this timetable is good: score breakdown, teacher load and room utilisation for the whole college. */
export function StatsPanel({ data, placements }: Props) {
  // Re-score here: the TS scorer is the source of truth, whichever engine ran.
  const result = useMemo(() => score(data, placements), [data, placements]);
  return (
    <section aria-label="Timetable statistics" className="grid gap-4 lg:grid-cols-2">
      <ScoreCard score={result} />
      <RoomCard data={data} placements={placements} />
      <TeacherLoadCard data={data} placements={placements} />
    </section>
  );
}

const pct = (rate: number) => `${Math.round(rate * 100)}%`;

function ScoreCard({ score }: { score: Score }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          Quality score
          <InfoTip>Penalty points for the soft rules below. Lower is better; 0 is perfect. Hard rules (no clashes) are never broken.</InfoTip>
        </CardTitle>
        <CardDescription>Penalty points across the whole college</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-semibold tabular-nums">{score.total}</span>
          <span className="text-sm text-muted-foreground">{score.total === 0 ? "points · perfect" : "points · lower is better"}</span>
        </div>
        <ul className="grid gap-2 text-sm">
          {SCORE_ROWS.map((row) => {
            const value = score.breakdown[row.key];
            return (
              <li key={row.key} className="flex items-center gap-2">
                <span className="w-7 text-xs text-muted-foreground">{row.rule}</span>
                <span className="flex flex-1 items-center gap-1.5">
                  {row.label}
                  <InfoTip>{row.tip}</InfoTip>
                </span>
                <span className={cn("tabular-nums font-medium", value === 0 && "text-muted-foreground")}>{value}</span>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

function RoomCard({ data, placements }: Props) {
  const usage = useMemo(() => roomUtilisation(data, placements), [data, placements]);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          Room utilisation
          <InfoTip>Share of the week's teaching periods each room is in use. Shared rooms (seminar halls, central labs) can be used by any department.</InfoTip>
        </CardTitle>
        <CardDescription>
          {usage.shared !== null ? (
            <>
              Shared room utilisation: <span className="font-semibold text-foreground">{pct(usage.shared)}</span> ·{" "}
            </>
          ) : null}
          All rooms: {pct(usage.overall)}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {usage.rooms.length === 0 ? (
          <p className="text-sm text-muted-foreground">No rooms in the data.</p>
        ) : (
          <ul className="grid max-h-80 gap-2 overflow-y-auto pr-1 text-sm">
            {usage.rooms.map((r) => (
              <li key={r.roomId} className="grid grid-cols-[minmax(0,1fr)_minmax(3rem,1fr)_2.5rem] items-center gap-3">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate">{r.name}</span>
                  {r.shared && <Badge variant="secondary">Shared</Badge>}
                </span>
                <span className="h-2 overflow-hidden rounded-full bg-muted" title={`${r.used} of ${r.capacity} periods`}>
                  <span
                    className={cn("block h-full rounded-full", r.shared ? "bg-primary" : "bg-primary/45")}
                    style={{ width: pct(r.rate) }}
                  />
                </span>
                <span className="text-right tabular-nums text-muted-foreground">{pct(r.rate)}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

const COLUMNS: { key: LoadSortKey; label: string; numeric?: boolean; wide?: boolean }[] = [
  { key: "name", label: "Teacher" },
  { key: "department", label: "Department", wide: true },
  { key: "total", label: "Periods / week", numeric: true },
];

function TeacherLoadCard({ data, placements }: Props) {
  const loads = useMemo(() => teacherLoads(data, placements), [data, placements]);
  const [sort, setSort] = useState<{ key: LoadSortKey; dir: "asc" | "desc" }>({ key: "total", dir: "desc" });
  const rows = sortLoads(loads, sort.key, sort.dir);
  const range = loadRange(loads);
  const perDayMax = Math.max(1, ...loads.flatMap((l) => l.perDay));
  const toggle = (key: LoadSortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "total" ? "desc" : "asc" }));

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          Teacher load
          <InfoTip>Teaching periods per week (a 2-period lab counts as 2). Bars show each day. Click a column to sort.</InfoTip>
        </CardTitle>
        <CardDescription>
          {range ? `From ${range.min} to ${range.max} periods a week` : "No teachers in the data."}
        </CardDescription>
      </CardHeader>
      {range && (
        <CardContent className="max-h-[28rem] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {COLUMNS.map((c) => (
                  <TableHead key={c.key} className={cn("whitespace-normal", c.numeric && "text-right", c.wide && "hidden sm:table-cell")} aria-sort={sort.key === c.key ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
                    <button
                      type="button"
                      onClick={() => toggle(c.key)}
                      className="inline-flex items-center gap-1 hover:text-foreground"
                    >
                      {c.label}
                      {sort.key === c.key && (sort.dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
                    </button>
                  </TableHead>
                ))}
                <TableHead>By day</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((l) => {
                const isMax = range.max !== range.min && l.total === range.max;
                const isMin = range.max !== range.min && l.total === range.min;
                return (
                  <TableRow key={l.teacherId}>
                    <TableCell className="font-medium whitespace-normal">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        {l.name}
                        {isMax && <Badge className="bg-amber-100 text-amber-900">Highest</Badge>}
                        {isMin && <Badge className="bg-sky-100 text-sky-900">Lowest</Badge>}
                      </span>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">{l.department}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{l.total}</TableCell>
                    <TableCell>
                      <DayBars perDay={l.perDay} days={data.settings.days} max={perDayMax} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      )}
    </Card>
  );
}

function DayBars({ perDay, days, max }: { perDay: number[]; days: string[]; max: number }) {
  return (
    <span className="flex h-8 items-end gap-1" aria-label={perDay.map((n, d) => `${days[d]} ${n}`).join(", ")}>
      {perDay.map((n, d) => (
        <span key={d} className="flex h-full w-4 flex-col items-center justify-end" title={`${days[d]}: ${n} period${n === 1 ? "" : "s"}`}>
          <span className="w-3.5 rounded-[3px] bg-primary/60" style={{ height: n > 0 ? `${(n / max) * 100}%` : "2px", opacity: n > 0 ? 1 : 0.3 }} />
        </span>
      ))}
    </span>
  );
}
