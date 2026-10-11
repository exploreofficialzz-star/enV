#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name, fallback) => process.argv.find((x) => x.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const baseUrl = arg("base-url", "http://127.0.0.1:8080").replace(/\/$/, "");
const reportPath = arg("report", path.join(root, "qa-results/qr-barcode-audit.json"));
const concurrency = Math.max(1, Math.min(6, Number(arg("concurrency", "3")) || 3));
const catalog = JSON.parse(fs.readFileSync(path.join(root, "apps/shared/catalog.json"), "utf8"));
const allTools = catalog.tools ?? catalog;
const tools = allTools.filter((tool) => tool.status === "active" && ["qr", "barcode"].includes(tool.engine?.type));
const failures = [];
let next = 0;

async function fill(page, label, value, select = false) {
  const control = page.getByLabel(label, { exact: true }).first();
  await control.waitFor({ state: "visible", timeout: 5000 });
  if (select || await control.evaluate((el) => el.tagName.toLowerCase() === "select")) await control.selectOption(value);
  else await control.fill(value);
}

async function prepareQr(page, tool) {
  const preset = tool.engine.preset;
  const f = (label, value, select = false) => fill(page, label, value, select);
  switch (preset) {
    case "url": await f("URL", "https://example.com/enV-qr-test"); break;
    case "wifi": await f("Network name (SSID)", "enV Audit WiFi"); await f("Password", "audit-password-123"); await f("Security", "WPA", true); await f("Hidden network", "false", true); break;
    case "whatsapp": await f("Phone with country code", "15555550123"); await f("Message", "QR audit"); break;
    case "email": await f("Email", "qa@example.com"); await f("Subject", "QR audit"); await f("Message", "Test message"); break;
    case "phone": await f("Phone", "+15555550123"); break;
    case "sms": await f("Phone", "+15555550123"); await f("Message", "QR audit"); break;
    case "vcard": await f("Name", "QA Tester"); await f("Phone", "+15555550123"); await f("Email", "qa@example.com"); await f("Organization", "enV QA"); break;
    case "mecard": await f("Name", "QA Tester"); await f("Phone", "+15555550123"); await f("Email", "qa@example.com"); break;
    case "geo": await f("Latitude", "37.7749"); await f("Longitude", "-122.4194"); break;
    case "event": case "calendar": await f("Title", "QA event"); await f("Start (YYYYMMDDTHHMMSS)", "20261011T100000"); await f("End (YYYYMMDDTHHMMSS)", "20261011T110000"); await f("Location", "Test venue"); break;
    case "bitcoin": await f("Bitcoin address", "bc1qexampleauditaddress"); await f("Amount (optional BTC)", "0.1"); await f("Label", "enV QA"); break;
    case "ethereum": case "crypto": await f("Ethereum address", "0x1234567890abcdef").catch(() => f("Wallet address", "0x1234567890abcdef")); break;
    case "text": await f("Text or URL", "enV QR tool audit"); break;
    case "high-error": case "low-error": await f("Text or URL", "enV QR correction audit"); break;
    case "styled": await f("Text or URL", "enV styled QR audit"); break;
    case "data-url": await f("Text or URL", "enV data URL audit"); break;
    case "svg": await f("Text or URL", "enV SVG audit"); break;
    case "batch": await f("One value per line", "first audit value\nsecond audit value"); break;
    case "payload": await f("Payload type", "email", true); await f("Primary value", "qa@example.com"); await f("Secondary value", "Audit subject"); await f("Third value", "Audit body"); break;
    case "inspect": await f("QR payload", "https://example.com/audit"); break;
    case "size": await f("QR modules", "21"); await f("Module size (px)", "4"); break;
    case "version": await f("Error correction", "M", true); await f("Payload", "hello QR version"); break;
    case "capacity": await f("Version", "5"); await f("Error correction", "M", true); break;
    default: throw new Error(`No browser fixture for QR preset ${preset}`);
  }
}

async function prepareBarcode(page, tool) {
  const format = tool.engine.format;
  const values = {
    "ean13": "9780143127741", "isbn": "9780143127741", "ean13-check": "9780143127741", "isbn-check": "9780143127741", "gtin-validator": "9780143127741",
    "upca": "036000291452", "upc-check": "036000291452", "ean8": "96385074", "itf14": "10000000000007", "msi": "12345", "pharmacode": "12345",
  };
  await fill(page, "Value", values[format] ?? "12345");
}

