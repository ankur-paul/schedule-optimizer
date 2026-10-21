import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CircleX, Loader2, Lock, RefreshCw, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { InfoTip } from "@/components/InfoTip";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SCORE_ROWS, scoreCount } from "@/domain/stats";
import { validate } from "@/domain/validator";
import { checkServer } from "@/engine/solveClient";
import { regenerateLabel } from "@/features/lock/locks";
import { useAppStore } from "@/store/useAppStore";
import { badgeText, ENGINE_OPTIONS, generateBlockers, TIME_LIMIT, type Notice } from "./generate";
import { cancelledToast, useGenerate } from "./useGenerate";

type ServerState = "checking" | "online" | "offline";

export function GenerateStep() {
  const [server, setServer] = useState<ServerState>("checking");
  const [notice, setNotice] = useState<Notice>({});
  const [finishedRuns, setFinishedRuns] = useState(0);
  const outcome = useRef<HTMLDivElement>(null);

  const pollServer = () => checkServer().then((up) => setServer(up ? "online" : "offline"));
  const refreshServer = () => {
    setServer("checking");
    pollServer();
  };
  useEffect(() => {
    pollServer();
  }, []);
  // A finished run's result (or error) is below the fold on most screens: bring it into view.
  useEffect(() => {
    if (finishedRuns > 0) outcome.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [finishedRuns]);

  return (
    <div className="grid gap-6">
      <EngineCard server={server} onRefresh={refreshServer} onDone={(next) => {
        setNotice(next);
        setFinishedRuns((n) => n + 1);
        refreshServer();
      }} />
      <div ref={outcome} className="grid gap-6">
        {notice.error && <ErrorCard message={notice.error} />}
        <ResultCard fallbackReason={notice.error ? undefined : notice.fallbackReason} />
      </div>
    </div>
  );
}

function EngineCard({ server, onRefresh, onDone }: {
  server: ServerState;
  onRefresh: () => void;
  onDone: (notice: Notice) => void;
}) {
  const data = useAppStore();
  const { engineMode, setEngineMode, timeLimitSec, setTimeLimitSec, loadSample, locks, setLocks } = data;
  const { running, elapsed, run: runEngine, cancel } = useGenerate();
  const blockers = generateBlockers(data);

  const run = async () => {
    const notice = await runEngine();
    if (notice?.cancelled) cancelledToast();
    else if (notice) onDone(notice);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          Engine
          <InfoTip>
            CP-SAT is an exact optimiser running in the Python server. The in-browser engine is a fast heuristic. Auto tries
            CP-SAT and falls back if the server is off or finds no solution.
          </InfoTip>
        </CardTitle>
        <CardDescription>Both engines obey every hard rule; CP-SAT usually finds a better score.</CardDescription>
        <CardAction>
          <ServerDot state={server} onRefresh={onRefresh} />
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-6">
        <div role="radiogroup" aria-label="Engine" className="grid gap-3 sm:grid-cols-3">
          {ENGINE_OPTIONS.map((o) => {
            const on = engineMode === o.value;
            return (
              <label
                key={o.value}
                className={cn(
                  "flex cursor-pointer gap-3 rounded-lg border p-3 text-sm transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                  on ? "border-primary bg-primary/5" : "hover:bg-muted",
                )}
              >
                <input
                  type="radio"
                  name="engine"
                  className="mt-0.5 size-4 accent-primary"
                  checked={on}
                  disabled={running}
                  onChange={() => setEngineMode(o.value)}
                />
                <span>
                  <span className="block font-medium">{o.title}</span>
                  <span className="text-muted-foreground">{o.description}</span>
                </span>
              </label>
            );
          })}
        </div>

        <div className="grid max-w-md gap-2">
          <label htmlFor="time-limit" className="flex items-center gap-1.5 text-sm font-medium">
            Time limit: <span className="tabular-nums">{timeLimitSec} s</span>
            <InfoTip>
              How long CP-SAT may search. Longer can give a better score; it stops early once it proves the best one.
              The in-browser engine uses at most 5 s.
            </InfoTip>
          </label>
          <input
            id="time-limit"
            type="range"
            min={TIME_LIMIT.min}
            max={TIME_LIMIT.max}
            step={TIME_LIMIT.step}
            value={timeLimitSec}
            disabled={running}
            onChange={(e) => setTimeLimitSec(Number(e.target.value))}
            className="accent-primary"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Primary until there is a timetable; after that the footer's Next is the main way on. */}
          <Button size="lg" variant={data.result ? "outline" : "default"} disabled={running || blockers.length > 0} onClick={run}>
            {running ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {running ? "Generating…" : data.result || locks.length > 0 ? regenerateLabel(locks.length) : "Generate timetable"}
          </Button>
          {locks.length > 0 && !running && (
            <Button variant="ghost" size="sm" onClick={() => setLocks([])}>
              <Lock /> Clear all locks
            </Button>
          )}
          {running && (
            <Button variant="outline" size="lg" onClick={cancel}>
              <X /> Cancel
            </Button>
          )}
          {running && (
            <span className="text-sm text-muted-foreground tabular-nums" aria-live="polite">
              {elapsed} s elapsed{engineMode !== "heuristic" && ` · up to ${timeLimitSec} s`}
            </span>
          )}
          {!running && blockers.length > 0 && (
            <span className="flex items-center gap-2 text-sm text-destructive">
              {blockers[0]}
              {data.courses.length === 0 && (
                <Button variant="outline" size="sm" onClick={loadSample}>
                  Load sample college
                </Button>
              )}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ServerDot({ state, onRefresh }: { state: ServerState; onRefresh: () => void }) {
  const text = { checking: "checking…", online: "online", offline: "offline" }[state];
  return (
    <button
      type="button"
      onClick={onRefresh}
      title="Check again"
      className="flex items-center gap-2 rounded-full px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
    >
      <span
        className={cn(
          "size-2 rounded-full",
          state === "online" && "bg-emerald-500",
          state === "offline" && "bg-amber-500",
          state === "checking" && "animate-pulse bg-muted-foreground",
        )}
      />
      Solver server: {text}
      <RefreshCw className="size-3" />
    </button>
  );
}

function ErrorCard({ message }: { message: string }) {
  const hasPrevious = useAppStore((s) => s.result !== null);
  return (
    <Card className="border-destructive/40">
      <CardContent className="flex items-start gap-3 text-sm">
        <CircleX className="mt-0.5 size-5 shrink-0 text-destructive" />
        <div>
          <p className="font-medium">No timetable was produced.</p>
          <p className="text-muted-foreground">{message}</p>
          <p className="mt-1 text-muted-foreground">
            Try the Auto or Fast engine, or start the solver server.
            {hasPrevious && " The previous result below is unchanged."}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function ResultCard({ fallbackReason }: { fallbackReason?: string }) {
  const result = useAppStore((s) => s.result);
  const { settings, departments, teachers, rooms, sections, courses, locks } = useAppStore();
  // Re-check against the current data: the store may hold a result from before a data edit.
  const validation = useMemo(() => {
    if (!result) return null;
    const input = { settings, departments, teachers, rooms, sections, courses, locks, options: { timeLimitSec: 0 } };
    return validate(input, result.placements);
  }, [result, settings, departments, teachers, rooms, sections, courses, locks]);
  if (!result || !validation) return null;

  const clean = validation.violations.length === 0;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Result</CardTitle>
        <CardDescription>
          {result.placements.length} sessions placed in {(result.timeMs / 1000).toFixed(1)} s.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div
          role="status"
          className={cn(
            "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium",
            clean
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-destructive/30 bg-destructive/10 text-destructive",
          )}
        >
          {badgeText(result, validation)}
          <InfoTip>Every result is re-checked by an independent validator against all hard rules (H1–H8), whichever engine made it.</InfoTip>
        </div>

        {!clean && (
          <ul className="grid gap-1 text-sm text-destructive">
            {validation.violations.slice(0, 20).map((v, i) => (
              <li key={i}>
                <span className="font-mono text-xs">{v.rule}</span> {v.message}
              </li>
            ))}
            {validation.violations.length > 20 && <li>…and {validation.violations.length - 20} more</li>}
          </ul>
        )}

        {fallbackReason && (
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
            {fallbackReason}
          </p>
        )}

        {result.unplaced.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
            <p className="font-medium text-amber-900">
              {result.unplaced.length} session{result.unplaced.length === 1 ? "" : "s"} could not be placed
            </p>
            <ul className="mt-2 grid max-h-60 gap-1 overflow-auto text-amber-900/80">
              {result.unplaced.map((u) => (
                <li key={u.sessionId}>{u.reason}</li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <p className="mb-2 flex items-center gap-1.5 text-sm font-medium">
            Score: <span className="tabular-nums">{result.score.total}</span>
            <span className="font-normal text-muted-foreground">(lower is better, 0 is perfect)</span>
          </p>
          <div className="grid gap-2 sm:grid-cols-4">
            {SCORE_ROWS.map((row) => {
              const points = result.score.breakdown[row.key];
              return (
                <div key={row.key} className="rounded-lg border p-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {row.label}
                    <InfoTip>{row.tip}</InfoTip>
                  </div>
                  <div className={cn("text-xl font-semibold tabular-nums", points === 0 && "text-muted-foreground")}>
                    {points} <span className="text-sm font-normal text-muted-foreground">pts</span>
                  </div>
                  <div className="text-xs text-muted-foreground tabular-nums">{scoreCount(row.key, points)}</div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
