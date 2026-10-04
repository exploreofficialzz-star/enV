import test from "node:test";
import assert from "node:assert/strict";
import { calculators } from "./formulas.ts";
import { tools } from "../../data/catalog.ts";
import { EXAMPLES } from "../calc/audit-support.mjs";
import { parseCalcNumber } from "../calc/numeric.ts";
import type { CalcOutput } from "./formulas.ts";

/**
 * Golden cases. Every `expected` value was computed independently of this code base
 * (Python mpmath, 30 significant digits, from the textbook definition of each formula,
 * with CODATA 2018 constants where a constant is involved) and is compared with a
 * relative tolerance (default 1e-9).
 */
const GOLDEN: Array<{ id: string; inputs: Record<string, string>; expected: number; tol?: number; note?: string }> = [
  { id: "math-exercise-pythagorean-c", inputs: { a: "3", b: "4" }, expected: 5.0 },
  { id: "math-exercise-pythagorean-a", inputs: { c: "13", b: "5" }, expected: 12.0 },
  { id: "math-exercise-linear-y", inputs: { m: "2.5", x: "4", b: "-1" }, expected: 9.0 },
  { id: "math-exercise-linear-x", inputs: { y: "9", m: "2.5", b: "-1" }, expected: 4.0 },
  { id: "math-exercise-distance-d", inputs: { r: "60", t: "2.5" }, expected: 150.0 },
  { id: "math-exercise-acceleration-a", inputs: { v: "30", u: "10", t: "4" }, expected: 5.0 },
  { id: "math-exercise-force-F", inputs: { m: "12", a: "9.81" }, expected: 117.72 },
  { id: "math-exercise-ke-E", inputs: { m: "2", v: "3" }, expected: 9.0 },
  { id: "math-exercise-ke-v", inputs: { E: "50", m: "4" }, expected: 5.0 },
  { id: "math-exercise-pe-E", inputs: { m: "10", g: "9.80665", h: "3" }, expected: 294.1995 },
  { id: "math-exercise-ohm-V", inputs: { I: "0.5", R: "220" }, expected: 110.0 },
  { id: "math-exercise-ideal-gas-P", inputs: { V: "0.0224", n: "1", R: "8.314462618", T: "273.15" }, expected: 101388.190361906 },
  { id: "math-exercise-simple-interest-I", inputs: { P: "2500", r: "0.04", t: "3" }, expected: 300.0 },
  { id: "math-exercise-compound-growth-A", inputs: { P: "1000", r: "0.05", n: "12", t: "10" }, expected: 1647.00949769028 },
  { id: "math-exercise-compound-growth-t", inputs: { A: "2000", P: "1000", r: "0.06", n: "4" }, expected: 11.6388814077015 },
  { id: "math-exercise-compound-growth-n", inputs: { A: "1647.009497690283034185674", P: "1000", r: "0.05", t: "10" }, expected: 12.0, tol: 1e-06, note: "numerical inverse: recovers n=12" },
  { id: "math-exercise-cagr-cagr", inputs: { A: "2000", P: "1000", t: "5" }, expected: 0.148698354997035 },
  { id: "math-exercise-circle-area-A", inputs: { r: "2.5" }, expected: 19.6349540849362 },
  { id: "math-exercise-sphere-volume-V", inputs: { r: "3" }, expected: 113.097335529233 },
  { id: "math-exercise-cone-volume-V", inputs: { r: "3", h: "5" }, expected: 47.1238898038469 },
  { id: "math-exercise-trapezoid-area-A", inputs: { a: "3", b: "7", h: "4" }, expected: 20.0 },
  { id: "math-exercise-z-score-z", inputs: { x: "85", mu: "70", sigma: "10" }, expected: 1.5 },
  { id: "math-exercise-standard-error-SE", inputs: { s: "12", n: "36" }, expected: 2.0 },
  { id: "math-exercise-molarity-M", inputs: { moles: "0.5", V: "2" }, expected: 0.25 },
  { id: "math-exercise-pH-pH", inputs: { H: "0.001" }, expected: 3.0 },
  { id: "math-exercise-lens-f", inputs: { u: "30", v: "60" }, expected: 20.0 },
  { id: "math-exercise-snell-theta2", inputs: { n1: "1", n2: "1.5", theta1: "30" }, expected: 19.4712206344907 },
  { id: "math-exercise-vertex-x-h", inputs: { b: "-6", a: "2" }, expected: 1.5 },
  { id: "math-exercise-law-of-cosines-c", inputs: { a: "3", b: "4", C: "60" }, expected: 3.60555127546399 },
  { id: "math-exercise-law-of-sines-a", inputs: { b: "10", A: "30", B: "45" }, expected: 7.07106781186548 },
  { id: "math-exercise-kinematic-displacement-s", inputs: { u: "2", a: "3", t: "4" }, expected: 32.0 },
  { id: "math-exercise-heat-Q", inputs: { m: "0.5", c: "4186", deltaT: "20" }, expected: 41860.0 },
  { id: "math-exercise-exponential-growth-A", inputs: { P: "100", r: "0.03", t: "10" }, expected: 134.9858807576 },
  { id: "math-exercise-doubling-time-t", inputs: { r: "0.07" }, expected: 9.90210257942779 },
  { id: "math-exercise-present-value-PV", inputs: { FV: "10000", r: "0.05", n: "10" }, expected: 6139.13253540759 },
  { id: "math-exercise-geometric-mean-mean", inputs: { product: "64", n: "3" }, expected: 4.0 },
  { id: "math-exercise-odds-probability-p", inputs: { odds: "0.25" }, expected: 0.2 },
  { id: "math-exercise-dilution-C2", inputs: { C1: "6", V1: "50", V2: "300" }, expected: 1.0 },
  { id: "math-exercise-efficiency-eta", inputs: { useful: "450", input: "600" }, expected: 75.0 },
  { id: "math-exercise-percent-error-error", inputs: { experimental: "9.78", accepted: "9.81" }, expected: 0.305810397553517 },
  { id: "math-exercise-scientific-notation-x", inputs: { m: "6.022", e: "23" }, expected: 6.022e+23 },
  { id: "math-exercise-gas-density-rho", inputs: { P: "101325", MM: "0.02897", R: "8.314462618", T: "288.15" }, expected: 1.22521498171677, note: "uses CODATA R=8.314462618" },
  { id: "math-exercise-gravitational-force-F", inputs: { G: "6.6743e-11", m1: "5.972e24", m2: "7.348e22", r: "3.844e8" }, expected: 1.98211072907925e+20, note: "uses CODATA 2018 G" },
  { id: "math-exercise-arc-length-s", inputs: { r: "4", theta: "1.5" }, expected: 0.10471975511966, note: "theta in degrees" },
  { id: "math-exercise-electrical-power-P", inputs: { V: "230", I: "4.5" }, expected: 1035.0 },
  { id: "math-exercise-wave-speed-v", inputs: { f: "440", lambda: "0.78" }, expected: 343.2 },
  { id: "math-exercise-centripetal-F", inputs: { m: "1200", v: "20", r: "50" }, expected: 9600.0 },
];

