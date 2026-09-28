#!/usr/bin/env node
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";
import { parseGeneratedCatalog } from "./catalog-reader.mjs";

function option(name) {
  const prefix = `--${name}=`;
  return process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

const category = "converters";
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

const MODE_COPY = {
  standard: "Instant conversion with a full unit comparison.",
  table: "Use one value as a reference across every supported unit.",
  quick: "Common conversions are one tap away.",
  comparison: "Compare the same value across the complete unit set.",
  reference: "Browse units and conversion factors before calculating.",
};

const KNOWN_ANSWERS = {
  length: { amount: "2", from: "m", to: "cm", expected: 200 },
  mass: { amount: "1", from: "kg", to: "g", expected: 1000 },
  weight: { amount: "1", from: "kg", to: "g", expected: 1000 },
  temperature: { amount: "32", from: "f", to: "c", expected: 0 },
  area: { amount: "1", from: "m2", to: "cm2", expected: 10000 },
  volume: { amount: "1", from: "l", to: "ml", expected: 1000 },
  speed: { amount: "1", from: "m-s", to: "km-h", expected: 3.6 },
  time: { amount: "1", from: "h", to: "min", expected: 60 },
  pressure: { amount: "1", from: "bar", to: "kpa", expected: 100 },
  energy: { amount: "1", from: "kwh", to: "j", expected: 3.6e6 },
  power: { amount: "1", from: "kw", to: "w", expected: 1000 },
  force: { amount: "1", from: "kgf", to: "n", expected: 9.80665 },
  frequency: { amount: "1", from: "khz", to: "hz", expected: 1000 },
  storage: { amount: "1", from: "KiB", to: "B", expected: 1024 },
  "data-transfer": { amount: "1", from: "kBps", to: "kbps", expected: 8 },
  angle: { amount: "180", from: "deg", to: "rad", expected: Math.PI },
  torque: { amount: "1", from: "nm", to: "lbf-ft", expected: 0.737562149277 },
  fuel: { amount: "1", from: "km-l", to: "l-100km", expected: 100 },
  "fuel-economy": { amount: "1", from: "km-l", to: "l-100km", expected: 100 },
  cooking: { amount: "1", from: "l", to: "ml", expected: 1000 },
  shoe: { amount: "40", from: "eu", to: "us-m", expected: 7 },
  clothing: { amount: "8", from: "scale", to: "us", expected: 14 },
  density: { amount: "1", from: "g-cm3", to: "kg-m3", expected: 1000 },
  "flow-rate": { amount: "1", from: "l-s", to: "l-min", expected: 60 },
  pixels: { amount: "1", from: "pt", to: "px", expected: 96 / 72 },
};

const TEXT_FIXTURES = {
  "csv-to-json": { name: "sample.csv", mimeType: "text/csv", text: "name,score\nAda,10\nGrace,20", expected: ['"name"', '"Ada"'], extension: ".json" },
  "json-to-csv": { name: "sample.json", mimeType: "application/json", text: '[{"name":"Ada","score":10},{"name":"Grace","score":20}]', expected: ["name,score", "Ada,10"], extension: ".csv" },
  "csv-to-tsv": { name: "sample.csv", mimeType: "text/csv", text: "name\tscore\nAda\t10", expected: ["name\tscore", "Ada\t10"], extension: ".tsv" },
  "tsv-to-csv": { name: "sample.tsv", mimeType: "text/tab-separated-values", text: "name\tscore\nAda\t10", expected: ["name,score", "Ada,10"], extension: ".csv" },
  "xml-to-json": { name: "sample.xml", mimeType: "application/xml", text: "<root><item>one</item><item>two</item></root>", expected: ['"root"', '"item"', '"one"'], extension: ".json" },
  "json-to-xml": { name: "sample.json", mimeType: "application/json", text: '{"item":"hello"}', expected: ["<?xml", "<root>", "<item>hello</item>"], extension: ".xml" },
  "yaml-to-json": { name: "sample.yaml", mimeType: "text/yaml", text: "name: Ada\nactive: true\nscore: 7", expected: ['"name": "Ada"', '"active": true', '"score": 7'], extension: ".json" },
  "json-to-yaml": { name: "sample.json", mimeType: "application/json", text: '{"name":"Ada","active":true}', expected: ['name: "Ada"', "active: true"], extension: ".yaml" },
  "txt-to-csv": { name: "sample.txt", mimeType: "text/plain", text: "Alpha\nBeta", expected: ["Alpha", "Beta"], extension: ".csv" },
  "csv-to-txt": { name: "sample.csv", mimeType: "text/csv", text: "first,last\nAda,Lovelace", expected: ["first last", "Ada Lovelace"], extension: ".txt" },
  "markdown-to-html": { name: "sample.md", mimeType: "text/markdown", text: "# Heading\n\n**bold**", expected: ["<h1>Heading</h1>", "<strong>bold</strong>"], extension: ".html" },
  "html-to-markdown": { name: "sample.html", mimeType: "text/html", text: "<h1>Heading</h1><p>Hello</p>", expected: ["# Heading", "Hello"], extension: ".md" },
};

const IMAGE_OPS = new Set(["jpg-to-png", "png-to-jpg", "png-to-webp", "webp-to-png", "jpg-to-webp", "webp-to-jpg", "svg-to-png", "png-to-svg"]);
const IMAGE_INPUT = {
  "jpg-to-png": { mimeType: "image/jpeg", extension: ".jpg" },
  "png-to-jpg": { mimeType: "image/png", extension: ".png" },
  "png-to-webp": { mimeType: "image/png", extension: ".png" },
  "webp-to-png": { mimeType: "image/webp", extension: ".webp" },
  "jpg-to-webp": { mimeType: "image/jpeg", extension: ".jpg" },
  "webp-to-jpg": { mimeType: "image/webp", extension: ".webp" },
  "svg-to-png": { mimeType: "image/svg+xml", extension: ".svg" },
  "png-to-svg": { mimeType: "image/png", extension: ".png" },
};
const OUTPUT_EXT = {
  "jpg-to-png": ".png", "png-to-jpg": ".jpg", "png-to-webp": ".webp", "webp-to-png": ".png",
  "jpg-to-webp": ".webp", "webp-to-jpg": ".jpg", "svg-to-png": ".png", "png-to-svg": ".svg",
  "csv-to-json": ".json", "json-to-csv": ".csv", "csv-to-tsv": ".tsv", "tsv-to-csv": ".csv",
  "xml-to-json": ".json", "json-to-xml": ".xml", "yaml-to-json": ".json", "json-to-yaml": ".yaml",
  "txt-to-csv": ".csv", "csv-to-txt": ".txt", "markdown-to-html": ".html", "html-to-markdown": ".md",
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function near(actual, expected, tolerance = Math.max(1e-10, Math.abs(expected) * 1e-9)) {
  return Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance;
}

async function downloadResult(page, expectedExtension) {
  const button = page.getByRole("button", { name: /^Download / });
  await button.waitFor({ state: "visible", timeout: 5000 });
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 10000 }), button.click()]);
  const filename = download.suggestedFilename();
  assert(filename.toLowerCase().endsWith(expectedExtension), `Wrong download extension: ${filename}; expected ${expectedExtension}.`);
  const filePath = await download.path();
  assert(filePath, "Browser did not produce a downloadable file.");
  const bytes = await readFile(filePath);
  assert(bytes.length > 0, "Downloaded output file is empty.");
  return { filename, bytes };
}

