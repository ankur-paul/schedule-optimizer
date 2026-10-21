import { useRef, useState } from "react";
import { AlertTriangle, Building2, CheckCircle2, Download, FileSpreadsheet, Upload, XCircle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAppStore } from "@/store/useAppStore";
import { countsLabel, plural, useCollegeData } from "./collegeData";
import { checkData, type DataReport } from "./dataChecks";
import { DataTables } from "./DataTables";
import { downloadWorkbook, parseWorkbook, readFiles, templateWorkbook, toWorkbook, type CollegeData, type ImportResult } from "./excel";

type Pending = { fileName: string; result: ImportResult };

export function DataStep() {
  const data = useCollegeData();
  const settings = useAppStore((s) => s.settings);
  const loadSample = useAppStore((s) => s.loadSample);
  const setData = useAppStore((s) => s.setData);
  const [pending, setPending] = useState<Pending | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const hasData = data.courses.length + data.teachers.length + data.sections.length + data.rooms.length > 0;
  const report = checkData(data, settings);

  const confirmReplace = () => !hasData || confirm("This replaces all current teachers, rooms, sections and courses. Continue?");

  const onSample = () => {
    if (!confirmReplace()) return;
    loadSample();
    setPending(null);
    toast.success(`Loaded sample college: ${countsLabel(useAppStore.getState())}`);
  };

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const list = [...files];
    try {
      const result = parseWorkbook(await readFiles(list));
      setPending({ fileName: list.map((f) => f.name).join(", "), result });
    } catch (e) {
      setPending({ fileName: list[0].name, result: { ok: false, errors: [`Could not read the file: ${(e as Error).message}`] } });
    }
    if (fileInput.current) fileInput.current.value = "";
  };

  const apply = (incoming: CollegeData) => {
    if (!confirmReplace()) return;
    setData(incoming);
    setPending(null);
    toast.success(`Imported ${countsLabel(incoming)}`);
  };

  return (
    <div className="grid gap-6">
      <div className="grid gap-4 md:grid-cols-3">
        <EntryCard
          icon={<Building2 />}
          title="Load sample college"
          description="A ready-made college with 3 departments and 9 sections. Best way to try the app."
        >
          <Button onClick={onSample}>Load sample</Button>
        </EntryCard>
        <EntryCard
          icon={<FileSpreadsheet />}
          title="Download template"
          description="An Excel file with one sheet each for Teachers, Rooms, Sections and Courses, plus example rows."
        >
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => downloadWorkbook(templateWorkbook(), "timetable-template.xlsx")}>
              <Download /> Template
            </Button>
            {hasData && (
              <Button variant="ghost" onClick={() => downloadWorkbook(toWorkbook(data), "timetable-data.xlsx")}>
                Export current data
              </Button>
            )}
          </div>
        </EntryCard>
        <EntryCard
          icon={<Upload />}
          title="Upload your file"
          description="The filled-in template (.xlsx), or one CSV per sheet named Teachers.csv, Rooms.csv…"
        >
          <input
            ref={fileInput}
            type="file"
            accept=".xlsx,.xls,.csv"
            multiple
            className="hidden"
            onChange={(e) => onFiles(e.target.files)}
          />
          <Button variant="outline" onClick={() => fileInput.current?.click()}>
            <Upload /> Choose file
          </Button>
        </EntryCard>
      </div>

      {pending && <ImportPanel pending={pending} onApply={apply} onCancel={() => setPending(null)} />}

      <SummaryCard data={data} report={report} />

      <DataTables report={report} />
    </div>
  );
}

function EntryCard({ icon, title, description, children }: { icon: React.ReactNode; title: string; description: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <div className="mb-1 flex size-8 items-center justify-center rounded-lg bg-muted text-foreground [&_svg]:size-4">{icon}</div>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="mt-auto">{children}</CardContent>
    </Card>
  );
}

const MAX_ERRORS_SHOWN = 15;

