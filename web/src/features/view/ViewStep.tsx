import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, CalendarX2, Download, Loader2, Lock, LockOpen, Move, Printer, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { InfoTip } from "@/components/InfoTip";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { expandSessions } from "@/domain/sessions";
import type { Id } from "@/domain/types";
import { validate } from "@/domain/validator";
import { badgeText, regenerateSummary } from "@/features/generate/generate";
import { useGenerate } from "@/features/generate/useGenerate";
import { isLocked, regenerateLabel, toggleLock } from "@/features/lock/locks";
import { useAppStore } from "@/store/useAppStore";
import { buildSubjectColors } from "./colors";
import { EntityPicker } from "./EntityPicker";
import { DraggableUnplaced, MoveDnd } from "./MoveDnd";
import { placementsCsv } from "./exportCsv";
import { entityGroups, entitySubtitle, placementsFor, stepEntity, unplacedFor, type PlacedSession, type ViewData, type ViewKind } from "./layout";
import { SessionDialog } from "./SessionDialog";
import { StatsPanel } from "./StatsPanel";
import { TimetableSheet } from "./TimetableSheet";

const KINDS: { kind: ViewKind; label: string }[] = [
  { kind: "section", label: "Section" },
  { kind: "teacher", label: "Teacher" },
  { kind: "room", label: "Room" },
];

