import { Popover } from "@base-ui/react/popover";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { InfoTip } from "@/components/InfoTip";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Course, Department, Id, Room, Section, Teacher } from "@/domain/types";
import { EntityPicker } from "@/features/view/EntityPicker";
import { entityGroups } from "@/features/view/layout";
import { helpHref } from "@/help/helpLinks";
import { useAppStore } from "@/store/useAppStore";
import { useCollegeData } from "./collegeData";
import type { DataReport } from "./dataChecks";
import { DATA_TABS, batchTeacherSummary, defaultDataTab, filterCourses, labRoomsFor, nextId, removeRoom, removeSection, setBatchTeacher, usageCount, type DataTab } from "./dataEdit";
import { useDataView } from "./dataView";

const selectClass =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive";

function Select({ value, onChange, children, invalid, label, className }: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  invalid?: boolean;
  label: string;
  className?: string;
}) {
  return (
    <select aria-label={label} aria-invalid={invalid || undefined} value={value} onChange={(e) => onChange(e.target.value)} className={cn(selectClass, className)}>
      {children}
    </select>
  );
}

function NumberCell({ value, onChange, label, min = 0 }: { value: number; onChange: (n: number) => void; label: string; min?: number }) {
  const invalid = !Number.isInteger(value) || value < min;
  return (
    <Input
      type="number"
      min={min}
      aria-label={label}
      aria-invalid={invalid || undefined}
      value={Number.isNaN(value) ? "" : value}
      onChange={(e) => onChange(e.target.value === "" ? NaN : Number(e.target.value))}
      className="w-16"
    />
  );
}

function DeleteButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <Button variant="ghost" size="icon-sm" aria-label={label} onClick={onClick}>
      <Trash2 />
    </Button>
  );
}

/** A column heading, with an ⓘ tooltip when `tip` is set and *Learn more* when `more` (a helpHref) is too. */
function Th({ children, tip, more, className }: { children: React.ReactNode; tip?: string; more?: string; className?: string }) {
  return (
    <th className={cn("px-1 pb-2 text-left text-xs font-medium whitespace-nowrap text-muted-foreground", className)}>
      <span className="inline-flex items-center gap-1">
        {children}
        {tip && <InfoTip more={more}>{tip}</InfoTip>}
      </span>
    </th>
  );
}

function Table({ head, children, empty }: { head: React.ReactNode; children: React.ReactNode[]; empty: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm [&_td]:px-1 [&_td]:py-1">
        <thead>
          <tr>{head}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
      {children.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>}
    </div>
  );
}

function AddButton({ onClick, label, disabled }: { onClick: () => void; label: string; disabled?: boolean }) {
  return (
    <Button variant="outline" size="sm" onClick={onClick} disabled={disabled}>
      <Plus /> {label}
    </Button>
  );
}

const confirmDelete = (what: string, uses: number, consequence: string) =>
  uses === 0 || confirm(`${what} is used by ${uses} ${uses === 1 ? "row" : "rows"}. ${consequence}`);

function DepartmentOptions({ departments, shared }: { departments: Department[]; shared?: boolean }) {
  return (
    <>
      {shared ? <option value="">Shared (any department)</option> : <option value="" disabled>Pick a department</option>}
      {departments.map((d) => (
        <option key={d.id} value={d.id}>
          {d.name}
        </option>
      ))}
    </>
  );
}

