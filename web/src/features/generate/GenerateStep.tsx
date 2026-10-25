import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, CircleCheck, CircleX, CloudOff, Info, Loader2, Lock, RefreshCw, Sparkles, Wand2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { HelpLink } from "@/components/HelpLink";
import { AskAboutButton } from "@/features/assistant/AssistantPanel";
import { InfoTip } from "@/components/InfoTip";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { SCORE_ROWS, scoreCount, scoreTotalTip } from "@/domain/stats";
import type { SolveResult } from "@/domain/types";
import { validate } from "@/domain/validator";
import { useCollegeData } from "@/features/data/collegeData";
import { checkData } from "@/features/data/dataChecks";
import { useDataView } from "@/features/data/dataView";
import { helpHref } from "@/help/helpLinks";
import { regenerateLabel } from "@/features/lock/locks";
import { useAppStore } from "@/store/useAppStore";
import { aimRows, aimsSummary, PREFERENCES_CHANGED, preferencesChanged } from "./aims";
import { causeHelpHref, unplacedHelpHref } from "./causeHelp";
import { explainInfeasible, GENERAL_SUGGESTIONS, preflightWarnings, topCauses, type Cause, type CauseLink } from "./causes";
import {
  badgeText,
  couldntFinishText,
  generateBlockers,
  generateView,
  partialHow,
  unplacedGroups,
  type DraftReason,
  type GenerateView,
} from "./generate";
import { cancelledToast, showFailure, useGenerate, useRunKind, useRunLimit, useRunOutcome, type RunEnd } from "./useGenerate";
import { useServerStatus, type ServerState } from "./useServer";

const SERVER_COMMAND = "cd server && uv run uvicorn main:app --port 8000";