async function makeCanvasImage(page, mimeType, extension) {
  const data = await page.evaluate(async (mime) => {
    const canvas = document.createElement("canvas");
    canvas.width = 2;
    canvas.height = 2;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable in this browser.");
    context.fillStyle = "#d52b1e";
    context.fillRect(0, 0, 2, 2);
    const blob = await new Promise((resolveBlob) => canvas.toBlob(resolveBlob, mime, 0.92));
    if (!blob || blob.type !== mime) throw new Error(`Browser could not generate a ${mime} test image.`);
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  }, mimeType);
  return { name: `sample${extension}`, mimeType, buffer: Buffer.from(data) };
}

async function testConverter(page, tool, engine, unitModule, result) {
  const mode = engine.mode ?? "standard";
  const system = engine.system;
  assert(Object.hasOwn(MODE_COPY, mode), `Unsupported converter mode: ${mode}.`);
  const modeCopy = page.getByText(MODE_COPY[mode], { exact: true });
  await modeCopy.waitFor({ state: "visible", timeout: 3000 });

  if (system === "paper") {
    const paperCount = Object.keys(unitModule.paperSizes).length;
    if (mode === "standard") {
      const selector = page.getByRole("combobox", { name: "Paper size" });
      await selector.selectOption("letter");
      assert((await page.locator("body").innerText()).includes("216 × 279 mm"), "Selecting US Letter did not show its dimensions.");
    } else if (mode === "table") {
      const rows = await page.locator("table tbody tr").count();
      assert(rows === paperCount, `Paper table has ${rows} rows; expected ${paperCount}.`);
    } else if (mode === "quick") {
      await page.getByRole("button", { name: "A3", exact: true }).click();
      assert((await page.locator('[role="status"]').innerText()).includes("297 × 420 mm"), "Paper quick selection did not update to A3 dimensions.");
    } else if (mode === "comparison") {
      await page.getByRole("combobox", { name: "First paper size" }).selectOption("a4");
      await page.getByRole("combobox", { name: "Second paper size" }).selectOption("letter");
      assert((await page.locator("table tbody").innerText()).includes("210"), "Paper comparison is missing A4 dimensions.");
      assert((await page.locator("table tbody").innerText()).includes("216"), "Paper comparison is missing Letter dimensions.");
    } else {
      const body = await page.locator("body").innerText();
      assert(body.includes("A4") && body.includes("US Letter"), "Paper reference list is missing common standards.");
    }
    result.mode = mode;
    result.paperDimensionsPassed = true;
    return;
  }

  if (system === "dpi") {
    if (mode === "reference") {
      assert((await page.locator("body").innerText()).includes("Print width (in) = pixels ÷ DPI"), "DPI reference is missing the conversion formula.");
      result.mode = mode;
      result.dpiReferencePassed = true;
      return;
    }
    const pixels = page.locator("#dpi-pixels");
    const width = page.locator("#dpi-inches");
    const dpi = page.locator("#dpi-value");
    await pixels.fill("2400");
    await dpi.fill("300");
    assert(await width.inputValue() === "8", `2400 pixels at 300 DPI should be 8 inches; received ${await width.inputValue()}.`);
    await width.fill("8");
    assert(await pixels.inputValue() === "2400", `8 inches at 300 DPI should be 2400 pixels; received ${await pixels.inputValue()}.`);
    if (mode === "quick") {
      await page.getByRole("button", { name: "150 DPI", exact: true }).click();
      assert(await dpi.inputValue() === "150", "DPI quick preset did not update the resolution.");
      assert(await pixels.inputValue() === "1200", "DPI quick preset did not recalculate pixels from the print width.");
    } else if (mode === "table") {
      assert(await page.locator("table tbody tr").count() === 5, "DPI reference table should include five common resolutions.");
    } else if (mode === "comparison") {
      assert((await page.locator("table caption").innerText()).includes("2400 pixels"), "DPI comparison is not tied to the selected pixel count.");
    }
    await dpi.fill("0");
    assert(/greater than 0/i.test((await page.locator('[role="alert"]').textContent()) ?? ""), "Zero DPI was not rejected accessibly.");
    result.mode = mode;
    result.dpiConversionPassed = true;
    return;
  }

  const units = unitModule.systems[system]?.units;
  assert(units?.length >= 2, `Unknown or incomplete unit system: ${system}.`);
  if (mode === "reference") {
    const baseFactorCount = await page.getByText(/Base factor:/).count();
    assert(baseFactorCount === units.length, `Reference page has ${baseFactorCount} unit cards; expected ${units.length}.`);
    result.mode = mode;
    result.referenceUnitsPassed = units.length;
    return;
  }

  const quickButtons = page.locator("button").filter({ hasText: "→" });
  if (mode === "quick") {
    assert(await quickButtons.count() > 0, "Quick mode has no quick-conversion buttons.");
  }
  if (mode === "comparison") {
    assert((await page.locator("table caption").innerText()).includes("Complete comparison"), "Comparison mode lacks its complete-comparison table.");
  }
  assert(await page.locator("#from-amount").count() === 1, `${mode} mode is missing its input control.`);

  const testCase = KNOWN_ANSWERS[system] ?? { amount: "2", from: units[0].id, to: units[1].id };
  assert(units.some((unit) => unit.id === testCase.from) && units.some((unit) => unit.id === testCase.to), `Known-answer units are not defined for ${system}.`);
  const fromSelect = page.getByRole("combobox", { name: "From unit" });
  const toSelect = page.getByRole("combobox", { name: "To unit" });
  const amountInput = page.locator("#from-amount");
  await amountInput.fill(testCase.amount);
  await fromSelect.selectOption(testCase.from);
  await toSelect.selectOption(testCase.to);
  const expected = unitModule.convert(system, Number(testCase.amount), testCase.from, testCase.to);
  assert(Number.isFinite(expected), `Known conversion produced a non-finite value for ${system}.`);
  if (testCase.expected !== undefined) assert(near(expected, testCase.expected), `${system} reference mismatch: expected ${testCase.expected}; engine returned ${expected}.`);
  const text = `${testCase.amount} ${testCase.from} = ${unitModule.formatUnitValue(expected)} ${testCase.to}`;
  await page.getByText(text, { exact: true }).waitFor({ state: "visible", timeout: 3000 });

  if (mode === "quick") {
    const pair = units.slice(0, Math.min(units.length, 8)).flatMap((unit, index) => units.slice(index + 1, Math.min(units.length, index + 3)).map((other) => [unit, other])).slice(0, 8)[0];
    await quickButtons.first().click();
    assert(await fromSelect.inputValue() === pair[0].id && await toSelect.inputValue() === pair[1].id, "Quick-pair button did not update the unit selectors.");
  } else if (mode === "standard") {
    const swap = page.getByRole("button", { name: "Swap units" });
    await swap.click();
    assert(await fromSelect.inputValue() === testCase.to && await toSelect.inputValue() === testCase.from, "Swap button did not reverse the units.");
    const reverse = unitModule.convert(system, Number(testCase.amount), testCase.to, testCase.from);
    const reverseText = `${testCase.amount} ${testCase.to} = ${unitModule.formatUnitValue(reverse)} ${testCase.from}`;
    await page.getByText(reverseText, { exact: true }).waitFor({ state: "visible", timeout: 3000 });
    await fromSelect.selectOption(testCase.from);
    await toSelect.selectOption(testCase.to);
    const save = page.getByRole("button", { name: "Save conversion" });
    await save.click();
    assert((await page.locator("body").innerText()).includes("Recent conversions"), "Saved conversion did not appear in history.");
    await amountInput.fill("999");
    const historyItem = page.getByRole("button").filter({ hasText: `${testCase.amount} → ${unitModule.formatUnitValue(expected)}` }).first();
    await historyItem.click();
    assert(await amountInput.inputValue() === testCase.amount, "Selecting conversion history did not restore its input value.");
  }

  await amountInput.fill("not-a-number");
  assert(/valid number/i.test((await page.locator('[role="alert"]').textContent()) ?? ""), "Invalid text input was not rejected accessibly.");
  await amountInput.fill("");
  assert(!(await page.locator("body").innerText()).includes("NaN"), "Blank amount rendered NaN.");
  assert(!(await page.locator("body").innerText()).includes("Infinity"), "Blank amount rendered Infinity.");

  const inverseUnit = units.find((unit) => unit.inverse);
  if (inverseUnit) {
    await fromSelect.selectOption(inverseUnit.id);
    await toSelect.selectOption(units.find((unit) => unit.id !== inverseUnit.id).id);
    await amountInput.fill("0");
    assert(/cannot be converted|greater than 0/i.test((await page.locator('[role="alert"]').textContent()) ?? ""), `${inverseUnit.label} accepted zero without an accessible conversion error.`);
    result.inverseZeroRejected = true;
  }
  result.mode = mode;
  result.validConversionPassed = true;
  result.knownReferenceChecked = testCase.expected !== undefined;
}

