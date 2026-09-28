import { formatNumber } from "@/lib/utils";
import { advancedCalculators } from "./advanced-calculators";

export type Field = {
  name: string;
  label: string;
  type?: "number" | "text" | "select" | "textarea";
  suffix?: string;
  options?: { value: string; label: string }[];
  defaultValue?: string | number;
  min?: number;
  max?: number;
  step?: number;
  hint?: string;
  placeholder?: string;
};
export type CalcOutput = { label: string; value: string; hint?: string; primary?: boolean };
export type CalculatorDef = {
  fields: Field[];
  compute: (v: Record<string, string>) => CalcOutput[];
  formula?: string;
};

function n(v: unknown, label = "value"): number {
  const raw = typeof v === "number" ? String(v) : String(v ?? "").replace(/,/g, "").trim();
  if (raw === "") throw new Error(`Enter a valid ${label}.`);
  const x = typeof v === "number" ? v : Number(raw);
  if (!Number.isFinite(x)) throw new Error(`Enter a valid ${label}.`);
  return x;
}
function pos(v: unknown, label = "value"): number {
  const x = n(v, label);
  if (x <= 0) throw new Error(`${label} must be greater than 0.`);
  return x;
}
function list(v: unknown): number[] {
  const parts = String(v ?? "")
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map((s) => Number(s.replace(/,/g, "")));
  if (!parts.length || parts.some((x) => !Number.isFinite(x))) {
    throw new Error("Enter a list of numbers separated by commas or spaces.");
  }
  return parts;
}
function out(label: string, value: number | string, extra?: Partial<CalcOutput>): CalcOutput {
  return { label, value: typeof value === "number" ? formatNumber(value) : value, ...extra };
}
function gcd(a: number, b: number): number {
  a = Math.abs(Math.round(a));
  b = Math.abs(Math.round(b));
  while (b) [a, b] = [b, a % b];
  return a || 1;
}
function f(name: string, label: string, extra: Partial<Field> = {}): Field {
  return { name, label, type: "number", ...extra };
}
function sel(name: string, label: string, options: { value: string; label: string }[], defaultValue?: string): Field {
  return { name, label, type: "select", options, defaultValue: defaultValue ?? options[0]?.value };
}
function area(a: number, b: number): number {
  return a * b;
}

