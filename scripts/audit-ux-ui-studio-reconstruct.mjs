#!/usr/bin/env node
/** Real, local OCR → review → editable Studio screen. Run against a dev server or deployment. */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const baseUrl = (process.env.EN_V_BROWSER_AUDIT_BASE_URL || "http://127.0.0.1:8080").replace(/\/$/, "");
const output = process.env.ENV_UX_UI_RECONSTRUCT_AUDIT_DIR || "/tmp/env-ux-ui-reconstruct-audit";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
const report = { baseUrl, runAt: new Date().toISOString(), checks: [], requests: [], runtimeErrors: [], stats: null };
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  const origin = new URL(baseUrl).origin;
  await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const page = await context.newPage(); page.setDefaultTimeout(120_000);
  page.on("pageerror", error => report.runtimeErrors.push(error.message));
  page.on("request", request => { if (request.url().includes("/uxui/ocr/")) report.requests.push({ url: request.url(), method: request.method() }); });
  await page.goto(baseUrl + "/tools/developer/ux-ui-studio", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.envToolHydrated === "ux-ui-studio");
  await page.getByRole("button", { name: "Add project", exact: true }).click();
  const source = await page.evaluate(async () => {
    const canvas = document.createElement("canvas"); canvas.width = 900; canvas.height = 1000;
    const context = canvas.getContext("2d"); context.fillStyle = "#f8fafc"; context.fillRect(0, 0, 900, 1000);
    context.fillStyle = "#111827"; context.font = "bold 44px sans-serif"; context.fillText("Workspace", 45, 76);
    context.font = "26px sans-serif"; context.fillText("Design your next project", 45, 136);
    context.fillStyle = "#fff"; context.fillRect(45, 200, 810, 230);
    context.fillStyle = "#111827"; context.font = "bold 32px sans-serif"; context.fillText("Project overview", 75, 260);
    context.font = "24px sans-serif"; context.fillText("Build clear interfaces", 75, 310);
    context.fillStyle = "#2563eb"; context.fillRect(75, 345, 260, 54);
    context.fillStyle = "#fff"; context.font = "bold 22px sans-serif"; context.fillText("Create project", 95, 380);
    const gradient = context.createLinearGradient(500, 560, 800, 810); gradient.addColorStop(0, "#ec4899"); gradient.addColorStop(0.5, "#8b5cf6"); gradient.addColorStop(1, "#06b6d4");
    context.fillStyle = gradient; context.beginPath(); context.arc(650, 685, 125, 0, Math.PI * 2); context.fill();
    return canvas.toDataURL("image/png");
  });
  const fixture = Buffer.from(source.split(",")[1], "base64");
  await writeFile(resolve(output, "source.png"), fixture);
  await page.getByLabel("Import screenshot as editable layers", { exact: true }).setInputFiles({ name: "workspace-screenshot.png", mimeType: "image/png", buffer: fixture });
  const dialog = page.getByRole("dialog", { name: "Reconstruct editable layers", exact: true });
  await dialog.waitFor();
  assert.equal(report.requests.length, 0, "Heavy OCR assets stay unloaded until the user requests reconstruction");
  await dialog.getByRole("button", { name: "Reconstruct editable layers", exact: true }).click();
  await dialog.getByRole("button", { name: "Add editable screen", exact: true }).waitFor();
  assert.equal(await dialog.getByRole("checkbox", { name: "Keep original screenshot as a hidden reference" }).isChecked(), false);
  const previewWords = await dialog.locator('svg[aria-label="Reconstructed screenshot preview"] text').allTextContents();
  for (const expected of ["Workspace", "Project overview", "Build clear interfaces", "Create project"]) assert.ok(previewWords.some(text => text.includes(expected)), "Actual OCR reconstructs " + expected);
  await page.screenshot({ path: resolve(output, "review.png"), animations: "disabled" });
  await dialog.getByRole("button", { name: "Add editable screen", exact: true }).click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("env-ux-ui-studio-project-v1") || "null")?.elements?.some(layer => layer.text?.includes("Workspace")));
  const project = await page.evaluate(() => JSON.parse(localStorage.getItem("env-ux-ui-studio-project-v1")));
  const screen = project.screens.find(item => item.id === project.activeScreenId);
  report.stats = screen.reconstruction.stats;
  assert.ok(report.stats.textLines >= 5); assert.ok(report.stats.shapes >= 1); assert.ok(report.stats.imageRegions >= 1);
  assert.ok(project.elements.some(layer => layer.kind === "rect"));
  assert.ok(project.elements.some(layer => layer.kind === "image" && layer.imageDataUrl));
  assert.ok(!project.elements.some(layer => layer.name === "Original screenshot · reference"), "No opaque original is added behind editable layers");
  assert.ok(!project.elements.some(layer => layer.imageDataUrl === source), "Retained artwork contains reconstructed crops, not the original screenshot");
  const text = project.elements.find(layer => layer.kind === "text" && layer.text.includes("Workspace"));
  await page.locator(`[data-layer-id="${text.id}"]`).click({ force: true });
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page.getByLabel("Selected text content", { exact: true }).fill("Edited reconstructed heading");
  await page.waitForFunction(id => JSON.parse(localStorage.getItem("env-ux-ui-studio-project-v1"))?.elements?.find(layer => layer.id === id)?.text === "Edited reconstructed heading", text.id);
  assert.ok(report.requests.length >= 3 && report.requests.every(request => request.method === "GET"), "Local OCR loads worker/core/model without an upload");
  assert.deepEqual(report.runtimeErrors, []);
  report.checks.push("Real English OCR recognizes dark labels and white text on colored controls", "Flat shapes and detailed artwork become separate editable layers", "Retained artwork has no baked second copy of recognized text", "Reference is optional and disabled by default", "Reconstructed text is editable and persists in the design", "OCR succeeds with every external origin blocked and performs no image upload");
  await page.screenshot({ path: resolve(output, "edited.png"), animations: "disabled" });
  await context.close();
} catch (error) { report.failure = error.stack || error.message; process.exitCode = 1; }
finally { await browser.close(); await writeFile(resolve(output, "report.json"), JSON.stringify(report, null, 2) + "\n"); }
console.log(JSON.stringify(report, null, 2));
