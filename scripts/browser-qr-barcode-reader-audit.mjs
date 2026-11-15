#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name, fallback) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const baseUrl = arg("base-url", "http://127.0.0.1:8080").replace(/\/$/, "");
const reportPath = arg("report", path.join(root, "qa-results/qr-barcode-reader-audit.json"));
const browserPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || "/usr/bin/chromium";
const launchOptions = { headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] };
if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) launchOptions.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
else if (fs.existsSync(browserPath)) launchOptions.executablePath = browserPath;
const browser = await chromium.launch(launchOptions);
const page = await browser.newPage({ viewport: { width: 412, height: 915 }, permissions: [] });
const pageErrors = [];
const toolResults = new Map();
let activeToolId = null;
let activeFailureCheck = "routeRendering";

function recordToolCheck(toolId, check, status, note = "") {
  const item = toolResults.get(toolId) ?? { toolId, checks: [], blockedChecks: [], notes: [] };
  const target = status === "passed" ? item.checks : item.blockedChecks;
  if (!target.includes(check)) target.push(check);
  if (note) item.notes.push(note);
  toolResults.set(toolId, item);
}
page.on("pageerror", (error) => pageErrors.push(error.message));

async function openTool(id) {
  activeToolId = id;
  activeFailureCheck = "routeRendering";
  const response = await page.goto(`${baseUrl}/tools/qr/${id}`, { waitUntil: "domcontentloaded", timeout: 20000 });
  if (!response || response.status() >= 400) throw new Error(`${id} returned HTTP ${response?.status() ?? "no response"}`);
  await page.waitForFunction((toolId) => document.documentElement.dataset.envToolHydrated === toolId, id, { timeout: 12000 });
  recordToolCheck(id, "routeRendering", "passed", "Tool route returned a successful response and hydrated with the expected stable tool ID.");
}

async function makeQrImage(payload) {
  await openTool("qr-generator");
  activeFailureCheck = "interactionExecution";
  await page.getByLabel("Text or URL", { exact: true }).fill(payload);
  await page.getByRole("button", { name: "Generate QR", exact: true }).click();
  recordToolCheck("qr-generator", "interactionExecution", "passed", "Entered a payload and executed Generate QR.");
  activeFailureCheck = "outputValidation";
  const image = page.getByRole("img", { name: "Generated QR code" });
  await image.waitFor({ state: "visible", timeout: 12000 });
  const bytes = await image.evaluate(async (element) => {
    const response = await fetch(element.src);
    return Array.from(new Uint8Array(await response.arrayBuffer()));
  });
  if (!bytes.length) throw new Error("QR Generator produced an empty image.");
  recordToolCheck("qr-generator", "outputValidation", "passed", "Generated QR image bytes were retrieved from the rendered output.");
  return Buffer.from(bytes);
}

async function makeCode128Image(value) {
  await openTool("code128-barcode");
  activeFailureCheck = "interactionExecution";
  await page.getByLabel("Value", { exact: true }).fill(value);
  await page.getByRole("button", { name: "Generate barcode", exact: true }).click();
  recordToolCheck("code128-barcode", "interactionExecution", "passed", "Entered a Code 128 value and executed Generate barcode.");
  activeFailureCheck = "outputValidation";
  const barcode = page.locator("div.overflow-x-auto svg").first();
  await barcode.waitFor({ state: "visible", timeout: 12000 });
  const svg = await barcode.evaluate((element) => {
    const clone = element.cloneNode(true);
    const background = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    background.setAttribute("width", "100%");
    background.setAttribute("height", "100%");
    background.setAttribute("fill", "#ffffff");
    clone.insertBefore(background, clone.firstChild);
    return new XMLSerializer().serializeToString(clone);
  });
  if (!svg.includes("<svg")) throw new Error("Code 128 generator did not return an SVG image.");
  recordToolCheck("code128-barcode", "outputValidation", "passed", "Generated Code 128 SVG output is present.");
  return Buffer.from(svg, "utf8");
}

async function scanFile(name, mimeType, buffer, expectedItems) {
  await openTool("qr-payload-inspector");
  activeFailureCheck = "fileImportExport";
  const uploadInput = page.locator('section[aria-labelledby="reader-upload-heading"] input[type="file"]');
  if (await uploadInput.count() !== 1) throw new Error("The reader image upload control was not available.");
  await uploadInput.setInputFiles({ name, mimeType, buffer });
  recordToolCheck("qr-payload-inspector", "interactionExecution", "passed", "Selected a local image through the reader's labelled upload section.");
  recordToolCheck("qr-payload-inspector", "fileImportExport", "passed", "Imported a local image fixture for on-device decoding.");
  activeFailureCheck = "outputValidation";

  // Upload decoding is asynchronous. Waiting for the results section alone is
  // insufficient because earlier scans can leave that section visible before
  // the newly uploaded file has finished decoding.
  for (const expected of expectedItems) {
    await page.getByText(expected.text, { exact: true }).waitFor({ state: "visible", timeout: 12000 })
      .catch(() => { throw new Error(`${name}: uploaded-image scan did not display ${expected.text}.`); });
  }

  const results = page.locator('section[aria-labelledby="reader-results-heading"] article');
  const content = (await results.allInnerTexts()).join("\\n");
  for (const expected of expectedItems) {
    if (!content.includes(expected.text)) throw new Error(`${name}: decoded content did not contain ${expected.text}.`);
    if (!content.includes(expected.format)) throw new Error(`${name}: expected format ${expected.format}, received: ${content.slice(0, 200)}`);
  }
  recordToolCheck("qr-payload-inspector", "outputValidation", "passed", "Decoded payload text and format matched the generated QR/barcode fixture.");
  return { file: name, expectedItems, passed: true };
}

