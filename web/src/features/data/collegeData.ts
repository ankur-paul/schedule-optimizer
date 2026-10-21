import { useAppStore } from "@/store/useAppStore";
import type { CollegeData } from "./excel";

/** Current data tables from the store, as one object. */
export function useCollegeData(): CollegeData {
  const departments = useAppStore((s) => s.departments);
  const teachers = useAppStore((s) => s.teachers);
  const rooms = useAppStore((s) => s.rooms);
  const sections = useAppStore((s) => s.sections);
  const courses = useAppStore((s) => s.courses);
  return { departments, teachers, rooms, sections, courses };
}

/** "1 section", "2 sections". */
export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function countsLabel(d: CollegeData): string {
  return [
    plural(d.sections.length, "section"),
    plural(d.teachers.length, "teacher"),
    plural(d.rooms.length, "room"),
    plural(d.courses.length, "course"),
  ].join(", ");
}
