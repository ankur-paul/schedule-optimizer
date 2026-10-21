import { ArrowLeft, ArrowRight, CalendarDays, Check, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { TooltipProvider } from '@/components/ui/tooltip'
import { SetupStep } from '@/features/setup/SetupStep'
import { settingsErrors } from '@/features/setup/periods'
import { ViewStep } from '@/features/view/ViewStep'
import { useAppStore, type Step } from '@/store/useAppStore'

const STEPS: { title: string; hint: string }[] = [
  { title: 'Setup week', hint: 'Pick the working days and the daily bell schedule. Every day uses the same periods.' },
  { title: 'Add data', hint: 'Load the sample college or import your Excel file, then check the tables.' },
  { title: 'Generate', hint: 'Build a clash-free timetable. Every result is re-checked by an independent validator.' },
  { title: 'View & export', hint: 'Browse by section, teacher or room. Lock cells, regenerate, or print.' },
]

function App() {
  const step = useAppStore((s) => s.step)
  const setStep = useAppStore((s) => s.setStep)
  const settings = useAppStore((s) => s.settings)
  const reset = useAppStore((s) => s.reset)

  // Only step ① can block moving on for now; later steps add their own checks.
  const blockers = step === 0 ? settingsErrors(settings) : []
  const current = STEPS[step]

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-muted/40 text-foreground">
        <header className="border-b bg-background">
          <div className="mx-auto flex max-w-6xl items-center gap-3 px-6 py-4">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <CalendarDays className="size-5" />
            </div>
            <div className="flex-1">
              <h1 className="text-base leading-tight font-semibold">Timetable Generator</h1>
              <p className="text-xs text-muted-foreground">Clash-free weekly class timetables for any college</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (confirm('Clear all data and start over?')) reset()
              }}
            >
              <RotateCcw /> Start over
            </Button>
          </div>
          <Stepper step={step} onSelect={setStep} />
        </header>

        <main className="mx-auto grid max-w-6xl gap-6 px-6 py-8">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">
              {step + 1}. {current.title}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{current.hint}</p>
          </div>

          {step === 0 && <SetupStep />}
          {step === 1 && <Placeholder ticket="T06" />}
          {step === 2 && <Placeholder ticket="T07" />}
          {step === 3 && <ViewStep />}

          <div className="flex items-center gap-3 border-t pt-6">
            <Button variant="outline" disabled={step === 0} onClick={() => setStep((step - 1) as Step)}>
              <ArrowLeft /> Back
            </Button>
            <div className="flex-1 text-right text-sm text-destructive">{blockers[0]}</div>
            {step < 3 && (
              <Button disabled={blockers.length > 0} onClick={() => setStep((step + 1) as Step)}>
                Next: {STEPS[step + 1].title} <ArrowRight />
              </Button>
            )}
          </div>
        </main>
      </div>
    </TooltipProvider>
  )
}

function Stepper({ step, onSelect }: { step: Step; onSelect: (step: Step) => void }) {
  return (
    <nav aria-label="Steps" className="mx-auto max-w-6xl px-6 pb-3">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-2">
        {STEPS.map((s, i) => {
          const state = i < step ? 'done' : i === step ? 'current' : 'todo'
          return (
            <li key={s.title} className="flex items-center gap-2">
              {i > 0 && <span className="h-px w-6 bg-border sm:w-10" aria-hidden />}
              <button
                type="button"
                onClick={() => onSelect(i as Step)}
                aria-current={state === 'current' ? 'step' : undefined}
                className={cn(
                  'flex items-center gap-2 rounded-full py-1 pr-3 pl-1 text-sm transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
                  state === 'current' ? 'font-medium text-foreground' : 'text-muted-foreground',
                )}
              >
                <span
                  className={cn(
                    'flex size-6 items-center justify-center rounded-full border text-xs font-medium',
                    state === 'current' && 'border-primary bg-primary text-primary-foreground',
                    state === 'done' && 'border-primary text-primary',
                  )}
                >
                  {state === 'done' ? <Check className="size-3.5" /> : i + 1}
                </span>
                {s.title}
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

function Placeholder({ ticket }: { ticket: string }) {
  return (
    <Card>
      <CardContent className="py-10 text-center text-sm text-muted-foreground">Coming in {ticket}.</CardContent>
    </Card>
  )
}

export default App
