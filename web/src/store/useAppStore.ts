import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { sampleCollege } from "@/domain/sampleCollege";
import type { Course, Department, Placement, Room, Section, Settings, SolveResult, Teacher } from "@/domain/types";
import type { EngineMode } from "@/engine/solveClient";

/** 0 = Setup week, 1 = Add data, 2 = Generate, 3 = View & export. */
export type Step = 0 | 1 | 2 | 3;

export interface AppData {
  settings: Settings;
  departments: Department[];
  teachers: Teacher[];
  rooms: Room[];
  sections: Section[];
  courses: Course[];
  result: SolveResult | null;
  locks: Placement[];
  step: Step;
  /** Step ③ choices, kept so Regenerate (T10) reuses them. */
  engineMode: EngineMode;
  timeLimitSec: number;
  /** Second line on printed timetables, e.g. "GNDEC Ludhiana · Semester 5, 2026". */
  printHeading: string;
}

export interface AppState extends AppData {
  /** Placements refer to day/period indexes, so changing settings drops the result and locks. */
  setSettings: (settings: Settings) => void;
  setDepartments: (departments: Department[]) => void;
  setTeachers: (teachers: Teacher[]) => void;
  setRooms: (rooms: Room[]) => void;
  setSections: (sections: Section[]) => void;
  setCourses: (courses: Course[]) => void;
  setResult: (result: SolveResult | null) => void;
  setLocks: (locks: Placement[]) => void;
  setStep: (step: Step) => void;
  setEngineMode: (engineMode: EngineMode) => void;
  setTimeLimitSec: (timeLimitSec: number) => void;
  setPrintHeading: (printHeading: string) => void;
  /** Replace all five data tables at once (import); drops the result and locks. */
  setData: (data: Pick<AppData, "departments" | "teachers" | "rooms" | "sections" | "courses">) => void;
  /** Replace all data with the demo college (keeps the current step). */
  loadSample: () => void;
  /** Back to an empty college and an empty week setup, on step ①. */
  reset: () => void;
}

const initialData = (): AppData => ({
  settings: { days: [], periods: [], lunchCandidates: [] },
  departments: [],
  teachers: [],
  rooms: [],
  sections: [],
  courses: [],
  result: null,
  locks: [],
  step: 0,
  engineMode: "auto",
  timeLimitSec: 20,
  printHeading: "",
});

/** localStorage that never throws (private mode, quota, or no window in tests). */
const safeStorage: StateStorage = {
  getItem: (name) => {
    try {
      return globalThis.localStorage?.getItem(name) ?? null;
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      globalThis.localStorage?.setItem(name, value);
    } catch {
      // ignore: the app still works, it just won't survive a reload
    }
  },
  removeItem: (name) => {
    try {
      globalThis.localStorage?.removeItem(name);
    } catch {
      // ignore
    }
  },
};

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      ...initialData(),
      setSettings: (settings) => set({ settings, result: null, locks: [] }),
      setDepartments: (departments) => set({ departments }),
      setTeachers: (teachers) => set({ teachers }),
      setRooms: (rooms) => set({ rooms }),
      setSections: (sections) => set({ sections }),
      setCourses: (courses) => set({ courses }),
      setResult: (result) => set({ result }),
      setLocks: (locks) => set({ locks }),
      setStep: (step) => set({ step }),
      setEngineMode: (engineMode) => set({ engineMode }),
      setTimeLimitSec: (timeLimitSec) => set({ timeLimitSec }),
      setPrintHeading: (printHeading) => set({ printHeading }),
      setData: ({ departments, teachers, rooms, sections, courses }) =>
        set({ departments, teachers, rooms, sections, courses, result: null, locks: [] }),
      loadSample: () => {
        const s = structuredClone(sampleCollege);
        set({
          settings: s.settings,
          departments: s.departments,
          teachers: s.teachers,
          rooms: s.rooms,
          sections: s.sections,
          courses: s.courses,
          result: null,
          locks: [],
        });
      },
      reset: () => set(initialData()),
    }),
    {
      name: "timetable-v1",
      storage: createJSONStorage(() => safeStorage),
    },
  ),
);
