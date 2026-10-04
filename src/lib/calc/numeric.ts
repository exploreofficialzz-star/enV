/**
 * Shared numeric primitives for every enV calculator.
 *
 * Parsing policy (see docs/calculator-architecture.md):
 *  - A blank field is an error, never 0.
 *  - Only plain decimal numbers are accepted: optional sign, digits, one decimal
 *    separator and an optional exponent (`1.5`, `-2e-3`, `.5`). Hexadecimal,
 *    binary, `Infinity`, `NaN`, units and stray symbols are rejected.
 *  - Thousands separators are understood (`1,234,567.89`, `1 234 567,89`,
 *    `12,34,567`, `1.234.567,89`). When both `.` and `,` appear the last one is the
 *    decimal separator. A lone comma followed by 1-2 or 4+ digits is a decimal
 *    comma (`3,14` = 3.14). A lone comma followed by exactly 3 digits (`1,234`) is
 *    ambiguous and is read as a thousands separator; use a period for decimals to
 *    avoid the ambiguity.
 *  - Nothing is rounded while parsing.
 *
 * Formatting policy:
 *  - `auto` keeps the classic locale-formatted decimal output but never shows a
 *    non-zero result as `0`, keeps at least six significant digits below 1, and never
 *    prints digits beyond double precision; magnitudes under 1e-6 or from 1e15 up switch
 *    to scientific notation with 12 significant digits.
 *  - `decimals`, `significant`, `scientific`, `engineering` and `exact` are the
 *    user-selectable modes offered by the calculator UI.
 */

export class CalcInputError extends Error {
  /** Human label (or field name) of the offending input, when known. */
  readonly field?: string;
  constructor(message: string, field?: string) {
    super(message);
    this.name = "CalcInputError";
    this.field = field;
  }
}

const MINUS_LIKE = /[\u2212\u2012\u2013\u2014]/g;
const SPACE_LIKE = /[\u00a0\u2009\u202f]/g;
const PLAIN_DECIMAL = /^(?:\d+\.?\d*|\.\d+)$/;

function cap(label: string): string {
  return label ? label.charAt(0).toUpperCase() + label.slice(1) : "Value";
}

function shorten(text: string, max = 24): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

function invalid(label: string, received: string): CalcInputError {
  return new CalcInputError(
    `Enter a valid number for ${label} (received "${shorten(received)}"). Use digits with an optional sign, decimal point or exponent, such as 1234.5 or 1.2e-3; remove units and symbols.`,
    label,
  );
}

/** Returns a canonical `-123.45` style string, or null when the text is not a well-formed number. */
function normalizeMantissa(text: string): string | null {
  let sign = "";
  let body = text;
  if (body.startsWith("+") || body.startsWith("-")) {
    sign = body.startsWith("-") ? "-" : "";
    body = body.slice(1);
  }
  if (body === "") return null;

  const hasComma = body.includes(",");
  const hasDot = body.includes(".");
  const hasSpace = body.includes(" ");
  if (!hasComma && !hasSpace) return PLAIN_DECIMAL.test(body) ? sign + body : null;

  let decimalSeparator: "." | "," | null = null;
  if (hasComma && hasDot) {
    decimalSeparator = body.lastIndexOf(",") > body.lastIndexOf(".") ? "," : ".";
  } else if (hasDot) {
    decimalSeparator = ".";
  } else if (hasComma && !hasSpace) {
    const commaCount = body.split(",").length - 1;
    if (commaCount === 1) {
      const [before, after] = body.split(",");
      const lonelyThousands = after.length === 3 && /^[1-9]\d{0,2}$/.test(before);
      if (/^\d*$/.test(before) && /^\d+$/.test(after) && !lonelyThousands) decimalSeparator = ",";
    }
  } else if (hasComma && hasSpace) {
    // "1 234,5": with spaces as grouping the comma can only be the decimal mark.
    decimalSeparator = ",";
  }

  let integerPart = body;
  let fraction = "";
  if (decimalSeparator) {
    const at = body.lastIndexOf(decimalSeparator);
    integerPart = body.slice(0, at);
    fraction = body.slice(at + 1);
    if (!/^\d+$/.test(fraction)) return null;
  }

  let integerDigits: string;
  if (/^\d+$/.test(integerPart)) {
    integerDigits = integerPart;
  } else if (/^\d{1,3}(?: \d{3})+$/.test(integerPart)) {
    integerDigits = integerPart.replace(/ /g, "");
  } else if (/^\d{1,3}(?:,\d{3})+$/.test(integerPart) && decimalSeparator !== ",") {
    integerDigits = integerPart.replace(/,/g, "");
  } else if (/^\d{1,2}(?:,\d{2})+,\d{3}$/.test(integerPart) && decimalSeparator !== ",") {
    integerDigits = integerPart.replace(/,/g, ""); // Indian grouping: 12,34,567
  } else if (/^\d{1,3}(?:\.\d{3})+$/.test(integerPart) && decimalSeparator === ",") {
    integerDigits = integerPart.replace(/\./g, ""); // 1.234.567,89
  } else if (integerPart === "" && decimalSeparator) {
    integerDigits = "0";
  } else {
    return null;
  }
  return `${sign}${integerDigits}${fraction ? `.${fraction}` : ""}`;
}

