import { create } from "zustand";
import type { Id } from "@/domain/types";
import type { CourseFilter } from "./dataEdit";

export type DataTab = "courses" | "sections" | "teachers" | "rooms" | "departments";

/** Where to land in step ②, e.g. a fix link: "Courses taught by Prof. Verma". */
export interface DataLink {
  tab: DataTab;
  sectionId?: Id;
  teacherId?: Id;
}

interface DataViewState {
  tab: DataTab;
  filter: CourseFilter;
  setTab: (tab: DataTab) => void;
  setFilter: (patch: Partial<CourseFilter>) => void;
  /** Jump to a tab with exactly the link's filters (anything not in the link is cleared). */
  open: (link: DataLink) => void;
}

const noFilter: CourseFilter = { sectionId: "", teacherId: "" };

/**
 * Step ②'s open tab and Courses filters. Kept outside the persisted app store: they are view state, reset on
 * reload, but other steps (T18 fix links) must be able to set them.
 */
export const useDataView = create<DataViewState>()((set) => ({
  tab: "courses",
  filter: noFilter,
  setTab: (tab) => set({ tab }),
  setFilter: (patch) => set((s) => ({ filter: { ...s.filter, ...patch } })),
  open: ({ tab, sectionId = "", teacherId = "" }) => set({ tab, filter: { sectionId, teacherId } }),
}));