export const calculators: Record<string, CalculatorDef> = {
  percentage: {
    fields: [f("amount", "Amount"), f("percent", "Percent", { suffix: "%" })],
    formula: "P% of A = A × P / 100",
    compute: (v) => {
      const a = n(v.amount, "amount");
      const p = n(v.percent, "percent");
      const of = (a * p) / 100;
      return [
        out(`${p}% of ${a}`, of, { primary: true }),
        out("Amount + percent", a + of),
        out("Amount − percent", a - of),
      ];
    },
  },
  "percentage-change": {
    fields: [f("from", "From"), f("to", "To")],
    formula: "((to − from) / from) × 100",
    compute: (v) => {
      const from = n(v.from, "from");
      if (from === 0) throw new Error("Starting value cannot be 0.");
      const to = n(v.to, "to");
      return [out("Change", ((to - from) / from) * 100, { primary: true, hint: "%" })];
    },
  },
  "percentage-of": {
    fields: [f("part", "Part"), f("whole", "Whole")],
    compute: (v) => {
      const whole = n(v.whole, "whole");
      if (whole === 0) throw new Error("Whole cannot be 0.");
      return [out("Percent", (n(v.part, "part") / whole) * 100, { primary: true, hint: "%" })];
    },
  },
  fraction: {
    fields: [
      f("a", "Numerator 1"),
      f("b", "Denominator 1"),
      sel("op", "Operation", [
        { value: "add", label: "Add" },
        { value: "sub", label: "Subtract" },
        { value: "mul", label: "Multiply" },
        { value: "div", label: "Divide" },
      ]),
      f("c", "Numerator 2"),
      f("d", "Denominator 2"),
    ],
    compute: (v) => {
      const a = n(v.a), b = pos(v.b, "Denominator 1"), c = n(v.c), d = pos(v.d, "Denominator 2");
      const x = a / b, y = c / d;
      const r = v.op === "sub" ? x - y : v.op === "mul" ? x * y : v.op === "div" ? x / y : x + y;
      if (!Number.isFinite(r)) throw new Error("That division is undefined.");
      return [out("Decimal", r, { primary: true })];
    },
  },
  ratio: {
    fields: [f("a", "A"), f("b", "B"), f("total", "Total (optional)", { hint: "Leave empty to only simplify" })],
    compute: (v) => {
      const a = n(v.a, "A"), b = n(v.b, "B");
      const g = gcd(a, b);
      const items = [out("Simplified", `${a / g}:${b / g}`, { primary: true })];
      if (String(v.total ?? "").trim()) {
        const t = pos(v.total, "total");
        const s = a + b;
        items.push(out("A share", (t * a) / s), out("B share", (t * b) / s));
      }
      return items;
    },
  },
  proportion: {
    fields: [f("a", "a"), f("b", "b"), f("c", "c"), f("d", "d")],
    formula: "a/b = c/d — leave one field empty",
    compute: (v) => {
      const keys = ["a", "b", "c", "d"] as const;
      const empty = keys.filter((k) => !String(v[k] ?? "").trim());
      if (empty.length !== 1) throw new Error("Leave exactly one of a, b, c, d empty.");
      const num = (k: string) => n(v[k], k);
      let val = 0;
      if (empty[0] === "a") val = (num("c") * num("b")) / num("d");
      if (empty[0] === "b") val = (num("a") * num("d")) / num("c");
      if (empty[0] === "c") val = (num("a") * num("d")) / num("b");
      if (empty[0] === "d") val = (num("c") * num("b")) / num("a");
      return [out(empty[0]!, val, { primary: true })];
    },
  },
  average: {
    fields: [
      { name: "numbers", label: "Numbers", type: "textarea", placeholder: "10, 20, 30" },
      { name: "weights", label: "Weights (optional)", type: "textarea", placeholder: "1, 2, 1", hint: "Leave blank for a simple average." },
    ],
    compute: (v) => {
      const xs = list(v.numbers);
      const weightsRaw = String(v.weights ?? "").trim();
      if (!weightsRaw) return [out("Mean", xs.reduce((a, b) => a + b, 0) / xs.length, { primary: true }), out("Count", xs.length)];
      const ws = list(weightsRaw);
      if (ws.length !== xs.length) throw new Error("Numbers and weights must have the same count.");
      const totalWeight = ws.reduce((a, b) => a + b, 0);
      if (totalWeight === 0) throw new Error("Weights cannot add up to 0.");
      return [out("Weighted mean", xs.reduce((sum, x, i) => sum + x * ws[i]!, 0) / totalWeight, { primary: true }), out("Total weight", totalWeight), out("Count", xs.length)];
    },
  },
  mean: {
    fields: [{ name: "numbers", label: "Numbers", type: "textarea" }],
    compute: (v) => {
      const xs = list(v.numbers);
      return [out("Mean", xs.reduce((a, b) => a + b, 0) / xs.length, { primary: true })];
    },
  },
  median: {
    fields: [{ name: "numbers", label: "Numbers", type: "textarea" }],
    compute: (v) => {
      const xs = [...list(v.numbers)].sort((a, b) => a - b);
      const m = xs.length % 2 ? xs[(xs.length - 1) / 2]! : (xs[xs.length / 2 - 1]! + xs[xs.length / 2]!) / 2;
      return [out("Median", m, { primary: true })];
    },
  },
  mode: {
    fields: [{ name: "numbers", label: "Numbers", type: "textarea" }],
    compute: (v) => {
      const xs = list(v.numbers);
      const m = new Map<number, number>();
      xs.forEach((x) => m.set(x, (m.get(x) ?? 0) + 1));
      const max = Math.max(...m.values());
      const modes = [...m.entries()].filter(([, c]) => c === max).map(([x]) => x);
      return [out("Mode", modes.join(", "), { primary: true })];
    },
  },
  stddev: {
    fields: [
      { name: "numbers", label: "Numbers", type: "textarea" },
      sel("kind", "Kind", [
        { value: "sample", label: "Sample" },
        { value: "population", label: "Population" },
      ]),
    ],
    compute: (v) => {
      const xs = list(v.numbers);
      if (xs.length < 2) throw new Error("Enter at least two numbers.");
      const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
      const den = v.kind === "population" ? xs.length : xs.length - 1;
      const variance = xs.reduce((s, x) => s + (x - mean) ** 2, 0) / den;
      return [out("Std. deviation", Math.sqrt(variance), { primary: true }), out("Variance", variance)];
    },
  },
  quadratic: {
    fields: [f("a", "a"), f("b", "b"), f("c", "c")],
    formula: "ax² + bx + c = 0",
    compute: (v) => {
      const a = n(v.a, "a");
      if (a === 0) throw new Error("a cannot be 0 for a quadratic.");
      const b = n(v.b, "b"), c = n(v.c, "c");
      const d = b * b - 4 * a * c;
      const items = [out("Discriminant", d)];
      if (d >= 0) {
        items.push(out("Root 1", (-b + Math.sqrt(d)) / (2 * a), { primary: true }));
        items.push(out("Root 2", (-b - Math.sqrt(d)) / (2 * a)));
      } else {
        const re = -b / (2 * a);
        const im = Math.sqrt(-d) / (2 * a);
        items.push(out("Roots", `${formatNumber(re)} ± ${formatNumber(im)}i`, { primary: true }));
      }
      return items;
    },
  },
  exponent: {
    fields: [f("base", "Base"), f("exp", "Exponent")],
    compute: (v) => [out("Result", n(v.base, "base") ** n(v.exp, "exponent"), { primary: true })],
  },
  logarithm: {
    fields: [f("value", "Value"), { name: "base", label: "Base (or e)", type: "text", defaultValue: "10" }],
    compute: (v) => {
      const x = pos(v.value, "Value");
      const base = v.base.trim() === "e" ? Math.E : pos(v.base, "base");
      if (base === 1) throw new Error("Base cannot be 1.");
      return [out("Log", Math.log(x) / Math.log(base), { primary: true })];
    },
  },
  factorial: {
    fields: [f("n", "n", { min: 0, max: 170 })],
    compute: (v) => {
      const n0 = n(v.n, "n");
      if (!Number.isInteger(n0) || n0 < 0 || n0 > 170) throw new Error("n must be an integer from 0 to 170.");
      let r = 1;
      for (let i = 2; i <= n0; i++) r *= i;
      return [out("n!", r, { primary: true })];
    },
  },
  permutation: {
    fields: [f("n", "n"), f("r", "r")],
    compute: (v) => {
      const nn = n(v.n, "n"), r = n(v.r, "r");
      if (r > nn || r < 0 || nn < 0 || !Number.isInteger(nn) || !Number.isInteger(r)) throw new Error("Need integers with 0 ≤ r ≤ n.");
      let p = 1;
      for (let i = 0; i < r; i++) p *= nn - i;
      return [out("P(n, r)", p, { primary: true })];
    },
  },
  combination: {
    fields: [f("n", "n"), f("r", "r")],
    compute: (v) => {
      const nn = n(v.n, "n"), r0 = n(v.r, "r");
      if (r0 > nn || r0 < 0 || !Number.isInteger(nn) || !Number.isInteger(r0)) throw new Error("Need integers with 0 ≤ r ≤ n.");
      const r = Math.min(r0, nn - r0);
      let c = 1;
      for (let i = 1; i <= r; i++) c = (c * (nn - r + i)) / i;
      return [out("C(n, r)", Math.round(c), { primary: true })];
    },
  },
  probability: {
    fields: [f("favorable", "Favorable"), f("total", "Total")],
    compute: (v) => {
      const t = pos(v.total, "Total");
      const p = n(v.favorable, "Favorable") / t;
      return [out("Probability", p, { primary: true }), out("Percent", p * 100, { hint: "%" })];
    },
  },
  area: {
    fields: [
      sel("shape", "Shape", [
        { value: "rectangle", label: "Rectangle" },
        { value: "triangle", label: "Triangle" },
        { value: "circle", label: "Circle" },
        { value: "trapezoid", label: "Trapezoid" },
      ]),
      f("length", "Length / base / base 1"),
      f("width", "Width / height"),
      f("radius", "Radius / base 2", { hint: "Radius for circle; second base for trapezoid." }),
    ],
    compute: (v) => {
      if (v.shape === "circle") return [out("Area", Math.PI * pos(v.radius, "radius") ** 2, { primary: true })];
      if (v.shape === "triangle") return [out("Area", 0.5 * n(v.length) * n(v.width), { primary: true })];
      if (v.shape === "trapezoid") return [out("Area", 0.5 * (n(v.length, "base 1") + n(v.radius, "base 2")) * n(v.width, "height"), { primary: true })];
      return [out("Area", area(n(v.length), n(v.width)), { primary: true })];
    },
  },
  volume: {
    fields: [
      sel("shape", "Solid", [
        { value: "box", label: "Box" },
        { value: "cylinder", label: "Cylinder" },
        { value: "sphere", label: "Sphere" },
        { value: "cone", label: "Cone" },
        { value: "pyramid", label: "Pyramid" },
      ]),
      f("a", "Length / radius / base"),
      f("b", "Width / height"),
      f("c", "Height (box)"),
    ],
    compute: (v) => {
      const a = pos(v.a, "first dimension");
      let vol = 0;
      if (v.shape === "box") vol = a * pos(v.b, "width") * pos(v.c, "height");
      else if (v.shape === "cylinder") vol = Math.PI * a * a * pos(v.b, "height");
      else if (v.shape === "sphere") vol = (4 / 3) * Math.PI * a ** 3;
      else if (v.shape === "cone") vol = (1 / 3) * Math.PI * a * a * pos(v.b, "height");
      else vol = (a * a * pos(v.b, "height")) / 3;
      return [out("Volume", vol, { primary: true })];
    },
  },
  "surface-area": {
    fields: [
      sel("shape", "Solid", [
        { value: "cube", label: "Cube" },
        { value: "sphere", label: "Sphere" },
        { value: "cylinder", label: "Cylinder" },
        { value: "box", label: "Box" },
      ]),
      f("a", "Side / radius / length"),
      f("b", "Width / height"),
      f("c", "Height (box)"),
    ],
    compute: (v) => {
      const a = pos(v.a, "dimension");
      let s = 0;
      if (v.shape === "cube") s = 6 * a * a;
      else if (v.shape === "sphere") s = 4 * Math.PI * a * a;
      else if (v.shape === "cylinder") s = 2 * Math.PI * a * pos(v.b, "height") + 2 * Math.PI * a * a;
      else s = 2 * (a * pos(v.b, "width") + a * pos(v.c, "height") + pos(v.b, "width") * pos(v.c, "height"));
      return [out("Surface area", s, { primary: true })];
    },
  },
  perimeter: {
    fields: [
      sel("shape", "Shape", [
        { value: "rectangle", label: "Rectangle" },
        { value: "square", label: "Square" },
        { value: "triangle", label: "Triangle (3 sides)" },
        { value: "circle", label: "Circle" },
      ]),
      f("a", "Side / length / radius"),
      f("b", "Width / side B"),
      f("c", "Side C"),
    ],
    compute: (v) => {
      if (v.shape === "circle") return [out("Circumference", 2 * Math.PI * pos(v.a, "radius"), { primary: true })];
      if (v.shape === "square") return [out("Perimeter", 4 * pos(v.a, "side"), { primary: true })];
      if (v.shape === "triangle") return [out("Perimeter", n(v.a) + n(v.b) + n(v.c), { primary: true })];
      return [out("Perimeter", 2 * (n(v.a) + n(v.b)), { primary: true })];
    },
  },
  circle: {
    fields: [f("radius", "Radius"), f("diameter", "Diameter"), f("circumference", "Circumference"), f("area", "Area")],
    compute: (v) => {
      let r = 0;
      if (v.radius) r = pos(v.radius, "radius");
      else if (v.diameter) r = pos(v.diameter, "diameter") / 2;
      else if (v.circumference) r = pos(v.circumference, "circumference") / (2 * Math.PI);
      else if (v.area) r = Math.sqrt(pos(v.area, "area") / Math.PI);
      else throw new Error("Fill in one of radius, diameter, circumference, or area.");
      return [
        out("Radius", r, { primary: true }),
        out("Diameter", 2 * r),
        out("Circumference", 2 * Math.PI * r),
        out("Area", Math.PI * r * r),
      ];
    },
  },
  triangle: {
    fields: [
      sel("method", "Method", [
        { value: "base-height", label: "Base × height" },
        { value: "heron", label: "Three sides (Heron)" },
      ]),
      f("base", "Base"),
      f("height", "Height"),
      f("sideA", "Side a"),
      f("sideB", "Side b"),
      f("sideC", "Side c"),
    ],
    compute: (v) => {
      if (v.method === "heron") {
        const a = pos(v.sideA, "a"), b = pos(v.sideB, "b"), c = pos(v.sideC, "c");
        if (a + b <= c || a + c <= b || b + c <= a) throw new Error("Those sides do not form a triangle.");
        const s = (a + b + c) / 2;
        const area0 = Math.sqrt(s * (s - a) * (s - b) * (s - c));
        return [out("Area", area0, { primary: true })];
      }
      return [out("Area", 0.5 * n(v.base, "base") * n(v.height, "height"), { primary: true })];
    },
  },
  rectangle: {
    fields: [f("length", "Length"), f("width", "Width")],
    compute: (v) => {
      const l = pos(v.length, "length"), w = pos(v.width, "width");
      return [out("Area", l * w, { primary: true }), out("Perimeter", 2 * (l + w)), out("Diagonal", Math.hypot(l, w))];
    },
  },
  sphere: {
    fields: [f("radius", "Radius")],
    compute: (v) => {
      const r = pos(v.radius, "radius");
      return [out("Volume", (4 / 3) * Math.PI * r ** 3, { primary: true }), out("Surface", 4 * Math.PI * r * r)];
    },
  },
  cylinder: {
    fields: [f("radius", "Radius"), f("height", "Height")],
    compute: (v) => {
      const r = pos(v.radius, "radius"), h = pos(v.height, "height");
      return [out("Volume", Math.PI * r * r * h, { primary: true }), out("Surface", 2 * Math.PI * r * h + 2 * Math.PI * r * r)];
    },
  },
  cone: {
    fields: [f("radius", "Radius"), f("height", "Height")],
    compute: (v) => {
      const r = pos(v.radius, "radius"), h = pos(v.height, "height");
      const sl = Math.hypot(r, h);
      return [out("Volume", (Math.PI * r * r * h) / 3, { primary: true }), out("Surface", Math.PI * r * r + Math.PI * r * sl)];
    },
  },
  cube: {
    fields: [f("side", "Side")],
    compute: (v) => {
      const s = pos(v.side, "side");
      return [out("Volume", s ** 3, { primary: true }), out("Surface", 6 * s * s), out("Face diagonal", s * Math.SQRT2)];
    },
  },
  square: {
    fields: [f("side", "Side")],
    compute: (v) => {
      const s = pos(v.side, "side");
      return [out("Area", s * s, { primary: true }), out("Perimeter", 4 * s), out("Diagonal", s * Math.SQRT2)];
    },
  },
  pyramid: {
    fields: [f("base", "Base side"), f("height", "Height")],
    compute: (v) => [out("Volume", (pos(v.base, "base") ** 2 * pos(v.height, "height")) / 3, { primary: true })],
  },
  ellipse: {
    fields: [f("a", "Semi-axis a"), f("b", "Semi-axis b")],
    compute: (v) => {
      const a = pos(v.a, "a"), b = pos(v.b, "b");
      const h = ((a - b) ** 2) / ((a + b) ** 2);
      const p = Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
      return [out("Area", Math.PI * a * b, { primary: true }), out("Perimeter (approx.)", p)];
    },
  },
  loan: {
    fields: [f("principal", "Principal"), f("annualRate", "Annual rate", { suffix: "%" }), f("years", "Years"), f("paymentsPerYear", "Payments / year", { defaultValue: 12 })],
    formula: "M = P r (1+r)^n / ((1+r)^n − 1)",
    compute: (v) => {
      const P = pos(v.principal, "principal");
      const npy = pos(v.paymentsPerYear, "payments per year");
      const nper = pos(v.years, "years") * npy;
      const r = n(v.annualRate, "rate") / 100 / npy;
      const M = r === 0 ? P / nper : (P * r * (1 + r) ** nper) / ((1 + r) ** nper - 1);
      return [
        out("Payment", M, { primary: true, hint: "estimate" }),
        out("Total paid", M * nper),
        out("Total interest", M * nper - P),
      ];
    },
  },
  mortgage: {
    fields: [f("price", "Price"), f("downPayment", "Down payment"), f("annualRate", "Annual rate", { suffix: "%" }), f("years", "Years", { defaultValue: 30 })],
    compute: (v) => {
      const loan = pos(v.price, "price") - n(v.downPayment, "down payment");
      if (loan <= 0) throw new Error("Down payment cannot exceed price.");
      const nper = pos(v.years, "years") * 12;
      const r = n(v.annualRate, "rate") / 100 / 12;
      const M = r === 0 ? loan / nper : (loan * r * (1 + r) ** nper) / ((1 + r) ** nper - 1);
      return [out("Monthly payment", M, { primary: true, hint: "estimate" }), out("Loan amount", loan), out("Total interest", M * nper - loan)];
    },
  },
};

