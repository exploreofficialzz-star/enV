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
const browser = await chromium.launch({ headless: true, executablePath: browserPath, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const page = await browser.newPage({ viewport: { width: 412, height: 915 }, permissions: [] });
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));

async function openTool(id) {
  const response = await page.goto(`${baseUrl}/tools/qr/${id}`, { waitUntil: "domcontentloaded", timeout: 20000 });
  if (!response || response.status() >= 400) throw new Error(`${id} returned HTTP ${response?.status() ?? "no response"}`);
  await page.waitForFunction((toolId) => document.documentElement.dataset.envToolHydrated === toolId, id, { timeout: 12000 });
}

async function makeQrImage(payload) {
  await openTool("qr-generator");
  await page.getByLabel("Text or URL", { exact: true }).fill(payload);
  await page.getByRole("button", { name: "Generate QR", exact: true }).click();
  const image = page.getByRole("img", { name: "Generated QR code" });
  await image.waitFor({ state: "visible", timeout: 12000 });
  const bytes = await image.evaluate(async (element) => {
    const response = await fetchelement.src;
    return Array.from(new Uint8Array(await response.arrayBuffer()));
  });
  return Buffer.from(bytes);
}

async function makeCode128Image(value) {
  await openTool("code128-barcode");
  await page.getByLabel("Value", { exact: true }).fill(value);
  await page.getByRole("button", { name: "Generate barcode", exact: true }).click();
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
  return Buffer.from(svg, "utf8");
}

async function scanFile(name, mimeType, buffer, expectedText, expectedFormat) {
  await openTool("qr-payload-inspector");
  await page.locator('input[aria-label="Upload QR or barcode image"]').setInputFiles({ name, mimeType, buffer });
  const result = page.locator('section[aria-labelledby="reader-results-heading"] article').first();
  await result.waitFor({ state: "visible", timeout: 12000 });
  const content = await result.innerText();
  if (!content.includes(expectedText)) throw new Error(`${name}: decoded content did not contain the expected payload.`);
  if (!content.includes(expectedFormat)) throw new Error(`${name}: expected format ${expectedFormat}, received: ${content.slice(0, 160)}`);
  return { file: name, expectedText, expectedFormat, passed: true };
}

let outcomes = [];
let failure = null;
try {
  const qrPayload = "https://example.com/env-qr-reader-audit?source=browser";
  const qrBytes = await makeQrImage(qrPayload);
  outcomes.push(await scanFile("env-reader-qr.png", "image/png", qrBytes, qrPayload, "QR Code"));

  const barcodeValue = "ENV-CODE128-READER-2026";
  const barcodeBytes = await makeCode128Image(barcodeValue);
  outcomes.push(await scanFile("env-reader-code128.svg", "image/svg+xml", barcodeBytes, barcodeValue, "Code 128"));

  if (pageErrors.length) throw new Error(`Browser runtime errors: ${pageErrors.join(" | ")}`);
} catch (error) {
  failure = error instanceof Error ? error.message : String(error);
} finally {
  await browser.close();
}

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
const report = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  tests: outcomes,
  passed: outcomes.filter((test) => test.passed).length,
  failed: failure ? 1 : 0,
  pageErrors,
  error: failure,
  ok: !failure && outcomes.length === 2,
};
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ ok: report.ok, passed: report.passed, failed: report.failed, reportPath, error: report.error }, null, 2));
if (!report.ok) process.exitCode = 1;
