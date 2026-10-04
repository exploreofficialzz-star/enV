/**
 * Field-aware number reading for the calculator registry.
 *
 * Thousands of formulas read inputs as `n(v.mass)`, which only sees the raw string and so
 * cannot say WHICH input was wrong. `trackCalculatorInputs` wraps every registered
 * calculator so `compute` receives a values object that remembers the last field read;
 * `readNumber` uses that to word errors with the on-screen label ("Enter a valid number
 * for Mass ...") and to carry the field name so the UI can mark the input.
 *
 * Attribution is verified, never guessed: the remembered field is used only when its
 * current value is identical to the string being parsed.
 */
import { CalcInputError, parseCalcNumber, requireCalcNumberList } from "./numeric";

interface FieldRef {
  name: string;
  label: string;
}

interface Frame {
  labels: Record<string, string>;
  values: Record<string, unknown>;
  last?: string;
}

let frame: Frame | null = null;

/** Run `run` with a values object that records which input field was read most recently. */
export function withTrackedInputs<T>(fields: readonly FieldRef[], values: Record<string, string>, run: (values: Record<string, string>) => T): T {
  const previous = frame;
  const current: Frame = { labels: Object.fromEntries(fields.map((field) => [field.name, field.label])), values };
  frame = current;
  const tracked = new Proxy(values, {
    get(target, property, receiver) {
      if (typeof property === "string" && property in current.labels) current.last = property;
      return Reflect.get(target, property, receiver);
    },
  });
  try {
    return run(tracked);
  } finally {
    frame = previous;
  }
}

/** Wrap every calculator in `registry` so its errors can name the input at fault. Call once per registry. */
export function trackCalculatorInputs<T extends { fields: readonly FieldRef[]; compute: (values: Record<string, string>) => unknown }>(registry: Record<string, T>): void {
  for (const [id, definition] of Object.entries(registry)) {
    const compute = definition.compute;
    registry[id] = { ...definition, compute: (values: Record<string, string>) => withTrackedInputs(definition.fields, values, compute) } as T;
  }
}

/** The field whose value was just read, when `raw` is exactly that field's value. */
function fieldOf(raw: unknown): { name: string; label: string } | null {
  if (!frame?.last) return null;
  const name = frame.last;
  if (String(frame.values[name] ?? "") !== String(raw ?? "")) return null;
  return { name, label: frame.labels[name] };
}

const capitalize = (text: string) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : text);

function resolve(raw: unknown, label: string): { label: string; name?: string } {
  if (label !== "value") return { label };
  const hit = fieldOf(raw);
  return hit ? { label: hit.label, name: hit.name } : { label };
}

/** Strict number read. Pass `label` for an explicit name; otherwise the tracked field label is used. */
export function readNumber(raw: unknown, label = "value"): number {
  const target = resolve(raw, label);
  return parseCalcNumber(raw, target.label, target.name);
}

export function readPositive(raw: unknown, label = "value"): number {
  const target = resolve(raw, label);
  const x = parseCalcNumber(raw, target.label, target.name);
  if (x <= 0) throw new CalcInputError(`${capitalize(target.label)} must be greater than 0.`, target.name ?? target.label);
  return x;
}

export function readInteger(raw: unknown, label = "value"): number {
  const target = resolve(raw, label);
  const x = parseCalcNumber(raw, target.label, target.name);
  if (!Number.isInteger(x)) throw new CalcInputError(`${capitalize(target.label)} must be a whole number.`, target.name ?? target.label);
  return x;
}

/** Numbers separated by commas, semicolons, spaces or new lines. Bad tokens are reported, never dropped. */
export function readList(raw: unknown, options: { min?: number; hint?: string } = {}): number[] {
  const target = resolve(raw, "value");
  return requireCalcNumberList(raw, { label: target.name ? target.label : "the list", ...options });
}