Object.assign(calculators, advancedCalculators);

function moneyCalc(
  key: string,
  fields: Field[],
  compute: CalculatorDef["compute"],
  formula?: string,
) {
  calculators[key] = { fields, compute, formula };
}

moneyCalc("interest", [f("principal", "Principal"), f("rate", "Rate", { suffix: "%" }), f("years", "Years"), sel("kind", "Kind", [{ value: "simple", label: "Simple" }, { value: "compound", label: "Compound" }])], (v) => {
  const P = pos(v.principal, "principal"), r = n(v.rate, "rate") / 100, t = pos(v.years, "years");
  const total = v.kind === "simple" ? P * (1 + r * t) : P * (1 + r) ** t;
  return [out("Total", total, { primary: true, hint: "estimate" }), out("Interest", total - P)];
});
moneyCalc("compound-interest", [f("principal", "Principal"), f("rate", "Rate", { suffix: "%" }), f("years", "Years"), f("compoundsPerYear", "Compounds / year", { defaultValue: 12 }), f("monthlyContribution", "Monthly contribution", { defaultValue: 0 })], (v) => {
  const P = pos(v.principal, "principal"), r = n(v.rate, "rate") / 100;
  const npy = pos(v.compoundsPerYear, "compounds"), t = pos(v.years, "years");
  const pmt = n(v.monthlyContribution || "0");
  const i = r / npy, nper = npy * t;
  let fv = P * (1 + i) ** nper;
  if (pmt) {
    const mRate = r / 12;
    const mN = t * 12;
    fv += mRate === 0 ? pmt * mN : pmt * (((1 + mRate) ** mN - 1) / mRate);
  }
  return [out("Future value", fv, { primary: true, hint: "estimate" })];
});
moneyCalc("simple-interest", [f("principal", "Principal"), f("rate", "Rate", { suffix: "%" }), f("years", "Years")], (v) => {
  const I = pos(v.principal, "principal") * (n(v.rate) / 100) * pos(v.years, "years");
  return [out("Interest", I, { primary: true }), out("Total", pos(v.principal, "principal") + I)];
});
moneyCalc("investment", [f("principal", "Principal"), f("monthly", "Monthly deposit"), f("rate", "Rate", { suffix: "%" }), f("years", "Years")], (v) => {
  const P = n(v.principal), pmt = n(v.monthly), r = n(v.rate) / 100 / 12, nper = pos(v.years) * 12;
  const fv = (r === 0 ? P + pmt * nper : P * (1 + r) ** nper + pmt * (((1 + r) ** nper - 1) / r));
  return [out("Future value", fv, { primary: true, hint: "estimate" })];
});
moneyCalc("roi", [f("gain", "Final value"), f("cost", "Cost")], (v) => {
  const cost = pos(v.cost, "cost");
  const roi = (n(v.gain, "gain") - cost) / cost;
  return [out("ROI", roi * 100, { primary: true, hint: "% · estimate" }), out("Multiple", n(v.gain) / cost)];
});
moneyCalc("profit", [f("cost", "Cost"), f("price", "Price"), f("qty", "Quantity", { defaultValue: 1 })], (v) => {
  const cost = n(v.cost), price = n(v.price), q = pos(v.qty, "quantity");
  const profit = (price - cost) * q;
  return [out("Profit", profit, { primary: true, hint: "estimate" }), out("Margin", ((price - cost) / price) * 100, { hint: "%" }), out("Markup", ((price - cost) / cost) * 100, { hint: "%" })];
});
moneyCalc("break-even", [f("fixed", "Fixed costs"), f("variablePerUnit", "Variable / unit"), f("pricePerUnit", "Price / unit")], (v) => {
  const den = n(v.pricePerUnit) - n(v.variablePerUnit);
  if (den <= 0) throw new Error("Price must be greater than variable cost.");
  return [out("Units", n(v.fixed) / den, { primary: true, hint: "estimate" })];
});
moneyCalc("markup", [f("cost", "Cost"), f("markupPercent", "Markup", { suffix: "%" })], (v) => [out("Price", pos(v.cost, "cost") * (1 + n(v.markupPercent) / 100), { primary: true })]);
moneyCalc("margin", [f("cost", "Cost"), f("price", "Price")], (v) => {
  const price = pos(v.price, "price");
  return [out("Margin", ((price - n(v.cost)) / price) * 100, { primary: true, hint: "%" })];
});
moneyCalc("discount", [f("price", "Price"), f("percent", "Discount", { suffix: "%" })], (v) => {
  const p = pos(v.price, "price"), d = n(v.percent) / 100;
  return [out("Sale price", p * (1 - d), { primary: true }), out("Saved", p * d)];
});
moneyCalc("tax", [f("amount", "Amount"), f("rate", "Rate", { suffix: "%" }), sel("mode", "Mode", [{ value: "add", label: "Add tax" }, { value: "extract", label: "Extract tax" }])], (v) => {
  const a = n(v.amount), r = n(v.rate) / 100;
  const gross = v.mode === "extract" ? a : a * (1 + r);
  const net = v.mode === "extract" ? a / (1 + r) : a;
  return [out("Gross", gross, { primary: true }), out("Net", net), out("Tax", gross - net)];
});
moneyCalc("vat", [f("amount", "Amount"), f("rate", "VAT rate", { suffix: "%", defaultValue: 20 }), sel("mode", "Mode", [{ value: "add", label: "Add VAT" }, { value: "extract", label: "Extract VAT" }])], calculators.tax.compute);
moneyCalc("tip", [f("bill", "Bill"), f("tipPercent", "Tip", { suffix: "%", defaultValue: 15 }), f("people", "People", { defaultValue: 1 })], (v) => {
  const bill = pos(v.bill, "bill"), tip = bill * (n(v.tipPercent) / 100), people = pos(v.people, "people");
  return [out("Tip", tip, { primary: true }), out("Total", bill + tip), out("Per person", (bill + tip) / people)];
});
moneyCalc("cagr", [f("start", "Start"), f("end", "End"), f("years", "Years")], (v) => [out("CAGR", (pos(v.end, "end") / pos(v.start, "start")) ** (1 / pos(v.years, "years")) - 1, { primary: true, hint: "as decimal" })]);
moneyCalc("inflation", [f("amount", "Amount"), f("rate", "Rate", { suffix: "%" }), f("years", "Years")], (v) => {
  const a = pos(v.amount, "amount"), r = n(v.rate) / 100, t = pos(v.years, "years");
  return [out("Future value", a * (1 + r) ** t, { primary: true, hint: "estimate" }), out("Present of future $1", a / (1 + r) ** t)];
});