const byId = new Map(tools.map((tool) => [tool.id, tool]));

/** The unrounded number behind the first primary output, falling back to parsing its displayed text. */
function primaryOf(outputs: CalcOutput[]): number {
  const item = outputs.find((entry) => entry.primary) ?? outputs[0];
  return item.raw ?? parseCalcNumber(item.value);
}

function relativeError(got: number, want: number) {
  return Math.abs(got - want) / Math.max(Math.abs(want), 1e-300);
}

test("golden formula cases match independently computed values", () => {
  for (const item of GOLDEN) {
    const tool = byId.get(item.id);
    if (!tool || tool.engine.type !== "calculator") throw new Error(`${item.id} is not a catalog calculator`);
    const definition = calculators[tool.engine.formula];
    assert.ok(definition, `${item.id} has a definition`);
    assert.deepEqual(Object.keys(item.inputs).sort(), definition.fields.map((field) => field.name).sort(), `${item.id} field set`);
    const got = primaryOf(definition.compute(item.inputs));
    assert.ok(relativeError(got, item.expected) <= (item.tol ?? 1e-9), `${item.id}: got ${got}, expected ${item.expected}`);
  }
});

test("calculators with restricted inputs match independently computed examples", () => {
  for (const [id, example] of Object.entries(EXAMPLES)) {
    const tool = byId.get(id);
    if (!tool || tool.engine.type !== "calculator") throw new Error(`${id} is not a catalog calculator`);
    const got = primaryOf(calculators[tool.engine.formula].compute(example.inputs));
    assert.ok(relativeError(got, example.primary) <= 1e-9, `${id}: got ${got}, expected ${example.primary}`);
  }
});

