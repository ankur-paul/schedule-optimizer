import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { InfoTip } from "@/components/InfoTip";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Period } from "@/domain/types";
import { useAppStore } from "@/store/useAppStore";
import {
  ALL_DAYS,
  cleanWholeNumber,
  defaultLunchCandidates,
  fromMinutes,
  generatePeriods,
  parseGeneratorForm,
  periodErrors,
  toMinutes,
  toggleDay,
  withPeriods,
  type GeneratorForm,
} from "./periods";

export function SetupStep() {
  return (
    <div className="grid gap-6">
      <DaysCard />
      <PeriodsCard />
      <LunchCard />
    </div>
  );
}

function DaysCard() {
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);
  const extraDays = settings.days.filter((d) => !ALL_DAYS.includes(d));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Working days</CardTitle>
        <CardDescription>
          Days that have classes. Every day uses the same periods.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {[...ALL_DAYS, ...extraDays].map((day) => {
          const on = settings.days.includes(day);
          return (
            <button
              key={day}
              type="button"
              aria-pressed={on}
              onClick={() =>
                setSettings({
                  ...settings,
                  days: toggleDay(settings.days, day),
                })
              }
              className={cn(
                "h-9 min-w-14 rounded-full border px-4 text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                on
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {day}
            </button>
          );
        })}
        {settings.days.length === 0 && (
          <p className="w-full text-sm text-destructive">
            Pick at least one working day.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function PeriodsCard() {
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);
  // Start with the generator open while there are no periods yet.
  const [showGenerator, setShowGenerator] = useState(settings.periods.length === 0);
  const periods = settings.periods;
  const errors = periodErrors(periods);

  const replace = (next: Period[]) => setSettings(withPeriods(settings, next));
  const update = (i: number, patch: Partial<Period>) =>
    replace(periods.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const move = (i: number, by: -1 | 1) => {
    const next = [...periods];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    replace(next);
  };
  const remove = (i: number) => replace(periods.filter((_, j) => j !== i));
  const add = () => {
    const last = periods.at(-1);
    const lastTeaching = periods.findLast((p) => p.kind === "teaching");
    const length = lastTeaching
      ? toMinutes(lastTeaching.end) - toMinutes(lastTeaching.start) || 50
      : 50;
    const start =
      last && !Number.isNaN(toMinutes(last.end)) ? toMinutes(last.end) : 9 * 60;
    const n = periods.filter((p) => p.kind === "teaching").length + 1;
    replace([
      ...periods,
      {
        id: -1,
        label: `P${n}`,
        start: fromMinutes(start),
        end: fromMinutes(start + length),
        kind: "teaching",
      },
    ]);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          Periods
          <InfoTip>
            The daily bell schedule, in time order. Include breaks as their own
            rows.
          </InfoTip>
        </CardTitle>
        <CardDescription>
          Teaching periods can hold classes or be lunch breaks. Break periods
          are free time for everyone.
        </CardDescription>
        <CardAction>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowGenerator((v) => !v)}
          >
            <Wand2 /> Generate periods
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-4">
        {showGenerator && (
          <PeriodGenerator
            onGenerate={(next) => {
              setSettings({
                ...settings,
                periods: next,
                lunchCandidates: defaultLunchCandidates(next),
              });
              setShowGenerator(false);
            }}
            onCancel={() => setShowGenerator(false)}
          />
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="w-8 pb-2 font-medium">#</th>
                <th className="w-40 pb-2 font-medium">Label</th>
                <th className="pb-2 font-medium">Start</th>
                <th className="pb-2 font-medium">End</th>
                <th className="pb-2 font-medium">Kind</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {periods.map((p, i) => {
                const error = errors.get(p.id);
                return (
                  <tr
                    key={p.id}
                    className={cn(
                      "align-top",
                      p.kind === "break" && "bg-muted/50",
                    )}
                  >
                    <td className="py-1.5 pt-3 text-muted-foreground tabular-nums">
                      {i + 1}
                    </td>
                    <td className="py-1.5 pr-2">
                      <Input
                        aria-label={`Period ${i + 1} label`}
                        value={p.label}
                        aria-invalid={error === "Label is empty" || undefined}
                        onChange={(e) => update(i, { label: e.target.value })}
                        className="min-w-20"
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <Input
                        type="time"
                        aria-label={`Period ${i + 1} start`}
                        value={p.start}
                        aria-invalid={
                          (error && error !== "Label is empty") || undefined
                        }
                        onChange={(e) => update(i, { start: e.target.value })}
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <Input
                        type="time"
                        aria-label={`Period ${i + 1} end`}
                        value={p.end}
                        aria-invalid={
                          (error && error !== "Label is empty") || undefined
                        }
                        onChange={(e) => update(i, { end: e.target.value })}
                      />
                      {error && (
                        <p className="mt-1 text-xs text-destructive">{error}</p>
                      )}
                    </td>
                    <td className="py-1.5 pr-2">
                      <KindToggle
                        value={p.kind}
                        onChange={(kind) => update(i, { kind })}
                      />
                    </td>
                    <td className="py-1.5">
                      <div className="flex justify-end gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Move up"
                          disabled={i === 0}
                          onClick={() => move(i, -1)}
                        >
                          <ArrowUp />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Move down"
                          disabled={i === periods.length - 1}
                          onClick={() => move(i, 1)}
                        >
                          <ArrowDown />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Remove period"
                          onClick={() => remove(i)}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div>
          <Button variant="outline" size="sm" onClick={add}>
            <Plus /> Add period
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function KindToggle({
  value,
  onChange,
}: {
  value: Period["kind"];
  onChange: (kind: Period["kind"]) => void;
}) {
  return (
    <div
      className="inline-flex rounded-lg border p-0.5"
      role="radiogroup"
      aria-label="Period kind"
    >
      {(["teaching", "break"] as const).map((kind) => (
        <button
          key={kind}
          type="button"
          role="radio"
          aria-checked={value === kind}
          onClick={() => onChange(kind)}
          className={cn(
            "h-7 rounded-md px-2.5 text-xs font-medium capitalize transition-colors",
            value === kind
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {kind}
        </button>
      ))}
    </div>
  );
}

function PeriodGenerator({
  onGenerate,
  onCancel,
}: {
  onGenerate: (periods: Period[]) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<GeneratorForm>({
    start: "09:00",
    lengthMin: "50",
    count: "8",
    breakAfter: "2",
    breakMin: "20",
  });
  const [editingBreak, setEditingBreak] = useState(false);
  const options = parseGeneratorForm(form);
  const num =
    (key: keyof GeneratorForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm({ ...form, [key]: cleanWholeNumber(e.target.value) });
  const breakFocus = {
    onFocus: () => setEditingBreak(true),
    onBlur: () => setEditingBreak(false),
  };

  return (
    <div className="grid gap-3 rounded-lg border bg-muted/40 p-4">
      <p className="text-sm text-muted-foreground">
        Builds an evenly spaced schedule. This replaces the current periods.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Field label="First period starts">
          <Input
            type="time"
            value={form.start}
            onChange={(e) => setForm({ ...form, start: e.target.value })}
          />
        </Field>
        <Field label="Period length (min)">
          <Input
            type="number"
            min={1}
            value={form.lengthMin}
            onChange={num("lengthMin")}
          />
        </Field>
        <Field label="Teaching periods">
          <Input
            type="number"
            min={1}
            value={form.count}
            onChange={num("count")}
          />
        </Field>
        <Field
          label="Break after period"
          tip="Put a break after this teaching period. 0 means no break."
        >
          <Input
            type="number"
            min={0}
            value={form.breakAfter}
            onChange={num("breakAfter")}
            {...breakFocus}
          />
        </Field>
        <Field label="Break length (min)">
          <Input
            type="number"
            min={0}
            value={form.breakMin}
            onChange={num("breakMin")}
            {...breakFocus}
          />
        </Field>
      </div>
      {editingBreak && (
        <p className="text-xs text-muted-foreground">
          This is a short break for everyone, like a tea break. It is not lunch:
          lunch periods are picked under Lunch candidates below.
        </p>
      )}
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={!options}
          onClick={() => options && onGenerate(generatePeriods(options))}
        >
          Replace periods
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  tip,
  children,
}: {
  label: string;
  tip?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs text-muted-foreground">
        {label}
        {tip && <InfoTip>{tip}</InfoTip>}
      </Label>
      {children}
    </div>
  );
}

function LunchCard() {
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);
  const teaching = settings.periods.filter((p) => p.kind === "teaching");

  const toggle = (id: number) => {
    const has = settings.lunchCandidates.includes(id);
    const next = has
      ? settings.lunchCandidates.filter((x) => x !== id)
      : [...settings.lunchCandidates, id];
    setSettings({ ...settings, lunchCandidates: next.sort((a, b) => a - b) });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          Lunch candidates
          <InfoTip>
            Each section and teacher gets at least one of these free every day.
          </InfoTip>
        </CardTitle>
        <CardDescription>
          Periods where lunch can happen. Pick two or three so the timetable has
          room to move.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {teaching.map((p) => {
          const on = settings.lunchCandidates.includes(p.id);
          return (
            <label
              key={p.id}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                on ? "border-primary bg-primary/5" : "hover:bg-muted",
              )}
            >
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={on}
                onChange={() => toggle(p.id)}
              />
              <span className="font-medium">{p.label}</span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {p.start}–{p.end}
              </span>
            </label>
          );
        })}
        {teaching.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Add a teaching period first.
          </p>
        )}
        {teaching.length > 0 && settings.lunchCandidates.length === 0 && (
          <p className="w-full text-sm text-destructive">
            Pick at least one lunch candidate period.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