export function ViewStep() {
  const result = useAppStore((s) => s.result);
  const settings = useAppStore((s) => s.settings);
  const departments = useAppStore((s) => s.departments);
  const teachers = useAppStore((s) => s.teachers);
  const rooms = useAppStore((s) => s.rooms);
  const sections = useAppStore((s) => s.sections);
  const courses = useAppStore((s) => s.courses);
  const printHeading = useAppStore((s) => s.printHeading);
  const setPrintHeading = useAppStore((s) => s.setPrintHeading);
  const locks = useAppStore((s) => s.locks);
  const setLocks = useAppStore((s) => s.setLocks);
  const lockedIds = useMemo(() => new Set(locks.map((l) => l.sessionId)), [locks]);
  const { running, elapsed, run } = useGenerate();
  const data: ViewData = useMemo(
    () => ({ settings, departments, teachers, rooms, sections, courses }),
    [settings, departments, teachers, rooms, sections, courses],
  );

  const [kind, setKind] = useState<ViewKind>("section");
  const [selected, setSelected] = useState<Record<ViewKind, Id | null>>({ section: null, teacher: null, room: null });
  const [open, setOpen] = useState<PlacedSession | null>(null);
  const [printAll, setPrintAll] = useState(false);

  const sessions = useMemo(() => {
    try {
      return new Map(expandSessions(data).map((s) => [s.id, s]));
    } catch {
      return new Map(); // a course points at a missing section; step ② reports it
    }
  }, [data]);
  const colors = useMemo(() => buildSubjectColors(courses), [courses]);
  const groups = useMemo(() => entityGroups(data, kind), [data, kind]);
  // Re-checked here too, so a hand-made move shows straight away whether the timetable is still clash-free.
  const validation = useMemo(() => {
    if (!result) return null;
    try {
      return validate({ ...data, locks, options: { timeLimitSec: 0 } }, result.placements);
    } catch {
      return null; // broken data; step ② reports it
    }
  }, [data, locks, result]);

  // "Print all sections" renders every section grid first, then opens the print dialog.
  useEffect(() => {
    if (!printAll) return;
    const done = () => setPrintAll(false);
    window.addEventListener("afterprint", done);
    const timer = setTimeout(() => window.print(), 100);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("afterprint", done);
    };
  }, [printAll]);

  if (!result) return <EmptyState />;

  const flat = groups.flatMap((g) => g.items);
  const currentId = flat.some((e) => e.id === selected[kind]) ? selected[kind] : (flat[0]?.id ?? null);
  const select = (id: Id | null) => setSelected((s) => ({ ...s, [kind]: id }));
  const entries = currentId ? placementsFor(kind, currentId, result.placements, sessions) : [];
  const missing = currentId ? unplacedFor(kind, currentId, result.unplaced, sessions) : [];
  const title = flat.find((e) => e.id === currentId)?.name ?? "";

  const regenerate = async () => {
    const notice = await run();
    if (!notice) return;
    if (notice.error) toast.error(`No timetable was produced: ${notice.error} The previous one is unchanged.`);
    else {
      const next = useAppStore.getState().result;
      if (next) toast.success(regenerateSummary(next), { description: notice.fallbackReason });
    }
  };

  const downloadCsv = () => {
    // BOM so Excel reads the file as UTF-8 (en dashes in times, non-ASCII names).
    const blob = new Blob(["﻿" + placementsCsv(data, result.placements, sessions)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "timetable.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <div role="tablist" aria-label="View by" className="inline-flex rounded-lg bg-muted p-1">
          {KINDS.map((k) => (
            <button
              key={k.kind}
              role="tab"
              type="button"
              aria-selected={kind === k.kind}
              onClick={() => setKind(k.kind)}
              className={cn(
                "h-7 rounded-md px-3 text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                kind === k.kind ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {k.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" aria-label="Previous" disabled={flat.length < 2} onClick={() => select(stepEntity(groups, currentId, -1))}>
            <ChevronLeft />
          </Button>
          <EntityPicker groups={groups} value={currentId} onChange={select} placeholder={`Choose a ${kind}`} />
          <Button variant="outline" size="icon" aria-label="Next" disabled={flat.length < 2} onClick={() => select(stepEntity(groups, currentId, 1))}>
            <ChevronRight />
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
          <Button onClick={regenerate} disabled={running} title="Re-solve everything except locked cells, with the engine chosen in step ③">
            {running ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            {running ? `Regenerating… ${elapsed} s` : regenerateLabel(locks.length)}
          </Button>
          {locks.length > 0 && (
            <Button variant="ghost" disabled={running} onClick={() => setLocks([])}>
              <LockOpen /> Clear all locks
            </Button>
          )}
          <Button variant="outline" disabled={!currentId} onClick={() => window.print()}>
            <Printer /> Print this timetable
          </Button>
          <Button variant="outline" disabled={sections.length === 0} onClick={() => setPrintAll(true)}>
            <Printer /> Print all sections
          </Button>
          <Button variant="ghost" onClick={downloadCsv}>
            <Download /> CSV
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <label htmlFor="print-heading" className="text-sm text-muted-foreground">
          Heading on printouts
        </label>
        <InfoTip>Printed under each timetable title, e.g. your college name and semester. Use your browser's “Save as PDF” to export.</InfoTip>
        <Input
          id="print-heading"
          value={printHeading}
          onChange={(e) => setPrintHeading(e.target.value)}
          placeholder="College name · Semester 5, 2026"
          className="h-8 max-w-sm flex-1"
        />
      </div>

      {validation && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm print:hidden">
          <span
            role="status"
            className={cn(
              "rounded-md border px-2 py-0.5 font-medium",
              validation.violations.length === 0
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-destructive/30 bg-destructive/10 text-destructive",
            )}
          >
            {badgeText(result, validation)}
          </span>
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Move className="size-3.5" />
            {kind === "section"
              ? "Drag a class to move it: green slots are free (with the score change), red ones say why not. Moved classes are locked."
              : "Switch to the Section view to move classes by dragging."}
          </span>
        </div>
      )}

      {currentId ? (
        <MoveDnd data={data} sessions={sessions} colors={colors} locked={lockedIds}>
          {(dnd) => (
            <>
              <TimetableSheet
                data={data}
                kind={kind}
                title={title}
                subtitle={entitySubtitle(data, kind, currentId)}
                heading={printHeading}
                entries={entries}
                colors={colors}
                onSelect={setOpen}
                locked={lockedIds}
                dnd={kind === "section" ? dnd : undefined}
                className={cn(printAll && "print:hidden")}
              />
              {missing.length > 0 && (
                <div className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 print:hidden">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <div>
                    <p className="font-medium">
                      {missing.length} {missing.length === 1 ? "session" : "sessions"} could not be placed
                      {kind === "section" && <span className="font-normal"> · drag one onto a green slot to place it yourself</span>}
                    </p>
                    <ul className="mt-1 grid gap-1 pl-1">
                      {missing.map(({ session, reason }) => {
                        const name = (
                          <>
                            {courses.find((c) => c.id === session.courseId)?.subject ?? session.courseId}{" "}
                            {session.kind === "lab" ? "lab" : "lecture"}
                            {session.batch ? ` (B${session.batch})` : ""}
                          </>
                        );
                        return (
                          <li key={session.id}>
                            {kind === "section" ? <DraggableUnplaced sessionId={session.id}>{name}</DraggableUnplaced> : name}: {reason}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
              )}
            </>
          )}
        </MoveDnd>
      ) : (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">No {kind}s in the data yet.</CardContent>
        </Card>
      )}

      <StatsPanel data={data} placements={result.placements} />
      {printAll && (
        <div className="hidden print:block">
          {sections.map((s) => (
            <TimetableSheet
              key={s.id}
              data={data}
              kind="section"
              title={s.name}
              subtitle={entitySubtitle(data, "section", s.id)}
              heading={printHeading}
              entries={placementsFor("section", s.id, result.placements, sessions)}
              colors={colors}
              onSelect={() => {}}
              className="break-after-page last:break-after-auto"
            />
          ))}
        </div>
      )}

      <SessionDialog
        data={data}
        entry={open}
        colors={colors}
        locked={open !== null && isLocked(locks, open.session.id)}
        onClose={() => setOpen(null)}
        actions={
          open && (
            <Button variant={isLocked(locks, open.session.id) ? "outline" : "default"} onClick={() => setLocks(toggleLock(locks, open.placement))}>
              {isLocked(locks, open.session.id) ? (
                <>
                  <LockOpen /> Unlock
                </>
              ) : (
                <>
                  <Lock /> Lock here
                </>
              )}
            </Button>
          )
        }
      />
    </div>
  );
}

function EmptyState() {
  const setStep = useAppStore((s) => s.setStep);
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
        <CalendarX2 className="size-10 text-muted-foreground" />
        <div>
          <p className="font-medium">No timetable yet</p>
          <p className="text-sm text-muted-foreground">Generate a timetable first, then come back here to browse it.</p>
        </div>
        <Button onClick={() => setStep(2)}>Go to Generate</Button>
      </CardContent>
    </Card>
  );
}
