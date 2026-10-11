import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldGrid } from "@/components/engines/fields";
import { initialValues } from "@/components/engines/initial-values";
import { ResultPanel } from "@/components/engines/result-panel";
import {
  advanceProductivityTimer,
  createProductivityTimer,
  displayedMilliseconds,
  formatCountdown,
  formatStopwatch,
  recordProductivityLap,
  resetProductivityTimer,
  setFocusDurations,
  skipProductivityPhase,
  toggleProductivityTimer,
  type ProductivityMode,
  type ProductivityTimerState,
} from "@/lib/productivity/timer-engine";

const monotonicNow = () => performance.now();

export function ProductivityEngine({ op }: { op: string }) {
  if (op === "stopwatch") return <Stopwatch />;
  if (op === "pomodoro") return <CycleTimer mode="pomodoro" />;
  return <CycleTimer mode="focus" />;
}

function useProductivityTimer(mode: ProductivityMode): [ProductivityTimerState, (next: (current: ProductivityTimerState) => ProductivityTimerState) => void] {
  const [timer, setTimer] = useState(() => createProductivityTimer(mode));
  useEffect(() => {
    if (!timer.running) return;
    const interval = window.setInterval(() => {
      const now = monotonicNow();
      setTimer((current) => advanceProductivityTimer(current, now));
    }, mode === "stopwatch" ? 50 : 250);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") {
        const now = monotonicNow();
        setTimer((current) => advanceProductivityTimer(current, now));
      }
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [mode, timer.running]);
  return [timer, setTimer];
}

function Stopwatch() {
  const [timer, setTimer] = useProductivityTimer("stopwatch");
  const elapsed = displayedMilliseconds(timer, monotonicNow());
  return <div className="space-y-5">
    <div className="rounded-2xl border border-border bg-surface-2 p-6 text-center">
      <div className="font-mono text-5xl tracking-tight sm:text-6xl" aria-live="polite">{formatStopwatch(elapsed)}</div>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Button type="button" onClick={() => { const now = monotonicNow(); setTimer((current) => toggleProductivityTimer(current, now)); }}>{timer.running ? "Pause" : timer.hasStarted ? "Resume" : "Start"}</Button>
        <Button type="button" variant="secondary" onClick={() => { const now = monotonicNow(); setTimer((current) => recordProductivityLap(current, now)); }} disabled={!timer.running}>Lap</Button>
        <Button type="button" variant="ghost" onClick={() => setTimer((current) => resetProductivityTimer(current))}>Reset</Button>
      </div>
    </div>
    {timer.lapsMs.length > 0 ? <section className="rounded-xl border border-border p-4">
      <h3 className="mb-3 text-sm font-medium">Laps</h3>
      <div className="space-y-2">{timer.lapsMs.map((value, i) => <div key={`${i}-${value}`} className="flex justify-between rounded-lg bg-surface-2 px-3 py-2 text-sm"><span>Lap {i + 1}</span><span className="font-mono">{formatStopwatch(value)}</span></div>)}</div>
    </section> : null}
    <p className="text-xs text-subtle">Time is measured locally using a monotonic clock. Keep enV open to view live updates.</p>
  </div>;
}

function CycleTimer({ mode }: { mode: "focus" | "pomodoro" }) {
  const [timer, setTimer] = useProductivityTimer(mode);
  const pomodoro = mode === "pomodoro";
  const fields = useMemo(() => pomodoro ? [] : [
    { name: "focus", label: "Focus minutes (1–240)", type: "number" as const, defaultValue: "50" },
    { name: "break", label: "Break minutes (1–240)", type: "number" as const, defaultValue: "10" },
  ], [pomodoro]);
  const [values, setValues] = useState(() => initialValues(fields));
  const remaining = displayedMilliseconds(timer, monotonicNow());
  const update = (name: string, value: string) => {
    setValues((current) => ({ ...current, [name]: value }));
    setTimer((current) => setFocusDurations(
      current,
      name === "focus" ? (value.trim() ? Number(value) : current.focusMinutes) : current.focusMinutes,
      name === "break" ? (value.trim() ? Number(value) : current.breakMinutes) : current.breakMinutes,
    ));
  };
  const cycleLabel = pomodoro
    ? `Round ${timer.round} · ${timer.phase === "focus" ? "Focus" : "Break"}`
    : timer.phase === "focus" ? "Focus" : "Break";
  const cycleSummary = pomodoro
    ? "25-minute focus and 5-minute break cycle."
    : `${timer.focusMinutes} min focus / ${timer.breakMinutes} min break`;

  return <form className="space-y-5" onSubmit={(event) => { event.preventDefault(); const now = monotonicNow(); setTimer((current) => toggleProductivityTimer(current, now)); }}>
    {!pomodoro ? <FieldGrid fields={fields} values={values} onChange={update} /> : null}
    {!pomodoro ? <p className="text-xs text-subtle">Use whole minutes. Values are limited to 1–240 minutes.</p> : null}
    <div className="rounded-2xl border border-border bg-surface-2 p-6 text-center">
      <p className="text-sm text-muted">{cycleLabel}</p>
      <div className="mt-2 font-mono text-6xl tracking-tight" aria-live="polite">{formatCountdown(remaining)}</div>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Button type="submit">{timer.running ? "Pause" : timer.hasStarted ? "Resume" : "Start"}</Button>
        {pomodoro ? <Button type="button" variant="secondary" onClick={() => { const now = monotonicNow(); setTimer((current) => skipProductivityPhase(current, now)); }}>Skip</Button> : null}
        <Button type="button" variant="ghost" onClick={() => setTimer((current) => resetProductivityTimer(current))}>Reset</Button>
      </div>
    </div>
    <p className="text-xs text-subtle">{cycleSummary} Timer runs locally. When you return to the page, elapsed time is reconciled from the system's monotonic clock; no background alert is promised.</p>
    {!pomodoro ? <ResultPanel items={[{ label: "Cycle", value: cycleSummary, primary: true }]} filename="env-focus-timer.txt" /> : null}
  </form>;
}
