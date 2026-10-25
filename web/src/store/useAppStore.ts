import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { sampleCollege } from "@/domain/sampleCollege";
import type { Course, Department, Placement, Room, Section, Settings, SolveResult, Teacher } from "@/domain/types";
import { emptyStacks, pushEntry, redoEntry, takeSnapshot, undoEntry, type UndoEntry, type UndoStacks } from "./undo";

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
  /** Step ③'s exact solver time limit, kept so Regenerate (T10) reuses it. */
  timeLimitSec: number;
  /** Second line on printed timetables, e.g. "GNDEC Ludhiana · Semester 5, 2026". */
  printHeading: string;
}

/** What an online version holds (T28): the data, locks, result and print heading. Step and time limit stay on the device. */
export type WorkingCopy = Omit<AppData, "step" | "timeLimitSec">;

/** The online timetable the working copy is linked to (T28). */
export interface OnlineLink {
  instituteId: string;
  /** The institute's name when linked, shown while signed out (the memberships aren't loaded then). */
  instituteName: string;
  timetableId: string;
  name: string;
  /** The version saved or opened last: the base of the next save's version check. */
  version: number;
  /** `docHash` of the working copy at that save or open; the copy has unsaved changes when its hash differs. */
  savedHash: string;
}

export interface AppState extends AppData {
  /** `null`: on this device only. Kept apart from `AppData`, which is what a solve or a version is built from. */
  online: OnlineLink | null;
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
  setTimeLimitSec: (timeLimitSec: number) => void;
  setPrintHeading: (printHeading: string) => void;
  /** Replace all five data tables at once (import); drops the result and locks. */
  setData: (data: Pick<AppData, "departments" | "teachers" | "rooms" | "sections" | "courses">) => void;
  /** Replace all data with the demo college (keeps the current step). */
  loadSample: () => void;
  setOnline: (online: OnlineLink | null) => void;
  /** Replace the working copy with an opened online version and link to it (keeps the step and time limit). */
  loadOnline: (data: WorkingCopy, online: OnlineLink) => void;
  /** Back to an empty college and a Mon–Fri week with no periods, on step ①, on this device only (drops the link). */
  reset: () => void;
  /** Undo and Redo of whole changes (T41), in memory only: not persisted, so a reload clears them. */
  history: UndoStacks;
  /** Snapshot the working copy before a change, e.g. `pushUndo("move CSE B DS to Tue P4")`. Clears Redo. */
  pushUndo: (label: string) => UndoEntry;
  /** Restore the newest snapshot; returns its label, or `null` when there is nothing to undo. */
  undo: () => string | null;
  redo: () => string | null;
}

export const initialData = (): AppData => ({
  settings: { days: ["Mon", "Tue", "Wed", "Thu", "Fri"], periods: [], lunchCandidates: [] },
  departments: [],
  teachers: [],
  rooms: [],
  sections: [],
  courses: [],
  result: null,
  locks: [],
  step: 0,
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

/** 1: `engineMode` removed (T18, exact solver only). 2: `online` link added (T28). */
export const PERSIST_VERSION = 2;

/** Upgrade state saved by an older version of the app. */
export function migrateState(persisted: unknown, version: number): AppState {
  const state = { ...(persisted as Record<string, unknown>) };
  if (version < 1) delete state.engineMode;
  if (version < 2) state.online = null;
  return state as unknown as AppState;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      ...initialData(),
      online: null,
      setSettings: (settings) => set({ settings, result: null, locks: [] }),
      setDepartments: (departments) => set({ departments }),
      setTeachers: (teachers) => set({ teachers }),
      setRooms: (rooms) => set({ rooms }),
      setSections: (sections) => set({ sections }),
      setCourses: (courses) => set({ courses }),
      setResult: (result) => set({ result }),
      setLocks: (locks) => set({ locks }),
      setStep: (step) => set({ step }),
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
      setOnline: (online) => set({ online }),
      loadOnline: (data, online) => set({ ...data, online }),
      reset: () => set({ ...initialData(), online: null }),
      history: emptyStacks(),
      pushUndo: (label) => {
        const entry = { label, snapshot: takeSnapshot(get()) };
        set({ history: pushEntry(get().history, entry) });
        return entry;
      },
      undo: () => {
        const out = undoEntry(get().history, get());
        if (!out) return null;
        set({ ...out.restore.snapshot, history: out.stacks });
        return out.restore.label;
      },
      redo: () => {
        const out = redoEntry(get().history, get());
        if (!out) return null;
        set({ ...out.restore.snapshot, history: out.stacks });
        return out.restore.label;
      },
    }),
    {
      name: "timetable-v1",
      version: PERSIST_VERSION,
      migrate: migrateState,
      partialize: ({ history: _, ...rest }) => rest,
      storage: createJSONStorage(() => safeStorage),
    },
  ),
);
