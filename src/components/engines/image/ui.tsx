/** Small, consistent controls shared by every Image studio. Every control shows its value and has a reset. */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { canRedo, canUndo, createHistory, pushHistory, redoHistory, resetHistory, undoHistory, type History } from "@/lib/image/history";

const field = "w-full rounded-md bg-surface px-3 py-2 text-sm text-fg shadow-[var(--shadow-border)] outline-none focus-visible:ring-2 focus-visible:ring-accent";

export function Row({ label, hint, children, right }: { label: string; hint?: string; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-fg">{label}</span>
        {right}
      </div>
      {children}
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export function Slider({ label, value, onChange, min, max, step = 1, unit = "", def, hint, format }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step?: number; unit?: string; def?: number; hint?: string; format?: (v: number) => string }) {
  const id = useRef(`s-${Math.random().toString(36).slice(2, 8)}`).current;
  const changed = def !== undefined && value !== def;
  return (
    <Row label={label} hint={hint} right={
      <span className="flex items-center gap-1">
        <input aria-label={`${label} value`} type="number" inputMode="decimal" className="h-7 w-20 rounded-sm bg-surface-2 px-2 text-right text-xs tabular-nums text-fg outline-none focus-visible:ring-2 focus-visible:ring-accent"
          value={Number.isFinite(value) ? Number(value.toFixed(step < 1 ? 2 : 0)) : ""} min={min} max={max} step={step}
          onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n))); }} />
        {unit ? <span className="text-xs text-muted">{unit}</span> : null}
        {def !== undefined ? <button type="button" aria-label={`Reset ${label}`} disabled={!changed} onClick={() => onChange(def)} className="grid size-7 place-items-center rounded-sm text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-30"><RotateCcw className="size-3.5" /></button> : null}
      </span>
    }>
      <input id={id} aria-label={label} aria-valuetext={format ? format(value) : `${value}${unit}`} type="range" min={min} max={max} step={step} value={Number.isFinite(value) ? value : min} onChange={(e) => onChange(Number(e.target.value))} className="h-6 w-full cursor-pointer accent-[var(--color-accent)]" />
    </Row>
  );
}

export function Num({ label, value, onChange, min = 1, max = 100000, step = 1, suffix, hint }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; suffix?: string; hint?: string }) {
  const [text, setText] = useState(String(value));
  useEffect(() => { setText(String(Number.isFinite(value) ? Number(value.toFixed(4)) : "")); }, [value]);
  return (
    <Row label={label} hint={hint}>
      <div className="relative">
        <input aria-label={label} inputMode="decimal" className={cn(field, suffix && "pr-10")} value={text} onChange={(e) => { setText(e.target.value); const n = Number(e.target.value); if (e.target.value.trim() !== "" && Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n))); }}
          onBlur={() => setText(String(Number.isFinite(value) ? Number(value.toFixed(4)) : ""))} step={step} />
        {suffix ? <span className="pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-xs text-muted">{suffix}</span> : null}
      </div>
    </Row>
  );
}

export function Seg<T extends string | number>({ label, value, onChange, options, hint }: { label?: string; value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; title?: string }[]; hint?: string }) {
  const body = (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1 rounded-md bg-surface-2 p-1">
      {options.map((o) => (
        <button key={String(o.value)} type="button" role="radio" aria-checked={o.value === value} title={o.title} onClick={() => onChange(o.value)}
          className={cn("min-h-8 flex-1 whitespace-nowrap rounded-sm px-2.5 text-[13px] font-medium transition-colors", o.value === value ? "bg-surface text-fg shadow-[var(--shadow-border)]" : "text-muted hover:text-fg")}>{o.label}</button>
      ))}
    </div>
  );
  return label ? <Row label={label} hint={hint}>{body}</Row> : body;
}

export function Select<T extends string>({ label, value, onChange, options, hint }: { label: string; value: T; onChange: (v: T) => void; options: { value: T; label: string; disabled?: boolean }[]; hint?: string }) {
  return (
    <Row label={label} hint={hint}>
      <select aria-label={label} className={field} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)}
      </select>
    </Row>
  );
}

export function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 py-1">
      <input type="checkbox" className="mt-0.5 size-4 accent-[var(--color-accent)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span><span className="text-[13px] font-medium text-fg">{label}</span>{hint ? <span className="block text-xs text-muted">{hint}</span> : null}</span>
    </label>
  );
}

export function ColorField({ label, value, onChange, allowTransparent }: { label: string; value: string; onChange: (v: string) => void; allowTransparent?: boolean }) {
  const transparent = value === "transparent";
  return (
    <Row label={label}>
      <div className="flex items-center gap-2">
        <input aria-label={label} type="color" value={transparent ? "#ffffff" : value} onChange={(e) => onChange(e.target.value)} className="size-9 cursor-pointer rounded-md bg-surface p-0.5 shadow-[var(--shadow-border)]" />
        <input aria-label={`${label} hex`} className={cn(field, "flex-1 font-mono")} value={value} spellCheck={false} onChange={(e) => onChange(e.target.value)} />
        {allowTransparent ? <button type="button" onClick={() => onChange(transparent ? "#ffffff" : "transparent")} className={cn("h-9 rounded-md px-2.5 text-xs font-medium shadow-[var(--shadow-border)]", transparent ? "bg-accent text-accent-fg" : "bg-surface text-fg")}>Transparent</button> : null}
      </div>
    </Row>
  );
}

