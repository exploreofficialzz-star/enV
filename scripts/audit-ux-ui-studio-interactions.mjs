#!/usr/bin/env node
/** Browser regressions for asset search, touch merging, sampled keys and fitted OCR. */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const baseUrl = (process.env.EN_V_BROWSER_AUDIT_BASE_URL || "http://127.0.0.1:8080").replace(/\/$/, "");
const output = process.env.ENV_UX_UI_INTERACTIONS_AUDIT_DIR || "/tmp/env-ux-ui-interactions";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const report = { runAt: new Date().toISOString(), baseUrl, cases: [], errors: [] };
const project = page => page.evaluate(() => JSON.parse(localStorage.getItem("env-ux-ui-studio-project-v1") || "null"));
const waitForProject = (page, predicate, arg) => page.waitForFunction(({ source, arg }) => new Function("p", "arg", "return (" + source + ")(p,arg)")(JSON.parse(localStorage.getItem("env-ux-ui-studio-project-v1") || "null"), arg), { source: predicate.toString(), arg });
const action = (page, name) => page.locator(".uxui-context-controls").getByRole("button", { name, exact: true }).click();
async function openSearch(page, query) {
  await page.getByRole("button", { name: "Add elements", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Studio toolkit", exact: true });
  await dialog.getByLabel("Search the Studio Toolkit", { exact: true }).fill(query);
  return dialog;
}
async function readPixels(page, source, points) {
  return page.evaluate(async ({ source, points }) => {
    const image = new Image(); image.src = source; await image.decode();
    const canvas = document.createElement("canvas"); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const ctx = canvas.getContext("2d"); ctx.drawImage(image, 0, 0);
    return points.map(([x, y]) => [...ctx.getImageData(x, y, 1, 1).data]);
  }, { source, points });
}
try {
  for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }, { width: 1440, height: 1000 }, { width: 390, height: 430 }].filter(viewport => !process.env.ENV_UX_UI_AUDIT_WIDTHS || process.env.ENV_UX_UI_AUDIT_WIDTHS.split(",").includes(String(viewport.width)))) {
    const entry = { viewport, checks: [], runtimeErrors: [] }; report.cases.push(entry);
    const context = await browser.newContext({ viewport, hasTouch: true, serviceWorkers: "block", colorScheme: viewport.width === 320 ? "dark" : "light" });
    const origin = new URL(baseUrl).origin;
    await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const page = await context.newPage(); page.setDefaultTimeout(45000);
    page.on("pageerror", error => entry.runtimeErrors.push(error.message));
    try {
      await page.goto(baseUrl + "/tools/developer/ux-ui-studio", { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => document.documentElement.dataset.envToolHydrated === "ux-ui-studio");
      await page.getByRole("button", { name: "Add project", exact: true }).click();
      const dialog = await openSearch(page, "home page icons");
      const matches = dialog.getByRole("region", { name: "Matching icons", exact: true });
      await matches.getByRole("button").first().waitFor();
      assert.ok(await matches.getByRole("button").count() > 0);
      const input = dialog.getByLabel("Search the Studio Toolkit", { exact: true });
      const bounds = await input.boundingBox();
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= viewport.width, "Search input stays inside mobile drawer");
      assert.equal(await input.evaluate(node => getComputedStyle(node).outlineStyle), "none");
      await page.screenshot({ path: resolve(output, `search-${viewport.width}-${viewport.height}.png`), animations: "disabled" });
      await input.fill("Inter fonts"); await dialog.getByRole("button", { name: "Use font Inter", exact: true }).waitFor();
      await input.fill("search bar"); await dialog.getByRole("button", { name: "Add shape Search bar", exact: true }).waitFor();
      await input.fill("zzzznomatchzzzz"); await dialog.getByText("No matches found", { exact: true }).waitFor();
      assert.equal(await dialog.getByRole("region", { name: "Matching icons", exact: true }).count(), 0);
      await dialog.getByRole("button", { name: "Clear toolkit search", exact: true }).click();
      assert.equal(await dialog.locator(".uxui-toolkit-tile").count(), 26);
      entry.checks.push("Unified search finds home icons, fonts and shapes offline; empty, clear and narrow viewport states work");
      for (const term of ["home page icons", "settings icons"]) {
        await input.fill(term);
        const icon = dialog.getByRole("region", { name: "Matching icons", exact: true }).getByRole("button").first();
        await icon.click(); await dialog.waitFor({ state: "hidden" });
        if (term.startsWith("home")) await openSearch(page, "settings icons");
      }
      await waitForProject(page, p => p?.elements?.filter(layer => layer.kind === "icon").length === 2);
      const before = await project(page), ids = before.elements.map(layer => layer.id);
      await action(page, "Select multiple layers");
      const picker = page.getByRole("region", { name: "Merge layer selection", exact: true });
      await picker.getByRole("checkbox").first().check();
      await picker.getByRole("button", { name: "Merge 2 selected layers", exact: true }).click();
      await waitForProject(page, p => p?.elements?.length === 1 && p.elements[0].componentKey === "merged-vector");
      const merged = (await project(page)).elements[0];
      const painted = page.locator(`[data-layer-id="${merged.id}"] > svg`);
      assert.equal(Number(await painted.getAttribute("x")), merged.x, "Merged vector gets no second inset");
      assert.equal(Number(await painted.getAttribute("width")), merged.width);
      await page.getByRole("button", { name: "Undo", exact: true }).last().click();
      await waitForProject(page, (p, ids) => ids.every(id => p?.elements?.some(layer => layer.id === id)), ids);
      entry.checks.push("Search inserts distinct icons; touch checkboxes merge them at exact bounds; Undo restores both sources");
      if (viewport.width === 390 && viewport.height === 844) {
        const source = await page.evaluate(() => {
          const canvas = document.createElement("canvas"); canvas.width = 200; canvas.height = 100;
          const ctx = canvas.getContext("2d"); ctx.fillStyle = "#1234ab"; ctx.fillRect(0, 0, 200, 100); ctx.fillStyle = "#d00000"; ctx.fillRect(70, 20, 60, 60);
          return canvas.toDataURL("image/png");
        });
        await page.getByLabel("Choose an image", { exact: true }).setInputFiles({ name: "sampled-color.png", mimeType: "image/png", buffer: Buffer.from(source.split(",")[1], "base64") });
        await waitForProject(page, p => p?.elements?.some(layer => layer.kind === "image"));
        const image = (await project(page)).elements.at(-1);
        await action(page, "Chroma key");
        const canvas = page.getByRole("img", { name: "Original image color picker", exact: true });
        await page.waitForFunction(() => document.querySelector(".uxui-chroma-picker > canvas")?.width === 200);
        await canvas.tap({ position: { x: 10, y: 10 } });
        await page.waitForFunction(() => document.querySelector('[aria-label="Chroma key color"]')?.value === "#1234ab");
        await page.getByRole("button", { name: "Apply chroma key", exact: true }).click();
        await waitForProject(page, (p, id) => p?.elements?.find(layer => layer.id === id)?.imageOriginalDataUrl, image.id);
        const keyed = (await project(page)).elements.find(layer => layer.id === image.id);
        const pixels = await readPixels(page, keyed.imageDataUrl, [[10, 10], [100, 50]]);
        assert.equal(pixels[0][3], 0); assert.equal(pixels[1][3], 255);
        await page.getByRole("button", { name: "Pick color from image", exact: true }).click();
        const layer = page.locator(`[data-layer-id="${image.id}"] > image`);
        await layer.tap({ position: { x: 10, y: 10 } });
        await page.waitForFunction(() => document.querySelector('[aria-label="Chroma key color"]')?.value === "#1234ab");
        const after = (await project(page)).elements.find(layer => layer.id === image.id);
        assert.deepEqual([after.x, after.y, after.width, after.height], [image.x, image.y, image.width, image.height]);
        entry.checks.push("Touch picker samples an exact custom color, applies real transparency and preserves the subject; artboard picking uses original pixels without dragging");
        await page.screenshot({ path: resolve(output, "chroma-picker.png"), animations: "disabled" });
        await action(page, "Move");
        const screenshot = await page.evaluate(() => {
          const canvas = document.createElement("canvas"); canvas.width = 900; canvas.height = 1000;
          const ctx = canvas.getContext("2d"); ctx.fillStyle = "#f8fafc"; ctx.fillRect(0, 0, 900, 1000);
          ctx.fillStyle = "#111827"; ctx.font = "bold 44px sans-serif"; ctx.fillText("Workspace", 45, 76);
          ctx.font = "26px sans-serif"; ctx.fillText("Design your next project", 45, 136);
          ctx.fillStyle = "#fff"; ctx.fillRect(45, 200, 810, 230);
          ctx.fillStyle = "#111827"; ctx.font = "bold 32px sans-serif"; ctx.fillText("Project overview", 75, 260);
          return canvas.toDataURL("image/png");
        });
        await page.getByLabel("Import screenshot as editable layers", { exact: true }).setInputFiles({ name: "screen.png", mimeType: "image/png", buffer: Buffer.from(screenshot.split(",")[1], "base64") });
        const reconstruction = page.getByRole("dialog", { name: "Reconstruct editable layers", exact: true });
        assert.equal(await reconstruction.getByLabel("Screenshot screen size", { exact: true }).inputValue(), "mockup");
        await reconstruction.getByRole("button", { name: "Reconstruct editable layers", exact: true }).click();
        await reconstruction.getByRole("button", { name: "Add editable screen", exact: true }).waitFor({ timeout: 180000 });
        const preview = reconstruction.getByRole("img", { name: "Reconstructed screenshot preview", exact: true });
        assert.equal(await preview.getAttribute("viewBox"), "0 0 390 844");
        await reconstruction.getByLabel("Screenshot fit", { exact: true }).selectOption("cover");
        const geometry = await preview.locator("text").first().evaluate(node => ({ x: Number(node.getAttribute("x")), fontSize: Number(node.getAttribute("font-size")) }));
        await reconstruction.locator("summary").filter({ hasText: "Review recognized text" }).click();
        await reconstruction.getByLabel("Recognized text line 1", { exact: true }).fill("Corrected workspace");
        await reconstruction.getByLabel("Overlay original to check alignment", { exact: true }).check();
        await page.screenshot({ path: resolve(output, "screenshot-review.png"), animations: "disabled" });
        await reconstruction.getByRole("button", { name: "Add editable screen", exact: true }).click();
        await waitForProject(page, p => p?.elements?.some(layer => layer.text === "Corrected workspace"));
        const fitted = await project(page), corrected = fitted.elements.find(layer => layer.text === "Corrected workspace");
        assert.deepEqual(fitted.viewport, { width: 390, height: 844 }); assert.equal(fitted.target, "mobile");
        assert.ok(Math.abs(corrected.x - geometry.x) < .01); assert.ok(Math.abs(corrected.fontSize - geometry.fontSize) < .01);
        assert.ok(corrected.x < 0, "Cover overflow is retained and clipped by the screen, rather than clamped out of alignment");
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => document.documentElement.dataset.envToolHydrated === "ux-ui-studio");
        await page.locator(".uxui-draft-card").first().getByRole("button").first().click();
        await waitForProject(page, p => p?.elements?.some(layer => layer.text === "Corrected workspace"));
        assert.equal((await project(page)).elements.find(layer => layer.text === "Corrected workspace").x, corrected.x);
        entry.checks.push("Real offline OCR fits the current mockup; contain/cover previews, text corrections and comparison overlay work; exact cropped geometry persists after reopening");
      }
      assert.deepEqual(entry.runtimeErrors, []);
    } catch (error) {
      entry.failure = error.stack || error.message; report.errors.push(error.message); console.error(viewport, error.message);
      await page.screenshot({ path: resolve(output, `failure-${viewport.width}-${viewport.height}.png`), animations: "disabled" }).catch(() => {});
    } finally { await context.close(); }
  }
} finally {
  await browser.close(); await writeFile(resolve(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
}
console.log(JSON.stringify(report, null, 2));
if (report.errors.length) process.exitCode = 1;