async function testFileConverter(page, tool, engine, imageFixtures, result) {
  const op = engine.op;
  const fileInput = page.locator('input[type="file"]');
  assert(await fileInput.count() === 1, `${op} is missing its file input.`);
  assert(await page.getByRole("button", { name: "Convert", exact: true }).isDisabled(), `${op} should disable Convert until a file is selected.`);
  let upload;
  let expectedText = [];
  if (IMAGE_OPS.has(op)) {
    const { mimeType, extension } = IMAGE_INPUT[op];
    if (op === "svg-to-png") {
      upload = { name: `sample${extension}`, mimeType, buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="#d52b1e"/></svg>') };
    } else {
      upload = imageFixtures[mimeType];
      upload = { ...upload, name: `sample${extension}` };
    }
  } else {
    const fixture = TEXT_FIXTURES[op];
    assert(fixture, `No valid fixture is defined for file-converter operation ${op}.`);
    upload = { name: fixture.name, mimeType: fixture.mimeType, buffer: Buffer.from(fixture.text) };
    expectedText = fixture.expected;
  }

  await fileInput.setInputFiles(upload);
  await page.getByRole("button", { name: "Convert", exact: true }).click();
  const downloadButton = page.getByRole("button", { name: /^Download / });
  await downloadButton.waitFor({ state: "visible", timeout: 5000 });
  let preview = "";
  if (await page.locator("pre").count()) preview = await page.locator("pre").first().innerText();
  for (const expected of expectedText) assert(preview.includes(expected), `${op} output is missing expected text ${JSON.stringify(expected)}.`);
  if (op === "png-to-svg") assert(preview.includes("<svg") && preview.includes("data:image/png;base64"), "PNG-to-SVG did not embed the PNG in an SVG wrapper.");
  const { filename, bytes } = await downloadResult(page, OUTPUT_EXT[op]);
  if (filename.endsWith(".png")) assert(bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), `${op} did not produce a valid PNG signature.`);
  if (filename.endsWith(".jpg")) assert(bytes[0] === 0xff && bytes[1] === 0xd8, `${op} did not produce a valid JPEG signature.`);
  if (filename.endsWith(".webp")) assert(bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP", `${op} did not produce a valid WebP signature.`);
  if (filename.endsWith(".svg")) assert(bytes.toString("utf8", 0, 4) === "<svg", `${op} did not produce an SVG file.`);

  if (["json-to-csv", "json-to-xml", "json-to-yaml"].includes(op) || op === "xml-to-json") {
    const invalid = op === "xml-to-json" ? "<root>" : "{\"invalid\":";
    const extension = op === "xml-to-json" ? ".xml" : ".json";
    const mimeType = op === "xml-to-json" ? "application/xml" : "application/json";
    await fileInput.setInputFiles({ name: `invalid${extension}`, mimeType, buffer: Buffer.from(invalid) });
    await page.getByRole("button", { name: "Convert", exact: true }).click();
    const error = (await page.locator('[role="alert"]').textContent()) ?? "";
    assert(error.trim().length > 0, `${op} did not show an accessible error for malformed input.`);
    assert(await page.getByRole("button", { name: /^Download / }).count() === 0, `${op} exposed a downloadable result after malformed input.`);
  }
  result.fileConversionPassed = true;
  result.downloadName = filename;
  result.downloadBytes = bytes.length;
}

async function testNumberBaseCodec(page, result) {
  await page.getByLabel("From base").fill("10");
  await page.getByLabel("To base").fill("16");
  await page.locator("#codec-in").fill("255");
  await page.getByRole("button", { name: "Convert", exact: true }).click();
  assert((await page.locator("pre").innerText()).trim() === "ff", "Number Base Converter did not convert 255 (base 10) to ff (base 16).");
  await page.locator("#codec-in").fill("12z");
  await page.getByRole("button", { name: "Convert", exact: true }).click();
  const error = (await page.locator('[role="alert"]').textContent()) ?? "";
  assert(/invalid number/i.test(error), "Number Base Converter accepted invalid base-10 digits.");
  result.numberBaseConversionPassed = true;
  result.invalidDigitsRejected = true;
}

async function waitForAppHydration(page) {
  const themeToggle = page.locator('button[aria-label="Switch to dark mode"], button[aria-label="Switch to light mode"]');
  await themeToggle.waitFor({ state: "visible", timeout: 10000 });
  const originalLabel = await themeToggle.getAttribute("aria-label");
  assert(originalLabel === "Switch to dark mode" || originalLabel === "Switch to light mode", "Theme toggle did not render with an accessible state.");
  const alternateLabel = originalLabel === "Switch to dark mode" ? "Switch to light mode" : "Switch to dark mode";
  let hydrated = false;

  for (let attempt = 0; attempt < 20; attempt++) {
    if ((await themeToggle.getAttribute("aria-label")) === alternateLabel) {
      hydrated = true;
      break;
    }
    await themeToggle.click();
    try {
      await page.locator(`button[aria-label="${alternateLabel}"]`).waitFor({ state: "visible", timeout: 250 });
      hydrated = true;
      break;
    } catch {
      await page.waitForTimeout(50);
    }
  }
  assert(hydrated, "React hydration did not activate the theme control within the retry window.");
  await page.locator(`button[aria-label="${alternateLabel}"]`).click();
  await page.locator(`button[aria-label="${originalLabel}"]`).waitFor({ state: "visible", timeout: 3000 });
}

async function testSharedToolUi(page, width, result) {
  assert(await page.getByRole("heading", { name: "How to use", exact: true }).count() === 0, "Tool page still shows a How to use section.");
  assert(await page.getByRole("heading", { name: "Frequently asked questions", exact: true }).count() === 0, "Tool page still shows a Frequently asked questions section.");
  assert(await page.getByRole("heading", { name: "What this tool does", exact: true }).count() === 1, "Tool description section is missing.");

  const headerFavorites = page.locator('a[aria-label="Favorites"]');
  assert(await headerFavorites.count() === 1, "Header Favorites control is missing.");
  const mobileNav = page.getByRole("navigation", { name: "Mobile" });
  const savedTab = mobileNav.getByRole("link", { name: "Saved", exact: true });
  if (width < 768) {
    assert(!(await headerFavorites.isVisible()), "Duplicate header Favorites control is visible on mobile.");
    assert(await mobileNav.isVisible() && await savedTab.isVisible(), "Mobile Saved navigation tab is missing.");
  } else {
    assert(await headerFavorites.isVisible(), "Desktop header Favorites control should remain visible.");
    assert(!(await mobileNav.isVisible()), "Mobile navigation should be hidden at desktop width.");
  }
  result.sharedToolUiPassed = true;
}

const allTools = parseGeneratedCatalog(readFileSync(new URL("../src/data/catalog.ts", import.meta.url), "utf8"));
const tools = allTools
  .filter((tool) => tool.category === category && tool.status === "active" && (!onlyIds || onlyIds.includes(tool.id)))
  .slice(0, Number.isFinite(limit) ? limit : undefined);
if (!tools.length) throw new Error("No active converter tools found.");
if (onlyIds) {
  const found = new Set(tools.map((tool) => tool.id));
  const missing = onlyIds.filter((id) => !found.has(id));
  if (missing.length) throw new Error(`Unknown active converter tool IDs: ${missing.join(", ")}`);
}

const vite = await createServer({ configFile: "vite.config.ts", server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "error" });
let browser;
try {
  const unitModule = await vite.ssrLoadModule("/src/lib/engines/units.ts");
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium", args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const context = await browser.newContext({ viewport: { width: viewportWidth, height: 844 }, acceptDownloads: true });
  const page = await context.newPage();
  const browserErrors = [];
  let currentTool = "category index";
  page.on("pageerror", (error) => browserErrors.push({ tool: currentTool, type: "pageerror", message: error.message }));
  page.on("console", (message) => { if (message.type() === "error") browserErrors.push({ tool: currentTool, type: "console", message: message.text() }); });

  const failures = [];
  const results = [];
  let tested = 0;
  let completed = 0;
  const destination = reportPath ? resolve(reportPath) : null;
  function makeReport(finished = false) {
    return {
      baseUrl: base.origin,
      category,
      viewport: { width: viewportWidth, height: 844 },
      totalActive: tools.length,
      completed,
      tested,
      passed: tested,
      finished,
      results,
      failures,
      browserErrors,
      ok: finished && completed === tools.length && failures.length === 0 && browserErrors.length === 0,
      ...(destination ? { reportPath: destination } : {}),
    };
  }
  function persistReport(finished = false) {
    const report = makeReport(finished);
    if (destination) {
      mkdirSync(dirname(destination), { recursive: true });
      const temporary = `${destination}.${process.pid}.tmp`;
      writeFileSync(temporary, `${JSON.stringify(report, null, 2)}\n`);
      renameSync(temporary, destination);
    }
    return report;
  }

  persistReport();
  const indexResponse = await page.goto(new URL("/tools/converters", base).href, { waitUntil: "load", timeout: 30000 });
  const indexHeading = (await page.locator("h1").first().textContent())?.trim() ?? "";
  if (!indexResponse?.ok() || !indexHeading) failures.push({ type: "category-index", status: indexResponse?.status() ?? 0, heading: indexHeading });
  persistReport();

  const imageFixtures = {};
  for (const mimeType of ["image/png", "image/jpeg", "image/webp"]) {
    imageFixtures[mimeType] = await makeCanvasImage(page, mimeType, mimeType === "image/jpeg" ? ".jpg" : mimeType === "image/webp" ? ".webp" : ".png");
  }

  for (let index = 0; index < tools.length; index++) {
    const tool = tools[index];
    currentTool = tool.id;
    const engine = tool.engine ?? {};
    const url = new URL(`/tools/converters/${encodeURIComponent(tool.slug)}`, base).href;
    const result = { id: tool.id, name: tool.name, slug: tool.slug, engine, url, ok: false };
    try {
      const response = await page.goto(url, { waitUntil: "load", timeout: 30000 });
      assert(response?.ok(), `Detail route returned HTTP ${response?.status() ?? 0}.`);
      const heading = (await page.locator("h1").first().textContent())?.trim() ?? "";
      assert(heading === tool.name, `Expected heading "${tool.name}", received "${heading}".`);
      await waitForAppHydration(page);
      await testSharedToolUi(page, viewportWidth, result);
      if (engine.type === "converter") await testConverter(page, tool, engine, unitModule, result);
      else if (engine.type === "file-converter") await testFileConverter(page, tool, engine, imageFixtures, result);
      else if (engine.type === "codec" && engine.op === "base-convert") await testNumberBaseCodec(page, result);
      else throw new Error(`Unsupported converter category engine: ${engine.type}/${engine.op ?? engine.system ?? ""}.`);
      result.ok = true;
      tested++;
    } catch (error) {
      result.error = String(error?.message ?? error);
      failures.push(result);
    }
    results.push(result);
    completed = index + 1;
    persistReport();
    if ((index + 1) % 20 === 0 || index + 1 === tools.length) {
      console.log(`Progress: ${index + 1}/${tools.length} converter tools; passed ${tested}; failures ${failures.length}.`);
    }
  }

  const report = persistReport(true);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
} finally {
  await browser?.close();
  await vite.close();
}