async function combineQrAndBarcode(qrBytes, barcodeSvgBytes) {
  const base64 = await page.evaluate(async ({ qrDataUrl, svgMarkup }) => {
    const load = (src) => new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Could not render a fixture code."));
      image.src = src;
    });
    const [qr, barcode] = await Promise.all([
      load(qrDataUrl),
      load(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`),
    ]);
    const gap = 24;
    const canvas = document.createElement("canvas");
    // Left margin + inter-code gap + right margin are all 24px.
    canvas.width = qr.naturalWidth + barcode.naturalWidth + gap * 3;
    canvas.height = Math.max(qr.naturalHeight, barcode.naturalHeight) + gap * 2;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not create a combined barcode fixture.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(qr, gap, gap);
    context.drawImage(barcode, qr.naturalWidth + gap * 2, gap);
    return canvas.toDataURL("image/png").split(",")[1];
  }, {
    qrDataUrl: `data:image/png;base64,${qrBytes.toString("base64")}`,
    svgMarkup: barcodeSvgBytes.toString("utf8"),
  });
  return Buffer.from(base64, "base64");
}

let outcomes = [];
let failure = null;
try {
  const qrPayload = "https://example.com/env-qr-reader-audit?source=browser";
  const qrBytes = await makeQrImage(qrPayload);
  outcomes.push(await scanFile("env-reader-qr.png", "image/png", qrBytes, [
    { text: qrPayload, format: "QR Code" },
  ]));

  const barcodeValue = "ENV-CODE128-READER-2026";
  const barcodeBytes = await makeCode128Image(barcodeValue);
  outcomes.push(await scanFile("env-reader-code128.svg", "image/svg+xml", barcodeBytes, [
    { text: barcodeValue, format: "Code 128" },
  ]));

  const batchQrPayload = "https://example.com/env-qr-reader-batch?source=browser";
  const batchQrBytes = await makeQrImage(batchQrPayload);
  const batchBarcodeValue = "ENV-BATCH-CODE128-2026";
  const batchBarcodeBytes = await makeCode128Image(batchBarcodeValue);
  const combinedBytes = await combineQrAndBarcode(batchQrBytes, batchBarcodeBytes);
  outcomes.push(await scanFile("env-reader-multiple-codes.png", "image/png", combinedBytes, [
    { text: batchQrPayload, format: "QR Code" },
    { text: batchBarcodeValue, format: "Code 128" },
  ]));

  activeToolId = "qr-payload-inspector";
  activeFailureCheck = "routeRendering";
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => document.documentElement.dataset.envToolHydrated === "qr-payload-inspector",
    null,
    { timeout: 12000 },
  );
  await page.getByText(qrPayload, { exact: true }).waitFor({ state: "visible", timeout: 8000 });
  await page.getByText(barcodeValue, { exact: true }).waitFor({ state: "visible", timeout: 8000 });
  activeFailureCheck = "persistenceSample";
  recordToolCheck("qr-payload-inspector", "persistenceSample", "passed", "Previously scanned QR and Code 128 values were restored after a page reload.");
  outcomes.push({
    file: "browser-local-history",
    expectedText: [qrPayload, barcodeValue, batchQrPayload, batchBarcodeValue],
    expectedFormat: "restored after reload",
    passed: true,
  });

  if (pageErrors.length) {
    activeFailureCheck = "runtimeErrorCheck";
    throw new Error(`Browser runtime errors: ${pageErrors.join(" | ")}`);
  }
  for (const id of ["qr-generator", "code128-barcode", "qr-payload-inspector"]) {
    recordToolCheck(id, "runtimeErrorCheck", "passed", "No uncaught browser page errors were observed during the completed audit.");
  }
} catch (error) {
  failure = error instanceof Error ? error.message : String(error);
  if (activeToolId) recordToolCheck(activeToolId, activeFailureCheck, "blocked", failure);
} finally {
  await browser.close();
}

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
const report = {
  generatedAt: new Date().toISOString(),
  observedCommit: process.env.GITHUB_SHA ?? null,
  workflowRunId: process.env.GITHUB_RUN_ID ? Number(process.env.GITHUB_RUN_ID) : null,
  baseUrl,
  tests: outcomes,
  toolResults: [...toolResults.values()].map((item) => ({ ...item, status: item.blockedChecks.length ? "blocked" : "passed" })),
  passed: outcomes.filter((test) => test.passed).length,
  failed: failure ? 1 : 0,
  pageErrors,
  error: failure,
  ok: !failure && outcomes.length === 4,
};
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ ok: report.ok, passed: report.passed, failed: report.failed, reportPath, error: report.error }, null, 2));
if (!report.ok) process.exitCode = 1;
