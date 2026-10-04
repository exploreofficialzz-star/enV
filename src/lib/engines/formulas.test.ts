import { test } from "node:test";
import assert from "node:assert/strict";
import { calculators } from "./formulas.ts";

const KEYS = [
  "percentage",
  "percentage-change",
  "percentage-of",
  "fraction",
  "ratio",
  "proportion",
  "average",
  "mean",
  "median",
  "mode",
  "stddev",
  "quadratic",
  "exponent",
  "logarithm",
  "factorial",
  "permutation",
  "combination",
  "probability",
  "area",
  "volume",
  "surface-area",
  "perimeter",
  "circle",
  "triangle",
  "rectangle",
  "sphere",
  "cylinder",
  "cone",
  "cube",
  "square",
  "pyramid",
  "ellipse",
  "loan",
  "mortgage",
  "interest",
  "compound-interest",
  "simple-interest",
  "investment",
  "roi",
  "profit",
  "break-even",
  "markup",
  "margin",
  "discount",
  "tax",
  "vat",
  "tip",
  "cagr",
  "inflation",
  "concrete",
  "brick",
  "tile",
  "paint",
  "flooring",
  "roofing",
  "lumber",
  "ohms-law",
  "voltage",
  "current",
  "resistance",
  "power-elec",
  "speed",
  "distance",
  "acceleration",
  "force",
  "pressure",
  "density",
  "kinetic-energy",
  "potential-energy",
  "freq-wave",
  "work",
  "bmi",
  "bmr",
  "tdee",
  "calorie",
  "macro",
  "protein",
  "body-fat",
  "ideal-weight",
  "water",
  "pace",
  "one-rep-max",
  "hr-zone",
  "calories-burned",
  "lbm",
  "gpa",
  "cgpa",
  "grade",
  "final-grade",
  "weighted-grade",
  "exam-score",
  "study-time",
  "sleep",
  "aspect",
  "fps",
  "audio-bitrate",
  "audio-size",
  "video-bitrate",
  "video-size",
  "sample-rate",
  "yt-rpm",
  "yt-cpm",
  "yt-shorts",
  "yt-earn",
  "tt-earn",
  "ig-eng",
  "twitch",
  "spotify",
  "apple-music",
  "podcast",
] as const;

function parseNum(value: string): number {
  return Number(value.replace(/[^0-9eE.+-]/g, ""));
}

function run(key: string, input: Record<string, string>) {
  const def = calculators[key];
  assert.ok(def, `missing calculator ${key}`);
  return def.compute(input);
}

function nums(key: string, input: Record<string, string>): number[] {
  return run(key, input)
    .map((row) => parseNum(row.value))
    .filter((x) => Number.isFinite(x));
}

function labeled(key: string, input: Record<string, string>, needle: string) {
  const row = run(key, input).find((r) => r.label.toLowerCase().includes(needle.toLowerCase()));
  assert.ok(row, `missing label matching "${needle}"`);
  return row;
}

test("every calculator key is defined with fields and compute", () => {
  for (const key of KEYS) {
    const def = calculators[key];
    assert.ok(def, `missing ${key}`);
    assert.ok(Array.isArray(def.fields) && def.fields.length > 0, `${key} has no fields`);
    assert.equal(typeof def.compute, "function", `${key} has no compute`);
  }
  // KEYS lists the original hand-written calculators; the registry has since grown (formula exercises,
  // STEM, expansion families). Catalog/registry parity is enforced by calculator-registry.test.ts.
  assert.ok(Object.keys(calculators).length >= KEYS.length);
});

test("percentage of amount plus increase and decrease", () => {
  const out = nums("percentage", { amount: "200", percent: "10" });
  assert.ok(out.includes(20));
  assert.ok(out.includes(220));
  assert.ok(out.includes(180));
});

test("percentage-change", () => {
  const up = parseNum(labeled("percentage-change", { from: "100", to: "125" }, "change").value);
  assert.equal(up, 25);
  const down = parseNum(labeled("percentage-change", { from: "100", to: "80" }, "change").value);
  assert.equal(down, -20);
});