export function DataTables({ report }: { report: DataReport }) {
  const data = useCollegeData();
  // Until a tab is picked (or a fix link opens one), the default follows the data: Departments while empty.
  const tab = useDataView((s) => s.tab) ?? defaultDataTab(data);
  const setTab = useDataView((s) => s.setTab);
  const tabs: Record<DataTab, { title: string; count: number; table: React.ReactNode }> = {
    departments: { title: "Departments", count: data.departments.length, table: <DepartmentsTable /> },
    rooms: { title: "Rooms", count: data.rooms.length, table: <RoomsTable /> },
    teachers: { title: "Teachers", count: data.teachers.length, table: <TeachersTable report={report} /> },
    sections: { title: "Sections", count: data.sections.length, table: <SectionsTable report={report} /> },
    courses: { title: "Courses", count: data.courses.length, table: <CoursesTable /> },
  };
  return (
    <Card>
      <CardContent>
        <Tabs value={tab} onValueChange={(v) => setTab(v as DataTab)}>
          <TabsList>
            {DATA_TABS.map((t) => (
              <TabsTrigger key={t} value={t}>
                {tabs[t].title} ({tabs[t].count})
              </TabsTrigger>
            ))}
          </TabsList>
          {DATA_TABS.map((t) => (
            <TabsContent key={t} value={t} className="pt-3">
              {tabs[t].table}
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}

function useUpdate<T extends { id: Id }>(list: T[], set: (list: T[]) => void) {
  return (id: Id, patch: Partial<T>) => set(list.map((x) => (x.id === id ? { ...x, ...patch } : x)));
}

function DepartmentsTable() {
  const data = useCollegeData();
  const setDepartments = useAppStore((s) => s.setDepartments);
  const update = useUpdate<Department>(data.departments, setDepartments);
  return (
    <div className="grid gap-3">
      <Table head={<><Th>Name</Th><Th>Used by</Th><th /></>} empty="No departments yet. They are created automatically when you import a file.">
        {data.departments.map((d) => (
          <tr key={d.id}>
            <td>
              <Input aria-label="Department name" value={d.name} aria-invalid={!d.name.trim() || undefined} autoFocus={!d.name} onChange={(e) => update(d.id, { name: e.target.value })} />
            </td>
            <td className="text-muted-foreground tabular-nums">{usageCount(data, "department", d.id)}</td>
            <td className="w-10">
              <DeleteButton
                label={`Delete ${d.name}`}
                onClick={() => {
                  if (confirmDelete(d.name, usageCount(data, "department", d.id), "They will need a new department. Delete anyway?"))
                    setDepartments(data.departments.filter((x) => x.id !== d.id));
                }}
              />
            </td>
          </tr>
        ))}
      </Table>
      <div>
        <AddButton label="Add department" onClick={() => setDepartments([...data.departments, { id: nextId("dept", data.departments), name: "" }])} />
      </div>
    </div>
  );
}

function TeachersTable({ report }: { report: DataReport }) {
  const data = useCollegeData();
  const setTeachers = useAppStore((s) => s.setTeachers);
  const update = useUpdate<Teacher>(data.teachers, setTeachers);
  const load = new Map(report.teachers.map((l) => [l.id, l]));
  return (
    <div className="grid gap-3">
      <Table
        head={<><Th>Name</Th><Th>Department</Th><Th tip="Periods this teacher is busy per week, and how many are free after one lunch period a day." more={helpHref("data", "data-checks")}>Load</Th><th /></>}
        empty="No teachers yet."
      >
        {data.teachers.map((t) => {
          const l = load.get(t.id);
          return (
            <tr key={t.id}>
              <td>
                <Input aria-label="Teacher name" value={t.name} aria-invalid={!t.name.trim() || undefined} autoFocus={!t.name} onChange={(e) => update(t.id, { name: e.target.value })} />
              </td>
              <td>
                <Select label="Department" value={t.departmentId} invalid={!data.departments.some((d) => d.id === t.departmentId)} onChange={(v) => update(t.id, { departmentId: v })}>
                  <DepartmentOptions departments={data.departments} />
                </Select>
              </td>
              <td className={cn("tabular-nums whitespace-nowrap", l && l.required > l.available ? "text-destructive" : "text-muted-foreground")}>
                {l ? `${l.required}/${l.available}` : "–"}
              </td>
              <td className="w-10">
                <DeleteButton
                  label={`Delete ${t.name}`}
                  onClick={() => {
                    if (confirmDelete(t.name, usageCount(data, "teacher", t.id), "Those courses will need a new teacher. Delete anyway?"))
                      setTeachers(data.teachers.filter((x) => x.id !== t.id));
                  }}
                />
              </td>
            </tr>
          );
        })}
      </Table>
      <div>
        <AddButton
          label="Add teacher"
          disabled={data.departments.length === 0}
          onClick={() => setTeachers([...data.teachers, { id: nextId("teacher", data.teachers), name: "", departmentId: data.departments[0].id }])}
        />
      </div>
    </div>
  );
}

function RoomsTable() {
  const data = useCollegeData();
  const setRooms = useAppStore((s) => s.setRooms);
  const setCourses = useAppStore((s) => s.setCourses);
  const update = useUpdate<Room>(data.rooms, setRooms);
  return (
    <div className="grid gap-3">
      <Table
        head={<><Th>Name</Th><Th>Type</Th><Th tip="Owned rooms are only used by that department. Shared rooms (seminar halls, central labs) can be used by anyone." more={helpHref("data", "rooms")}>Department</Th><th /></>}
        empty="No rooms yet."
      >
        {data.rooms.map((r) => (
          <tr key={r.id}>
            <td>
              <Input aria-label="Room name" value={r.name} aria-invalid={!r.name.trim() || undefined} autoFocus={!r.name} onChange={(e) => update(r.id, { name: e.target.value })} />
            </td>
            <td>
              <Select label="Room type" value={r.type} onChange={(v) => update(r.id, { type: v as Room["type"] })}>
                <option value="classroom">Classroom</option>
                <option value="lab">Lab</option>
              </Select>
            </td>
            <td>
              <Select label="Department" value={r.departmentId ?? ""} onChange={(v) => update(r.id, { departmentId: v || null })}>
                <DepartmentOptions departments={data.departments} shared />
              </Select>
            </td>
            <td className="w-10">
              <DeleteButton
                label={`Delete ${r.name}`}
                onClick={() => {
                  if (!confirmDelete(r.name, usageCount(data, "room", r.id), "Those courses will use any eligible lab instead. Delete anyway?")) return;
                  const next = removeRoom(data, r.id);
                  setRooms(next.rooms);
                  setCourses(next.courses);
                }}
              />
            </td>
          </tr>
        ))}
      </Table>
      <div>
        <AddButton label="Add room" onClick={() => setRooms([...data.rooms, { id: nextId("room", data.rooms), name: "", type: "classroom", departmentId: null }])} />
      </div>
    </div>
  );
}

function SectionsTable({ report }: { report: DataReport }) {
  const data = useCollegeData();
  const setSections = useAppStore((s) => s.setSections);
  const setCourses = useAppStore((s) => s.setCourses);
  const update = useUpdate<Section>(data.sections, setSections);
  const load = new Map(report.sections.map((l) => [l.id, l]));
  return (
    <div className="grid gap-3">
      <Table
        head={
          <>
            <Th>Name</Th>
            <Th>Department</Th>
            <Th tip="How many groups the section splits into for labs. 1 = no split. Batch labs can run at the same time in different labs." more={helpHref("data", "lab-batches")}>
              Lab batches
            </Th>
            <Th tip="Periods per week the section needs (busiest batch for labs) vs periods free after one lunch period a day." more={helpHref("data", "data-checks")}>
              Load
            </Th>
            <th />
          </>
        }
        empty="No sections yet."
      >
        {data.sections.map((s) => {
          const l = load.get(s.id);
          return (
            <tr key={s.id}>
              <td>
                <Input aria-label="Section name" value={s.name} aria-invalid={!s.name.trim() || undefined} autoFocus={!s.name} onChange={(e) => update(s.id, { name: e.target.value })} />
              </td>
              <td>
                <Select label="Department" value={s.departmentId} invalid={!data.departments.some((d) => d.id === s.departmentId)} onChange={(v) => update(s.id, { departmentId: v })}>
                  <DepartmentOptions departments={data.departments} />
                </Select>
              </td>
              <td>
                <NumberCell label="Lab batches" min={1} value={s.batches} onChange={(batches) => update(s.id, { batches })} />
              </td>
              <td className={cn("tabular-nums whitespace-nowrap", l && l.required > l.available ? "text-destructive" : "text-muted-foreground")}>
                {l ? `${l.required}/${l.available}` : "–"}
              </td>
              <td className="w-10">
                <DeleteButton
                  label={`Delete ${s.name}`}
                  onClick={() => {
                    const n = usageCount(data, "section", s.id);
                    if (n > 0 && !confirm(`Delete ${s.name} and its ${n} course${n === 1 ? "" : "s"}?`)) return;
                    const next = removeSection(data, s.id);
                    setSections(next.sections);
                    setCourses(next.courses);
                  }}
                />
              </td>
            </tr>
          );
        })}
      </Table>
      <div>
        <AddButton
          label="Add section"
          disabled={data.departments.length === 0}
          onClick={() => setSections([...data.sections, { id: nextId("section", data.sections), name: "", departmentId: data.departments[0].id, batches: 1 }])}
        />
      </div>
    </div>
  );
}

function CoursesTable() {
  const data = useCollegeData();
  const settings = useAppStore((s) => s.settings);
  const setCourses = useAppStore((s) => s.setCourses);
  const update = useUpdate<Course>(data.courses, setCourses);
  const filter = useDataView((s) => s.filter);
  const setFilter = useDataView((s) => s.setFilter);
  const sectionById = new Map(data.sections.map((s) => [s.id, s]));
  const shown = filterCourses(data.courses, filter);

  const teacherOptions = (
    <>
      <option value="" disabled>
        Pick a teacher
      </option>
      {data.teachers.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </>
  );

  const add = () => {
    const sectionId = filter.sectionId || data.sections[0].id;
    const teacherId = filter.teacherId || (data.teachers[0]?.id ?? "");
    setCourses([
      ...data.courses,
      { id: nextId("course", data.courses), sectionId, subject: "", teacherId, lecturesPerWeek: 3, labSessionsPerWeek: 0, labLength: 2, labRoomId: null, batchTeacherIds: null },
    ]);
  };

  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2">
        <EntityPicker
          groups={[{ label: "", items: [{ id: "", name: "All sections" }] }, ...entityGroups({ ...data, settings }, "section")]}
          value={filter.sectionId}
          onChange={(v) => setFilter({ sectionId: v })}
          placeholder="All sections"
        />
        <Select label="Filter by teacher" value={filter.teacherId} onChange={(v) => setFilter({ teacherId: v })} className="w-56">
          <option value="">All teachers</option>
          {data.teachers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
        <span className="text-xs text-muted-foreground">{shown.length} shown</span>
      </div>
      <Table
        head={
          <>
            <Th>Section</Th>
            <Th>Subject</Th>
            <Th tip="Teaches the lectures, and the labs unless batch teachers are set.">Teacher</Th>
            <Th tip="One-period whole-section classes in a classroom.">Lectures/wk</Th>
            <Th tip="Lab sessions per week, for each batch.">Labs/wk</Th>
            <Th tip="Consecutive periods per lab session. A lab can't run across a break.">Lab length</Th>
            <Th tip="Pin the labs to one lab room. Leave on 'Any eligible lab' to let the solver choose." more={helpHref("data", "rooms")}>
              Lab room
            </Th>
            <Th tip="For split sections: who takes each batch's lab. Default is the course teacher." more={helpHref("data", "lab-batches")}>
              Batch teachers
            </Th>
            <th />
          </>
        }
        empty={data.sections.length ? "No courses yet." : "Add a section first."}
      >
        {shown.map((c) => {
          const section = sectionById.get(c.sectionId);
          const hasLabs = c.labSessionsPerWeek > 0;
          const labs = labRoomsFor(data.rooms, section);
          return (
            <tr key={c.id}>
              <td className="w-24 min-w-24">
                <Select label="Section" value={c.sectionId} invalid={!section} onChange={(v) => update(c.id, { sectionId: v, labRoomId: null, batchTeacherIds: null })}>
                  {!section && <option value={c.sectionId} disabled>Pick a section</option>}
                  {data.sections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </td>
              <td className="min-w-44">
                <Input aria-label="Subject" value={c.subject} aria-invalid={!c.subject.trim() || undefined} autoFocus={!c.subject} onChange={(e) => update(c.id, { subject: e.target.value })} />
              </td>
              <td className="min-w-44">
                <Select label="Teacher" value={data.teachers.some((t) => t.id === c.teacherId) ? c.teacherId : ""} invalid={!data.teachers.some((t) => t.id === c.teacherId)} onChange={(v) => update(c.id, { teacherId: v })}>
                  {teacherOptions}
                </Select>
              </td>
              <td>
                <NumberCell label="Lectures per week" value={c.lecturesPerWeek} onChange={(n) => update(c.id, { lecturesPerWeek: n })} />
              </td>
              <td>
                <NumberCell label="Lab sessions per week" value={c.labSessionsPerWeek} onChange={(n) => update(c.id, { labSessionsPerWeek: n })} />
              </td>
              <td>{hasLabs ? <NumberCell label="Lab length" min={1} value={c.labLength} onChange={(n) => update(c.id, { labLength: n })} /> : <span className="text-muted-foreground">–</span>}</td>
              <td className="min-w-36">
                {hasLabs ? (
                  <Select label="Lab room" value={c.labRoomId ?? ""} onChange={(v) => update(c.id, { labRoomId: v || null })}>
                    <option value="">Any eligible lab</option>
                    {c.labRoomId && !labs.some((r) => r.id === c.labRoomId) && (
                      <option value={c.labRoomId} disabled>
                        (not allowed for this section)
                      </option>
                    )}
                    {labs.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <span className="text-muted-foreground">–</span>
                )}
              </td>
              <td className="w-52 max-w-52">
                {hasLabs && section && section.batches > 1 ? (
                  <BatchTeachersCell course={c} batches={section.batches} teachers={data.teachers} onChange={(batchTeacherIds) => update(c.id, { batchTeacherIds })} />
                ) : (
                  <span className="text-muted-foreground">–</span>
                )}
              </td>
              <td className="w-10">
                <DeleteButton label={`Delete ${c.subject}`} onClick={() => setCourses(data.courses.filter((x) => x.id !== c.id))} />
              </td>
            </tr>
          );
        })}
      </Table>
      <div>
        <AddButton label="Add course" disabled={data.sections.length === 0} onClick={add} />
      </div>
    </div>
  );
}

/**
 * Per-batch lab teachers in a popover, so every course row stays one line high. The cell shows
 * only the overrides; "Course teacher" (muted) when every batch has the course teacher.
 */
function BatchTeachersCell({ course, batches, teachers, onChange }: {
  course: Course;
  batches: number;
  teachers: Teacher[];
  onChange: (batchTeacherIds: Id[] | null) => void;
}) {
  const name = (id: Id) => teachers.find((t) => t.id === id)?.name ?? id;
  const summary = batchTeacherSummary(course, batches, name);
  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label="Batch teachers"
        title={summary ?? undefined}
        className={cn(selectClass, "flex items-center justify-between gap-1 text-left", !summary && "text-muted-foreground")}
      >
        <span className="truncate">{summary ?? "Course teacher"}</span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={4} align="end" className="isolate z-50">
          <Popover.Popup className="grid w-80 gap-2 rounded-lg bg-popover p-3 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-none">
            <p className="text-xs text-muted-foreground">Who takes each batch's lab. Leave on the course teacher unless a batch has its own.</p>
            {Array.from({ length: batches }, (_, i) => i + 1).map((b) => {
              const id = course.batchTeacherIds?.[b - 1];
              return (
                <label key={b} className="grid grid-cols-[3.5rem_1fr] items-center gap-2">
                  <span className="text-xs text-muted-foreground">Batch {b}</span>
                  <Select
                    label={`Batch ${b} teacher`}
                    value={id && id !== course.teacherId ? id : ""}
                    onChange={(v) => onChange(setBatchTeacher(course, batches, b, v))}
                  >
                    <option value="">Course teacher ({name(course.teacherId)})</option>
                    {teachers
                      .filter((t) => t.id !== course.teacherId)
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                  </Select>
                </label>
              );
            })}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