function geoMat(key: string, fields: Field[], fn: CalculatorDef["compute"]) {
  calculators[key] = { fields, compute: fn };
}
geoMat("concrete", [f("length", "Length (m)"), f("width", "Width (m)"), f("depth", "Depth"), sel("depthUnit", "Depth unit", [{ value: "cm", label: "cm" }, { value: "inch", label: "inch" }]), f("bagYield", "Bag yield m³", { defaultValue: 0.018 })], (v) => {
  const depthM = pos(v.depth, "depth") * (v.depthUnit === "inch" ? 0.0254 : 0.01);
  const vol = pos(v.length, "length") * pos(v.width, "width") * depthM;
  return [out("Volume m³", vol, { primary: true }), out("Bags", Math.ceil(vol / pos(v.bagYield, "bag yield")))];
});
geoMat("brick", [f("wallLength", "Wall length m"), f("wallHeight", "Wall height m"), f("brickLength", "Brick length cm", { defaultValue: 21.5 }), f("brickHeight", "Brick height cm", { defaultValue: 6.5 }), f("waste", "Waste %", { defaultValue: 10 })], (v) => {
  const area0 = pos(v.wallLength) * pos(v.wallHeight);
  const ba = (pos(v.brickLength) / 100) * (pos(v.brickHeight) / 100);
  const n0 = Math.ceil((area0 / ba) * (1 + n(v.waste) / 100));
  return [out("Bricks", n0, { primary: true })];
});
geoMat("tile", [f("roomLength", "Room length"), f("roomWidth", "Room width"), f("tileLength", "Tile length"), f("tileWidth", "Tile width"), f("waste", "Waste %", { defaultValue: 10 })], (v) => {
  const n0 = Math.ceil(((pos(v.roomLength) * pos(v.roomWidth)) / (pos(v.tileLength) * pos(v.tileWidth))) * (1 + n(v.waste) / 100));
  return [out("Tiles", n0, { primary: true })];
});
geoMat("paint", [f("area", "Area m²"), f("coats", "Coats", { defaultValue: 2 }), f("coverage", "Coverage m²/L", { defaultValue: 10 })], (v) => [out("Litres", (pos(v.area) * pos(v.coats)) / pos(v.coverage), { primary: true })]);
geoMat("flooring", [f("length", "Length"), f("width", "Width"), f("waste", "Waste %", { defaultValue: 10 })], (v) => {
  const a = pos(v.length) * pos(v.width);
  return [out("Area", a), out("With waste", a * (1 + n(v.waste) / 100), { primary: true })];
});
geoMat("roofing", [f("length", "Length m"), f("width", "Width m"), f("pitch", "Pitch °", { defaultValue: 30 })], (v) => {
  const plan = pos(v.length) * pos(v.width);
  const area0 = plan / Math.cos((n(v.pitch) * Math.PI) / 180);
  return [out("Roof area m²", area0, { primary: true }), out("Squares", area0 / 9.29)];
});
geoMat("lumber", [f("thickness", "Thickness in"), f("width", "Width in"), f("length", "Length in"), f("count", "Count", { defaultValue: 1 })], (v) => [out("Board feet", (pos(v.thickness) * pos(v.width) * pos(v.length) * pos(v.count)) / 12, { primary: true })]);

