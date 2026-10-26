#!/usr/bin/env node
/**
 * Functional Studio regressions at phone, tablet and desktop browser widths.
 * Run against a running dev server or production preview; bundled icon/font checks deliberately block asset CDNs.
 * EN_V_BROWSER_AUDIT_BASE_URL and PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH are supported.
 */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const baseUrl = (process.env.EN_V_BROWSER_AUDIT_BASE_URL || "http://127.0.0.1:8080").replace(/\/$/, "");
const output = resolve(process.env.ENV_UX_UI_AUDIT_DIR || "/tmp/env-ux-ui-studio-audit");
const timeout = Number(process.env.EN_V_BROWSER_AUDIT_TIMEOUT_MS || 60000);
const selectedWidths = process.env.ENV_UX_UI_AUDIT_WIDTHS?.split(",").map(Number);
const toolkitNames = ["Icons", "Typography", "Colors", "Backgrounds", "Effects", "Illustrations", "Images & media", "Brand kit", "Motion", "UI components", "Device mockups", "Responsive layout", "Projects", "Layers", "Interactive flows", "Design system", "Accessibility", "Content", "Data visualization", "Patterns & textures", "Transform & alignment", "Platform kits", "Assets", "Export & handoff", "References", "Design QA"];
const themes = ["light", "dark"];
const report = { runAt: new Date().toISOString(), baseUrl, cdnsBlocked: true, themes, widths: [], compactScreens: [], errors: [] };
await mkdir(output, { recursive: true });
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
const toolButtonName = (name) => new RegExp("^" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?:\\s|$)");
const normalizedHex = (value) => value.toLowerCase().replace(/^#([\da-f])([\da-f])([\da-f])$/, "#$1$1$2$2$3$3");

async function storedProject(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("env-ux-ui-studio-project-v1") || "null"));
}

async function waitForStored(page, predicate, description) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await storedProject(page);
    if (value && predicate(value)) return value;
    await page.waitForTimeout(50);
  }
  throw new Error("Project did not persist " + description);
}

async function checkBounds(locator, label, viewport) {
  const box = await locator.boundingBox();
  assert.ok(box && box.width > 0 && box.height > 0, label + " has visible space");
  assert.ok(box.x >= -1 && box.y >= -1 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1, label + " fits the viewport: " + JSON.stringify(box));
  return box;
}

async function checkGrid(locator, label) {
  const boxes = await locator.evaluateAll((nodes) => nodes.map((node) => ({ text: node.textContent.trim(), ...node.getBoundingClientRect().toJSON() })));
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    const overlapWidth = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const overlapHeight = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    assert.ok(overlapWidth <= 1 || overlapHeight <= 1, label + " cards overlap: " + a.text + " / " + b.text);
  }
}

async function checkContainedChildren(locator, selector, label) {
  const failures = await locator.evaluate((parent, childSelector) => {
    const box = parent.getBoundingClientRect();
    return Array.from(parent.querySelectorAll(childSelector)).flatMap((child) => {
      const rect = child.getBoundingClientRect();
      if (!rect.width || !rect.height) return [];
      const fits = rect.left >= box.left - 1 && rect.top >= box.top - 1 && rect.right <= box.right + 1 && rect.bottom <= box.bottom + 1;
      return fits ? [] : [{ text: child.getAttribute("aria-label") || child.textContent.trim(), parent: box.toJSON(), child: rect.toJSON() }];
    });
  }, selector);
  assert.deepEqual(failures, [], label + " does not clip or hide controls");
}

async function checkMonochromeSamples(page, drawer) {
  const bitmap = await drawer.screenshot({ animations: "disabled" });
  const ratio = await page.evaluate(async (base64) => {
    const data = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    const image = await createImageBitmap(new Blob([data], { type: "image/png" }));
    const canvas = new OffscreenCanvas(image.width, image.height);
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, image.width, image.height).data;
    let colored = 0, total = 0;
    // Leave the rounded corners and blurred page outside the modal out of the sample.
    for (let y = 20; y < image.height - 20; y++) for (let x = 20; x < image.width - 20; x++) {
      const index = (y * image.width + x) * 4;
      const channels = [pixels[index], pixels[index + 1], pixels[index + 2]];
      if (Math.max(...channels) - Math.min(...channels) > 8) colored++;
      total++;
    }
    image.close();
    return colored / total;
  }, bitmap.toString("base64"));
  assert.ok(ratio < 0.001, "Toolkit chrome and specimens render in black and white: colored fraction " + ratio);
}

