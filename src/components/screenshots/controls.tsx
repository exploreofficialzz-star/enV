import type { ReactNode } from "react";
import { useId } from "react";
import { safeColor } from "@/lib/screenshots/backgrounds";

export function Section({ title, children, open = false, badge }: { title: string; children: ReactNode; open?: boolean; badge?: string }) {
  return (
    <details className="ss-section" open={open}>
      <summary><span>{title}</span>{badge ? <span className="ss-badge">{badge}</span> : null}</summary>
      <div className="ss-section-body">{children}</div>
    </details>
  );
}

export function Field({ label, hint, children, id }: { label: string; hint?: string; children: ReactNode; id?: string }) {
  return (<div className="ss-field"><label htmlFor={id} className="ss-label">{label}</label>{children}{hint ? <p className="ss-hint">{hint}</p> : null}</div>);
}

export function Note({ tone = "info", children }: { tone?: "info" | "warn" | "danger" | "ok"; children: ReactNode }) {
  return <p className={`ss-note ss-note-${tone}`} role={tone === "danger" || tone === "warn" ? "status" : undefined}>{children}</p>;
}

export function Slider({ label, value, min, max, step = 1, unit = "", onChange, format }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void; format?: (v: number) => string }) {
  const id = useId(), safe = Number.isFinite(value) ? value : min;
  const set = (raw: string) => { const n = Number(raw); if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n))); };
  return (
    <div className="ss-field">
      <div className="ss-row"><label htmlFor={id} className="ss-label">{label}</label>
        <span className="ss-num"><input type="number" aria-label={`${label} value`} value={format ? format(safe) : Math.round(safe * 100) / 100} min={min} max={max} step={step} onChange={(e) => set(e.target.value)} />{unit ? <span className="ss-unit">{unit}</span> : null}</span></div>
      <input id={id} type="range" min={min} max={max} step={step} value={safe} onChange={(e) => set(e.target.value)} />
    </div>
  );
}

export function NumberInput({ label, value, min, max, step = 1, unit, onChange, disabled }: { label: string; value: number; min?: number; max?: number; step?: number; unit?: string; onChange: (v: number) => void; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="ss-field ss-field-num"><label htmlFor={id} className="ss-label">{label}</label>
      <span className="ss-num"><input id={id} type="number" value={Number.isFinite(value) ? Math.round(value * 100) / 100 : 0} min={min} max={max} step={step} disabled={disabled} onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) onChange(n); }} />{unit ? <span className="ss-unit">{unit}</span> : null}</span></div>
  );
}

export function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string; disabled?: boolean }[]; onChange: (v: T) => void }) {
  return (
    <div className="ss-field"><span className="ss-label" id={`seg-${label}`}>{label}</span>
      <div className="ss-seg" role="radiogroup" aria-labelledby={`seg-${label}`}>
        {options.map((o) => (<button key={o.value} type="button" role="radio" aria-checked={o.value === value} disabled={o.disabled} onClick={() => onChange(o.value)}>{o.label}</button>))}
      </div></div>
  );
}

export function Toggle({ label, checked, onChange, hint, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string; disabled?: boolean }) {
  const id = useId();
  return (<div className="ss-field ss-toggle"><label htmlFor={id} className="ss-check"><input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} /><span>{label}</span></label>{hint ? <p className="ss-hint">{hint}</p> : null}</div>);
}

export function SelectField<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string; group?: string }[]; onChange: (v: T) => void }) {
  const id = useId(), groups = [...new Set(options.map((o) => o.group ?? ""))];
  return (
    <Field label={label} id={id}>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {groups.map((g) => g ? <optgroup key={g} label={g}>{options.filter((o) => o.group === g).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</optgroup> : options.filter((o) => !o.group).map((o) => <option key={o.value} value={o.value}>{o.label}</option>))}
      </select>
    </Field>
  );
}

export function TextInput({ label, value, onChange, placeholder, multiline, maxLength = 200, autoFocus }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; multiline?: boolean; maxLength?: number; autoFocus?: boolean }) {
  const id = useId();
  return (<Field label={label} id={id}>{multiline
    ? <textarea id={id} rows={2} value={value} maxLength={maxLength} placeholder={placeholder} autoFocus={autoFocus} onChange={(e) => onChange(e.target.value)} />
    : <input id={id} type="text" value={value} maxLength={maxLength} placeholder={placeholder} autoFocus={autoFocus} autoComplete="off" spellCheck={false} onChange={(e) => onChange(e.target.value)} />}</Field>);
}

export function ColorInput({ label, value, onChange, allowClear }: { label: string; value: string; onChange: (v: string) => void; allowClear?: boolean }) {
  const id = useId(), hex = safeColor(value, "#000000").slice(0, 7);
  return (
    <div className="ss-field ss-field-color"><label htmlFor={id} className="ss-label">{label}</label>
      <span className="ss-color"><input id={id} type="color" value={hex} onChange={(e) => onChange(e.target.value)} aria-label={`${label} colour picker`} />
        <input type="text" aria-label={`${label} hex value`} value={value === "transparent" ? "transparent" : value} spellCheck={false} onChange={(e) => onChange(e.target.value)} onBlur={(e) => { if (e.target.value !== "transparent") onChange(safeColor(e.target.value, hex)); }} />
        {allowClear ? <button type="button" className="ss-mini" onClick={() => onChange("transparent")}>None</button> : null}</span></div>
  );
}