calculators["ohms-law"] = {
  fields: [f("volts", "Volts (optional)"), f("amps", "Amps (optional)"), f("ohms", "Ohms (optional)"), f("watts", "Watts (optional)")],
  formula: "V = I R, P = V I",
  compute: (v) => {
    const given: Record<string, number> = {};
    for (const k of ["volts", "amps", "ohms", "watts"] as const) {
      if (String(v[k] ?? "").trim()) given[k] = n(v[k], k);
    }
    if (Object.keys(given).length < 2) throw new Error("Fill in any two of V, I, R, P.");
    let V = given.volts, I = given.amps, R = given.ohms, P = given.watts;
    if (V == null && I != null && R != null) V = I * R;
    if (I == null && V != null && R != null) I = V / R;
    if (R == null && V != null && I != null) R = V / I;
    if (P == null && V != null && I != null) P = V * I;
    if (V == null && P != null && I != null) V = P / I;
    if (I == null && P != null && V != null) I = P / V;
    if (R == null && V != null && P != null) R = (V * V) / P;
    if (V == null || I == null || R == null || P == null) throw new Error("Could not solve Ohm's law from those two values.");
    return [out("Volts", V, { primary: true }), out("Amps", I), out("Ohms", R), out("Watts", P)];
  },
};
calculators.voltage = { fields: [f("current", "Current A"), f("resistance", "Resistance Ω")], compute: (v) => [out("Voltage", n(v.current) * n(v.resistance), { primary: true })] };
calculators.current = { fields: [f("voltage", "Voltage V"), f("resistance", "Resistance Ω")], compute: (v) => [out("Current", n(v.voltage) / pos(v.resistance, "resistance"), { primary: true })] };
calculators.resistance = { fields: [f("voltage", "Voltage V"), f("current", "Current A")], compute: (v) => [out("Resistance", n(v.voltage) / pos(v.current, "current"), { primary: true })] };
calculators["power-elec"] = { fields: [f("voltage", "Voltage"), f("current", "Current")], compute: (v) => [out("Watts", n(v.voltage) * n(v.current), { primary: true })] };
calculators.speed = { fields: [f("distance", "Distance"), f("timeHours", "Time (hours)"), sel("unit", "Distance unit", [{ value: "km", label: "km" }, { value: "mi", label: "miles" }])], compute: (v) => {
  const d = pos(v.distance, "distance"), t = pos(v.timeHours, "time");
  const km = v.unit === "mi" ? d * 1.60934 : d;
  return [out("km/h", km / t, { primary: true }), out("mph", km / t / 1.60934)];
}};
calculators.distance = { fields: [f("speed", "Speed"), f("timeHours", "Hours")], compute: (v) => [out("Distance", pos(v.speed) * pos(v.timeHours), { primary: true })] };
calculators.acceleration = { fields: [f("v0", "v₀"), f("v1", "v₁"), f("time", "Time s")], compute: (v) => [out("Acceleration", (n(v.v1) - n(v.v0)) / pos(v.time, "time"), { primary: true })] };
calculators.force = { fields: [f("mass", "Mass kg"), f("accel", "Acceleration m/s²")], compute: (v) => [out("Force (N)", pos(v.mass) * n(v.accel), { primary: true })] };
calculators.pressure = { fields: [f("force", "Force N"), f("area", "Area m²")], compute: (v) => [out("Pascal", n(v.force) / pos(v.area, "area"), { primary: true })] };
calculators.density = { fields: [f("mass", "Mass kg"), f("volume", "Volume m³")], compute: (v) => [out("kg/m³", n(v.mass) / pos(v.volume, "volume"), { primary: true })] };
calculators["kinetic-energy"] = { fields: [f("mass", "Mass kg"), f("velocity", "Velocity m/s")], compute: (v) => [out("Joules", 0.5 * pos(v.mass) * n(v.velocity) ** 2, { primary: true })] };
calculators["potential-energy"] = { fields: [f("mass", "Mass kg"), f("height", "Height m"), f("g", "g", { defaultValue: 9.80665 })], compute: (v) => [out("Joules", pos(v.mass) * n(v.g) * n(v.height), { primary: true })] };
calculators["freq-wave"] = { fields: [sel("from", "Known", [{ value: "frequency", label: "Frequency Hz" }, { value: "wavelength", label: "Wavelength m" }]), f("value", "Value"), f("c", "Speed m/s", { defaultValue: 299792458 })], compute: (v) => {
  const c = pos(v.c, "speed"), x = pos(v.value, "value");
  return v.from === "frequency" ? [out("Wavelength m", c / x, { primary: true })] : [out("Frequency Hz", c / x, { primary: true })];
}};
calculators.work = { fields: [f("force", "Force N"), f("distance", "Distance m")], compute: (v) => [out("Joules", n(v.force) * n(v.distance), { primary: true })] };

