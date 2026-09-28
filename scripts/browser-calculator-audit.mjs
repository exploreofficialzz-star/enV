#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";
import { parseGeneratedCatalog } from "./catalog-reader.mjs";

function option(name) {
  const prefix = `--${name}=`;
  return process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

const category = option("category") ?? "calculators";
const baseUrl = option("base-url") ?? process.env.BROWSER_AUDIT_BASE_URL ?? "http://127.0.0.1:8080";
const reportPath = option("report");
const onlyIds = option("only")?.split(",").map((id) => id.trim()).filter(Boolean);
const limit = Number(option("limit") ?? Infinity);
const viewportWidth = Number(option("width") ?? 390);
const base = new URL(baseUrl);
if (!["http:", "https:"].includes(base.protocol) || base.username || base.password) {
  throw new Error("--base-url must be a plain http(s) URL without credentials.");
}
if (!Number.isInteger(viewportWidth) || viewportWidth < 320) throw new Error("--width must be an integer of at least 320px.");

const sampleOverrides = {
  percentage: { amount: "200", percent: "15" },
  "percentage-change": { from: "100", to: "120" },
  "percentage-of": { part: "25", whole: "100" },
  fraction: { a: "1", b: "2", c: "1", d: "3", op: "add" },
  ratio: { a: "6", b: "9" },
  proportion: { a: "2", b: "4", c: "6", d: "" },
  average: { numbers: "1, 2, 3", weights: "" },
  mean: { numbers: "1, 2, 3" },
  median: { numbers: "1, 2, 3" },
  mode: { numbers: "1, 2, 2, 3" },
  stddev: { numbers: "1, 2, 3" },
  "basic-calculator": { expression: "2 + 3 * 4" },
  quadratic: { a: "1", b: "-3", c: "2" },
  mortgage: { price: "200000", downPayment: "20000", annualRate: "5", years: "30" },
  "break-even": { fixed: "1000", variablePerUnit: "2", pricePerUnit: "10" },
  profit: { cost: "80", price: "100", qty: "2" },
  margin: { cost: "80", price: "100" },
  markup: { cost: "80", markupPercent: "20" },
  roi: { gain: "120", cost: "100" },
  cagr: { start: "100", end: "120", years: "2" },
  discount: { price: "100", percent: "10" },
  tax: { amount: "100", rate: "10" },
  vat: { amount: "100", rate: "20" },
  "ohms-law": { volts: "12", amps: "2", ohms: "", watts: "" },
  circle: { radius: "5", diameter: "", circumference: "", area: "" },
  "math-slope-calculator": { x1: "1", y1: "2", x2: "3", y2: "6" },
  "math-coordinate-geometry-calculator": { x1: "1", y1: "2", x2: "4", y2: "6" },
  "science-ohms-law-calculator": { voltage: "12", current: "2", resistance: "" },
  "science-gas-law-calculator": { p1: "2", v1: "3", t1: "300", p2: "4", v2: "5", t2: "" },
  "science-molar-mass-calculator": { masses: "12.01, 2*1.008, 16.00" },
  "finance-gross-profit-calculator": { revenue: "100", cogs: "60" },
  "finance-contribution-margin-calculator": { sales: "100", variableCosts: "60" },
  "finance-irr-calculator": { cashflows: "-1000, 300, 400, 500" },
};

function sampleForField(field, formula) {
  const override = sampleOverrides[formula];
  if (override && Object.hasOwn(override, field.name)) return String(override[field.name]);
  if (field.type === "select") return String(field.defaultValue ?? field.options?.[0]?.value ?? "");
  if (/optional/i.test(field.label ?? "") || /leave\s+(?:blank|empty)/i.test(field.hint ?? "")) return "";
  if (field.defaultValue !== undefined) return String(field.defaultValue);
  if (field.type === "textarea") {
    if (/probabilit/i.test(field.name + field.label)) return "0.2, 0.3, 0.5";
    if (/weight/i.test(field.name + field.label)) return "";
    return "1, 2, 3";
  }
  if (field.name === "expression") return "2 + 3 * 4";
  if (field.type === "text") return field.name === "base" ? "10" : "2";
  return "2";
}

function alternateSampleForField(field, currentValue, formula) {
  if (field.type === "select" || !String(currentValue).trim()) return String(currentValue);
  if (formula === "finance-irr-calculator" && field.name === "cashflows") return "-1200, 400, 500, 600";
  if (field.type === "textarea") {
    if (/probabilit/i.test(field.name + field.label)) return "0.1, 0.3, 0.6";
    if (/weight/i.test(field.name + field.label)) return "";
    if (field.name === "masses") return "24.02, 2*1.008";
    return "2, 4, 8";
  }
  if (field.name === "expression") return "18 / 3 + 4";
  const numericValue = Number(String(currentValue).replace(/,/g, ""));
  const precisionField = /significant figures/i.test(`${field.name} ${field.label}`);
  const decimalPlacesField = /decimal places/i.test(`${field.name} ${field.label}`);
  if ((precisionField || decimalPlacesField) && Number.isFinite(numericValue)) {
    const nextInteger = Math.round(numericValue * 1.5 + 1);
    return String(precisionField ? Math.min(15, Math.max(1, nextInteger)) : Math.min(20, Math.max(0, nextInteger)));
  }
  if (Number.isFinite(numericValue)) return String(numericValue < 0 ? numericValue * 1.5 : numericValue * 1.5 + 1);
  return String(currentValue);
}

function visibleRows(form) {
  return form.locator("dl > div").evaluateAll((rows) =>
    rows.map((row) => ({
      label: row.querySelector("dt")?.textContent?.trim() ?? "",
      value: row.querySelector("dd > span")?.textContent?.trim() ?? "",
    })),
  );
}

const allTools = parseGeneratedCatalog(readFileSync(new URL("../src/data/catalog.ts", import.meta.url), "utf8"));
const tools = allTools
  .filter((tool) => tool.category === category && tool.status === "active" && (!onlyIds || onlyIds.includes(tool.id)))
  .slice(0, Number.isFinite(limit) ? limit : undefined);
if (!tools.length) throw new Error(`No active tools found for category "${category}".`);
if (onlyIds) {
  const found = new Set(tools.map((tool) => tool.id));
  const missing = onlyIds.filter((id) => !found.has(id));
  if (missing.length) throw new Error(`Unknown active tool IDs for category "${category}": ${missing.join(", ")}`);
}

const vite = await createServer({
  configFile: "vite.config.ts",
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
  logLevel: "error",
});
let browser;
try {
  const { calculators } = await vite.ssrLoadModule("/src/lib/engines/formulas.ts");
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage({ viewport: { width: viewportWidth, height: 844 } });
  const browserErrors = [];
  let currentTool = "category index";
  page.on("pageerror", (error) => browserErrors.push({ tool: currentTool, type: "pageerror", message: error.message }));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push({ tool: currentTool, type: "console", message: message.text() });
  });

  const failures = [];
  let tested = 0;
  const categoryPath = `/tools/${encodeURIComponent(category)}`;
  try {
    const categoryResponse = await page.goto(new URL(categoryPath, base).href, { waitUntil: "networkidle", timeout: 30000 });
    const categoryHeading = await page.locator("h1").first().textContent();
    if (!categoryResponse?.ok() || !categoryHeading?.trim()) {
      failures.push({ type: "category-index", status: categoryResponse?.status() ?? 0, heading: categoryHeading?.trim() ?? "" });
    }
  } catch (error) {
    failures.push({ type: "category-index", error: String(error?.message ?? error) });
  }

  for (let i = 0; i < tools.length; i++) {
    const tool = tools[i];
    currentTool = tool.id;
    const formula = tool.engine?.formula;
    const definition = tool.engine?.type === "calculator" ? calculators[formula] : null;
    const url = new URL(`/tools/${encodeURIComponent(category)}/${encodeURIComponent(tool.slug)}`, base).href;
    const result = { id: tool.id, name: tool.name, formula, url, ok: false };
    try {
      if (!definition) throw new Error(`No calculator definition for ${String(formula)}.`);
      const response = await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
      if (!response?.ok()) throw new Error(`Detail route returned HTTP ${response?.status() ?? 0}.`);
      const heading = (await page.locator("h1").first().textContent())?.trim() ?? "";
      if (heading !== tool.name) throw new Error(`Expected detail heading "${tool.name}", received "${heading}".`);
      const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Calculate", exact: true }) }).first();
      await form.waitFor({ state: "visible", timeout: 10000 });

      // First submit an entirely blank form. No failed submission should be recorded as valid history.
      for (const field of definition.fields) {
        if (field.type === "select") continue;
        await form.locator(`[id="${field.name}"]`).fill("");
      }
      await form.getByRole("button", { name: "Calculate", exact: true }).click();
      await page.waitForTimeout(20);
      const blankResultCount = await form.locator("dl").count();
      const blankHistoryCount = await form.locator('section[aria-label="Recent calculations"]').count();
      const blankErrorCount = await form.locator('[role="alert"]').count();
      if (!blankErrorCount) throw new Error("Blank submission did not show an accessible validation error.");
      if (blankResultCount || blankHistoryCount) {
        throw new Error(`Blank submission produced visible results/history (results=${blankResultCount}, history=${blankHistoryCount}).`);
      }

      const values = {};
      for (const field of definition.fields) {
        const value = sampleForField(field, formula);
        values[field.name] = value;
        const control = form.locator(`[id="${field.name}"]`);
        if (field.type === "select") await control.selectOption(value);
        else await control.fill(value);
      }
      const expected = definition.compute(values);
      if (!Array.isArray(expected) || !expected.length) throw new Error("Formula did not return any outputs for its valid test input.");
      const knownAnswers = {
        "science-gas-law-calculator": [{ label: "T₂", value: "1,000" }],
        "science-molar-mass-calculator": [{ label: "Total molar mass", value: "30.026" }],
        "finance-irr-calculator": [{ label: "IRR", value: "8.89633947" }],
      }[tool.id];
      if (knownAnswers && JSON.stringify(expected.map(({ label, value }) => ({ label: String(label), value: String(value) }))) !== JSON.stringify(knownAnswers)) {
        throw new Error(`Known-answer check failed. Expected ${JSON.stringify(knownAnswers)}; formula returned ${JSON.stringify(expected)}.`);
      }
      await form.getByRole("button", { name: "Calculate", exact: true }).click();
      const resultList = form.locator("dl");
      await resultList.waitFor({ state: "visible", timeout: 5000 });
      const actual = await visibleRows(form);
      const expectedPairs = expected.map(({ label, value }) => ({ label: String(label), value: String(value) }));
      if (JSON.stringify(actual) !== JSON.stringify(expectedPairs)) {
        throw new Error(`Rendered result differs from calculator definition. Expected ${JSON.stringify(expectedPairs)}; received ${JSON.stringify(actual)}.`);
      }
      if (actual.some((row) => !row.value || /NaN|Infinity|undefined/i.test(row.value))) {
        throw new Error(`Output includes an empty or non-finite result: ${JSON.stringify(actual)}.`);
      }
      const alternateValues = {};
      for (const field of definition.fields) {
        const value = alternateSampleForField(field, values[field.name], formula);
        alternateValues[field.name] = value;
        const control = form.locator(`[id="${field.name}"]`);
        if (field.type === "select") await control.selectOption(value);
        else await control.fill(value);
      }
      const alternateExpected = definition.compute(alternateValues);
      if (!Array.isArray(alternateExpected) || !alternateExpected.length) throw new Error("Formula did not return outputs for its second valid input.");
      const knownAlternateAnswers = {
        "finance-irr-calculator": [{ label: "IRR", value: "11.21871874" }],
      }[tool.id];
      if (knownAlternateAnswers && JSON.stringify(alternateExpected.map(({ label, value }) => ({ label: String(label), value: String(value) }))) !== JSON.stringify(knownAlternateAnswers)) {
        throw new Error(`Second known-answer check failed. Expected ${JSON.stringify(knownAlternateAnswers)}; formula returned ${JSON.stringify(alternateExpected)}.`);
      }
      await form.getByRole("button", { name: "Calculate", exact: true }).click();
      await resultList.waitFor({ state: "visible", timeout: 5000 });
      const alternateActual = await visibleRows(form);
      const alternateExpectedPairs = alternateExpected.map(({ label, value }) => ({ label: String(label), value: String(value) }));
      if (JSON.stringify(alternateActual) !== JSON.stringify(alternateExpectedPairs)) {
        throw new Error(`Second valid result differs from calculator definition. Expected ${JSON.stringify(alternateExpectedPairs)}; received ${JSON.stringify(alternateActual)}.`);
      }
      if (alternateActual.some((row) => !row.value || /NaN|Infinity|undefined/i.test(row.value))) {
        throw new Error(`Second input produced an empty or non-finite result: ${JSON.stringify(alternateActual)}.`);
      }
      if (tool.id === "finance-irr-calculator") {
        await form.locator('[id="cashflows"]').fill("1, 2, 3");
        await form.getByRole("button", { name: "Calculate", exact: true }).click();
        const error = await form.locator('[role="alert"]').textContent();
        if (!/at least one negative and one positive/i.test(error ?? "")) {
          throw new Error("IRR accepted cash flows without both negative and positive values.");
        }
        await form.locator('[id="cashflows"]').fill("-100, 200, -100");
        await form.getByRole("button", { name: "Calculate", exact: true }).click();
        const multipleSignError = await form.locator('[role="alert"]').textContent();
        if (!/multiple sign changes/i.test(multipleSignError ?? "")) {
          throw new Error("IRR accepted cash flows with multiple sign changes and potentially ambiguous roots.");
        }
        result.irrInvalidCasesPassed = 2;
      }
      if (tool.id === "science-gas-law-calculator") {
        const gasIds = ["p1", "v1", "t1", "p2", "v2", "t2"];
        const submitGasValues = async (values) => {
          for (let index = 0; index < gasIds.length; index++) {
            await form.locator(`[id="${gasIds[index]}"]`).fill(values[index] ?? "");
          }
          await form.getByRole("button", { name: "Calculate", exact: true }).click();
          return (await form.locator('[role="alert"]').textContent()) ?? "";
        };
        const rejectsFour = /exactly five/i.test(await submitGasValues(["2", "3", "300", "4", "", ""]));
        const rejectsSix = /exactly five/i.test(await submitGasValues(["2", "3", "300", "4", "5", "350"]));
        const rejectsZero = /greater than 0/i.test(await submitGasValues(["0", "3", "300", "4", "5", ""]));
        if (!rejectsFour || !rejectsSix || !rejectsZero) {
          throw new Error(`Gas Law invalid-input checks failed (four=${rejectsFour}, six=${rejectsSix}, zero=${rejectsZero}).`);
        }
        result.invalidInputCasesPassed = 3;
      }
      result.ok = true;
      result.outputCount = alternateActual.length;
      result.validInputCases = 2;
      result.emptySubmissionRejected = true;
      tested++;
    } catch (error) {
      result.error = String(error?.message ?? error);
      failures.push(result);
    }
    if ((i + 1) % 25 === 0 || i + 1 === tools.length) {
      console.log(`Progress: ${i + 1}/${tools.length} calculator routes; passed ${tested}; failures ${failures.length}.`);
    }
  }

  const report = {
    baseUrl: base.origin,
    category,
    viewport: { width: viewportWidth, height: 844 },
    totalActive: tools.length,
    tested,
    passed: tested,
    failures,
    browserErrors,
    ok: failures.length === 0 && browserErrors.length === 0,
  };
  if (reportPath) {
    const destination = resolve(reportPath);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, `${JSON.stringify(report, null, 2)}\n`);
    report.reportPath = destination;
  }
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
} finally {
  await browser?.close();
  await vite.close();
}
