import type { Course, Id, Room, Section } from "@/domain/types";
import { uniqueId, type CollegeData } from "./excel";

/** A fresh id like "teacher-3" that no item in `existing` uses. */
export function nextId(prefix: string, existing: { id: Id }[]): Id {
  const taken = new Set(existing.map((x) => x.id));
  taken.add(prefix); // always suffix, so new rows read "teacher-2", "teacher-3"…
  return uniqueId(prefix, taken);
}

export type EntityKind = "department" | "teacher" | "room" | "section";

/** How many other rows point at this entity (shown before a delete). */
export function usageCount(data: CollegeData, kind: EntityKind, id: Id): number {
  switch (kind) {
    case "department":
      return [...data.teachers, ...data.rooms, ...data.sections].filter((x) => x.departmentId === id).length;
    case "teacher":
      return data.courses.filter((c) => c.teacherId === id || c.batchTeacherIds?.includes(id)).length;
    case "room":
      return data.courses.filter((c) => c.labRoomId === id).length;
    case "section":
      return data.courses.filter((c) => c.sectionId === id).length;
  }
}

/** A section's courses make no sense without it, so they go too. */
export function removeSection(data: CollegeData, id: Id): Pick<CollegeData, "sections" | "courses"> {
  return { sections: data.sections.filter((s) => s.id !== id), courses: data.courses.filter((c) => c.sectionId !== id) };
}

/** Removing a lab room a course required falls back to "any eligible lab" instead of leaving a dangling id. */
export function removeRoom(data: CollegeData, id: Id): Pick<CollegeData, "rooms" | "courses"> {
  return {
    rooms: data.rooms.filter((r) => r.id !== id),
    courses: data.courses.map((c) => (c.labRoomId === id ? { ...c, labRoomId: null } : c)),
  };
}

/**
 * Set batch `b` (1-based) to `teacherId`, or "" for "same as the course teacher".
 * Returns null when every batch uses the course teacher, so the course stays simple.
 */
export function setBatchTeacher(course: Course, batches: number, b: number, teacherId: Id | ""): Id[] | null {
  const ids = Array.from({ length: batches }, (_, i) => course.batchTeacherIds?.[i] ?? course.teacherId);
  ids[b - 1] = teacherId || course.teacherId;
  return ids.every((id) => id === course.teacherId) ? null : ids;
}

/** Lab rooms a section may be pinned to: shared or owned by its department. */
export function labRoomsFor(rooms: Room[], section: Section | undefined): Room[] {
  return rooms.filter((r) => r.type === "lab" && (r.departmentId === null || r.departmentId === section?.departmentId));
}

/** Data tabs in the order the data depends on: courses need sections, teachers and rooms. */
export const DATA_TABS = ["departments", "rooms", "teachers", "sections", "courses"] as const;
export type DataTab = (typeof DATA_TABS)[number];

/** Open on Courses once there are some (the table people edit most), otherwise at the start. */
export function defaultDataTab(data: Pick<CollegeData, "courses">): DataTab {
  return data.courses.length > 0 ? "courses" : "departments";
}