function bmrOf(sex: string, kg: number, cm: number, age: number) {
  return sex === "female" ? 10 * kg + 6.25 * cm - 5 * age - 161 : 10 * kg + 6.25 * cm - 5 * age + 5;
}
const sexF = sel("sex", "Sex", [{ value: "male", label: "Male" }, { value: "female", label: "Female" }]);
calculators.bmi = { fields: [f("weightKg", "Weight kg"), f("heightCm", "Height cm")], compute: (v) => {
  const h = pos(v.heightCm, "Height") / 100, bmi = pos(v.weightKg, "Weight") / (h * h);
  const cat = bmi < 18.5 ? "Underweight" : bmi < 25 ? "Healthy range (est.)" : bmi < 30 ? "Overweight range (est.)" : "Obesity range (est.)";
  return [out("BMI", bmi, { primary: true, hint: cat + " · not medical advice" })];
}};
calculators.bmr = { fields: [sexF, f("weightKg", "Weight kg"), f("heightCm", "Height cm"), f("age", "Age")], compute: (v) => [out("BMR kcal/day", bmrOf(v.sex, pos(v.weightKg, "weight"), pos(v.heightCm, "height"), pos(v.age, "age")), { primary: true, hint: "estimate" })] };
const act = sel("activity", "Activity", [{ value: "1.2", label: "Sedentary 1.2" }, { value: "1.375", label: "Light 1.375" }, { value: "1.55", label: "Moderate 1.55" }, { value: "1.725", label: "Active 1.725" }, { value: "1.9", label: "Very active 1.9" }], "1.55");
calculators.tdee = { fields: [sexF, f("weightKg", "Weight kg"), f("heightCm", "Height cm"), f("age", "Age"), act], compute: (v) => {
  const b = bmrOf(v.sex, pos(v.weightKg, "weight"), pos(v.heightCm, "height"), pos(v.age, "age"));
  return [out("TDEE kcal", b * Number(v.activity), { primary: true, hint: "estimate" })];
}};
calculators.calorie = { fields: [...calculators.tdee.fields, sel("goal", "Goal", [{ value: "lose", label: "Lose" }, { value: "maintain", label: "Maintain" }, { value: "gain", label: "Gain" }])], compute: (v) => {
  const tdee = bmrOf(v.sex, pos(v.weightKg, "weight"), pos(v.heightCm, "height"), pos(v.age, "age")) * Number(v.activity);
  const adj = v.goal === "lose" ? -500 : v.goal === "gain" ? 500 : 0;
  return [out("Daily kcal", tdee + adj, { primary: true, hint: "estimate · not medical advice" })];
}};
calculators.macro = { fields: [f("calories", "Calories"), f("proteinPct", "Protein %", { defaultValue: 30 }), f("carbPct", "Carb %", { defaultValue: 40 }), f("fatPct", "Fat %", { defaultValue: 30 })], compute: (v) => {
  const p = n(v.proteinPct), c = n(v.carbPct), fpc = n(v.fatPct);
  if (Math.round(p + c + fpc) !== 100) throw new Error("Protein + carbs + fat percents must add to 100.");
  const cal = pos(v.calories, "calories");
  return [out("Protein g", (cal * p) / 100 / 4, { primary: true, hint: "estimate" }), out("Carbs g", (cal * c) / 100 / 4), out("Fat g", (cal * fpc) / 100 / 9)];
}};
calculators.protein = { fields: [f("weightKg", "Weight kg"), f("gramsPerKg", "g per kg", { defaultValue: 1.6 })], compute: (v) => [out("Protein g", pos(v.weightKg) * n(v.gramsPerKg), { primary: true, hint: "estimate" })] };
calculators["body-fat"] = { fields: [sexF, f("heightCm", "Height cm"), f("waistCm", "Waist cm"), f("neckCm", "Neck cm"), f("hipCm", "Hip cm (female)")], compute: (v) => {
  const h = pos(v.heightCm, "height"), waist = pos(v.waistCm, "waist"), neck = pos(v.neckCm, "neck");
  let bf: number;
  if (v.sex === "female") {
    const hip = pos(v.hipCm, "hip");
    bf = 495 / (1.29579 - 0.35004 * Math.log10(waist + hip - neck) + 0.221 * Math.log10(h)) - 450;
  } else {
    bf = 495 / (1.0324 - 0.19077 * Math.log10(waist - neck) + 0.15456 * Math.log10(h)) - 450;
  }
  return [out("Body fat %", bf, { primary: true, hint: "Navy method estimate" })];
}};
calculators["ideal-weight"] = { fields: [sexF, f("heightCm", "Height cm")], compute: (v) => {
  const inches = pos(v.heightCm) / 2.54;
  const over = inches - 60;
  const base = v.sex === "female" ? 45.5 : 50;
  return [out("Devine kg", base + 2.3 * over, { primary: true, hint: "estimate" })];
}};
calculators.water = { fields: [f("weightKg", "Weight kg"), f("activityMinutes", "Activity minutes", { defaultValue: 0 })], compute: (v) => [out("Litres", (pos(v.weightKg) * 30 + n(v.activityMinutes) * 12) / 1000, { primary: true, hint: "estimate" })] };
calculators.pace = { fields: [sel("solve", "Solve for", [{ value: "pace", label: "Pace" }, { value: "time", label: "Time" }, { value: "distance", label: "Distance" }]), f("distanceKm", "Distance km"), f("timeMinutes", "Time minutes"), f("paceMinPerKm", "Pace min/km")], compute: (v) => {
  if (v.solve === "pace") return [out("min/km", pos(v.timeMinutes) / pos(v.distanceKm), { primary: true })];
  if (v.solve === "time") return [out("Minutes", pos(v.distanceKm) * pos(v.paceMinPerKm), { primary: true })];
  return [out("km", pos(v.timeMinutes) / pos(v.paceMinPerKm), { primary: true })];
}};
calculators["one-rep-max"] = { fields: [f("weight", "Weight"), f("reps", "Reps")], compute: (v) => [out("Epley 1RM", pos(v.weight) * (1 + pos(v.reps) / 30), { primary: true, hint: "estimate" })] };
calculators["hr-zone"] = { fields: [f("age", "Age")], compute: (v) => {
  const max = 220 - pos(v.age, "age");
  return [out("Max (Fox)", max, { primary: true, hint: "estimate" }), out("Z2 60–70%", `${Math.round(max * 0.6)}–${Math.round(max * 0.7)}`)];
}};
calculators["calories-burned"] = { fields: [f("weightKg", "Weight kg"), f("minutes", "Minutes"), f("met", "MET", { defaultValue: 6 })], compute: (v) => [out("kcal", n(v.met) * pos(v.weightKg) * (pos(v.minutes) / 60), { primary: true, hint: "estimate" })] };
calculators.lbm = { fields: [sexF, f("weightKg", "Weight kg"), f("heightCm", "Height cm")], compute: (v) => {
  const w = pos(v.weightKg), h = pos(v.heightCm);
  const lbm = v.sex === "female" ? 0.252 * w + 0.473 * h - 48.3 : 0.407 * w + 0.267 * h - 19.2;
  return [out("Lean mass kg", lbm, { primary: true, hint: "Boer estimate" })];
}};

function parseGrade(g: string): number {
  const m: Record<string, number> = { A: 4, B: 3, C: 2, D: 1, F: 0 };
  if (m[g.toUpperCase()] != null) return m[g.toUpperCase()]!;
  const n0 = Number(g);
  if (!Number.isFinite(n0)) throw new Error(`Unknown grade "${g}". Use 0–4 or A–F.`);
  return n0;
}
calculators.gpa = { fields: [{ name: "rows", label: "credits,grade per line", type: "textarea", placeholder: "3,A\n4,B" }], compute: (v) => {
  const rows = String(v.rows).split("\n").map((l) => l.trim()).filter(Boolean);
  if (!rows.length) throw new Error("Enter courses as credits,grade.");
  let w = 0, c = 0;
  for (const row of rows) {
    const [cr, g] = row.split(/[,\s]+/);
    const cred = pos(cr, "credits");
    w += cred * parseGrade(g ?? "");
    c += cred;
  }
  return [out("GPA", w / c, { primary: true })];
}};
calculators.cgpa = { fields: [{ name: "rows", label: "GPA or GPA,credits per line", type: "textarea" }], compute: (v) => {
  const rows = String(v.rows).split("\n").map((l) => l.trim()).filter(Boolean);
  if (!rows.length) throw new Error("Enter semester GPAs.");
  let w = 0, c = 0;
  for (const row of rows) {
    const [g, cr] = row.split(/[,\s]+/);
    const cred = cr ? pos(cr, "credits") : 1;
    w += n(g, "gpa") * cred;
    c += cred;
  }
  return [out("CGPA", w / c, { primary: true })];
}};
calculators.grade = { fields: [{ name: "rows", label: "score,weight per line", type: "textarea", placeholder: "88,40\n92,60" }], compute: (v) => {
  const rows = String(v.rows).split("\n").map((l) => l.trim()).filter(Boolean);
  let w = 0, t = 0;
  for (const row of rows) {
    const [s, wt] = row.split(/[,\s]+/);
    w += n(s) * n(wt);
    t += n(wt);
  }
  if (!t) throw new Error("Weights must sum to more than 0.");
  return [out("Weighted %", w / t, { primary: true })];
}};
calculators["weighted-grade"] = calculators.grade;
calculators["final-grade"] = { fields: [f("current", "Current %"), f("currentWeight", "Current weight %"), f("target", "Target %"), f("finalWeight", "Final weight %")], compute: (v) => {
  const fw = pos(v.finalWeight, "final weight") / 100;
  const needed = (n(v.target) - n(v.current) * (n(v.currentWeight) / 100)) / fw;
  return [out("Needed on final", needed, { primary: true, hint: "%" })];
}};
calculators["exam-score"] = { fields: [f("correct", "Correct"), f("total", "Total")], compute: (v) => [out("Percent", (n(v.correct) / pos(v.total, "total")) * 100, { primary: true })] };
calculators["study-time"] = { fields: [f("hours", "Total hours"), f("days", "Days")], compute: (v) => [out("Hours / day", pos(v.hours) / pos(v.days, "days"), { primary: true })] };
calculators.sleep = { fields: [{ name: "wakeTime", label: "Wake time (HH:mm)", type: "text", defaultValue: "07:00" }], compute: (v) => {
  const [hh, mm] = (v.wakeTime || "07:00").split(":").map(Number);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) throw new Error("Use HH:mm.");
  const wake = hh * 60 + mm;
  const beds = [6, 5, 4].map((cyc) => {
    let m = wake - cyc * 90 - 15;
    if (m < 0) m += 1440;
    return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  });
  return [out("Suggested bedtimes", beds.join(", "), { primary: true, hint: "90-min cycles + 15 min" })];
}};
calculators.aspect = { fields: [f("width", "Width"), f("height", "Height")], compute: (v) => {
  const w = pos(v.width), h = pos(v.height), g = gcd(w, h);
  return [out("Ratio", `${w / g}:${h / g}`, { primary: true })];
}};
calculators.fps = { fields: [f("durationSec", "Duration s"), f("fps", "FPS")], compute: (v) => [out("Frames", pos(v.durationSec) * pos(v.fps), { primary: true })] };
calculators["audio-bitrate"] = { fields: [f("durationSec", "Duration s"), f("bitrateKbps", "Bitrate kbps")], compute: (v) => [out("MB", (pos(v.durationSec) * pos(v.bitrateKbps)) / 8 / 1000, { primary: true })] };
calculators["audio-size"] = calculators["audio-bitrate"];
calculators["video-bitrate"] = { fields: [f("sizeMB", "Size MB"), f("durationSec", "Duration s")], compute: (v) => [out("kbps", (pos(v.sizeMB) * 8 * 1000) / pos(v.durationSec), { primary: true })] };
calculators["video-size"] = { fields: [f("bitrateMbps", "Bitrate Mbps"), f("durationSec", "Duration s")], compute: (v) => {
  const mb = (pos(v.bitrateMbps) * pos(v.durationSec)) / 8;
  return [out("MB", mb * 1000, { primary: true }), out("GB", mb)];
}};
calculators["sample-rate"] = { fields: [f("samples", "Samples"), f("sampleRateHz", "Sample rate Hz")], compute: (v) => [out("Seconds", pos(v.samples) / pos(v.sampleRateHz), { primary: true })] };