test("bmi 70kg 175cm is about 22.9", () => {
  const bmi = parseNum(labeled("bmi", { weightKg: "70", heightCm: "175" }, "BMI").value);
  assert.ok(Math.abs(bmi - 22.857142) < 1e-4);
  assert.ok(Math.abs(bmi - 22.9) < 0.05);
  const row = labeled("bmi", { weightKg: "70", heightCm: "175" }, "BMI");
  assert.equal(row.primary, true);
  assert.ok(row.hint);
});

test("loan 100000 at 5% for 30 years monthly is about 536.82", () => {
  const payment = parseNum(
    labeled("loan", { principal: "100000", annualRate: "5", years: "30", paymentsPerYear: "12" }, "payment").value,
  );
  assert.ok(Math.abs(payment - 536.82) < 0.01);
});

test("quadratic 1,-3,2 roots are 2 and 1", () => {
  const out = run("quadratic", { a: "1", b: "-3", c: "2" });
  const r1 = parseNum(labeled("quadratic", { a: "1", b: "-3", c: "2" }, "Root 1").value);
  const r2 = parseNum(labeled("quadratic", { a: "1", b: "-3", c: "2" }, "Root 2").value);
  const roots = [r1, r2].sort((a, b) => a - b);
  assert.deepEqual(roots, [1, 2]);
  const disc = parseNum(out.find((r) => r.label.toLowerCase().includes("discriminant"))!.value);
  assert.equal(disc, 1);
});

test("combination C(10,3)=120", () => {
  const c = parseNum(labeled("combination", { n: "10", r: "3" }, "C(").value);
  assert.equal(c, 120);
});

test("compound-interest smoke", () => {
  const out = run("compound-interest", {
    principal: "10000",
    rate: "5",
    years: "10",
    compoundsPerYear: "12",
    monthlyContribution: "100",
  });
  assert.ok(out.length > 0);
  const fv = parseNum(out[0]!.value);
  assert.ok(fv > 10000);
  assert.ok(Number.isFinite(fv));
  assert.ok(out[0]!.hint);
});

test("roi", () => {
  const roi = parseNum(labeled("roi", { gain: "150", cost: "100" }, "ROI").value);
  assert.equal(roi, 50);
  const multiple = parseNum(labeled("roi", { gain: "150", cost: "100" }, "Multiple").value);
  assert.equal(multiple, 1.5);
});

test("tip", () => {
  const out = run("tip", { bill: "100", tipPercent: "15", people: "2" });
  const tip = parseNum(out.find((r) => r.label.toLowerCase() === "tip")!.value);
  const total = parseNum(out.find((r) => r.label.toLowerCase() === "total")!.value);
  const per = parseNum(out.find((r) => r.label.toLowerCase().includes("person"))!.value);
  assert.equal(tip, 15);
  assert.equal(total, 115);
  assert.equal(per, 57.5);
});

test("ohms-law V=12 R=4 solves I=3", () => {
  const out = run("ohms-law", { volts: "12", ohms: "4", amps: "", watts: "" });
  const amps = parseNum(out.find((r) => r.label.toLowerCase().includes("amp"))!.value);
  const watts = parseNum(out.find((r) => r.label.toLowerCase().includes("watt"))!.value);
  assert.equal(amps, 3);
  assert.equal(watts, 36);
});

test("circle from radius 10", () => {
  const out = run("circle", { radius: "10", diameter: "", circumference: "", area: "" });
  const radius = parseNum(out.find((r) => r.label === "Radius")!.value);
  const diameter = parseNum(out.find((r) => r.label === "Diameter")!.value);
  const circ = parseNum(out.find((r) => r.label === "Circumference")!.value);
  const area = parseNum(out.find((r) => r.label === "Area")!.value);
  assert.equal(radius, 10);
  assert.equal(diameter, 20);
  assert.ok(Math.abs(circ - 2 * Math.PI * 10) < 1e-6);
  assert.ok(Math.abs(area - Math.PI * 100) < 1e-6);
});

test("throws short actionable errors", () => {
  assert.throws(() => run("bmi", { weightKg: "70", heightCm: "0" }), /Height must be greater than 0/);
  assert.throws(() => run("percentage", { amount: "abc", percent: "10" }), /Enter a valid number/);
  assert.throws(() => run("ohms-law", { volts: "12" }), /any two of V, I, R, P/);
});