/**
 * Parse one user-entered number. Throws {@link CalcInputError} with a message that
 * names the input, says what is wrong and how to fix it.
 */
export function parseCalcNumber(input: unknown, label = "value", fieldName?: string): number {
  if (fieldName === undefined) return parseCore(input, label);
  try {
    return parseCore(input, label);
  } catch (error) {
    if (error instanceof CalcInputError) throw new CalcInputError(error.message, fieldName);
    throw error;
  }
}

function parseCore(input: unknown, label: string): number {
  if (typeof input === "number") {
    if (!Number.isFinite(input)) throw new CalcInputError(`${cap(label)} must be a finite number.`, label);
    return input === 0 ? 0 : input;
  }
  const original = String(input ?? "");
  const text = original.trim().replace(MINUS_LIKE, "-").replace(SPACE_LIKE, " ");
  if (text === "") throw new CalcInputError(`Enter a value for ${label}.`, label);

  const split = /^(.*?)([eE][+-]?\d+)?$/.exec(text);
  const mantissa = split ? normalizeMantissa(split[1]) : null;
  if (mantissa === null) throw invalid(label, original);

  const value = Number(`${mantissa}${split?.[2] ?? ""}`);
  if (Number.isNaN(value)) throw invalid(label, original);
  if (!Number.isFinite(value)) throw new CalcInputError(`${cap(label)} is too large to calculate with.`, label);
  return value === 0 ? 0 : value;
}

/** True when a raw form value is empty (or whitespace). */
export function isBlank(input: unknown): boolean {
  return String(input ?? "").trim() === "";
}

export interface ParsedList {
  values: number[];
  /** Tokens that could not be read as numbers, in input order. Never silently dropped. */
  invalid: string[];
}

/** Parse comma / semicolon / whitespace / newline separated numbers. */
export function parseCalcNumberList(input: unknown): ParsedList {
  const tokens = String(input ?? "").split(/[\s,;]+/).filter(Boolean);
  const values: number[] = [];
  const bad: string[] = [];
  for (const token of tokens) {
    try {
      values.push(parseCalcNumber(token, "value"));
    } catch {
      bad.push(token);
    }
  }
  return { values, invalid: bad };
}

/** Like {@link parseCalcNumberList} but throws a specific error for empty or invalid lists. */
export function requireCalcNumberList(input: unknown, options: { label?: string; min?: number; hint?: string } = {}): number[] {
  const { label = "values", min = 1, hint } = options;
  const { values, invalid: bad } = parseCalcNumberList(input);
  if (bad.length) {
    const shown = bad.slice(0, 3).map((token) => `"${shorten(token, 12)}"`).join(", ");
    throw new CalcInputError(
      `Could not read ${shown}${bad.length > 3 ? ` and ${bad.length - 3} more` : ""} as ${bad.length === 1 ? "a number" : "numbers"} in ${label}. Separate numbers with commas, spaces or new lines.`,
      label,
    );
  }
  if (values.length < min) {
    throw new CalcInputError(
      hint ?? (min <= 1 ? `Enter at least one number in ${label}.` : `Enter at least ${min} numbers in ${label} (found ${values.length}).`),
      label,
    );
  }
  return values;
}

/**
 * Throws a domain error when a formula produced NaN or +/-Infinity, instead of letting
 * "Undefined", "NaN" or an empty value reach the screen.
 */
export function requireFiniteResult(value: number, what: string, formula?: string): number {
  if (Number.isFinite(value)) return value;
  throw new CalcInputError(
    `No real value of ${what} exists for these inputs${formula ? ` (${formula})` : ""}. The formula would divide by zero, take the square root, logarithm or inverse trigonometric function of a number outside its domain, or the result is too large to represent. Change one of the values.`,
  );
}

export type PrecisionMode = "auto" | "decimals" | "significant" | "scientific" | "engineering" | "exact";

export const PRECISION_MODE_LABELS: Record<PrecisionMode, string> = {
  auto: "Automatic",
  decimals: "Decimal places",
  significant: "Significant figures",
  scientific: "Scientific notation",
  engineering: "Engineering notation",
  exact: "Exact (unrounded)",
};

export interface FormatOptions {
  mode?: PrecisionMode;
  /** Decimal places (`decimals`) or significant figures (`significant`, `scientific`, `engineering`). */
  digits?: number;
  /** `auto` mode: maximum fraction digits (default 6). */
  maxFractionDigits?: number;
  /** `auto` mode: use significant digits instead of fraction digits. */
  maxSignificantDigits?: number;
  /** Thousands separators in decimal output (default true). Scientific/engineering/exact never group. */
  grouping?: boolean;
  locale?: string;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(n)));