function ImportPanel({ pending, onApply, onCancel }: { pending: Pending; onApply: (d: CollegeData) => void; onCancel: () => void }) {
  const { result, fileName } = pending;
  if (!result.ok) {
    return (
      <Card className="ring-destructive/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <XCircle className="size-4" /> {result.errors.length} problem{result.errors.length === 1 ? "" : "s"} in {fileName}
          </CardTitle>
          <CardDescription>Nothing was imported. Fix these rows in your file and upload it again.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <ul className="grid gap-1 font-mono text-xs">
            {result.errors.slice(0, MAX_ERRORS_SHOWN).map((e) => (
              <li key={e}>{e}</li>
            ))}
            {result.errors.length > MAX_ERRORS_SHOWN && (
              <li className="text-muted-foreground">…and {result.errors.length - MAX_ERRORS_SHOWN} more</li>
            )}
          </ul>
          <div>
            <Button variant="outline" size="sm" onClick={onCancel}>
              Dismiss
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="ring-primary/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CheckCircle2 className="size-4 text-emerald-600" /> {fileName} looks good
        </CardTitle>
        <CardDescription>
          Found {plural(result.data.departments.length, "department")}, {countsLabel(result.data)}.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex gap-2">
        <Button onClick={() => onApply(result.data)}>Import</Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </CardContent>
    </Card>
  );
}

function SummaryCard({ data, report }: { data: CollegeData; report: DataReport }) {
  const counts: [string, number][] = [
    ["Departments", data.departments.length],
    ["Teachers", data.teachers.length],
    ["Rooms", data.rooms.length],
    ["Sections", data.sections.length],
    ["Courses", data.courses.length],
  ];
  const busiest = [...report.sections].sort((a, b) => b.required / b.available - a.required / a.available).slice(0, 6);

  return (
    <Card>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap gap-x-8 gap-y-3">
          {counts.map(([label, n]) => (
            <div key={label}>
              <div className="text-2xl font-semibold tabular-nums">{n}</div>
              <div className="text-xs text-muted-foreground">{label}</div>
            </div>
          ))}
        </div>

        {busiest.length > 0 && (
          <div className="grid gap-1.5">
            <div className="text-xs font-medium text-muted-foreground">Busiest sections · periods needed per week vs free</div>
            <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {busiest.map((l) => (
                <LoadBar key={l.id} name={l.name} required={l.required} available={l.available} />
              ))}
            </div>
          </div>
        )}

        <Problems errors={report.errors} warnings={report.warnings} />
      </CardContent>
    </Card>
  );
}

function LoadBar({ name, required, available }: { name: string; required: number; available: number }) {
  const over = required > available;
  const pct = available > 0 ? Math.min(100, (required / available) * 100) : 100;
  return (
    <div className="grid grid-cols-[6rem_1fr_auto] items-center gap-2 text-xs">
      <span className="truncate">{name}</span>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", over ? "bg-destructive" : "bg-primary/70")} style={{ width: `${pct}%` }} />
      </div>
      <span className={cn("tabular-nums", over ? "text-destructive" : "text-muted-foreground")}>
        {required}/{available}
      </span>
    </div>
  );
}

const MAX_PROBLEMS_SHOWN = 8;

function Problems({ errors, warnings }: { errors: string[]; warnings: string[] }) {
  if (errors.length === 0 && warnings.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-emerald-700">
        <CheckCircle2 className="size-4" /> Data looks complete. Every section fits in the week.
      </p>
    );
  }
  return (
    <div className="grid gap-2">
      {errors.length > 0 && (
        <ProblemList tone="error" title={`${errors.length} problem${errors.length === 1 ? "" : "s"} to fix before generating`} items={errors} />
      )}
      {warnings.length > 0 && (
        <ProblemList tone="warning" title="Probably too full: some sessions may stay unplaced" items={warnings} />
      )}
    </div>
  );
}

function ProblemList({ tone, title, items }: { tone: "error" | "warning"; title: string; items: string[] }) {
  return (
    <div className={cn("rounded-lg border p-3 text-sm", tone === "error" ? "border-destructive/30 bg-destructive/5" : "border-amber-300 bg-amber-50")}>
      <div className={cn("mb-1 flex items-center gap-2 font-medium", tone === "error" ? "text-destructive" : "text-amber-800")}>
        {tone === "error" ? <XCircle className="size-4" /> : <AlertTriangle className="size-4" />} {title}
      </div>
      <ul className="ml-6 list-disc text-xs">
        {items.slice(0, MAX_PROBLEMS_SHOWN).map((e) => (
          <li key={e}>{e}</li>
        ))}
        {items.length > MAX_PROBLEMS_SHOWN && <li className="text-muted-foreground">…and {items.length - MAX_PROBLEMS_SHOWN} more</li>}
      </ul>
    </div>
  );
}