export function Section({ title, children, defaultOpen = true, badge }: { title: string; children: ReactNode; defaultOpen?: boolean; badge?: ReactNode }) {
  return (
    <details open={defaultOpen} className="group rounded-lg bg-surface shadow-[var(--shadow-border)]">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-4 text-sm font-semibold text-fg [&::-webkit-details-marker]:hidden">
        <span>{title}</span><span className="flex items-center gap-2">{badge}<span aria-hidden className="text-muted transition-transform group-open:rotate-90">›</span></span>
      </summary>
      <div className="space-y-4 border-t border-border px-4 py-4">{children}</div>
    </details>
  );
}

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: "ok" | "warn" | "danger" }) {
  return (
    <div className="rounded-md bg-surface-2 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
      <div className={cn("text-sm font-semibold tabular-nums text-fg", tone === "ok" && "text-ok", tone === "warn" && "text-warn", tone === "danger" && "text-danger")}>{value}</div>
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "danger" | "ok"; children: ReactNode }) {
  const toneClass = { info: "bg-accent-soft text-fg", warn: "bg-warn/10 text-fg", danger: "bg-danger/10 text-danger", ok: "bg-ok/10 text-fg" }[tone];
  return <p role={tone === "danger" ? "alert" : "status"} className={cn("rounded-md px-3 py-2 text-[13px] leading-relaxed", toneClass)}>{children}</p>;
}

export function Chips({ items, onPick, active }: { items: { id: string; label: string }[]; onPick: (id: string) => void; active?: string }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((i) => <button key={i.id} type="button" onClick={() => onPick(i.id)} className={cn("min-h-8 rounded-full px-3 text-xs font-medium shadow-[var(--shadow-border)]", active === i.id ? "bg-accent text-accent-fg" : "bg-surface text-fg hover:bg-surface-2")}>{i.label}</button>)}
    </div>
  );
}

export function Btn({ children, onClick, disabled, variant = "outline", title, className, type = "button" }: { children: ReactNode; onClick?: () => void; disabled?: boolean; variant?: "default" | "outline" | "ghost"; title?: string; className?: string; type?: "button" | "submit" }) {
  const v = { default: "bg-accent text-accent-fg hover:opacity-90", outline: "bg-surface text-fg shadow-[var(--shadow-border)] hover:bg-surface-2", ghost: "text-fg hover:bg-surface-2" }[variant];
  const symbolic = typeof children === "string" && children.trim().length <= 2;
  return <button type={type} title={title} aria-label={symbolic ? title : undefined} disabled={disabled} onClick={onClick} className={cn("inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-3.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40", v, className)}>{children}</button>;
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="min-h-8 rounded-sm bg-surface-2 px-2.5 text-xs font-medium text-fg hover:bg-border" onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1200); } catch { /* clipboard blocked */ } }}>
      {done ? "Copied" : label}
    </button>
  );
}

/** Undo/redo state for tool settings. Rapid changes with the same key (a slider drag) collapse into one history step. */
export function useSettings<T extends object>(initial: T) {
  const initialRef = useRef(initial);
  const [hist, setHist] = useState<History<T>>(() => createHistory(initial));
  const last = useRef<{ key: string; at: number }>({ key: "", at: 0 });
  const set = useCallback((patch: Partial<T> | ((prev: T) => Partial<T>), key = "") => {
    setHist((h) => {
      const next = { ...h.present, ...(typeof patch === "function" ? patch(h.present) : patch) };
      const now = Date.now();
      const merge = key !== "" && last.current.key === key && now - last.current.at < 700;
      last.current = { key, at: now };
      if (merge) return { ...h, present: next };
      return pushHistory(h, next);
    });
  }, []);
  const undo = useCallback(() => setHist((h) => undoHistory(h)), []);
  const redo = useCallback(() => setHist((h) => redoHistory(h)), []);
  const reset = useCallback((to?: T) => { last.current = { key: "", at: 0 }; setHist((h) => resetHistory(h, to ?? initialRef.current)); }, []);
  const replace = useCallback((next: T) => setHist((h) => pushHistory(h, next)), []);
  return { values: hist.present, set, undo, redo, reset, replace, canUndo: canUndo(hist), canRedo: canRedo(hist), initial: initialRef.current };
}

export function HistoryBar({ canUndo: u, canRedo: r, onUndo, onRedo, onReset, dirty = true }: { canUndo: boolean; canRedo: boolean; onUndo: () => void; onRedo: () => void; onReset: () => void; dirty?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT") && (t as HTMLInputElement).type !== "range") return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) onRedo(); else onUndo(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") { e.preventDefault(); onRedo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onUndo, onRedo]);
  return (
    <div className="flex flex-wrap gap-2" role="toolbar" aria-label="History">
      <Btn onClick={onUndo} disabled={!u} title="Undo (Ctrl/⌘+Z)">↶ Undo</Btn>
      <Btn onClick={onRedo} disabled={!r} title="Redo (Ctrl/⌘+Shift+Z)">↷ Redo</Btn>
      <Btn onClick={onReset} disabled={!dirty} title="Back to the starting values (undoable)">Reset all</Btn>
    </div>
  );
}