function trimExponentForm(text: string): string {
  const [mantissa, exponent] = text.split("e");
  const trimmed = mantissa.includes(".") ? mantissa.replace(/\.?0+$/, "") : mantissa;
  return `${trimmed}e${exponent.replace("+", "")}`;
}

/** 1.2346e-7 style output with `sig` significant digits (trailing zeros removed). */
export function toScientific(x: number, sig = 6, keepZeros = false): string {
  const text = x.toExponential(clamp(sig, 1, 15) - 1);
  return keepZeros ? text.replace("e+", "e") : trimExponentForm(text);
}

/** Engineering notation: exponent is always a multiple of 3, mantissa in [1, 1000). */
export function toEngineering(x: number, sig = 6, keepZeros = false): string {
  if (x === 0) return "0";
  const [mantissa, exponentText] = x.toExponential(clamp(sig, 1, 15) - 1).split("e");
  const exponent = Number(exponentText);
  const shift = ((exponent % 3) + 3) % 3;
  const negative = mantissa.startsWith("-");
  let digits = mantissa.replace("-", "").replace(".", "");
  while (digits.length < shift + 1) digits += "0";
  let body = digits.slice(0, shift + 1);
  const rest = digits.slice(shift + 1);
  if (rest) body += `.${rest}`;
  if (!keepZeros && body.includes(".")) body = body.replace(/\.?0+$/, "");
  return `${negative ? "-" : ""}${body}e${exponent - shift}`;
}

/** Format a computed value. Never rounds a non-zero result to `0` in `auto` mode. */
export function formatCalcNumber(x: number, options: FormatOptions = {}): string {
  if (!Number.isFinite(x)) return "—";
  if (x === 0) return "0";
  const { mode = "auto", digits, locale } = options;
  const useGrouping = options.grouping !== false;
  const abs = Math.abs(x);

  switch (mode) {
    case "exact":
      return String(x);
    case "scientific":
      return toScientific(x, digits ?? 6, digits !== undefined);
    case "engineering":
      return toEngineering(x, digits ?? 6, digits !== undefined);
    case "decimals": {
      const places = clamp(digits ?? 2, 0, 15);
      return new Intl.NumberFormat(locale, { minimumFractionDigits: places, maximumFractionDigits: places, useGrouping }).format(x);
    }
    case "significant": {
      const sig = clamp(digits ?? 4, 1, 15);
      if (abs >= 1e15 || abs < 1e-6) return toScientific(x, sig, true);
      return new Intl.NumberFormat(locale, { minimumSignificantDigits: sig, maximumSignificantDigits: sig, useGrouping }).format(x);
    }
    default: {
      if (options.maxSignificantDigits) {
        if (abs >= 1e15 || abs < 1e-6) return toScientific(x, Math.min(options.maxSignificantDigits, 12));
        return new Intl.NumberFormat(locale, { maximumSignificantDigits: options.maxSignificantDigits, useGrouping }).format(x);
      }
      const maxFraction = options.maxFractionDigits ?? 6;
      if (abs >= 1e15 || abs < 1e-6) return toScientific(x, 12);
      // Below 1, widen the fraction so at least six significant digits survive (0.000253514, not 0.0002535).
      const fractionDigits = abs < 1 ? Math.min(12, Math.max(maxFraction, 5 - Math.floor(Math.log10(abs)))) : maxFraction;
      return new Intl.NumberFormat(locale, { maximumFractionDigits: fractionDigits, useGrouping }).format(x);
    }
  }
}

export interface NumericOutput {
  label: string;
  value: string;
  /** Unrounded number behind `value`, so the UI can re-format it (decimals, significant figures, ...). */
  raw?: number;
  unit?: string;
  hint?: string;
  primary?: boolean;
}

/**
 * Build a labelled calculator output that keeps the unrounded number for re-formatting.
 * A non-finite primary value is an error; a non-finite secondary value is shown as an
 * explicit "undefined" line rather than a bare dash.
 */
export function numericOutput(
  label: string,
  value: number | string,
  extra: { primary?: boolean; hint?: string; unit?: string } & FormatOptions = {},
): NumericOutput {
  const { primary, hint, unit, ...format } = extra;
  const item: NumericOutput = { label, value: "" };
  if (typeof value === "number" && !Number.isFinite(value)) {
    if (primary) requireFiniteResult(value, label.toLowerCase());
    item.value = "—";
    item.hint = hint ?? "Undefined for these inputs";
  } else if (typeof value === "number") {
    item.value = formatCalcNumber(value, format);
    item.raw = value === 0 ? 0 : value;
  } else {
    item.value = value;
  }
  if (unit !== undefined) item.unit = unit;
  if (hint !== undefined && item.hint === undefined) item.hint = hint;
  if (primary !== undefined) item.primary = primary;
  return item;
}
