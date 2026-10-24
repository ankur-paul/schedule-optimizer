import { useEffect, useMemo, useState } from "react";
import { CalendarX2, CloudOff, Loader2, Printer } from "lucide-react";
import { LatticeMark } from "@/components/LatticeMark";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { expandSessions } from "@/domain/sessions";
import { cn } from "@/lib/utils";
import { supabaseConfig } from "@/lib/supabaseConfig";
import { buildSubjectColors, subjectColor } from "@/features/view/colors";
import { EntityNav, useEntitySelection } from "@/features/view/EntityNav";
import { entitySubtitle, placementsFor, type PlacedSession, type ViewData, type ViewKind } from "@/features/view/layout";
import { SessionDialog } from "@/features/view/SessionDialog";
import { TimetableSheet } from "@/features/view/TimetableSheet";
import { dayItems, todayTab } from "./days";
import { parsePublishedPath, publishedPath } from "./path";
import { loadPublished, updatedText, type LoadOutcome, type PublishedTimetable } from "./published";

const config = supabaseConfig(import.meta.env);

/** The public page at /<handle>/<id> (T30): one published timetable, read-only, for anyone with the link. */
export function PublishedPage() {
  const [link] = useState(() => parsePublishedPath(window.location.pathname));
  const [outcome, setOutcome] = useState<LoadOutcome | null>(link ? null : { kind: "notPublished" });

  useEffect(() => {
    if (!link) return;
    let current = true;
    loadPublished(config, link.publicId).then((out) => {
      if (!current) return;
      setOutcome(out);
      if (out.kind !== "ok") return;
      const { handle, timetableName, instituteName } = out.timetable;
      document.title = `${timetableName} · ${instituteName}`;
      // The institute may have changed its handle since the link was shared: show the current one.
      const canonical = publishedPath(handle, link.publicId);
      if (window.location.pathname !== canonical) {
        window.history.replaceState(null, "", canonical + window.location.search + window.location.hash);
      }
    });
    return () => {
      current = false;
    };
  }, [link]);

  return (
    <div className="flex min-h-screen flex-col bg-muted/40 text-foreground print:min-h-0 print:bg-white">
      <main className="mx-auto grid w-full max-w-6xl flex-1 content-start gap-5 px-4 py-6 sm:px-6 sm:py-8 print:max-w-none print:p-0">
        {outcome === null ? (
          <Message icon={<Loader2 className="animate-spin" />} text="Loading timetable…" />
        ) : outcome.kind === "notPublished" ? (
          <Message icon={<CalendarX2 />} text="This timetable isn't published." />
        ) : outcome.kind === "failed" ? (
          <Message icon={<CloudOff />} text="Couldn't load this timetable. Try again later." />
        ) : (
          <Published timetable={outcome.timetable} />
        )}
      </main>
      <footer className="flex items-center justify-center gap-2 px-4 pb-6 text-xs text-muted-foreground print:hidden">
        <a href="/" className="flex items-center gap-1.5 font-medium hover:text-foreground">
          <span className="flex size-5 items-center justify-center rounded bg-primary text-primary-foreground">
            <LatticeMark className="size-3.5" />
          </span>
          Made with Lattice
        </a>
        · <a href="/privacy" className="hover:text-foreground">Privacy</a>
        · <a href="/terms" className="hover:text-foreground">Terms</a>
      </footer>
    </div>
  );
}

function Message({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-14 text-center text-muted-foreground [&_svg]:size-10">
        {icon}
        <p className="font-medium text-foreground">{text}</p>
      </CardContent>
    </Card>
  );
}

