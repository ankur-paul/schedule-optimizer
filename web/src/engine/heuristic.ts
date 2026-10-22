import { eligibleRooms, validStarts } from "@/domain/eligibility";
import { sessionLabel } from "@/domain/grid";
import { score, WEIGHTS } from "@/domain/score";
import { expandSessions } from "@/domain/sessions";
import type { Id, Placement, Session, SolveInput, SolveResult, UnplacedCause } from "@/domain/types";

export interface HeuristicOptions { timeLimitMs: number; seed?: number }

const RESTART_SHARE = 0.4; // share of the time budget spent on randomised restarts; the rest improves the best one
const MAX_CONSECUTIVE = 3;

/**
 * Greedy construction (most-constrained session first) + restarts + local search.
 * Every placement is checked against H1–H4, H6–H8, so the output is clash-free by construction;
 * sessions that don't fit are returned in `unplaced` with the dominant reason.
 */
export function solveHeuristic(input: SolveInput, opts: HeuristicOptions): SolveResult {
  const t0 = performance.now();
  try {
    return new Solver(input, opts.seed ?? 1).solve(t0 + opts.timeLimitMs, t0);
  } catch (e) {
    return {
      engine: "heuristic",
      status: "error",
      placements: [],
      unplaced: [],
      score: { total: 0, breakdown: { subjectRepeat: 0, teacherOverload: 0, sectionGaps: 0, batchIdle: 0 } },
      timeMs: Math.round(performance.now() - t0),
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

/** mulberry32: small seeded PRNG so runs are reproducible for a given seed. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Blocker = Extract<UnplacedCause, "teacher" | "section" | "room" | "lunch">;
const UNPLACED = -1;

/** Mutable occupancy state over flat typed arrays; slot = day * P + period. Exported for tests. */
export class Solver {
  private readonly sessions: Session[];
  private readonly D: number;
  private readonly P: number;
  private readonly teaching: boolean[];
  private readonly lunch: number[];
  private readonly lunchSet: Set<number>;
  // Per session (index i)
  private readonly sTeacher: number[];
  private readonly sSection: number[];
  private readonly sBatch: number[]; // 0 = whole section
  private readonly sCourse: number[];
  private readonly sLecture: boolean[];
  private readonly starts: number[][];
  private readonly rooms: number[][]; // eligible room indices, dept-owned first
  private readonly locked: boolean[];
  private readonly lockPlacements: Placement[] = []; // locks echoed verbatim (also ones we can't model)
  private readonly lockInit: [number, number, number, number][] = []; // [session, day, start, room] to pre-place
  // Per entity
  private readonly sectionBatches: number[];
  private readonly teacherNames: string[];
  private readonly roomNames: string[];
  private readonly sectionNames: string[];
  private readonly maxB: number;
  // Occupancy counts
  private tBusy!: Int16Array;
  private rBusy!: Int16Array;
  private secAny!: Int16Array;
  private secWhole!: Int16Array;
  private secBatch!: Int16Array;
  private courseDay!: Int16Array;
  // Assignment
  private day!: Int32Array;
  private start!: Int32Array;
  private room!: Int32Array;
  private rand: () => number;

  private readonly input: SolveInput;
  private readonly seed: number;

  constructor(input: SolveInput, seed: number) {
    this.input = input;
    this.seed = seed;
    const { settings } = input;
    this.sessions = expandSessions(input);
    this.D = settings.days.length;
    this.P = settings.periods.length;
    this.teaching = settings.periods.map((p) => p.kind === "teaching");
    this.lunch = settings.lunchCandidates.filter((p) => p >= 0 && p < this.P);
    this.lunchSet = new Set(this.lunch);
    this.rand = rng(seed);

    const index = (ids: Id[]) => new Map(ids.map((id, k) => [id, k]));
    const teacherIds = [...input.teachers.map((t) => t.id)];
    for (const s of this.sessions) if (!teacherIds.includes(s.teacherId)) teacherIds.push(s.teacherId);
    const teacherIdx = index(teacherIds);
    const sectionIdx = index(input.sections.map((s) => s.id));
    const roomIdx = index(input.rooms.map((r) => r.id));
    const courseIdx = index(input.courses.map((c) => c.id));
    this.teacherNames = teacherIds.map((id) => input.teachers.find((t) => t.id === id)?.name ?? id);
    this.roomNames = input.rooms.map((r) => r.name);
    this.sectionNames = input.sections.map((s) => s.name);
    this.sectionBatches = input.sections.map((s) => Math.max(1, s.batches));
    this.maxB = Math.max(1, ...this.sectionBatches);

    this.sTeacher = this.sessions.map((s) => teacherIdx.get(s.teacherId)!);
    this.sSection = this.sessions.map((s) => sectionIdx.get(s.sectionId)!);
    this.sBatch = this.sessions.map((s) => s.batch ?? 0);
    this.sCourse = this.sessions.map((s) => courseIdx.get(s.courseId)!);
    this.sLecture = this.sessions.map((s) => s.kind === "lecture");
    this.starts = this.sessions.map((s) => validStarts(settings, s.length));
    this.rooms = this.sessions.map((s) =>
      eligibleRooms(input, s)
        .sort((a, b) => Number(a.departmentId === null) - Number(b.departmentId === null))
        .map((r) => roomIdx.get(r.id)!),
    );

    const sessionIdx = index(this.sessions.map((s) => s.id));
    this.locked = this.sessions.map(() => false);
    for (const lock of input.locks) {
      this.lockPlacements.push(lock);
      const i = sessionIdx.get(lock.sessionId);
      if (i === undefined || this.locked[i]) continue;
      this.locked[i] = true;
      // A lock we can't model (room gone, settings shrank) is still echoed, just not occupied; the validator flags it.
      const r = roomIdx.get(lock.roomId);
      const inRange = lock.day >= 0 && lock.day < this.D && lock.period >= 0 && lock.period + this.sessions[i].length <= this.P;
      if (r !== undefined && inRange) this.lockInit.push([i, lock.day, lock.period, r]);
    }
    this.reset();
  }

  // ---- state ---------------------------------------------------------------

  private reset() {
    const { D, P } = this;
    const T = this.teacherNames.length;
    const S = this.sectionNames.length;
    this.tBusy = new Int16Array(T * D * P);
    this.rBusy = new Int16Array(this.roomNames.length * D * P);
    this.secAny = new Int16Array(S * D * P);
    this.secWhole = new Int16Array(S * D * P);
    this.secBatch = new Int16Array(S * this.maxB * D * P);
    this.courseDay = new Int16Array(this.input.courses.length * D);
    const n = this.sessions.length;
    this.day = new Int32Array(n).fill(UNPLACED);
    this.start = new Int32Array(n).fill(UNPLACED);
    this.room = new Int32Array(n).fill(UNPLACED);
    for (const [i, d, st, r] of this.lockInit) this.place(i, d, st, r);
  }

  private snapshot() {
    return { day: this.day.slice(), start: this.start.slice(), room: this.room.slice() };
  }

  private load(a: ReturnType<Solver["snapshot"]>) {
    this.reset();
    for (let i = 0; i < this.sessions.length; i++) {
      if (!this.locked[i] && a.day[i] !== UNPLACED) this.place(i, a.day[i], a.start[i], a.room[i]);
    }
  }

  private apply(i: number, d: number, st: number, r: number, sign: 1 | -1) {
    const { D, P } = this;
    const sec = this.sSection[i];
    const b = this.sBatch[i];
    for (let p = st; p < st + this.sessions[i].length; p++) {
      const slot = d * P + p;
      this.tBusy[this.sTeacher[i] * D * P + slot] += sign;
      this.rBusy[r * D * P + slot] += sign;
      this.secAny[sec * D * P + slot] += sign;
      if (b === 0) this.secWhole[sec * D * P + slot] += sign;
      else this.secBatch[(sec * this.maxB + b - 1) * D * P + slot] += sign;
    }
    if (this.sLecture[i]) this.courseDay[this.sCourse[i] * D + d] += sign;
  }

  private place(i: number, d: number, st: number, r: number) {
    this.apply(i, d, st, r, 1);
    this.day[i] = d;
    this.start[i] = st;
    this.room[i] = r;
  }

  private unplace(i: number) {
    this.apply(i, this.day[i], this.start[i], this.room[i], -1);
    this.day[i] = this.start[i] = this.room[i] = UNPLACED;
  }

  // ---- hard constraints (session i must not currently be placed) -------------

  /** First hard rule (other than rooms) that blocks i at (d, st), or null. */
  private blocker(i: number, d: number, st: number): Blocker | null {
    const { D, P } = this;
    const len = this.sessions[i].length;
    const t = this.sTeacher[i] * D * P + d * P;
    const sec = this.sSection[i] * D * P + d * P;
    const b = this.sBatch[i];
    const batch = b === 0 ? 0 : (this.sSection[i] * this.maxB + b - 1) * D * P + d * P;
    for (let p = st; p < st + len; p++) if (this.tBusy[t + p] > 0) return "teacher";
    for (let p = st; p < st + len; p++) {
      if (b === 0 ? this.secAny[sec + p] > 0 : this.secWhole[sec + p] > 0 || this.secBatch[batch + p] > 0) return "section";
    }
    if (this.lunch.length > 0) {
      const freeAfter = (base: number, busy: Int16Array) => this.lunch.some((c) => (c < st || c >= st + len) && busy[base + c] === 0);
      if (!freeAfter(sec, this.secAny) || !freeAfter(t, this.tBusy)) return "lunch";
    }
    return null;
  }

  private roomFree(i: number, r: number, d: number, st: number): boolean {
    const base = r * this.D * this.P + d * this.P;
    for (let p = st; p < st + this.sessions[i].length; p++) if (this.rBusy[base + p] > 0) return false;
    return true;
  }

  private freeRooms(i: number, d: number, st: number): number[] {
    return this.rooms[i].filter((r) => this.roomFree(i, r, d, st));
  }

  /** Pick a free room: keep `preferred` if possible, else a random dept-owned room, else a random shared one. */
  private pickRoom(i: number, d: number, st: number, preferred = UNPLACED): number {
    const free = this.freeRooms(i, d, st);
    if (free.length === 0) return UNPLACED;
    if (free.includes(preferred)) return preferred;
    const owned = free.filter((r) => this.input.rooms[r].departmentId !== null);
    const pool = owned.length > 0 ? owned : free;
    return pool[Math.floor(this.rand() * pool.length)];
  }

  // ---- soft constraints --------------------------------------------------------

  private sectionDayCost(sec: number, d: number): number {
    const { D, P, teaching } = this;
    const base = sec * D * P + d * P;
    let first = -1;
    let last = -1;
    for (let p = 0; p < P; p++) {
      if (teaching[p] && this.secAny[base + p] > 0) {
        if (first < 0) first = p;
        last = p;
      }
    }
    let gaps = 0;
    for (let p = first + 1; first >= 0 && p < last; p++) {
      if (teaching[p] && this.secAny[base + p] === 0 && !this.lunchSet.has(p)) gaps++;
    }
    let idle = 0;
    const batches = this.sectionBatches[sec];
    if (batches > 1) {
      for (let p = 0; p < P; p++) {
        if (!teaching[p]) continue;
        let inLab = 0;
        for (let b = 0; b < batches; b++) if (this.secBatch[(sec * this.maxB + b) * D * P + d * P + p] > 0) inLab++;
        if (inLab > 0 && this.secWhole[base + p] === 0) idle += batches - inLab;
      }
    }
    return gaps * WEIGHTS.sectionGaps + idle * WEIGHTS.batchIdle;
  }

  private teacherDayCost(t: number, d: number): number {
    const base = t * this.D * this.P + d * this.P;
    let run = 0;
    let over = 0;
    for (let p = 0; p < this.P; p++) {
      run = this.teaching[p] && this.tBusy[base + p] > 0 ? run + 1 : 0;
      if (run > MAX_CONSECUTIVE) over++;
    }
    return over * WEIGHTS.teacherOverload;
  }

  /** Soft cost of the section-days, teacher-days and course-days touched by sessions `is` on days `ds`. */
  private localCost(is: number[], ds: number[]): number {
    const seen = new Set<string>();
    let cost = 0;
    is.forEach((i, k) => {
      const d = ds[k];
      if (d === UNPLACED) return;
      const keys: [string, () => number][] = [
        [`s${this.sSection[i]}:${d}`, () => this.sectionDayCost(this.sSection[i], d)],
        [`t${this.sTeacher[i]}:${d}`, () => this.teacherDayCost(this.sTeacher[i], d)],
        [`c${this.sCourse[i]}:${d}`, () => Math.max(0, this.courseDay[this.sCourse[i] * this.D + d] - 1) * WEIGHTS.subjectRepeat],
      ];
      for (const [key, fn] of keys) {
        if (seen.has(key)) continue;
        seen.add(key);
        cost += fn();
      }
    });
    return cost;
  }

  private totalCost(): number {
    let cost = 0;
    for (let s = 0; s < this.sectionNames.length; s++) for (let d = 0; d < this.D; d++) cost += this.sectionDayCost(s, d);
    for (let t = 0; t < this.teacherNames.length; t++) for (let d = 0; d < this.D; d++) cost += this.teacherDayCost(t, d);
    for (const n of this.courseDay) cost += Math.max(0, n - 1) * WEIGHTS.subjectRepeat;
    return cost;
  }

  private unplacedCount(): number {
    return this.day.reduce((n, d) => n + (d === UNPLACED ? 1 : 0), 0);
  }

  // ---- search ------------------------------------------------------------------

  /** Number of feasible (day, start, room) options for i right now. */
  private optionCount(i: number): number {
    let n = 0;
    for (let d = 0; d < this.D; d++) {
      for (const st of this.starts[i]) {
        if (this.blocker(i, d, st) === null) n += this.freeRooms(i, d, st).length;
      }
    }
    return n;
  }

  /** Place i at the feasible (day, start) with the lowest added soft cost (random tie-break). */
  private placeBest(i: number): boolean {
    let best = Infinity;
    let choices: [number, number][] = [];
    for (let d = 0; d < this.D; d++) {
      for (const st of this.starts[i]) {
        if (this.blocker(i, d, st) !== null || this.freeRooms(i, d, st).length === 0) continue;
        const before = this.localCost([i], [d]);
        this.apply(i, d, st, this.rooms[i][0], 1);
        const delta = this.localCost([i], [d]) - before;
        this.apply(i, d, st, this.rooms[i][0], -1);
        if (delta < best) {
          best = delta;
          choices = [[d, st]];
        } else if (delta === best) choices.push([d, st]);
      }
    }
    if (choices.length === 0) return false;
    const [d, st] = choices[Math.floor(this.rand() * choices.length)];
    this.place(i, d, st, this.pickRoom(i, d, st));
    return true;
  }

  /** Greedy construction: repeatedly place the unplaced session with the fewest options. */
  private construct() {
    this.reset();
    const todo = new Set(this.sessions.map((_, i) => i).filter((i) => !this.locked[i]));
    while (todo.size > 0) {
      let pick = -1;
      let fewest = Infinity;
      let ties = 0;
      for (const i of todo) {
        const n = this.optionCount(i);
        if (n < fewest) {
          fewest = n;
          pick = i;
          ties = 1;
        } else if (n === fewest && this.rand() * ++ties < 1) pick = i;
      }
      todo.delete(pick);
      if (fewest > 0) this.placeBest(pick);
    }
  }

  /** Local search: random moves and same-length swaps, accepted if the soft cost doesn't increase. */
  private improve(deadline: number) {
    const movable = this.sessions.map((_, i) => i).filter((i) => !this.locked[i]);
    if (movable.length === 0) return;
    const byLength = new Map<number, number[]>();
    for (const i of movable) byLength.set(this.sessions[i].length, [...(byLength.get(this.sessions[i].length) ?? []), i]);
    let cost = this.totalCost();
    for (let iter = 0; ; iter++) {
      if ((iter & 63) === 0) {
        if (performance.now() >= deadline) return;
        if (cost === 0 && this.unplacedCount() === 0) return;
        // Retry unplaced sessions now and then: earlier moves may have freed a slot.
        for (const i of movable) if (this.day[i] === UNPLACED && this.placeBest(i)) cost = this.totalCost();
      }
      const i = movable[Math.floor(this.rand() * movable.length)];
      if (this.day[i] === UNPLACED) continue;
      if (this.rand() < 0.6) cost += this.tryMove(i);
      else {
        const peers = byLength.get(this.sessions[i].length)!;
        const j = peers[Math.floor(this.rand() * peers.length)];
        if (j !== i && this.day[j] !== UNPLACED) cost += this.trySwap(i, j);
      }
    }
  }

  /** Move i to a random slot. Returns the cost change (0 if rejected). */
  private tryMove(i: number): number {
    const starts = this.starts[i];
    const d = Math.floor(this.rand() * this.D);
    const st = starts[Math.floor(this.rand() * starts.length)];
    const [od, ost, or] = [this.day[i], this.start[i], this.room[i]];
    if (d === od && st === ost) return 0;
    const before = this.localCost([i, i], [od, d]);
    this.unplace(i);
    const r = this.blocker(i, d, st) === null ? this.pickRoom(i, d, st, or) : UNPLACED;
    if (r === UNPLACED) {
      this.place(i, od, ost, or);
      return 0;
    }
    this.place(i, d, st, r);
    const delta = this.localCost([i, i], [od, d]) - before;
    if (delta <= 0) return delta;
    this.unplace(i);
    this.place(i, od, ost, or);
    return 0;
  }

  /** Swap the slots of i and j (same length). Returns the cost change (0 if rejected). */
  private trySwap(i: number, j: number): number {
    const a = [this.day[i], this.start[i], this.room[i]] as const;
    const b = [this.day[j], this.start[j], this.room[j]] as const;
    if (a[0] === b[0] && a[1] === b[1]) return 0;
    const before = this.localCost([i, i, j, j], [a[0], b[0], a[0], b[0]]);
    this.unplace(i);
    this.unplace(j);
    const restore = () => {
      if (this.day[i] !== UNPLACED) this.unplace(i);
      if (this.day[j] !== UNPLACED) this.unplace(j);
      this.place(i, ...a);
      this.place(j, ...b);
      return 0;
    };
    const ri = this.blocker(i, b[0], b[1]) === null ? this.pickRoom(i, b[0], b[1], b[2]) : UNPLACED;
    if (ri === UNPLACED) return restore();
    this.place(i, b[0], b[1], ri);
    const rj = this.blocker(j, a[0], a[1]) === null ? this.pickRoom(j, a[0], a[1], a[2]) : UNPLACED;
    if (rj === UNPLACED) return restore();
    this.place(j, a[0], a[1], rj);
    const delta = this.localCost([i, i, j, j], [a[0], b[0], a[0], b[0]]) - before;
    return delta <= 0 ? delta : restore();
  }

  // ---- result --------------------------------------------------------------------

  solve(deadline: number, t0: number): SolveResult {
    const restartUntil = t0 + (deadline - t0) * RESTART_SHARE;
    let best: { a: ReturnType<Solver["snapshot"]>; unplaced: number; cost: number } | null = null;
    for (let k = 0; best === null || performance.now() < restartUntil; k++) {
      this.rand = rng(this.seed + k * 7919);
      this.construct();
      const candidate = { a: this.snapshot(), unplaced: this.unplacedCount(), cost: this.totalCost() };
      if (!best || candidate.unplaced < best.unplaced || (candidate.unplaced === best.unplaced && candidate.cost < best.cost)) {
        best = candidate;
      }
      if (best.unplaced === 0 && best.cost === 0) break;
    }
    this.load(best.a);
    this.improve(deadline);

    const placements: Placement[] = [...this.lockPlacements];
    const unplaced: SolveResult["unplaced"] = [];
    this.sessions.forEach((s, i) => {
      if (this.locked[i]) return;
      if (this.day[i] === UNPLACED) unplaced.push({ sessionId: s.id, ...this.whyUnplaced(i) });
      else placements.push({ sessionId: s.id, day: this.day[i], period: this.start[i], roomId: this.input.rooms[this.room[i]].id });
    });
    return {
      engine: "heuristic",
      status: unplaced.length === 0 ? "feasible" : "partial",
      placements,
      unplaced,
      score: score(this.input, placements),
      timeMs: Math.round(performance.now() - t0),
      message: unplaced.length > 0 ? `${unplaced.length} session(s) could not be placed` : undefined,
    };
  }

  /** Explain why i has no feasible option: tally what blocks each (day, start) and report the most common. */
  private whyUnplaced(i: number): { reason: string; cause: UnplacedCause } {
    const s = this.sessions[i];
    const label = sessionLabel(this.input, s);
    const roomDesc = s.fixedRoomId
      ? (this.input.rooms.find((r) => r.id === s.fixedRoomId)?.name ?? s.fixedRoomId)
      : `an eligible ${s.roomType}`;
    if (this.rooms[i].length === 0) {
      const why = s.fixedRoomId ? `required room ${roomDesc} missing or not allowed` : "none shared or owned by its department";
      return { reason: `${label}: no ${s.roomType} room it may use (${why})`, cause: "noRoom" };
    }
    if (this.starts[i].length === 0) return { reason: `${label}: no day has ${s.length} consecutive teaching periods`, cause: "noStart" };
    const tally: Record<Blocker, number> = { teacher: 0, section: 0, room: 0, lunch: 0 };
    for (let d = 0; d < this.D; d++) {
      for (const st of this.starts[i]) {
        const blocked = this.blocker(i, d, st) ?? (this.freeRooms(i, d, st).length === 0 ? "room" : null);
        if (blocked) tally[blocked]++;
      }
    }
    const top = (Object.keys(tally) as Blocker[]).reduce((x, y) => (tally[y] > tally[x] ? y : x));
    const teacher = this.teacherNames[this.sTeacher[i]];
    const section = this.sectionNames[this.sSection[i]];
    const slots = s.length > 1 ? `${s.length} consecutive periods` : "period";
    const mostly = {
      teacher: `teacher ${teacher} is busy`,
      section: `section ${section} is busy`,
      room: `${roomDesc} is taken`,
      lunch: `it would take the last free lunch period`,
    }[top];
    return { reason: `${label}: no ${slots} where teacher ${teacher}, ${section} and ${roomDesc} are all free (mostly: ${mostly})`, cause: top };
  }
}