function earn(key: string, fields: Field[], fn: (v: Record<string, string>) => number, hint = "editable assumption") {
  calculators[key] = { fields, compute: (v) => [out("Estimate", fn(v), { primary: true, hint })] };
}
earn("yt-rpm", [f("views", "Views"), f("rpm", "RPM", { defaultValue: 4 })], (v) => (n(v.views) / 1000) * n(v.rpm));
earn("yt-cpm", [f("impressions", "Impressions"), f("cpm", "CPM", { defaultValue: 8 })], (v) => (n(v.impressions) / 1000) * n(v.cpm));
earn("yt-shorts", [f("views", "Views"), f("rpm", "RPM", { defaultValue: 0.04 })], (v) => (n(v.views) / 1000) * n(v.rpm));
calculators["yt-earn"] = { fields: [f("views", "Views"), f("rpmLow", "RPM low", { defaultValue: 2 }), f("rpmHigh", "RPM high", { defaultValue: 6 })], compute: (v) => [
  out("Low", (n(v.views) / 1000) * n(v.rpmLow), { hint: "estimate" }),
  out("High", (n(v.views) / 1000) * n(v.rpmHigh), { primary: true, hint: "estimate" }),
]};
earn("tt-earn", [f("views", "Views"), f("rpm", "RPM", { defaultValue: 0.02 })], (v) => (n(v.views) / 1000) * n(v.rpm));
calculators["ig-eng"] = { fields: [f("likes", "Likes"), f("comments", "Comments"), f("followers", "Followers")], compute: (v) => [out("Engagement %", ((n(v.likes) + n(v.comments)) / pos(v.followers, "followers")) * 100, { primary: true })] };
calculators.twitch = { fields: [f("subs", "Subs"), f("subPrice", "Net / sub", { defaultValue: 2.5 }), f("bits", "Bits", { defaultValue: 0 }), f("bitValue", "Bit value", { defaultValue: 0.01 }), f("adMinutes", "Ad minutes", { defaultValue: 0 }), f("cpm", "Ad CPM", { defaultValue: 5 })], compute: (v) => [out("Estimate", n(v.subs) * n(v.subPrice) + n(v.bits) * n(v.bitValue) + (n(v.adMinutes) / 1000) * n(v.cpm) * 100, { primary: true, hint: "rough" })] };
earn("spotify", [f("streams", "Streams"), f("perStream", "Per stream", { defaultValue: 0.003 })], (v) => n(v.streams) * n(v.perStream));
earn("apple-music", [f("streams", "Streams"), f("perStream", "Per stream", { defaultValue: 0.006 })], (v) => n(v.streams) * n(v.perStream));
earn("podcast", [f("downloads", "Downloads"), f("cpm", "CPM", { defaultValue: 18 }), f("adsPerEpisode", "Ads", { defaultValue: 2 })], (v) => (n(v.downloads) / 1000) * n(v.cpm) * n(v.adsPerEpisode));


