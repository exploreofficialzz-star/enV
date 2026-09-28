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
  "science-ohms-law-calculator": { voltage: "12", current: "2", resistance: "" },
  "finance-gross-profit-calculator": { revenue: "100", cogs: "60" },
  "finance-contribution-margin-calculator": { sales: "100", variableCosts: "60" },
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
  .filter((tool) => tool.category === category && tool.status === "active")
  .slice(0, Number.isFinite(limit) ? limit : undefined);
if (!tools.length) throw new Error(`No active tools found for category "${category}".`);

const vite = await createServer({
  configFile: "vite.config.ts",
  server: { middlewareMode: true },
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
      result.ok = true;
      result.outputCount = actual.length;
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
