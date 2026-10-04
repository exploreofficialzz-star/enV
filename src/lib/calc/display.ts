/**
 * Presentation helpers for calculator results: user-selectable number display (decimal places,
 * significant figures, scientific / engineering notation, exact) and the plain-text calculation
 * summary that is copied or downloaded. Pure functions, no DOM.
 */
import { formatCalcNumber, type PrecisionMode } from "./numeric";

export interface DisplaySettings {
  mode: PrecisionMode;
  /** Decimal places or significant figures, depending on `mode`. Ignored by `auto` and `exact`. */
  digits: number;
}

export const DEFAULT_DISPLAY: DisplaySettings = { mode: "auto", digits: 6 };

export interface DisplayItem {
  label: string;
  value: string;
  hint?: string;
  primary?: boolean;
  /** Unrounded number behind `value`. Outputs without it (text, ratios, dates) are never re-formatted. */
  raw?: number;
  unit?: string;
}

export function modeUsesDigits(mode: PrecisionMode): boolean {
  return mode === "decimals" || mode === "significant" || mode === "scientific" || mode === "engineering";
}

/** Allowed range of `digits` for a mode. */
export function digitRange(mode: PrecisionMode): { min: number; max: number } {
  return mode === "decimals" ? { min: 0, max: 12 } : { min: 1, max: 15 };
}

export function clampDigits(mode: PrecisionMode, digits: number): number {
  const { min, max } = digitRange(mode);
  if (!Number.isFinite(digits)) return min;
  return Math.min(max, Math.max(min, Math.round(digits)));
}

/** Re-format every output that carries its unrounded value. `auto` returns the engine's own formatting. */
export function applyDisplaySettings<T extends DisplayItem>(items: readonly T[], settings: DisplaySettings): T[] {
  if (settings.mode === "auto") return [...items];
  const digits = modeUsesDigits(settings.mode) ? clampDigits(settings.mode, settings.digits) : undefined;
  return items.map((item) => (item.raw === undefined ? item : { ...item, value: formatCalcNumber(item.raw, { mode: settings.mode, digits }) }));
}

/** "Force: 12.5 N" — the value a person wants to paste elsewhere. */
export function describeOutput(item: DisplayItem): string {
  return `${item.label}: ${item.value}${item.unit ? ` ${item.unit}` : ""}`;
}

export interface SummaryInput {
  formula?: string;
  inputs: Array<{ label: string; value: string; suffix?: string }>;
  steps?: readonly string[];
  outputs: readonly DisplayItem[];
}

/** Plain-text record of one calculation: formula, inputs, steps and results. */
export function buildCalculationSummary({ formula, inputs, steps = [], outputs }: SummaryInput): string {
  const lines: string[] = [];
  if (formula) lines.push(`Formula: ${formula}`, "");
  const given = inputs.filter((input) => input.value.trim() !== "");
  if (given.length) {
    lines.push("Inputs");
    for (const input of given) lines.push(`  ${input.label}: ${input.value.trim()}${input.suffix ? ` ${input.suffix}` : ""}`);
    lines.push("");
  }
  if (steps.length) {
    lines.push("Steps");
    for (const step of steps) lines.push(`  ${step}`);
    lines.push("");
  }
  lines.push("Results");
  for (const item of outputs) lines.push(`  ${describeOutput(item)}${item.hint ? ` (${item.hint})` : ""}`);
  return lines.join("\n");
}