async function runTool(browser, tool) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  try {
    const url = `${baseUrl}/tools/${tool.category}/${tool.slug}`;
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
    if (!response || response.status() >= 400) throw new Error(`Route returned HTTP ${response?.status() ?? "no response"}`);
    await page.waitForFunction((id) => document.documentElement.dataset.envToolHydrated === id, tool.id, { timeout: 12000 });
    if (tool.engine.type === "qr") {
      await prepareQr(page, tool);
      const label = ["size", "version", "capacity", "inspect"].includes(tool.engine.preset) ? "Calculate" : "Generate QR";
      await page.getByRole("button", { name: label, exact: true }).click();
      if (tool.engine.preset === "batch") await page.locator('img[alt^="QR"]').first().waitFor({ state: "visible", timeout: 12000 });
      else if (tool.engine.preset === "svg") await page.locator("div.max-w-md svg").waitFor({ state: "visible", timeout: 12000 });
      else if (tool.engine.preset === "data-url") await page.locator('pre[aria-label="Generated QR data URL"]').waitFor({ state: "visible", timeout: 12000 });
      else if (["size", "version", "capacity", "inspect"].includes(tool.engine.preset)) await page.getByText(/modules|Estimated QR version|Approximate alphanumeric capacity|Detected payload type/i).last().waitFor({ state: "visible", timeout: 5000 });
      else await page.getByRole("img", { name: "Generated QR code" }).waitFor({ state: "visible", timeout: 12000 });
    } else {
      await prepareBarcode(page, tool);
      const validator = ["gtin-validator", "ean13-check", "upc-check", "isbn-check"].includes(tool.engine.format);
      await page.getByRole("button", { name: validator ? "Validate / Calculate" : "Generate barcode", exact: true }).click();
      if (validator) await page.getByText(/^(?:Valid:|Invalid:|Calculated check digit:)/i).last().waitFor({ state: "visible", timeout: 5000 });
      else await page.locator("div.overflow-x-auto svg").waitFor({ state: "visible", timeout: 12000 });
    }
    const alertText = (await page.locator('[role="alert"]').allTextContents()).join(" ").trim();
    if (alertText) throw new Error(`UI reported: ${alertText}`);
    if (browserErrors.length) throw new Error(`Browser runtime error: ${browserErrors.join(" | ")}`);
    const imageCount = await page.locator('img[alt="Generated QR code"], img[alt^="QR "]').count();
    const result = { id: tool.id, type: tool.engine.type, preset: tool.engine.preset ?? null, format: tool.engine.format ?? null, url, ok: true, imageCount };
    if (tool.id === "qr-data-url-generator") result.dataUrlVisible = (await page.locator('pre[aria-label="Generated QR data URL"]').innerText()).startsWith("data:image/png;base64,");
    if (tool.id === "qr-batch-generator") { result.batchImages = imageCount; if (imageCount !== 2) throw new Error(`Expected two batch QR images, received ${imageCount}.`); }
    return result;
  } catch (error) {
    return { id: tool.id, type: tool.engine.type, url: `${baseUrl}/tools/${tool.category}/${tool.slug}`, ok: false, error: error instanceof Error ? error.message : String(error), browserErrors };
  } finally { await page.close(); }
}

const browser = await chromium.launch({ headless: true, executablePath: "/usr/bin/chromium", args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const results = new Array(tools.length);
async function worker() {
  while (true) {
    const index = next++;
    if (index >= tools.length) return;
    results[index] = await runTool(browser, tools[index]);
    if (!results[index].ok) failures.push(results[index]);
  }
}
await Promise.all(Array.from({ length: concurrency }, worker));
await browser.close();
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
const report = { generatedAt: new Date().toISOString(), baseUrl, total: tools.length, passed: tools.length - failures.length, failed: failures.length, results, failures, ok: failures.length === 0 };
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ total: report.total, passed: report.passed, failed: report.failed, ok: report.ok, reportPath, failures }, null, 2));
if (!report.ok) process.exitCode = 1;
