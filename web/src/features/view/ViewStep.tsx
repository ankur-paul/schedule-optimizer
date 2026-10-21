import { useMemo, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, CalendarX2, FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { expandSessions } from "@/domain/sessions";
import type { Id } from "@/domain/types";
import { useAppStore } from "@/store/useAppStore";
import { buildSubjectColors } from "./colors";
import { EntityPicker } from "./EntityPicker";
import { entityGroups, layoutWeek, placementsFor, stepEntity, unplacedFor, type PlacedSession, type ViewData, type ViewKind } from "./layout";
import { mockResult } from "./mockResult";
import { SessionDialog } from "./SessionDialog";
import { StatsPanel } from "./StatsPanel";
import { TimetableGrid } from "./TimetableGrid";

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
  const data: ViewData = useMemo(
    () => ({ settings, departments, teachers, rooms, sections, courses }),
    [settings, departments, teachers, rooms, sections, courses],
  );

  const [kind, setKind] = useState<ViewKind>("section");
  const [selected, setSelected] = useState<Record<ViewKind, Id | null>>({ section: null, teacher: null, room: null });
  const [open, setOpen] = useState<PlacedSession | null>(null);

  const sessions = useMemo(() => {
    try {
      return new Map(expandSessions(data).map((s) => [s.id, s]));
    } catch {
      return new Map(); // a course points at a missing section; step ② reports it
    }
  }, [data]);
  const colors = useMemo(() => buildSubjectColors(courses), [courses]);
  const groups = useMemo(() => entityGroups(data, kind), [data, kind]);

  if (!result) return <EmptyState />;

  const flat = groups.flatMap((g) => g.items);
  const currentId = flat.some((e) => e.id === selected[kind]) ? selected[kind] : (flat[0]?.id ?? null);
  const select = (id: Id | null) => setSelected((s) => ({ ...s, [kind]: id }));
  const entries = currentId ? placementsFor(kind, currentId, result.placements, sessions) : [];
  const missing = currentId ? unplacedFor(kind, currentId, result.unplaced, sessions) : [];
  const title = flat.find((e) => e.id === currentId)?.name ?? "";

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
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
      </div>

      {currentId ? (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-lg font-semibold">
              {title} <span className="font-normal text-muted-foreground">— Timetable</span>
            </h3>
            <p className="text-sm text-muted-foreground">
              {subtitle(data, kind, currentId)} · {entries.length} {entries.length === 1 ? "class" : "classes"} a week
            </p>
          </div>
          <TimetableGrid data={data} kind={kind} week={layoutWeek(settings, entries)} colors={colors} onSelect={setOpen} />
          {missing.length > 0 && (
            <div className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="font-medium">
                  {missing.length} {missing.length === 1 ? "session" : "sessions"} could not be placed
                </p>
                <ul className="mt-1 list-disc pl-4">
                  {missing.map(({ session, reason }) => (
                    <li key={session.id}>
                      {courses.find((c) => c.id === session.courseId)?.subject ?? session.courseId}{" "}
                      {session.kind === "lab" ? "lab" : "lecture"}
                      {session.batch ? ` (B${session.batch})` : ""}: {reason}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </>
      ) : (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">No {kind}s in the data yet.</CardContent>
        </Card>
      )}

      <StatsPanel data={data} placements={result.placements} />

      <SessionDialog data={data} entry={open} colors={colors} onClose={() => setOpen(null)} />
    </div>
  );
}

function subtitle(data: ViewData, kind: ViewKind, id: Id): string {
  const dept = (deptId: Id | null) => data.departments.find((d) => d.id === deptId)?.name;
  if (kind === "section") {
    const s = data.sections.find((x) => x.id === id);
    return [dept(s?.departmentId ?? null), s && s.batches > 1 ? `${s.batches} batches` : null].filter(Boolean).join(" · ");
  }
  if (kind === "teacher") return dept(data.teachers.find((x) => x.id === id)?.departmentId ?? null) ?? "";
  const r = data.rooms.find((x) => x.id === id);
  return `${r?.type === "lab" ? "Lab" : "Classroom"} · ${r?.departmentId ? (dept(r.departmentId) ?? r.departmentId) : "Shared"}`;
}

function EmptyState() {
  const setStep = useAppStore((s) => s.setStep);
  const loadSample = useAppStore((s) => s.loadSample);
  const setResult = useAppStore((s) => s.setResult);
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
        <CalendarX2 className="size-10 text-muted-foreground" />
        <div>
          <p className="font-medium">No timetable yet</p>
          <p className="text-sm text-muted-foreground">Generate a timetable first, then come back here to browse it.</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setStep(2)}>Go to Generate</Button>
          {import.meta.env.DEV && (
            <Button
              variant="outline"
              onClick={() => {
                loadSample();
                setResult(mockResult());
              }}
            >
              <FlaskConical /> Mock result (dev)
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