// Fitness calculators — educational estimates, not medical diagnosis or treatment.
calculators.bmr = { fields: [
  f("weightKg", "Weight", { suffix: "kg" }), f("heightCm", "Height", { suffix: "cm" }),
  f("age", "Age", { suffix: "years" }),
  sel("sex", "Sex", [{ value: "male", label: "Male" }, { value: "female", label: "Female" }], "male"),
], formula: "Mifflin–St Jeor: 10W + 6.25H − 5A + sex constant", compute: (v) => {
  const w = pos(v.weightKg, "Weight"), h = pos(v.heightCm, "Height"), age = pos(v.age, "Age");
  if (age > 120) throw new Error("Enter an age between 1 and 120.");
  const bmr = 10 * w + 6.25 * h - 5 * age + (v.sex === "female" ? -161 : 5);
  return [out("BMR", bmr, { primary: true, hint: "kcal/day estimate" })];
}};
calculators.tdee = { fields: [
  f("weightKg", "Weight", { suffix: "kg" }), f("heightCm", "Height", { suffix: "cm" }), f("age", "Age", { suffix: "years" }),
  sel("sex", "Sex", [{ value: "male", label: "Male" }, { value: "female", label: "Female" }], "male"),
  sel("activity", "Activity", [
    { value: "1.2", label: "Sedentary — little exercise" }, { value: "1.375", label: "Light — 1–3 days/week" },
    { value: "1.55", label: "Moderate — 3–5 days/week" }, { value: "1.725", label: "Very active — 6–7 days/week" },
    { value: "1.9", label: "Extra active — hard training/physical work" },
  ], "1.55"),
], formula: "TDEE = Mifflin–St Jeor BMR × activity factor", compute: (v) => {
  const w = pos(v.weightKg, "Weight"), h = pos(v.heightCm, "Height"), age = pos(v.age, "Age");
  if (age > 120) throw new Error("Enter an age between 1 and 120.");
  const bmr = 10 * w + 6.25 * h - 5 * age + (v.sex === "female" ? -161 : 5);
  const factor = Number(v.activity);
  if (!Number.isFinite(factor)) throw new Error("Choose an activity level.");
  return [out("BMR", bmr), out("TDEE", bmr * factor, { primary: true, hint: "kcal/day estimate" })];
}};
calculators.calorie = { fields: [
  f("weightKg", "Weight", { suffix: "kg" }), f("heightCm", "Height", { suffix: "cm" }), f("age", "Age", { suffix: "years" }),
  sel("sex", "Sex", [{ value: "male", label: "Male" }, { value: "female", label: "Female" }], "male"),
  sel("activity", "Activity", [
    { value: "1.2", label: "Sedentary" }, { value: "1.375", label: "Light" }, { value: "1.55", label: "Moderate" }, { value: "1.725", label: "Very active" }, { value: "1.9", label: "Extra active" },
  ], "1.55"),
  sel("goal", "Goal", [{ value: "lose", label: "Lose weight" }, { value: "maintain", label: "Maintain" }, { value: "gain", label: "Gain weight" }], "maintain"),
], formula: "TDEE adjusted by a 500 kcal/day goal assumption", compute: (v) => {
  const w = pos(v.weightKg, "Weight"), h = pos(v.heightCm, "Height"), age = pos(v.age, "Age"), factor = Number(v.activity);
  if (age > 120 || !Number.isFinite(factor)) throw new Error("Check age and activity inputs.");
  const bmr = 10 * w + 6.25 * h - 5 * age + (v.sex === "female" ? -161 : 5), tdee = bmr * factor;
  const adjustment = v.goal === "lose" ? -500 : v.goal === "gain" ? 500 : 0;
  return [out("Maintenance", tdee, { hint: "TDEE estimate" }), out("Daily target", Math.max(0, tdee + adjustment), { primary: true, hint: "uses ±500 kcal goal assumption" })];
}};
calculators.macro = { fields: [
  f("calories", "Daily calories", { suffix: "kcal" }),
  f("proteinPct", "Protein", { suffix: "%", defaultValue: 30 }), f("carbPct", "Carbohydrates", { suffix: "%", defaultValue: 40 }), f("fatPct", "Fat", { suffix: "%", defaultValue: 30 }),
], formula: "Protein/carbs/fat grams = calories × percentage ÷ 4/4/9", compute: (v) => {
  const calories = pos(v.calories, "Calories"), p = n(v.proteinPct, "protein %"), c = n(v.carbPct, "carb %"), fat = n(v.fatPct, "fat %");
  if (p < 0 || c < 0 || fat < 0 || Math.abs(p + c + fat - 100) > 0.01) throw new Error("Protein, carbohydrate, and fat percentages must add up to 100%.");
  return [out("Protein", calories * p / 100 / 4, { primary: true, hint: "g/day" }), out("Carbohydrates", calories * c / 100 / 4, { hint: "g/day" }), out("Fat", calories * fat / 100 / 9, { hint: "g/day" })];
}};
calculators.protein = { fields: [
  f("weightKg", "Weight", { suffix: "kg" }),
  sel("goal", "Goal", [{ value: "general", label: "General" }, { value: "active", label: "Active" }, { value: "strength", label: "Strength / hypertrophy" }], "general"),
], formula: "Weight × goal factor: 1.2 / 1.6 / 2.2 g/kg", compute: (v) => {
  const w = pos(v.weightKg, "Weight"), factor = v.goal === "strength" ? 2.2 : v.goal === "active" ? 1.6 : 1.2;
  return [out("Protein target", w * factor, { primary: true, hint: `${factor} g/kg assumption` })];
}};
calculators["body-fat"] = { fields: [
  f("heightIn", "Height", { suffix: "in" }), f("neckIn", "Neck", { suffix: "in" }), f("waistIn", "Waist", { suffix: "in" }),
  f("hipIn", "Hip (female only)", { suffix: "in", hint: "Required for the female Navy equation." }),
  sel("sex", "Sex", [{ value: "male", label: "Male" }, { value: "female", label: "Female" }], "male"),
], formula: "US Navy circumference method; logarithmic estimate", compute: (v) => {
  const h = pos(v.heightIn, "Height"), neck = pos(v.neckIn, "Neck"), waist = pos(v.waistIn, "Waist");
  let bf: number;
  if (v.sex === "female") {
    const hip = pos(v.hipIn, "Hip");
    if (waist + hip <= neck) throw new Error("Check waist, hip, and neck measurements.");
    bf = 495 / (1.29579 - 0.35004 * Math.log10(waist + hip - neck) + 0.221 * Math.log10(h)) - 450;
  } else {
    if (waist <= neck) throw new Error("Waist must be larger than neck for this estimate.");
    bf = 495 / (1.0324 - 0.19077 * Math.log10(waist - neck) + 0.15456 * Math.log10(h)) - 450;
  }
  return [out("Estimated body fat", Math.max(0, bf), { primary: true, hint: "% · measurement-based estimate" })];
}};
calculators["ideal-weight"] = { fields: [
  f("heightIn", "Height", { suffix: "in" }),
], formula: "Devine, Robinson, and Miller formulas", compute: (v) => {
  const h = pos(v.heightIn, "Height");
  if (h < 48) throw new Error("Enter a height of at least 48 inches.");
  const extra = h - 60;
  const devine = 50 + 2.3 * extra, robinson = 52 + 1.9 * extra, miller = 56.2 + 1.41 * extra;
  return [out("Devine", devine, { primary: true, hint: "kg" }), out("Robinson", robinson, { hint: "kg" }), out("Miller", miller, { hint: "kg" })];
}};
calculators.water = { fields: [f("weightKg", "Weight", { suffix: "kg" }), f("activityMin", "Exercise minutes/day", { suffix: "min", defaultValue: 30 })], formula: "≈35 mL/kg + ≈12 mL per exercise minute", compute: (v) => {
  const w = pos(v.weightKg, "Weight"), min = n(v.activityMin, "exercise minutes");
  if (min < 0) throw new Error("Exercise minutes cannot be negative.");
  return [out("Daily water", (w * 35 + min * 12) / 1000, { primary: true, hint: "litres/day estimate" }), out("Daily water", w * 35 + min * 12, { hint: "mL/day estimate" })];
}};
calculators.pace = { fields: [f("distanceKm", "Distance", { suffix: "km" }), f("timeMin", "Time", { suffix: "min" })], formula: "Pace = time ÷ distance", compute: (v) => {
  const d = pos(v.distanceKm, "Distance"), t = pos(v.timeMin, "Time"), pace = t / d, totalSec = Math.round(pace * 60), mins = Math.floor(totalSec / 60), secs = totalSec % 60;
  const speed = d / (t / 60);
  return [out("Pace", `${mins}:${String(secs).padStart(2, "0")} /km`, { primary: true }), out("Speed", speed, { hint: "km/h" }), out("Pace", pace * 1.609344, { hint: "min/mile" })];
}};
calculators["one-rep-max"] = { fields: [f("weightKg", "Weight lifted", { suffix: "kg" }), f("reps", "Repetitions", { defaultValue: 5 })], formula: "Epley: 1RM = weight × (1 + reps/30)", compute: (v) => {
  const w = pos(v.weightKg, "Weight"), reps = pos(v.reps, "Repetitions");
  if (reps > 30) throw new Error("Epley is most useful for lower rep ranges; enter 30 or fewer reps.");
  const epley = w * (1 + reps / 30), brzycki = w * 36 / (37 - reps);
  return [out("Estimated 1RM", epley, { primary: true, hint: "Epley · kg" }), out("Brzycki estimate", brzycki, { hint: "kg" })];
}};
calculators["hr-zone"] = { fields: [f("age", "Age", { suffix: "years" })], formula: "Fox max HR = 220 − age; zones use 50–100% of max", compute: (v) => {
  const age = pos(v.age, "Age");
  if (age > 120) throw new Error("Enter an age between 1 and 120.");
  const max = 220 - age;
  return [out("Estimated max HR", max, { primary: true, hint: "bpm" }), out("Zone 1", `${Math.round(max * .50)}–${Math.round(max * .60)} bpm`), out("Zone 2", `${Math.round(max * .60)}–${Math.round(max * .70)} bpm`), out("Zone 3", `${Math.round(max * .70)}–${Math.round(max * .80)} bpm`), out("Zone 4", `${Math.round(max * .80)}–${Math.round(max * .90)} bpm`), out("Zone 5", `${Math.round(max * .90)}–${Math.round(max)} bpm`)];
}};
calculators["calories-burned"] = { fields: [f("weightKg", "Weight", { suffix: "kg" }), f("minutes", "Duration", { suffix: "min" }), f("met", "MET", { defaultValue: 7, hint: "Use the activity's published MET value." })], formula: "Calories ≈ MET × 3.5 × kg ÷ 200 × minutes", compute: (v) => {
  const kg = pos(v.weightKg, "Weight"), min = pos(v.minutes, "Duration"), met = pos(v.met, "MET");
  return [out("Estimated calories", met * 3.5 * kg / 200 * min, { primary: true, hint: "rough estimate" })];
}};
calculators.lbm = { fields: [f("weightKg", "Weight", { suffix: "kg" }), f("heightCm", "Height", { suffix: "cm" }), sel("sex", "Sex", [{ value: "male", label: "Male" }, { value: "female", label: "Female" }], "male")], formula: "Boer lean-body-mass estimate", compute: (v) => {
  const w = pos(v.weightKg, "Weight"), h = pos(v.heightCm, "Height");
  const lbm = v.sex === "female" ? 0.252 * w + 0.473 * h - 48.3 : 0.407 * w + 0.267 * h - 19.2;
  return [out("Lean body mass", Math.max(0, lbm), { primary: true, hint: "kg · estimate" })];
}};
