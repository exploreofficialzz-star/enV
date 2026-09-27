import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldGrid } from "@/components/engines/fields";
import { initialValues } from "@/components/engines/initial-values";
import { ResultPanel } from "@/components/engines/result-panel";

function formatMs(ms: number) {
  const total = Math.max(0, Math.floor(ms / 10));
  const cs = total % 100;
  const seconds = Math.floor(total / 100) % 60;
  const minutes = Math.floor(total / 6000);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function formatSeconds(total: number) {
  const s = Math.max(0, Math.ceil(total));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function ProductivityEngine({ op }: { op: string }) {
  if (op === "stopwatch") return <Stopwatch />;
  if (op === "pomodoro") return <Pomodoro />;
  return <FocusTimer />;
}

function Stopwatch() {
  const [running, setRunning] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [laps, setLaps] = useState<number[]>([]);

  useEffect(() => {
    if (!running || startedAt === null) return;
    const id = window.setInterval(() => setElapsed(Date.now() - startedAt), 50);
    return () => window.clearInterval(id);
  }, [running, startedAt]);

  const toggle = () => {
    if (running) setRunning(false);
    else setStartedAt(Date.now() - elapsed);
    setRunning((v) => !v);
  };

  const reset = () => { setRunning(false); setStartedAt(null); setElapsed(0); setLaps([]); };
  const lap = () => setLaps((items) => [...items, elapsed]);

  return <div className="space-y-5">
    <div className="rounded-2xl border border-border bg-surface-2 p-6 text-center">
      <div className="font-mono text-5xl tracking-tight sm:text-6xl" aria-live="polite">{formatMs(elapsed)}</div>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Button type="button" onClick={toggle}>{running ? "Pause" : "Start"}</Button>
        <Button type="button" variant="secondary" onClick={lap} disabled={!running}>Lap</Button>
        <Button type="button" variant="ghost" onClick={reset}>Reset</Button>
      </div>
    </div>
    {laps.length > 0 ? <section className="rounded-xl border border-border p-4">
      <h3 className="mb-3 text-sm font-medium">Laps</h3>
      <div className="space-y-2">{laps.map((value, i) => <div key={`${i}-${value}`} className="flex justify-between rounded-lg bg-surface-2 px-3 py-2 text-sm"><span>Lap {i + 1}</span><span className="font-mono">{formatMs(value)}</span></div>)}</div>
    </section> : null}
  </div>;
}

function Pomodoro() {
  const [phase, setPhase] = useState<"focus" | "break">("focus");
  const [round, setRound] = useState(1);
  const [running, setRunning] = useState(false);
  const [remaining, setRemaining] = useState(25 * 60);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setRemaining((v) => {
      if (v <= 1) {
        const nextPhase = phase === "focus" ? "break" : "focus";
        if (nextPhase === "focus") setRound((r) => r + 1);
        setPhase(nextPhase);
        return nextPhase === "focus" ? 25 * 60 : 5 * 60;
      }
      return v - 1;
    }), 1000);
    return () => window.clearInterval(id);
  }, [running, phase]);

  const reset = () => { setRunning(false); setPhase("focus"); setRound(1); setRemaining(25 * 60); };
  const skip = () => { const next = phase === "focus" ? "break" : "focus"; setPhase(next); if (next === "focus") setRound((r) => r + 1); setRemaining(next === "focus" ? 25 * 60 : 5 * 60); };

  return <div className="space-y-5">
    <div className="rounded-2xl border border-border bg-surface-2 p-6 text-center">
      <p className="text-sm text-muted">Round {round} · {phase === "focus" ? "Focus" : "Break"}</p>
      <div className="mt-2 font-mono text-6xl tracking-tight" aria-live="polite">{formatSeconds(remaining)}</div>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Button type="button" onClick={() => setRunning((v) => !v)}>{running ? "Pause" : "Start"}</Button>
        <Button type="button" variant="secondary" onClick={skip}>Skip</Button>
        <Button type="button" variant="ghost" onClick={reset}>Reset</Button>
      </div>
    </div>
    <p className="text-xs text-subtle">Standard 25-minute focus and 5-minute break cycle. The timer stays in your browser.</p>
  </div>;
}

function FocusTimer() {
  const fields = useMemo(() => [
    { name: "focus", label: "Focus minutes", type: "number" as const, defaultValue: "50" },
    { name: "break", label: "Break minutes", type: "number" as const, defaultValue: "10" },
  ], []);
  const [values, setValues] = useState(() => initialValues(fields));
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState<"focus" | "break">("focus");
  const [remaining, setRemaining] = useState(50 * 60);

  const focus = Math.max(1, Number(values.focus) || 50) * 60;
  const pause = Math.max(1, Number(values.break) || 10) * 60;

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setRemaining((v) => {
      if (v <= 1) {
        const next = phase === "focus" ? "break" : "focus";
        setPhase(next);
        return next === "focus" ? focus : pause;
      }
      return v - 1;
    }), 1000);
    return () => window.clearInterval(id);
  }, [running, phase, focus, pause]);

  const start = () => { setRemaining(phase === "focus" ? focus : pause); setRunning(true); };
  const reset = () => { setRunning(false); setPhase("focus"); setRemaining(focus); };

  return <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); start(); }}>
    <FieldGrid fields={fields} values={values} onChange={(name, value) => setValues((v) => ({ ...v, [name]: value }))} />
    <div className="rounded-2xl border border-border bg-surface-2 p-6 text-center">
      <p className="text-sm text-muted">{phase === "focus" ? "Focus" : "Break"}</p>
      <div className="mt-2 font-mono text-6xl tracking-tight" aria-live="polite">{formatSeconds(remaining)}</div>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Button type="submit">{running ? "Restart" : "Start"}</Button>
        <Button type="button" variant="ghost" onClick={reset}>Reset</Button>
      </div>
    </div>
    <ResultPanel items={[{ label: "Cycle", value: `${values.focus || 50} min focus / ${values.break || 10} min break`, primary: true }]} filename="env-focus-timer.txt" />
  </form>;
}