test("unknowns with two valid answers return both", () => {
  const values = (id: string, inputs: Record<string, string>) => calculators[`exercise-${id}`].compute(inputs).map((item) => item.raw ?? parseCalcNumber(item.value));
  const closeTo = (actual: number[], expected: number[]) => {
    assert.equal(actual.length, expected.length, `expected ${expected.length} answers, got ${actual.join(", ")}`);
    const sorted = [...actual].sort((a, b) => a - b);
    expected.forEach((want, index) => assert.ok(Math.abs(sorted[index] - want) < 1e-9, `${sorted[index]} vs ${want}`));
  };
  closeTo(values("quadratic-root-x", { a: "1", b: "-3", c: "2" }), [1, 2]);
  closeTo(values("kinematic-final-velocity-v", { u: "2", a: "3", s: "4" }), [-Math.sqrt(28), Math.sqrt(28)]);
  // Side-side-angle: b = 4, C = 30 degrees, c = 3 leaves two possible triangles for side a.
  const base = 4 * Math.cos(Math.PI / 6);
  const root = Math.sqrt(9 - (4 * Math.sin(Math.PI / 6)) ** 2);
  closeTo(values("law-of-cosines-a", { c: "3", b: "4", C: "30" }), [base - root, base + root]);
  closeTo(values("percent-error-experimental", { error: "10", accepted: "50" }), [45, 55]);
  closeTo(values("percent-error-accepted", { error: "10", experimental: "55" }), [50, 55 / 0.9]);
});

test("complex roots are reported as complex, not as NaN", () => {
  const outputs = calculators["exercise-quadratic-root-x"].compute({ a: "1", b: "0", c: "1" });
  assert.match(outputs[0].value, /i$/);
  assert.match(outputs[0].hint ?? "", /complex roots/);
});

test("compounding frequency is solved numerically and out-of-range answers are explained", () => {
  const n = primaryOf(calculators["exercise-compound-growth-n"].compute({ A: "1647.00949769028", P: "1000", r: "0.05", t: "10" }));
  assert.ok(Math.abs(n - 12) < 1e-5, `recovered ${n}`);
  assert.throws(() => calculators["exercise-compound-growth-n"].compute({ A: "5000", P: "1000", r: "0.05", t: "10" }), /No compounding frequency gives that result/);
});

test("domain errors name the problem instead of returning Undefined", () => {
  assert.throws(() => calculators["exercise-pythagorean-a"].compute({ c: "3", b: "5" }), /hypotenuse must be longer than leg b/);
  assert.throws(() => calculators["exercise-snell-theta2"].compute({ n1: "1.5", n2: "1", theta1: "60" }), /Total internal reflection/);
  assert.throws(() => calculators["exercise-log-product-L"].compute({ a: "1", x: "2", y: "3" }), /Base must be greater than 0 and not equal to 1/);
  assert.throws(() => calculators["exercise-ke-v"].compute({ E: "-5", m: "2" }), /No real value of/);
  assert.throws(() => calculators["exp-ratio-ratio-absent-c"].compute({ a: "5", b: "0" }), /Cannot divide by zero: Enrolled must not be 0/);
});