async function openToolkit(page, name) {
  const drawer = page.getByRole("dialog", { name: "Studio toolkit", exact: true });
  if (!await drawer.isVisible()) await page.getByRole("button", { name: "Add elements", exact: true }).click();
  await drawer.getByRole("tab", { name: "All 26", exact: true }).click();
  await drawer.getByRole("button", { name: toolButtonName(name) }).click();
  await page.waitForFunction(() => (document.querySelector(".uxui-toolkit-content")?.scrollTop || 0) < 2);
  return drawer;
}

try {
  for (const { viewport, theme } of [{ width: 320, height: 740 }, { width: 375, height: 667 }, { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 768, height: 1024 }, { width: 1440, height: 1000 }].flatMap((viewport) => themes.map((theme) => ({ viewport, theme })))) {
    if (process.env.ENV_UX_UI_AUDIT_COMPACT_ONLY || (selectedWidths && !selectedWidths.includes(viewport.width))) continue;
    console.log("Auditing Studio at " + viewport.width + "×" + viewport.height + " (" + theme + ")");
    const entry = { viewport, theme, checks: [], runtimeErrors: [] };
    report.widths.push(entry);
    const context = await browser.newContext({ viewport, colorScheme: theme, acceptDownloads: true, serviceWorkers: "block" });
    await context.route(/https:\/\/(api\.iconify\.design|api\.fontsource\.org|fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.jsdelivr\.net)\//, (route) => route.abort());
    const page = await context.newPage();
    page.setDefaultTimeout(timeout);
    page.on("pageerror", (error) => entry.runtimeErrors.push(error.message));
    try {
      await page.goto(baseUrl + "/tools/developer/ux-ui-studio", { waitUntil: "domcontentloaded", timeout: 120000 });
      await page.waitForFunction(() => document.documentElement.dataset.envToolHydrated === "ux-ui-studio", null, { timeout });
      await page.getByRole("button", { name: "Add project", exact: true }).click();
      await page.getByRole("button", { name: "Add elements", exact: true }).click();
      let drawer = page.getByRole("dialog", { name: "Studio toolkit", exact: true });
      await checkBounds(drawer, "Toolkit modal", viewport);
      assert.equal(await page.locator("html").evaluate((node) => node.classList.contains("dark")), theme === "dark", "Studio inherits the system theme");
      const chrome = await drawer.evaluate((node) => {
        const style = getComputedStyle(node);
        return { surface: style.backgroundColor, ink: style.color, accent: style.getPropertyValue("--color-accent").trim() };
      });
      for (const value of [chrome.surface, chrome.ink]) {
        const channels = value.match(/[\d.]+/g).slice(0, 3).map(Number);
        assert.ok(Math.max(...channels) - Math.min(...channels) <= 1, "Studio chrome is monochrome: " + value);
      }
      assert.equal(normalizedHex(chrome.accent), theme === "dark" ? "#ffffff" : "#111111", "Accent icons adapt to black or white");
      entry.checks.push("Monochrome studio chrome follows the effective " + theme + " theme");
      await drawer.getByRole("tab", { name: "Elements", exact: true }).click();
      await drawer.getByRole("button", { name: "Button: Primary action", exact: true }).click();
      if (await drawer.isVisible()) await drawer.getByRole("button", { name: "Close studio toolkit", exact: true }).click();
      await waitForStored(page, (project) => project.elements.some((layer) => layer.kind === "button"), "the inserted button");

      const movement = page.getByLabel("Selected element movement and transform controls", { exact: true });
      const styling = page.getByRole("region", { name: "Selected element styling", exact: true });
      await movement.waitFor({ state: "visible" });
      await styling.waitFor({ state: "visible" });
      const movementBox = await checkBounds(movement, "Movement controls", viewport);
      const styleBox = await checkBounds(styling, "Selected styling", viewport);
      assert.ok(styleBox.y >= movementBox.y + movementBox.height - 1, "Selection styling follows the movement controller");
      await checkContainedChildren(movement, "button,.uxui-gamepad-label", "Movement controller");
      await checkContainedChildren(page.locator(".uxui-context-controls"), ".uxui-context-action,.uxui-context-selection", "Contextual actions");
      entry.checks.push("Selected styling is visible below controllers in fullscreen");

      // A real color edit must update the saved layer, not only the visible control.
      await styling.getByLabel("Selected fill color", { exact: true }).fill("#7c3aed");
      await waitForStored(page, (project) => project.elements.some((layer) => layer.kind === "button" && layer.background.toLowerCase() === "#7c3aed"), "the selected layer fill");
      entry.checks.push("Selected fill editing changes persisted project data");
      if (viewport.width === 390) {
        const beforeSlider = await storedProject(page);
        const previous = beforeSlider.elements.find((item) => item.kind === "button");
        const slider = styling.getByLabel("Selected size", { exact: true });
        await slider.scrollIntoViewIfNeeded();
        const box = await slider.boundingBox();
        await page.mouse.move(box.x + box.width * 0.45, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2, { steps: 5 });
        await page.mouse.up();
        await waitForStored(page, (project) => project.elements.find((item) => item.id === previous.id).width !== previous.width, "a visual size-slider drag");
        const beforeResize = await storedProject(page);
        const size = beforeResize.elements.find((item) => item.id === previous.id);
        const handle = page.locator(".uxui-resize-handle");
        const corner = await handle.boundingBox();
        await page.mouse.move(corner.x + corner.width / 2, corner.y + corner.height / 2);
        await page.mouse.down();
        await page.mouse.move(corner.x + corner.width / 2 + 9, corner.y + corner.height / 2 + 6, { steps: 5 });
        await page.mouse.up();
        await waitForStored(page, (project) => project.elements.find((item) => item.id === previous.id).width > size.width, "the canvas corner resize gesture");
        await page.getByRole("button", { name: "Undo", exact: true }).last().click();
        await waitForStored(page, (project) => project.elements.find((item) => item.id === previous.id).width === size.width, "one-step undo of the resize gesture");
        entry.checks.push("Dragging visual sliders and the canvas resize handle changes saved geometry; one undo restores the resize");
      }
      if (viewport.width === 390) await page.screenshot({ animations: "disabled", path: resolve(output, `selected-styling-390-${theme}.png`) });

      drawer = await openToolkit(page, "Effects");
      const effects = drawer.getByRole("region", { name: "Effects controls", exact: true });
      await effects.waitFor({ state: "visible" });
      await checkGrid(effects.locator(".uxui-effect-card"), "Effects");
      if (viewport.width === 390) await page.screenshot({ animations: "disabled", path: resolve(output, `effects-390-${theme}.png`) });
      const beforeEffect = await storedProject(page);
      const effectAction = effects.getByRole("button", { name: /soft elevation/i }).first();
      await effectAction.click();
      await waitForStored(page, (project) => JSON.stringify(project.elements) !== JSON.stringify(beforeEffect.elements), "the chosen effect");
      entry.checks.push("Visible effect sample applies and persists");

      if (!await drawer.isVisible()) await page.getByRole("button", { name: "Add elements", exact: true }).click();
      await drawer.getByRole("tab", { name: "All 26", exact: true }).click();
      assert.equal(await drawer.locator(".uxui-toolkit-tile").count(), 26, "All 26 tools remain available");
      await checkGrid(drawer.locator(".uxui-toolkit-tile"), "Toolkit");
      await checkMonochromeSamples(page, drawer);
      entry.checks.push("Toolkit chrome and visual specimens pass a rendered monochrome check");
      if (viewport.width === 390) await page.screenshot({ animations: "disabled", path: resolve(output, `toolkit-390-${theme}.png`) });
      for (const name of toolkitNames) {
        await drawer.getByRole("tab", { name: "All 26", exact: true }).click();
        await drawer.getByRole("button", { name: toolButtonName(name) }).click();
        await page.waitForFunction(() => (document.querySelector(".uxui-toolkit-content")?.scrollTop || 0) < 2);
        const detail = drawer.getByRole("region", { name: name + " controls", exact: true });
        await detail.waitFor({ state: "visible" });
        const sample = detail.locator(".uxui-toolkit-preview");
        await sample.scrollIntoViewIfNeeded();
        assert.ok((await sample.boundingBox())?.height >= 40, name + " has a visual sample");
        // Icons, fonts, tokens, assets and presets share a library panel below the detail.
        const sharedLibraries = new Set(["Icons", "Typography", "Colors", "Backgrounds", "Illustrations", "Images & media", "Brand kit", "UI components", "Projects", "Design system", "Data visualization", "Assets"]);
        const actionScope = sharedLibraries.has(name) ? drawer.locator(".uxui-toolkit-content") : detail;
        assert.ok(await actionScope.locator("button:enabled:not(.uxui-toolkit-back),input:enabled,select:enabled").count() > 0, name + " has an available connected action");
      }
      entry.checks.push("Each of 26 toolkit pages has a visible sample and usable controls");

      drawer = await openToolkit(page, "Icons");
      await drawer.getByRole("tab", { name: "Icons", exact: true }).click();
      const icon = drawer.locator('button[title^="Add icon "]').first();
      await icon.scrollIntoViewIfNeeded();
      await icon.locator("svg").waitFor({ state: "visible" });
      await page.waitForFunction(() => {
        const first = document.querySelector('button[title^="Add icon "]');
        return !!first?.querySelector("svg path,svg circle,svg rect,svg polygon,svg polyline,svg line,svg ellipse") && !first?.querySelector('[aria-label="Loading icon preview"],[aria-label="Icon preview unavailable"]');
      });
      await icon.click();
      await waitForStored(page, (project) => project.elements.some((layer) => layer.kind === "icon" && layer.iconSvg.length > 20), "an offline icon vector");
      const brokenImages = await drawer.locator("img").evaluateAll((images) => images.filter((image) => image.complete && image.naturalWidth === 0).length);
      assert.equal(brokenImages, 0, "Icon picker has no broken images while CDN requests fail");
      entry.checks.push("Bundled icon preview and insertion work with asset CDNs blocked");

      await drawer.getByRole("tab", { name: "Fonts", exact: true }).click();
      for (const family of ["Inter", "Lora", "JetBrains Mono", "Bebas Neue", "Caveat"]) {
        await drawer.getByLabel("Search fonts", { exact: true }).fill(family);
        const fontButton = drawer.getByRole("button", { name: new RegExp("^" + family.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s") }).first();
        await fontButton.scrollIntoViewIfNeeded();
        const sample = fontButton.getByText("Design systems that scale 012345", { exact: true });
        await sample.scrollIntoViewIfNeeded();
        await sample.waitFor({ state: "visible" });
        await page.waitForFunction((fontFamily) => Array.from(document.fonts).some((face) => face.family.replaceAll('"', "") === fontFamily && face.status === "loaded"), family);
        assert.ok((await sample.evaluate((node) => getComputedStyle(node).fontFamily)).includes(family), family + " sample uses the loaded font before download");
      }
      entry.checks.push("Five bundled font families render genuine samples before download");
      if (viewport.width === 390) {
        const preview = drawer.locator(".uxui-font-animation").first();
        assert.notEqual(await preview.locator("span").first().evaluate((node) => getComputedStyle(node).animationName), "none", "Font specimens animate before selection");
        await drawer.getByRole("button", { name: "Pause previews", exact: true }).click();
        await drawer.locator(".uxui-font-still").first().waitFor();
        await drawer.getByLabel("Font preview text", { exact: true }).fill("My beautiful idea");
        assert.ok(await drawer.getByText("My beautiful idea", { exact: true }).count() > 0);
        await drawer.getByRole("button", { name: "Play previews", exact: true }).click();
        await page.emulateMedia({ reducedMotion: "reduce" });
        assert.equal(await drawer.locator(".uxui-font-animation > span").first().evaluate((node) => getComputedStyle(node).animationName), "none", "Animated previews respect reduced motion");
        await page.emulateMedia({ reducedMotion: "no-preference" });
        entry.checks.push("Animated font specimens support custom words, pause/play and reduced-motion preferences");
      }
      if (viewport.width === 390) await page.screenshot({ animations: "disabled", path: resolve(output, `fonts-390-${theme}.png`) });
      if (viewport.width === 390) {
        await drawer.getByRole("button", { name: /^Caveat\s/ }).first().click();
        await waitForStored(page, (project) => project.elements.some((layer) => layer.kind === "text" && layer.fontFamily === "Caveat" && layer.fontDataUrl.startsWith("data:font/ttf;base64,")), "the font chosen from its animated card");
        assert.equal(await drawer.isVisible(), false, "Choosing a font returns directly to visual editing");
        entry.checks.push("Choosing a preview creates visible text with the real font embedded and returns to the canvas");
      }
      if (await drawer.isVisible()) await drawer.getByRole("button", { name: "Close studio toolkit", exact: true }).click();

      const canvas = page.getByRole("button", { name: "Select canvas background", exact: true });
      const canvasBox = await canvas.boundingBox();
      await canvas.click({ position: { x: canvasBox.width * 0.9, y: canvasBox.height * 0.9 } });
      const canvasStyling = page.getByRole("region", { name: "Canvas styling", exact: true });
      await canvasStyling.waitFor({ state: "visible" });
      await checkBounds(canvasStyling, "Canvas styling", viewport);
      await canvasStyling.getByLabel("Canvas background color", { exact: true }).fill("#111827");
      await waitForStored(page, (project) => project.background.toLowerCase() === "#111827", "the canvas background");
      entry.checks.push("Canvas selection exposes working background controls");

      const layout = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
      assert.ok(layout.document <= layout.viewport + 2, "Studio has no horizontal document overflow");
      assert.deepEqual(entry.runtimeErrors, [], "Studio has no browser runtime exceptions");
      await page.screenshot({ animations: "disabled", path: resolve(output, `studio-${viewport.width}-${theme}.png`) });
      entry.checks.push("No document overflow or browser runtime exceptions");

      // Export is verified as actual downloaded project JSON, including the local icon.
      await page.getByRole("button", { name: "Export", exact: true }).click();
      const exported = page.waitForEvent("download");
      await page.getByRole("dialog", { name: "Export design handoff", exact: true }).getByRole("button", { name: /Project JSON/ }).click();
      const download = await exported;
      const project = JSON.parse(await readFile(await download.path(), "utf8"));
      assert.equal(project.background.toLowerCase(), "#111827");
      assert.ok(project.elements.some((layer) => layer.kind === "icon" && layer.iconSvg.length > 20));
      entry.checks.push("JSON download retains background and embedded icon");
      if (viewport.width === 390 && theme === "light") {
        const beforeTheme = await storedProject(page);
        await page.emulateMedia({ colorScheme: "dark" });
        await page.waitForFunction(() => document.documentElement.classList.contains("dark"));
        const ink = await page.locator(".ux-ui-studio").evaluate((node) => getComputedStyle(node).getPropertyValue("--color-accent").trim());
        assert.equal(normalizedHex(ink), "#ffffff", "Studio follows a live system-theme change");
        const afterTheme = await storedProject(page);
        assert.equal(afterTheme.background, beforeTheme.background);
        assert.deepEqual(afterTheme.elements, beforeTheme.elements, "Theme changes preserve authored artwork colors and assets");
        entry.checks.push("Live system-theme changes update controls while preserving artwork");
      }
    } catch (error) {
      entry.failure = error.stack || error.message;
      report.errors.push({ width: viewport.width, theme, error: error.message });
      console.error("Studio " + viewport.width + ": " + (error.stack || error.message));
      await page.screenshot({ animations: "disabled", path: resolve(output, `failure-${viewport.width}-${theme}.png`) }).catch(() => {});
    } finally { await context.close(); }
  }
  for (const viewport of [{ width: 320, height: 568 }, { width: 568, height: 320 }, { width: 390, height: 430 }]) for (const theme of themes) {
    if (selectedWidths && !selectedWidths.includes(viewport.width)) continue;
    const entry = { viewport, theme, checks: [], runtimeErrors: [] };
    report.compactScreens.push(entry);
    console.log("Auditing compact Studio at " + viewport.width + "×" + viewport.height + " (" + theme + ")");
    const context = await browser.newContext({ viewport, colorScheme: theme, acceptDownloads: true, serviceWorkers: "block", hasTouch: true });
    const page = await context.newPage();
    page.setDefaultTimeout(timeout);
    page.on("pageerror", (error) => entry.runtimeErrors.push(error.message));
    try {
      await page.goto(baseUrl + "/tools/developer/ux-ui-studio", { waitUntil: "domcontentloaded", timeout: 120000 });
      await page.waitForFunction(() => document.documentElement.dataset.envToolHydrated === "ux-ui-studio", null, { timeout });
      await page.getByRole("button", { name: "Add project", exact: true }).click();
      await page.getByRole("button", { name: "Add elements", exact: true }).click();
      let drawer = page.getByRole("dialog", { name: "Studio toolkit", exact: true });
      await checkBounds(drawer, "Compact toolkit", viewport);
      await drawer.getByRole("tab", { name: "Elements", exact: true }).click();
      await drawer.getByRole("button", { name: "Button: Primary action", exact: true }).click();
      if (await drawer.isVisible()) await drawer.getByRole("button", { name: "Close studio toolkit", exact: true }).click();
      const styling = page.getByRole("region", { name: "Selected element styling", exact: true });
      const corners = styling.getByRole("button", { name: "Round", exact: true });
      await corners.scrollIntoViewIfNeeded();
      await checkBounds(corners, "Visual corner choice", viewport);
      await corners.click();
      await waitForStored(page, (project) => project.elements.some((layer) => layer.kind === "button" && layer.radius >= 20), "the visual Round corner preset");
      const fill = styling.getByLabel("Selected fill color", { exact: true });
      await fill.scrollIntoViewIfNeeded();
      await checkBounds(fill, "Compact color control", viewport);
      await fill.fill("#7c3aed");
      await waitForStored(page, (project) => project.elements.some((layer) => layer.background.toLowerCase() === "#7c3aed"), "compact color editing");
      const size = styling.getByLabel("Selected size", { exact: true });
      await size.scrollIntoViewIfNeeded();
      await checkBounds(size, "Compact size slider", viewport);
      await size.focus(); await size.press("ArrowRight");
      entry.checks.push("Touch-sized visual shapes, colors and sliders remain reachable in short, landscape and keyboard-sized viewports");
      drawer = await openToolkit(page, "Effects");
      await checkBounds(drawer, "Compact effects toolkit", viewport);
      await checkGrid(drawer.locator(".uxui-effect-card"), "Compact effects");
      entry.checks.push("Toolkit and effect samples fit without overlap");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2);
      assert.equal(overflow, false);
      assert.deepEqual(entry.runtimeErrors, []);
      await page.screenshot({ animations: "disabled", path: resolve(output, `compact-${viewport.width}-${viewport.height}-${theme}.png`) });
    } catch (error) {
      entry.failure = error.stack || error.message;
      report.errors.push({ width: viewport.width, height: viewport.height, theme, error: error.message });
      console.error("Compact Studio " + viewport.width + "×" + viewport.height + " " + theme + ": " + error.message);
      await page.screenshot({ animations: "disabled", path: resolve(output, `compact-failure-${viewport.width}-${viewport.height}-${theme}.png`) }).catch(() => {});
    } finally { await context.close(); }
  }
} finally {
  await browser.close();
  await writeFile(resolve(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
}
console.log(JSON.stringify(report, null, 2));
if (report.errors.length) process.exitCode = 1;
