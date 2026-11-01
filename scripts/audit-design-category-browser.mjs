#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require("playwright");
} catch (error) {
  console.error("Design category browser audit requires Playwright.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
}

const baseUrl = (
  process.argv.find((argument) => argument.startsWith("--base-url="))?.slice("--base-url=".length)
  ?? process.env.AUDIT_BASE_URL
  ?? "http://127.0.0.1:8080"
).replace(/\/+$/, "");
const requestedBrowser = process.argv.find((argument) => argument.startsWith("--browser="))?.slice("--browser=".length) ?? "chromium";
const browserMap = [
  ["chromium", playwright.chromium],
  ["firefox", playwright.firefox],
  ["webkit", playwright.webkit],
];
const browserEntries = requestedBrowser === "all"
  ? browserMap
  : browserMap.filter(([name]) => name === requestedBrowser);
assert.ok(browserEntries.length > 0, `Unsupported browser "${requestedBrowser}". Use chromium, firefox, webkit or all.`);
const outputDir = resolve("artifacts/design-category");
await mkdir(outputDir, { recursive: true });

for (const [browserName, browserType] of browserEntries) {
  const browserOptions = { headless: true };
  if (browserName === "chromium" && process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
    browserOptions.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  }
  const browser = await browserType.launch(browserOptions);
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1000 } });
  try {
  const page = await context.newPage();
  const failures = [];
  page.on("pageerror", (error) => failures.push(error.message));
  const response = await page.goto(baseUrl + "/tools/design", { waitUntil: "domcontentloaded", timeout: 60000 });
  assert.ok(response && response.ok(), "Design category route should respond successfully");
  await page.getByText("enV Design workspace", { exact: true }).waitFor({ state: "visible" });
  // Wait for the client-side explorer to hydrate before exercising controlled React inputs.
  await page.waitForLoadState("networkidle", { timeout: 30000 });

  const cards = page.locator('a[href^="/tools/design/"]');
  const cardCount = await cards.count();
  const badge = await page.getByText(/^\d+\s+tools?\s+in this workspace$/).first().textContent();
  const advertisedCount = Number(badge?.match(/\d+/)?.[0]);
  assert.ok(Number.isInteger(advertisedCount) && advertisedCount > 21, "Design hero should advertise the expanded catalogue");
  assert.equal(cardCount, advertisedCount, "Every advertised Design utility must render as a tool card");

  const hrefs = await cards.evaluateAll((anchors) => anchors.map((anchor) => anchor.getAttribute("href")));
  assert.equal(new Set(hrefs).size, hrefs.length, "Every Design tool card should have a unique route");

  const routeChecks = [];
  for (let offset = 0; offset < hrefs.length; offset += 12) {
    const batch = await Promise.all(hrefs.slice(offset, offset + 12).map(async (href) => {
      const response = await page.request.get(baseUrl + href, { timeout: 30000 });
      return { href, status: response.status(), finalUrl: response.url() };
    }));
    routeChecks.push(...batch);
  }
  const failedRoutes = routeChecks.filter((result) => result.status !== 200);
  assert.deepEqual(failedRoutes, [], "Every Design tool route should respond with HTTP 200");
  console.log("PASS Design tool route smoke test: " + routeChecks.length + " routes returned HTTP 200.");

  const search = page.getByRole("textbox", { name: "Search design tools" });
  await search.focus();
  await page.keyboard.insertText("Gradient Token Generator");
  await page.getByText("1 tool found", { exact: true }).waitFor({ state: "visible", timeout: 10000 });
  const generatedGradientToken = page.locator('a[href="/tools/design/gradient-token-generator"]');
  await generatedGradientToken.waitFor({ state: "visible" });
  assert.equal(await cards.count(), 1, "Search should find the generated Gradient Token Generator alone");

  await search.fill("");
  const filterGradientseffects = page.getByRole("button", { name: "Gradients & effects", exact: true });
  await filterGradientseffects.focus();
  await page.keyboard.press("Enter");
  await page.locator('a[href="/tools/design/shadow-builder"]').waitFor({ state: "visible" });
  assert.ok(await cards.count() > 7, "Effects filter should include the generated effect workflows");

  const filterUIcomponents = page.getByRole("button", { name: "UI components", exact: true });
  await filterUIcomponents.focus();
  await page.keyboard.press("Enter");
  await page.locator('a[href="/tools/design/button-builder"]').waitFor({ state: "visible" });
  assert.ok(await cards.count() > 2, "Components filter should include generated component workflows");

  const filterSVGbackgrounds = page.getByRole("button", { name: "SVG & backgrounds", exact: true });
  await filterSVGbackgrounds.focus();
  await page.keyboard.press("Enter");
  await page.locator('a[href="/tools/design/pattern-generator"]').waitFor({ state: "visible" });
  assert.ok(await cards.count() > 2, "SVG filter should include generated pattern and artwork workflows");

  const filterColorpalettes = page.getByRole("button", { name: "Color & palettes", exact: true });
  await filterColorpalettes.focus();
  await page.keyboard.press("Enter");
  await page.locator('a[href="/tools/design/color-builder"]').waitFor({ state: "visible" });
  assert.ok(await cards.count() > 7, "Color filter should include generated color workflows");

  const filterAccessibility = page.getByRole("button", { name: "Accessibility", exact: true });
  await filterAccessibility.focus();
  await page.keyboard.press("Enter");
  assert.equal(await cards.count(), 3, "Accessibility group should retain the three curated tools");

  const filterAlltools = page.getByRole("button", { name: "All tools", exact: true });
  await filterAlltools.focus();
  await page.keyboard.press("Enter");
  const restoredCount = await cards.count();
  assert.equal(restoredCount, advertisedCount, "All tools filter should restore the full Design catalogue");
  await page.screenshot({ path: resolve(outputDir, `design-category-${browserName}-desktop.png`), fullPage: true });

  for (const viewport of [{ width: 320, height: 740 }, { width: 390, height: 844 }, { width: 768, height: 1024 }]) {
    await page.setViewportSize(viewport);
    assert.equal(await cards.count(), advertisedCount, `Layout should retain every Design card at ${viewport.width}px`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 1, `Design category should not horizontally overflow a ${viewport.width}px viewport`);
    if (viewport.width === 390) {
      await page.screenshot({ path: resolve(outputDir, `design-category-${browserName}-mobile.png`), fullPage: true });
    }
  }

  // Exercise the actual palette engine, not only its category-card presentation.
  await page.setViewportSize({ width: 1280, height: 900 });
  const paletteResponse = await page.goto(baseUrl + "/tools/design/palette-generator", { waitUntil: "domcontentloaded", timeout: 60000 });
  assert.ok(paletteResponse && paletteResponse.ok(), "Palette Generator route should respond successfully");
  // Wait for client hydration so the React click handler is attached before exercising downloads.
  await page.waitForLoadState("networkidle", { timeout: 30000 });
  const swatchExport = page.locator('[aria-labelledby="palette-swatch-export-heading"]');
  await swatchExport.waitFor({ state: "visible" });
  // Confirm React has hydrated by changing the palette count and waiting for the sixth editable swatch.
  await page.locator("#palette-count").selectOption("6");
  await page.getByLabel("Edit palette color 6").waitFor({ state: "visible" });
  const [pngDownload] = await Promise.all([
    page.waitForEvent("download", { timeout: 15000 }),
    page.getByTestId("palette-download-png").click(),
  ]);
  assert.match(pngDownload.suggestedFilename(), /\.png$/i, "Palette PNG export should produce a PNG file");
  const pngPath = resolve(outputDir, `palette-swatches-${browserName}.png`);
  await pngDownload.saveAs(pngPath);
  const pngBytes = await readFile(pngPath);
  assert.deepEqual([...pngBytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], "Palette download must contain a real PNG signature");
  assert.ok(pngBytes.length > 1000, "Palette PNG should contain the rendered swatch sheet, not an empty file");

  const [svgDownload] = await Promise.all([
    page.waitForEvent("download", { timeout: 15000 }),
    swatchExport.getByRole("button", { name: "Download", exact: true }).click(),
  ]);
  assert.equal(svgDownload.suggestedFilename(), "env-palette-swatches.svg", "Palette SVG export should retain its SVG filename");
  const svgPath = resolve(outputDir, `palette-swatches-${browserName}.svg`);
  await svgDownload.saveAs(svgPath);
  const svgContent = await readFile(svgPath, "utf8");
  assert.match(svgContent, /<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/, "Palette SVG export should be a valid standalone SVG document");
  assert.match(svgContent, /enV color palette/, "Palette SVG export should contain its accessible title");

  const layoutSelect = page.getByLabel("Page preview layout");
  await layoutSelect.waitFor({ state: "visible" });
  for (const layout of ["landing", "dashboard", "forms", "content"]) {
    await layoutSelect.selectOption(layout);
    const preview = page.locator(`[data-testid="palette-preview-${layout}"]`);
    await preview.waitFor({ state: "visible" });
    await preview.screenshot({ path: resolve(outputDir, `palette-preview-${browserName}-${layout}-light.png`) });
  }
  await page.getByLabel("Preview color theme").selectOption("dark");
  for (const layout of ["landing", "dashboard", "forms", "content"]) {
    await layoutSelect.selectOption(layout);
    const preview = page.locator(`[data-testid="palette-preview-${layout}"]`);
    await preview.waitFor({ state: "visible" });
    await preview.screenshot({ path: resolve(outputDir, `palette-preview-${browserName}-${layout}-dark.png`) });
  }

  // Verify the real gradient stop editor reorders through its keyboard-accessible controls.
  // Native HTML drag-and-drop remains implemented and is covered by its source and engine regression gates;
  // keyboard acceptance is deterministic across Chromium, Firefox and WebKit.
  const gradientResponse = await page.goto(baseUrl + "/tools/design/gradient-generator", { waitUntil: "domcontentloaded", timeout: 60000 });
  assert.ok(gradientResponse && gradientResponse.ok(), "Gradient Generator route should respond successfully");
  const endStopRow = page.locator('[data-testid="gradient-stop-end"]');
  const moveEarlier = endStopRow.getByRole("button", { name: "Move stop 3 earlier" });
  await moveEarlier.waitFor({ state: "visible" });
  await moveEarlier.focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => {
    const order = [...document.querySelectorAll('[data-testid^="gradient-stop-"]')]
      .map((element) => element.getAttribute("data-testid"));
    return order.join(",") === "gradient-stop-start,gradient-stop-end,gradient-stop-middle";
  }, { timeout: 10000 });
  assert.equal(await page.getByRole("button", { name: "Move stop 2 earlier" }).isVisible(), true, "Keyboard reorder controls should remain available after state changes");

  assert.deepEqual(failures, [], "Design category, palette and gradient routes should not emit uncaught browser errors");
  console.log("PASS Design browser audit: " + advertisedCount + " tools, search, keyboard filters, 3 viewport widths and 4 page previews in light/dark themes.");
  } finally {
    await browser.close();
  }
}