export function GenerateStep() {
  const { server, contractMismatch, recheck } = useServerStatus();
  const runKind = useRunKind();
  const outcome = useRunOutcome();
  const result = useAppStore((s) => s.result);
  const timeLimitSec = useAppStore((s) => s.timeLimitSec);
  const view = generateView({ server, running: runKind, outcome, result, timeLimitSec });
  const run = useGenerate();
  const [finishedRuns, setFinishedRuns] = useState(0);
  const outcomeRef = useRef<HTMLDivElement>(null);

  // A finished run's card is below the fold on most screens: bring it into view.
  useEffect(() => {
    if (finishedRuns > 0) outcomeRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [finishedRuns]);

  const after = (end: RunEnd) => {
    if (!end) return;
    if (end.kind === "cancelled") cancelledToast();
    else setFinishedRuns((n) => n + 1);
  };
  const actions: Actions = {
    generate: (limit?: number) => run.generate(limit).then(after),
    draft: (reason: DraftReason) => run.draft(reason).then(after),
    cancel: run.cancel,
  };

  return (
    <div className="grid gap-6">
      <AimsCard running={view.state === "running"} />
      <GenerateCard view={view} server={server} contractMismatch={contractMismatch} onRecheck={recheck} actions={actions} elapsed={run.elapsed} />
      <div ref={outcomeRef} className="grid scroll-mt-4 gap-6">
        {view.state === "impossible" && <ImpossibleCard view={view} actions={actions} />}
        {view.state === "couldntFinish" && <CouldntFinishCard view={view} actions={actions} />}
        {result && (view.state === "ready" || view.state === "partial") && <ResultCard view={view} result={result} actions={actions} />}
      </div>
    </div>
  );
}

interface Actions {
  generate: (timeLimitSec?: number) => void;
  draft: (reason: DraftReason) => void;
  cancel: () => void;
}

/** The soft rules as aims, one switch each (T54). A flip keeps the timetable and re-scores it at once. */
function AimsCard({ running }: { running: boolean }) {
  const softRules = useAppStore((s) => s.softRules);
  const setSoftRules = useAppStore((s) => s.setSoftRules);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          What to aim for
          <InfoTip more={helpHref("generate", "aims")}>
            The soft rules: things a timetable may do but shouldn't. Each one that's on adds points to the score, and Generate
            looks for the lowest score. Hard rules, such as no clashes, always apply.
          </InfoTip>
        </CardTitle>
        <CardDescription>{aimsSummary(softRules)}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-x-6 gap-y-3 text-sm md:grid-cols-2">
          {aimRows(softRules).map((aim) => (
            <li key={aim.key} className="flex items-center gap-2">
              <label className={cn("flex items-center gap-2.5", running ? "cursor-not-allowed text-muted-foreground" : "cursor-pointer")}>
                {/* The stock off track is near-white on a white card. */}
                <Switch
                  className="data-unchecked:bg-muted-foreground/35"
                  checked={aim.on}
                  disabled={running}
                  onCheckedChange={(on) => setSoftRules({ ...softRules, [aim.key]: on })}
                />
                {aim.label}
              </label>
              <InfoTip more={helpHref("timetable", "score")}>{aim.tip}</InfoTip>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function GenerateCard({ view, server, contractMismatch, onRecheck, actions, elapsed }: {
  view: GenerateView;
  server: ServerState;
  contractMismatch: boolean;
  onRecheck: () => void;
  actions: Actions;
  elapsed: number;
}) {
  const data = useAppStore();
  const { timeLimitSec, loadSample, locks, setLocks } = data;
  const runLimit = useRunLimit() ?? timeLimitSec;
  const changed = preferencesChanged(data.rulesAtRun, data.softRules, data.result !== null);
  const college = useCollegeData();
  const blockers = generateBlockers(data);
  const running = view.state === "running";
  const warnings = useMemo(() => {
    try {
      return preflightWarnings(checkData(college, data.settings));
    } catch {
      return []; // broken data; step ② reports it
    }
  }, [college, data.settings]);
  const draftMain = view.button === "draft";
  const label = draftMain
    ? "Make a quick draft"
    : data.result || locks.length > 0
      ? regenerateLabel(locks.length)
      : "Generate timetable";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          Exact solver
          <InfoTip more={helpHref("generate", "engines")}>
            The exact solver (CP-SAT, from Google OR-Tools, on the Python server) finds the best timetable or proves that
            none exists. A quick draft is a fast in-browser heuristic; it only runs when you ask for one.
          </InfoTip>
        </CardTitle>
        <CardDescription>Every hard rule is obeyed. It stops early once it has proved the best timetable.</CardDescription>
        <CardAction>
          <ServerDot state={server} onRecheck={onRecheck} />
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-5">
        {view.offline && (
          <div role="status" className="flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <CloudOff className="mt-0.5 size-4 shrink-0" />
            <div className="grid gap-1">
              <p className="font-medium">Exact solver is offline. A quick draft will be made in your browser instead; it may score worse.</p>
              {import.meta.env.DEV ? (
                <p>
                  Start it with <code className="rounded bg-amber-100 px-1 py-0.5 font-mono text-xs">{SERVER_COMMAND}</code>; this
                  page notices within 5 s.
                </p>
              ) : (
                <p>The solver service is unavailable.</p>
              )}
              <p>
                <HelpLink href={helpHref("troubleshooting", "solver-offline")}>What to do</HelpLink>
              </p>
            </div>
          </div>
        )}

        {contractMismatch && !view.offline && (
          <p role="status" className="flex gap-2 text-sm text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0" />
            <span>
              The solver was updated at a different time from this page. Reload the page; if this stays, results may be
              wrong. <HelpLink href={helpHref("troubleshooting", "solver-version")}>Why</HelpLink>
            </span>
          </p>
        )}

        {warnings.length > 0 && view.state !== "impossible" && !running && <BeforeYouStart warnings={warnings} />}

        <div className="flex flex-wrap items-center gap-3">
          {/* Primary until there is a timetable; after that the footer's Next is the main way on. */}
          <Button
            size="lg"
            variant={data.result ? "outline" : "default"}
            disabled={running || blockers.length > 0}
            onClick={() => (draftMain ? actions.draft("offline") : actions.generate())}
          >
            {running ? <Loader2 className="animate-spin" /> : draftMain ? <Wand2 /> : <Sparkles />}
            {running ? (view.draft ? "Making a quick draft…" : "Generating…") : label}
          </Button>
          {locks.length > 0 && !running && (
            <Button variant="ghost" size="sm" onClick={() => setLocks([])}>
              <Lock /> Clear all locks
            </Button>
          )}
          {running && (
            <Button variant="outline" size="lg" onClick={actions.cancel}>
              <X /> Cancel
            </Button>
          )}
          {running && (
            <span className="text-sm text-muted-foreground tabular-nums" aria-live="polite">
              {view.draft ? `${elapsed} s` : `${elapsed} s of up to ${runLimit} s`}
            </span>
          )}
          {!running && blockers.length === 0 && changed && (
            <span role="status" className="flex items-center gap-1.5 text-sm text-amber-800">
              <Info className="size-4 shrink-0" />
              {PREFERENCES_CHANGED}
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

function ServerDot({ state, onRecheck }: { state: ServerState; onRecheck: () => void }) {
  const text = { checking: "checking…", online: "online", offline: "offline" }[state];
  return (
    <button
      type="button"
      onClick={onRecheck}
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
      Exact solver: {text}
      <RefreshCw className="size-3" />
    </button>
  );
}

/** Load warnings from step ②, shown before a run. They never block: the solver gets the final say. */
function BeforeYouStart({ warnings }: { warnings: Cause[] }) {
  const { shown, more } = topCauses(warnings, 3);
  return (
    <div className="rounded-lg border p-3 text-sm">
      <p className="flex items-center gap-1.5 font-medium">
        <AlertTriangle className="size-4 text-amber-500" /> Before you start
      </p>
      <p className="mt-0.5 text-muted-foreground">This data probably can't fit in the week. You can still try.</p>
      <ul className="mt-2 grid gap-2">
        {shown.map((c, i) => (
          <CauseItem key={i} cause={c} />
        ))}
      </ul>
      {more > 0 && <p className="mt-1 text-muted-foreground">+{more} more in step ②'s data checks</p>}
    </div>
  );
}

/** Go where a fix link points: step ② on the right tab and filters, or step ④ to clear the locks. */
function openLink(link: CauseLink) {
  const { setStep } = useAppStore.getState();
  if (link.step === 2) {
    useDataView.getState().open({ tab: link.tab, sectionId: link.sectionId, teacherId: link.teacherId });
    setStep(1);
  } else setStep(3);
}

/** `askable`: a *Can't be built* reason, which gets *Ask about this* (the warnings before a run don't). */
function CauseItem({ cause, askable = false }: { cause: Cause; askable?: boolean }) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
      <span className="min-w-0 flex-1 basis-72">
        {cause.text}{" "}
        <HelpLink href={causeHelpHref(cause)} className="text-muted-foreground hover:text-foreground">
          What this means
        </HelpLink>
        {askable && (
          <>
            {" "}
            <AskAboutButton card={{ kind: "cause", cause }} className="ml-2 text-muted-foreground hover:text-foreground" />
          </>
        )}
      </span>
      <Button variant="outline" size="sm" onClick={() => openLink(cause.link)}>
        {cause.fix} →
      </Button>
    </li>
  );
}

function ImpossibleCard({ view, actions }: { view: Extract<GenerateView, { state: "impossible" }>; actions: Actions }) {
  const failed = useRunOutcome().failed!;
  const heading = useRef<HTMLHeadingElement>(null);
  const [showAll, setShowAll] = useState(false);
  const causes = useMemo(() => {
    const { input, failure } = failed;
    try {
      return explainInfeasible(input, failure.diagnosis, checkData(input, input.settings));
    } catch {
      return [];
    }
  }, [failed]);
  const { shown, more } = topCauses(causes);
  useEffect(() => heading.current?.focus(), [failed]);

  return (
    <Card role="alert" className="border-destructive/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-destructive">
          <CircleX className="size-5" />
          <h3 ref={heading} tabIndex={-1} className="outline-none">
            This timetable can't be built
          </h3>
        </CardTitle>
        <CardDescription>
          The exact solver proved that no timetable fits every rule with this data. Nothing was changed
          {view.hasTimetable ? "; your previous timetable is kept." : "."}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 text-sm">
        {causes.length > 0 ? (
          <div>
            <p className="mb-2 font-medium">Why, most likely first</p>
            <ul className="grid gap-2">
              {(showAll ? causes : shown).map((c, i) => (
                <CauseItem key={i} cause={c} askable />
              ))}
            </ul>
            {more > 0 && (
              <Button variant="link" size="sm" className="mt-1 px-0" onClick={() => setShowAll((s) => !s)}>
                {showAll ? "Show fewer" : `+${more} more`}
              </Button>
            )}
          </div>
        ) : (
          <div>
            <p className="font-medium">No single cause found: the rules conflict in combination.</p>
            <p className="mt-1 text-muted-foreground">
              Things that usually help:{" "}
              <HelpLink href={helpHref("generate", "no-single-cause")} className="hover:text-foreground">
                More about this
              </HelpLink>
            </p>
            <ul className="mt-1 list-disc pl-5 text-muted-foreground">
              {GENERAL_SUGGESTIONS.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="grid gap-1 border-t pt-4">
          <div>
            <Button variant="outline" onClick={() => actions.draft("impossible")}>
              <Wand2 /> Make a partial timetable
            </Button>
          </div>
          <p className="text-muted-foreground">
            Places as many classes as fit and lists the rest.{view.hasTimetable && " Replaces your current timetable."}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function CouldntFinishCard({ view, actions }: { view: Extract<GenerateView, { state: "couldntFinish" }>; actions: Actions }) {
  const message = useRunOutcome().failed?.failure.message;
  const { title, body } = couldntFinishText(view.kind, view.limitSec);
  const retry =
    view.kind === "timeout" ? (
      view.retryWith !== null && (
        <Button disabled={view.offline} onClick={() => actions.generate(view.retryWith!)}>
          <RefreshCw /> Try again with {view.retryWith} s
        </Button>
      )
    ) : (
      <Button disabled={view.offline} onClick={() => actions.generate()}>
        <RefreshCw /> Try again
      </Button>
    );
  return (
    <Card role="alert">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Info className="size-5 text-muted-foreground" />
          {title}
          {/* The server's own words can name CP-SAT, so they stay in the tooltip. */}
          {message && <InfoTip>Details: {message}</InfoTip>}
        </CardTitle>
        <CardDescription>
          {body} {view.hasTimetable ? "Your previous timetable is unchanged." : "No timetable was made."}
        </CardDescription>
      </CardHeader>
      <CardContent className="text-sm">
        <div className="flex flex-wrap items-center gap-2">
          {retry}
          <Button variant="outline" onClick={() => actions.draft("couldntFinish")}>
            <Wand2 /> Make a quick draft instead
          </Button>
          <HelpLink href={helpHref("generate", "couldnt-finish")} className="ml-1 text-muted-foreground hover:text-foreground">
            What this means
          </HelpLink>
          <AskAboutButton card={{ kind: "couldntFinish", title, body }} className="ml-1 text-muted-foreground hover:text-foreground" />
        </div>
      </CardContent>
    </Card>
  );
}

function ResultCard({ view, result, actions }: {
  view: Extract<GenerateView, { state: "ready" | "partial" }>;
  result: SolveResult;
  actions: Actions;
}) {
  const { settings, departments, teachers, rooms, sections, courses, locks } = useAppStore();
  // Re-check against the current data: the store may hold a result from before a data edit.
  const validation = useMemo(() => {
    const input = { settings, departments, teachers, rooms, sections, courses, locks, options: { timeLimitSec: 0 } };
    try {
      return validate(input, result.placements);
    } catch {
      return null; // broken data; step ② reports it
    }
  }, [result, settings, departments, teachers, rooms, sections, courses, locks]);
  if (!validation) return null;

  const clean = validation.violations.length === 0;
  const partial = view.state === "partial";
  return (
    <Card className={cn(partial ? "border-amber-300" : clean && "border-emerald-300")}>
      <CardHeader>
        <CardTitle className={cn("flex items-center gap-2", partial ? "text-amber-900" : clean && "text-emerald-800")}>
          {partial ? (
            <AlertTriangle className="size-5 text-amber-500" />
          ) : clean ? (
            <CircleCheck className="size-5 text-emerald-600" />
          ) : (
            <CircleX className="size-5 text-destructive" />
          )}
          {partial ? `Partial: ${view.unplaced} of ${view.total} classes not placed` : "Timetable ready"}
        </CardTitle>
        <CardDescription>{view.state === "partial" ? partialHow(view.from) : readyLine(view, result)}</CardDescription>
        {view.state === "ready" && view.tryLonger !== null && (
          <CardAction>
            <Button variant="outline" disabled={view.offline} onClick={() => actions.generate(view.tryLonger!)}>
              Try longer: {view.tryLonger} s
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="grid gap-5">
        <div
          role="status"
          className={cn(
            "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium",
            !clean
              ? "border-destructive/30 bg-destructive/10 text-destructive"
              : partial
                ? "border-amber-200 bg-amber-50 text-amber-900"
                : "border-emerald-200 bg-emerald-50 text-emerald-800",
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

        {partial && <UnplacedList result={result} />}
        {view.state === "partial" && view.backToReasons && (
          <div>
            <Button variant="ghost" size="sm" onClick={() => showFailure(true)}>
              <ArrowLeft /> Back to the reasons
            </Button>
          </div>
        )}

        <ScoreGrid result={result} />
      </CardContent>
    </Card>
  );
}

function readyLine(view: Extract<GenerateView, { state: "ready" }>, result: SolveResult): string {
  const time = `${(result.timeMs / 1000).toFixed(1)} s`;
  switch (view.quality) {
    case "optimal":
      return `The best possible timetable, found by the exact solver in ${time}.`;
    case "feasible":
      return `The best timetable found in ${view.limitSec} s. A longer search may find a better score.`;
    case "draft":
      return `${result.placements.length} classes placed in ${time}.`;
  }
}

function UnplacedList({ result }: { result: SolveResult }) {
  const groups = unplacedGroups(result.unplaced);
  return (
    <div className="grid gap-1 text-sm">
      <p className="font-medium">Not placed, by reason</p>
      {groups.map((g, i) => (
        <details key={g.cause} open={i === 0} className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2">
          <summary className="cursor-pointer font-medium text-amber-900 select-none">
            {g.label} <span className="font-normal tabular-nums">({g.items.length})</span>
          </summary>
          <span className="mt-1 flex flex-wrap gap-x-3 text-xs text-amber-900">
            <HelpLink href={unplacedHelpHref(g.cause)}>What this means</HelpLink>
            <AskAboutButton card={{ kind: "unplaced", cause: g.cause, label: g.label, reasons: g.items.map((u) => u.reason) }} />
          </span>
          <ul className="mt-1 grid max-h-60 gap-1 overflow-auto text-amber-900/80">
            {g.items.map((u) => (
              <li key={u.sessionId}>{u.reason}</li>
            ))}
          </ul>
        </details>
      ))}
      <p className="text-muted-foreground">In step ④ you can drag them onto free slots yourself.</p>
    </div>
  );
}

function ScoreGrid({ result }: { result: SolveResult }) {
  return (
    <div>
      <p className="mb-2 flex items-center gap-1.5 text-sm font-medium">
        Score: <span className="tabular-nums">{result.score.total}</span>
        <span className="font-normal text-muted-foreground">(lower is better, 0 is perfect)</span>
        <InfoTip more={helpHref("timetable", "score")}>{scoreTotalTip(result.score.breakdown)}</InfoTip>
      </p>
      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {SCORE_ROWS.map((row) => {
          const points = result.score.breakdown[row.key];
          return (
            <div key={row.key} className="rounded-lg border p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {row.label}
                <InfoTip more={helpHref("timetable", "score")}>{row.tip}</InfoTip>
              </div>
              {points == null ? (
                <div className="text-xl font-semibold text-muted-foreground">Off</div>
              ) : (
                <>
                  <div className={cn("text-xl font-semibold tabular-nums", points === 0 && "text-muted-foreground")}>
                    {points} <span className="text-sm font-normal text-muted-foreground">pts</span>
                  </div>
                  <div className="text-xs text-muted-foreground tabular-nums">{scoreCount(row.key, points)}</div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