function Published({ timetable }: { timetable: PublishedTimetable }) {
  const { data, result, printHeading } = timetable;
  const { kind, setKind, groups, currentId, select, title } = useEntitySelection(data);
  const [open, setOpen] = useState<PlacedSession | null>(null);
  const sessions = useMemo(() => {
    try {
      return new Map(expandSessions(data).map((s) => [s.id, s]));
    } catch {
      return new Map(); // a course points at a missing section: show what can be shown
    }
  }, [data]);
  const colors = useMemo(() => buildSubjectColors(data.courses), [data.courses]);
  const entries = currentId ? placementsFor(kind, currentId, result.placements, sessions) : [];
  const subtitle = currentId ? entitySubtitle(data, kind, currentId) : "";
  const updated = updatedText(timetable.savedAt);

  return (
    <>
      <header className="grid gap-1 print:hidden">
        <p className="text-sm font-medium text-muted-foreground">{timetable.instituteName}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{timetable.timetableName}</h1>
        <p className="text-sm text-muted-foreground">{[printHeading, updated].filter(Boolean).join(" · ")}</p>
      </header>

      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <EntityNav kind={kind} onKindChange={setKind} groups={groups} currentId={currentId} onSelect={select} />
        <Button variant="outline" className="max-sm:hidden sm:ml-auto" disabled={!currentId} onClick={() => window.print()}>
          <Printer /> Print
        </Button>
      </div>

      {currentId ? (
        <>
          <TimetableSheet
            data={data}
            kind={kind}
            title={title}
            subtitle={subtitle}
            heading={printHeading}
            entries={entries}
            colors={colors}
            onSelect={setOpen}
            className="hidden sm:grid print:grid"
          />
          <DayList data={data} kind={kind} title={title} subtitle={subtitle} entries={entries} colors={colors} onSelect={setOpen} />
        </>
      ) : (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">No {kind}s in this timetable.</CardContent>
        </Card>
      )}

      <SessionDialog data={data} entry={open} colors={colors} onClose={() => setOpen(null)} />
    </>
  );
}

/** The phone layout (below 640 px): one day at a time, with day tabs, opening on today. */
function DayList({ data, kind, title, subtitle, entries, colors, onSelect }: {
  data: ViewData;
  kind: ViewKind;
  title: string;
  subtitle: string;
  entries: PlacedSession[];
  colors: Map<string, number>;
  onSelect: (entry: PlacedSession) => void;
}) {
  const { days } = data.settings;
  const [day, setDay] = useState(() => todayTab(days, new Date()));
  const items = dayItems(data, kind, entries, day);

  return (
    <section className="grid gap-3 sm:hidden print:hidden">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      <div role="tablist" aria-label="Day" className="flex gap-1 overflow-x-auto rounded-lg bg-muted p-1">
        {days.map((name, d) => (
          <button
            key={d}
            role="tab"
            type="button"
            aria-selected={day === d}
            onClick={() => setDay(d)}
            className={cn(
              "h-8 min-w-12 flex-1 rounded-md px-2 text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
              day === d ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
            )}
          >
            {name}
          </button>
        ))}
      </div>
      {items.length === 0 ? (
        <p className="rounded-xl border bg-background px-4 py-8 text-center text-sm text-muted-foreground">No classes on {days[day]}.</p>
      ) : (
        <ol className="grid gap-2">
          {items.map((item) => {
            const color = subjectColor(colors, item.subject);
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onSelect(item.entry)}
                  className="flex w-full gap-3 rounded-xl border bg-background p-3 text-left focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  <span className="w-[5.5rem] shrink-0 text-sm">
                    <span className="block font-semibold tabular-nums">{item.time}</span>
                    <span className="block text-xs text-muted-foreground">{item.periods}</span>
                  </span>
                  <span
                    className="grid min-w-0 flex-1 gap-0.5 rounded-md border px-2 py-1.5 text-sm"
                    style={{ backgroundColor: color.bg, borderColor: color.border, color: color.fg }}
                  >
                    <span className="flex items-start gap-1 font-semibold leading-tight">
                      {item.subject}
                      {item.lab && <span className="shrink-0 rounded border border-current/30 px-1 text-[11px] leading-4 font-medium">Lab</span>}
                      {item.batch && <span className="shrink-0 rounded bg-current/15 px-1 text-[11px] leading-4 font-semibold">{item.batch}</span>}
                    </span>
                    {item.lines.map((line, i) => (
                      <span key={i} className="truncate text-xs opacity-80">
                        {line}
                      </span>
                    ))}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
